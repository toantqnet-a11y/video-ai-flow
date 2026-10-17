/**
 * R1-07 — Remote LLM execution boundary used by Outline, Chapter, Judge & Retry.
 * WHY: runtime (rather than a UI "free" badge) must own remote consent,
 * vault lookup, verified free entitlement, paid approval and accounting.
 * Only hard-coded official HTTPS origins can receive credentials; arbitrary
 * model.endpoint is NEVER used here (prevents SSRF / credential exfiltration).
 * Job queue supplies the durable execution / fencing; no second scheduler.
 */
import {createHash} from 'node:crypto';
import {ProviderAccountRepository} from '../../../packages/core/src/provider-accounts.mjs';
import {QuotaLedgerRepository} from '../../../packages/core/src/quota-ledger-r208.mjs';
import {ProviderMonitorR212} from '../../../packages/core/src/provider-monitor-r212.mjs';

const ENDPOINTS=Object.freeze({
  gemini:'https://generativelanguage.googleapis.com',
  groq:'https://api.groq.com',
  openrouter:'https://openrouter.ai'
});
const MAX_RESPONSE_BYTES=150_000;
const error=(code,retryable=false)=>Object.assign(new Error(code),{code,retryable});
const validJob=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,150}$/.test(id);
const failWhenAborted=signal=>{if(signal?.aborted)throw error('LLM_ABORTED',false)};
const safeJsonText=text=>{
  if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>MAX_RESPONSE_BYTES)throw error('LLM_OUTPUT_INVALID');
  // Providers sometimes wrap otherwise valid JSON in one markdown code fence.
  // Strict parse and the downstream domain schema still decide acceptance.
  const raw=text.trim().replace(/^```(?:json)?\s*\n?/i,'').replace(/\n?```$/,'').trim();
  try{return JSON.parse(raw)}catch{throw error('LLM_OUTPUT_INVALID')}
};

async function readBounded(response){
  const contentLength=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(contentLength)&&contentLength>MAX_RESPONSE_BYTES)throw error('LLM_RESPONSE_TOO_LARGE');
  if(!response.body?.getReader){
    const text=await response.text();
    if(Buffer.byteLength(text,'utf8')>MAX_RESPONSE_BYTES)throw error('LLM_RESPONSE_TOO_LARGE');
    return text;
  }
  const reader=response.body.getReader(),parts=[];let length=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;
    length+=value.byteLength;
    if(length>MAX_RESPONSE_BYTES){await reader.cancel();throw error('LLM_RESPONSE_TOO_LARGE')}
    parts.push(Buffer.from(value));
  }}finally{reader.releaseLock()}
  return Buffer.concat(parts).toString('utf8');
}

/** Protocol isolated for deterministic tests; never insert secrets into URLs. */
export async function invokeOfficialLlm({providerId,modelId,prompt,apiKey,signal,fetchImpl=globalThis.fetch,timeoutMs=180_000}){
  if(!ENDPOINTS[providerId]||typeof modelId!=='string'||!/^[\w.:/-]{1,128}$/.test(modelId)||
     modelId.includes('..')||typeof apiKey!=='string'||!apiKey||typeof prompt!=='string'||prompt.length>120_000)
    throw error('LLM_INVOCATION_INVALID');
  failWhenAborted(signal);
  const base=ENDPOINTS[providerId],isGemini=providerId==='gemini';
  const endpoint=isGemini?`${base}/v1beta/models/${encodeURIComponent(modelId)}:generateContent`
    :providerId==='groq'?`${base}/openai/v1/chat/completions`:`${base}/api/v1/chat/completions`;
  const headers={'content-type':'application/json',...(isGemini?{'x-goog-api-key':apiKey}:{authorization:`Bearer ${apiKey}`})};
  const body=isGemini?{contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.45}}
    :{model:modelId,messages:[{role:'user',content:prompt}],temperature:0.45};
  const timeout=AbortSignal.timeout(timeoutMs);
  const combined=AbortSignal.any([timeout,...(signal?[signal]:[])]);
  let response;
  try{
    response=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers,body:JSON.stringify(body),signal:combined});
  }catch{
    // Connection loss after dispatch is ambiguous. Never expose fetch errors
    // (some transports include API keys/request headers in their messages).
    throw error(signal?.aborted?'LLM_ABORTED':'LLM_TRANSPORT_UNCERTAIN',!signal?.aborted);
  }
  if(!response.ok){
    // Do NOT echo upstream error bodies: providers can include user prompts.
    const retryable=response.status===429||response.status===408||response.status>=500;
    throw error(response.status===429?'LLM_RATE_LIMIT':retryable?'LLM_UPSTREAM_TRANSIENT':'LLM_UPSTREAM_REJECTED',retryable);
  }
  let envelope;
  try{envelope=JSON.parse(await readBounded(response))}catch(e){if(e?.code)throw e;throw error('LLM_ENVELOPE_INVALID')}
  const text=isGemini?envelope?.candidates?.[0]?.content?.parts?.map(x=>x.text??'').join('')
    :envelope?.choices?.[0]?.message?.content;
  const result=safeJsonText(text);
  const rawUnits=isGemini?envelope?.usageMetadata?.totalTokenCount:envelope?.usage?.total_tokens;
  const units=Number.isSafeInteger(rawUnits)&&rawUnits>0&&rawUnits<=1e9?rawUnits:null;
  return {result,units};
}

/**
 * Free accounts require EXPLICIT server-side evidence they cannot bill.
 * `free_unverified` database labels and user UI flags are NOT proof.
 * Costed models require an independent, trusted cost estimate AND a scoped
 * R0-13 approval for the exact job/account/model; no automated paid fallback.
 */
export function createLlmDispatcher({db,store,credentialAccess,paidPolicy,fetchImpl=globalThis.fetch,
    allowRemote=false,confirmedFreeModelIds=[],verifiedCostCapsMicroUsd={},
    quotaReservationUnitsByModel={},clock=()=>Date.now(),minIntervalMs=1250}={}){
  if(!db||!store||!credentialAccess||!paidPolicy)throw new Error('LLM_DISPATCH_DEPENDENCY_REQUIRED');
  const providerAccounts=new ProviderAccountRepository(db,{clock});
  const quotaLedger=new QuotaLedgerRepository(db,{clock});
  const providerMonitor=new ProviderMonitorR212(db,{clock});
  const freeIds=new Set(confirmedFreeModelIds);
  const nextCall=new Map();
  const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(error('LLM_ABORTED'));
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms);
    const abort=()=>{clearTimeout(timer);reject(error('LLM_ABORTED'))};
    signal?.addEventListener('abort',abort,{once:true});
  });
  async function invoke({model,prompt,task,jobId,attempt=1,signal}={}){
    if(!validJob(jobId)||!['outline','chapter','judge','retry'].includes(task)||!model?.id||!model?.account_id)
      throw error('LLM_JOB_CONTEXT_REQUIRED');
    const pinned=store.get(jobId);
    if(pinned?.status!=='running'||pinned.payload?.providerModelId!==model.id||
       pinned.payload?.providerAccountId!==model.account_id)throw error('LLM_JOB_SCOPE_INVALID');
    if(!allowRemote)throw error('REMOTE_CONSENT_REQUIRED');
    if(!ENDPOINTS[model.provider_id]||model.location!=='remote'||model.kind!=='llm')throw error('LLM_PROVIDER_UNSUPPORTED');
    if(model.status!=='active'||model.account_status!=='active')throw error('LLM_MODEL_DISABLED');
    if(!['free_unverified','paid'].includes(model.cost_tier))throw error('LLM_COST_TIER_UNSUPPORTED');
    const current=providerAccounts.getModel(model.id);
    if(!current||current.status!=='active'||current.costTier!==model.cost_tier||
       current.accountId!==model.account_id||current.location!=='remote')throw error('LLM_MODEL_CHANGED');
    const originalAccount=db.prepare('SELECT * FROM provider_accounts WHERE id=?').get(model.account_id);
    if(!originalAccount||originalAccount.status!=='active'||originalAccount.provider_id!==model.provider_id)throw error('LLM_ACCOUNT_CHANGED');
    const primaryQuotaExhausted=current.quota.source!=='unknown'&&current.quota.limit!==null&&current.quota.used>=current.quota.limit;
    if(primaryQuotaExhausted&&model.cost_tier==='paid')throw error('LLM_QUOTA_EXHAUSTED');

    // Free fallback is limited to equivalent provider+model, with independent
    // evidence for EACH account. Never swap a paid target across approvals.
    const alternatives=model.cost_tier==='free_unverified'?db.prepare(`SELECT m.*,a.provider_id,a.credential_id,a.status account_status
      FROM provider_models m JOIN provider_accounts a ON m.account_id=a.id
      WHERE m.kind='llm' AND m.model_id=? AND a.provider_id=? AND m.location='remote'
      AND m.cost_tier='free_unverified' AND m.status='active' AND a.status='active'
      ORDER BY CASE WHEN m.id=? THEN -1 ELSE m.priority END,a.priority`).all(model.model_id,model.provider_id,model.id):[model];
    // Never fallback on auth, vault or invalid-schema failures; only known
    // temporary provider errors are eligible. No automatic retry of paid calls.
    let lastError=primaryQuotaExhausted?error('LLM_QUOTA_EXHAUSTED'):null;
    for(const target of alternatives){
      if(target.cost_tier==='free_unverified'&&!freeIds.has(target.id)){
        if(target.id===model.id)throw error('FREE_TIER_NOT_VERIFIED');
        continue;
      }
      const targetModel=providerAccounts.getModel(target.id);
      if(targetModel?.quota.source!=='unknown'&&targetModel?.quota.limit!==null&&
        quotaLedger.snapshot(target.id).remainingUnits===0){
          lastError=error('LLM_QUOTA_EXHAUSTED');continue;
        }
      const account=db.prepare('SELECT * FROM provider_accounts WHERE id=?').get(target.account_id);
      if(!account?.credential_id)throw error('LLM_CREDENTIAL_REQUIRED');
      if(account.status!=='active')throw error('LLM_MODEL_DISABLED');
      failWhenAborted(signal);
      const delay=Math.max(0,(nextCall.get(account.id)??0)-clock());
      if(delay)await sleep(delay,signal);
      nextCall.set(account.id,clock()+minIntervalMs);
      let reservation=null,quotaKey=null;
      try{
        const output=await credentialAccess.withCredential({credentialId:account.credential_id,providerId:account.provider_id},
          async secret=>{
            // Re-check the live account/model after queue wait and Vault access:
            // a changed billing tier or revoked credential must NOT inherit a
            // previously admitted free/paid routing decision (TOCTOU fence).
            const fresh=providerAccounts.getModel(target.id);
            const freshAccount=providerAccounts.getAccount(account.id);
            if(!fresh||!freshAccount||fresh.accountId!==account.id||
               fresh.kind!=='llm'||fresh.location!=='remote'||
               fresh.status!=='active'||freshAccount.status!=='active'||
               fresh.costTier!==target.cost_tier||freshAccount.providerId!==account.provider_id||
               freshAccount.credentialId!==account.credential_id)
              throw error('LLM_MODEL_CHANGED');
            // Paid approvals can be reserved only AFTER the Vault has supplied
            // a valid credential, avoiding needless budget use while locked.
            if(model.cost_tier==='paid'){
              const estimated=verifiedCostCapsMicroUsd[model.id];
              if(!Number.isSafeInteger(estimated)||estimated<=0)throw error('LLM_PRICE_NOT_VERIFIED');
              const approval=paidPolicy.list(jobId).find(g=>g.modelId===model.id&&g.accountId===account.id&&g.status==='approved'&&g.expiresAt>clock());
              if(!approval)throw error('PAID_APPROVAL_REQUIRED');
              const invocationKey=createHash('sha256').update(`llm:${jobId}:${model.id}:${task}`).digest('hex');
              paidPolicy.reserve({approvalId:approval.id,jobId,accountId:account.id,modelId:model.id,
                providerId:account.provider_id,invocationKey,estimateMicroUsd:estimated});
              reservation=invocationKey;
            }
            // Local quota is not official entitlement or billing evidence. For
            // user-set limits we require an operator-sized token reservation;
            // guessing output usage would allow concurrent workers to overrun.
            if(model.cost_tier==='free_unverified'&&targetModel?.quota.source!=='unknown'&&
               targetModel?.quota.limit!==null){
              const estimatedUnits=quotaReservationUnitsByModel[target.id];
              if(!Number.isSafeInteger(estimatedUnits)||estimatedUnits<1||estimatedUnits>1e9)
                throw error('LLM_QUOTA_ESTIMATE_REQUIRED');
              const key=createHash('sha256').update(`quota:${jobId}:${target.id}:${task}:${attempt}`).digest('hex');
              quotaLedger.reserve(target.id,{invocationKey:key,estimatedUnits});
              quotaKey=key;
            }
            return invokeOfficialLlm({providerId:account.provider_id,modelId:target.model_id,prompt,apiKey:secret,signal,fetchImpl});
          });
        if(reservation)paidPolicy.finish(reservation,'settled');
        // Only acknowledged, valid upstream results contribute to usage. The
        // quota source remains unknown/estimated unless officially verified.
        if(quotaKey){
          if(output.units)quotaLedger.settle(quotaKey,{actualUnits:output.units});
          else quotaLedger.uncertain(quotaKey); // no upstream metering proof
        }else if(output.units)providerAccounts.recordUsage(target.id,{requestId:createHash('sha256')
          .update(`usage:${jobId}:${target.id}`).digest('hex'),units:output.units});
        // This is a REAL successful switch, not an option shown by dry-run.
        // Logging is best-effort: an observational failure cannot cause a
        // completed paid/free upstream request to be retried and billed twice.
        if(target.id!==model.id){
          try {providerMonitor.recordFreeSwitch({jobId,attempt,fromModelId:model.id,
            toModelId:target.id,accountId:account.id,providerId:account.provider_id});}
          catch { /* telemetry must never trigger a duplicate provider call */ }
        }
        return output.result;
      }catch(e){
        if(reservation)paidPolicy.finish(reservation,'uncertain');
        if(quotaKey)quotaLedger.uncertain(quotaKey);
        const sanitized=e?.code&&/^[A-Z0-9_]{3,80}$/.test(e.code)?e:error('LLM_DISPATCH_FAILED');
        lastError=sanitized;
        if(model.cost_tier==='paid'||!['LLM_RATE_LIMIT','LLM_UPSTREAM_TRANSIENT'].includes(sanitized.code))throw sanitized;
      }
    }
    throw lastError??error('LLM_NO_ELIGIBLE_ACCOUNT');
  }
  return Object.freeze({invoke});
}
