/**
 * R0-07 Provider/Account Registry — safe metadata and local usage accounting.
 * WHY: provider configuration must survive restarts without ever storing an API
 * secret in SQLite. Secrets live exclusively in the encrypted SP-06 Vault.
 * A route preview is NOT permission to execute a paid or remote API call.
 */
import {randomUUID} from 'node:crypto';
import {transact} from './db.mjs';
import {QuotaLedgerRepository} from './quota-ledger-r208.mjs';
import {DomainError} from './domain.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
const idOk=id=>typeof id==='string'&&/^[a-z][a-z0-9_-]{1,63}$/.test(id);
const modelOk=id=>typeof id==='string'&&/^[\w.:/-]{1,128}$/.test(id)&&!id.includes('..');
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const enums={kind:['llm','tts','image','video'],location:['local','remote'],costTier:['local','free_unverified','paid'],quotaSource:['unknown','estimated','provider_verified'],status:['active','disabled']};
const safeEnum=(key,value)=>enums[key].includes(value);
const goodName=x=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=100;
const emptyOrId=x=>x===null||x===undefined||(typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(x));

// These are *capability categories*, not claims that any service currently has
// free API quota. Defaults are disabled until user creates a model/account.
export const PROVIDER_TEMPLATES=Object.freeze([
  {id:'ollama',name:'Ollama (local)',location:'local',kinds:['llm'],costTier:'local'},
  {id:'comfyui',name:'ComfyUI (local)',location:'local',kinds:['image','video'],costTier:'local'},
  {id:'piper',name:'Piper / local TTS',location:'local',kinds:['tts'],costTier:'local'},
  {id:'edge',name:'Microsoft Edge TTS',location:'remote',kinds:['tts'],costTier:'free_unverified'},
  {id:'gemini',name:'Gemini API',location:'remote',kinds:['llm','tts','image','video'],costTier:'free_unverified'},
  {id:'groq',name:'Groq API',location:'remote',kinds:['llm'],costTier:'free_unverified'},
  {id:'openrouter',name:'OpenRouter API',location:'remote',kinds:['llm'],costTier:'free_unverified'},
  {id:'seedance',name:'Seedance (third-party API)',location:'remote',kinds:['video'],costTier:'paid'},
  {id:'custom',name:'Custom endpoint',location:'remote',kinds:['llm','tts','image','video'],costTier:'free_unverified'}
]);
const templates=new Map(PROVIDER_TEMPLATES.map(p=>[p.id,p]));
const parse=x=>JSON.parse(x);
const mapAccount=row=>row&&({id:row.id,providerId:row.provider_id,name:row.name,credentialId:row.credential_id,
  status:row.status,priority:row.priority,rowVersion:row.row_version,createdAt:row.created_at,updatedAt:row.updated_at});
const mapModel=row=>row&&({id:row.id,accountId:row.account_id,modelId:row.model_id,kind:row.kind,
  location:row.location,costTier:row.cost_tier,status:row.status,priority:row.priority,
  endpoint:row.endpoint,quota:{source:row.quota_source,limit:row.quota_limit,used:row.quota_used,
    resetAt:row.quota_reset_at},rowVersion:row.row_version,createdAt:row.created_at,updatedAt:row.updated_at});
const constrainFields=(obj,fields)=>{
  if(!isObj(obj)||Object.keys(obj).some(k=>!fields.includes(k)))fail('INVALID_PROVIDER_CONFIGURATION');
};

/** Metadata-only endpoint rule. Live outbound requests MUST use the separate
 * SSRF-safe egress adapter; we never probe user-defined URLs from this module.
 */
export function validateProviderEndpoint(endpoint,location){
  if(endpoint===null||endpoint===undefined||endpoint==='')return null;
  if(typeof endpoint!=='string'||endpoint.length>320||/[\s\\?#@]/.test(endpoint))fail('INVALID_PROVIDER_ENDPOINT');
  let url;try{url=new URL(endpoint)}catch{fail('INVALID_PROVIDER_ENDPOINT')}
  if(url.username||url.password||url.search||url.hash||url.pathname.startsWith('//') || url.port&&(!/^\d+$/.test(url.port)))fail('INVALID_PROVIDER_ENDPOINT');
  if(location==='local'){
    if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname))fail('INVALID_PROVIDER_ENDPOINT');
  }else{
    // No raw IP, localhost, embedded credentials or arbitrary HTTP; DNS still
    // must be verified/pinned by the runtime egress adapter before connecting.
    if(url.protocol!=='https:'||url.hostname==='localhost'||!url.hostname.includes('.')||/^(?:\d+\.){3}\d+$/.test(url.hostname)||url.hostname.endsWith('.local'))fail('INVALID_PROVIDER_ENDPOINT');
  }
  return url.origin + (url.pathname==='/' ? '' : url.pathname);
}

export class ProviderAccountRepository {
  constructor(db,{clock=()=>Date.now()}={}){this.db=db;this.clock=clock;}
  templates(){return PROVIDER_TEMPLATES.map(p=>({...p,kinds:[...p.kinds]}));}
  listAccounts(){return this.db.prepare('SELECT * FROM provider_accounts ORDER BY priority ASC,created_at ASC').all().map(mapAccount);}
  getAccount(id){return mapAccount(this.db.prepare('SELECT * FROM provider_accounts WHERE id=?').get(id));}
  createAccount(body={}){
    constrainFields(body,['providerId','name','credentialId','priority']);
    const {providerId,name,credentialId=null,priority=100}=body;
    if(!templates.has(providerId)||!goodName(name)||!emptyOrId(credentialId)||!Number.isSafeInteger(priority)||priority<0||priority>10000)fail('INVALID_PROVIDER_ACCOUNT');
    const id=randomUUID(),now=this.clock();
    transact(this.db,()=>{
      this.db.prepare('INSERT INTO provider_accounts(id,provider_id,name,credential_id,status,priority,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,providerId,name.trim(),credentialId,'active',priority,now,now);
      this.#event('provider_account',id,'provider_account.created',{providerId});
    });return this.getAccount(id);
  }
  updateAccount(id,body={}){
    constrainFields(body,['name','credentialId','status','priority','rowVersion']);
    const prev=this.getAccount(id);if(!prev)fail('PROVIDER_ACCOUNT_NOT_FOUND',404);
    if(body.rowVersion!==prev.rowVersion)fail('VERSION_CONFLICT',409);
    const next={name:body.name??prev.name,credentialId:body.credentialId===undefined?prev.credentialId:body.credentialId,
      status:body.status??prev.status,priority:body.priority??prev.priority};
    if(!goodName(next.name)||!emptyOrId(next.credentialId)||!safeEnum('status',next.status)||!Number.isSafeInteger(next.priority)||next.priority<0||next.priority>10000)fail('INVALID_PROVIDER_ACCOUNT');
    transact(this.db,()=>{
      this.db.prepare('UPDATE provider_accounts SET name=?,credential_id=?,status=?,priority=?,row_version=row_version+1,updated_at=? WHERE id=?')
        .run(next.name.trim(),next.credentialId,next.status,next.priority,this.clock(),id);
      this.#event('provider_account',id,'provider_account.updated');
    });return this.getAccount(id);
  }
  listModels(accountId){
    if(accountId&&!this.getAccount(accountId))fail('PROVIDER_ACCOUNT_NOT_FOUND',404);
    return (accountId?this.db.prepare('SELECT * FROM provider_models WHERE account_id=? ORDER BY priority,created_at').all(accountId):
      this.db.prepare('SELECT * FROM provider_models ORDER BY priority,created_at').all()).map(mapModel);
  }
  getModel(id){return mapModel(this.db.prepare('SELECT * FROM provider_models WHERE id=?').get(id));}
  createModel(accountId,body={}){
    constrainFields(body,['modelId','kind','location','costTier','endpoint','priority']);
    const account=this.getAccount(accountId);if(!account)fail('PROVIDER_ACCOUNT_NOT_FOUND',404);
    const provider=templates.get(account.providerId);
    const {modelId,kind,location=provider.location,costTier=provider.costTier,priority=100}=body;
    if(!modelOk(modelId)||!safeEnum('kind',kind)||!provider.kinds.includes(kind)||!safeEnum('location',location)||(account.providerId!=='custom'&&location!==provider.location)||
       !safeEnum('costTier',costTier)||(location==='local'&&costTier!=='local')||
       (!['custom','gemini','groq','openrouter'].includes(account.providerId)&&costTier!==provider.costTier)||
       (['gemini','groq','openrouter'].includes(account.providerId)&&costTier==='local')||
       !Number.isSafeInteger(priority)||priority<0||priority>10000)fail('INVALID_PROVIDER_MODEL');
    // User-supplied free labels are *unverified*. Remote model accounts
    // can explicitly declare PAID when their plan bills requests; runtime
    // still requires trusted pricing, Vault access and job-scoped approval.
    const endpoint=validateProviderEndpoint(body.endpoint,location),id=randomUUID(),now=this.clock();
    try{transact(this.db,()=>{
      this.db.prepare(`INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,endpoint,status,priority,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,accountId,modelId,kind,location,costTier,endpoint,'active',priority,now,now);
      this.#event('provider_model',id,'provider_model.created',{accountId,kind});
    });}catch(e){if(String(e.message).includes('UNIQUE constraint failed'))fail('PROVIDER_MODEL_EXISTS',409);throw e;}
    return this.getModel(id);
  }
  updateModel(id,body={}){
    constrainFields(body,['status','priority','rowVersion']);
    const prev=this.getModel(id);if(!prev)fail('PROVIDER_MODEL_NOT_FOUND',404);
    if(body.rowVersion!==prev.rowVersion)fail('VERSION_CONFLICT',409);
    const {status=prev.status,priority=prev.priority}=body;
    if(!safeEnum('status',status)||!Number.isSafeInteger(priority)||priority<0||priority>10000)fail('INVALID_PROVIDER_MODEL');
    transact(this.db,()=>{
      this.db.prepare('UPDATE provider_models SET status=?,priority=?,row_version=row_version+1,updated_at=? WHERE id=?')
        .run(status,priority,this.clock(),id);
      this.#event('provider_model',id,'provider_model.updated');
    });return this.getModel(id);
  }
  /** Store only safe quota evidence. Never assume provider offers a quota API. */
  setQuota(modelId,body={}){
    constrainFields(body,['source','limit','used','resetAt','rowVersion']);
    const model=this.getModel(modelId);if(!model)fail('PROVIDER_MODEL_NOT_FOUND',404);
    if(body.rowVersion!==model.rowVersion)fail('VERSION_CONFLICT',409);
    const source=body.source;
    if(!safeEnum('quotaSource',source)||source==='provider_verified')fail('PROVIDER_QUOTA_VERIFICATION_REQUIRED',409);
    // Verified quota may only be written by future trusted adapter with source
    // authentication, not by user-editable API data.
    const limit=source==='unknown'?null:body.limit,used=source==='unknown'?null:body.used;
    if(source!=='unknown'&&(!Number.isSafeInteger(limit)||limit<0||limit>1e12||!Number.isSafeInteger(used)||used<0||used>1e12||
      (body.resetAt!==null&&body.resetAt!==undefined&&(!Number.isSafeInteger(body.resetAt)||body.resetAt<0))))fail('INVALID_QUOTA');
    const resetAt=source==='unknown'?null:body.resetAt??null;
    transact(this.db,()=>{
      this.db.prepare('UPDATE provider_models SET quota_source=?,quota_limit=?,quota_used=?,quota_reset_at=?,row_version=row_version+1,updated_at=? WHERE id=?')
        .run(source,limit,used,resetAt,this.clock(),modelId);
      this.#event('provider_model',modelId,'provider_quota.updated',{source});
    });return this.getModel(modelId);
  }
  /** Append usage only after a caller has observed a completed request.
   * Idempotency prevents retry/recovery from double-counting one API call.
   */
  recordUsage(modelId,{requestId,units}={}){
    const model=this.getModel(modelId);if(!model)fail('PROVIDER_MODEL_NOT_FOUND',404);
    if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)||!Number.isSafeInteger(units)||units<=0||units>1e9)fail('INVALID_USAGE_RECORD');
    const now=this.clock();
    transact(this.db,()=>{
      const recorded=this.db.prepare('SELECT model_id,units FROM provider_usage_events WHERE request_id=?').get(requestId);
      if(recorded){if(recorded.model_id!==modelId||recorded.units!==units)fail('USAGE_IDEMPOTENCY_CONFLICT',409);return;}
      this.db.prepare('INSERT INTO provider_usage_events(request_id,model_id,units,created_at) VALUES(?,?,?,?)').run(requestId,modelId,units,now);
      if(model.quota.source!=='unknown')this.db.prepare('UPDATE provider_models SET quota_used=quota_used+?,updated_at=? WHERE id=?').run(units,now,modelId);
      this.#event('provider_model',modelId,'provider_usage.recorded',{units});
    });return this.getModel(modelId);
  }
  /** Pure planning / dry run, no API calls, no persisted approval. Route changes
   * due to exhausted quota or paid tier return an explanation to the UI.
   */
  planRoute({kind,allowRemote=false,paidApproval=null}={}){
    if(!safeEnum('kind',kind)||typeof allowRemote!=='boolean')fail('INVALID_ROUTE_REQUEST');
    const candidates=[];
    for(const model of this.listModels()){
      if(model.kind!==kind)continue;
      const account=this.getAccount(model.accountId);
      let reason=null;
      if(account.status!=='active'||model.status!=='active')reason='DISABLED';
      else if(model.quota.source!=='unknown'&&model.quota.limit!==null&&model.quota.used>=model.quota.limit)reason='QUOTA_EXHAUSTED';
      else if(new QuotaLedgerRepository(this.db,{clock:this.clock}).snapshot(model.id).remainingUnits===0)reason='QUOTA_RESERVED';
      else if(model.location==='remote'&&!allowRemote)reason='REMOTE_CONSENT_REQUIRED';
      else if(model.costTier==='paid'&&!(paidApproval?.approved===true&&paidApproval?.accountId===account.id&&paidApproval?.modelId===model.id&&
        typeof paidApproval.maxUsd==='number'&&Number.isFinite(paidApproval.maxUsd)&&paidApproval.maxUsd>0))reason='PAID_APPROVAL_REQUIRED';
      else if(model.location==='remote'&&account.credentialId===null&& !['edge'].includes(account.providerId))reason='CREDENTIAL_REQUIRED';
      candidates.push({modelId:model.id,accountId:account.id,providerId:account.providerId,kind,location:model.location,
        costTier:model.costTier,quota:model.quota,eligible:reason===null,reason,priority:model.priority+account.priority});
    }
    candidates.sort((a,b)=> Number(b.eligible)-Number(a.eligible) || a.priority-b.priority || a.modelId.localeCompare(b.modelId));
    return {kind,candidates,selected:candidates.find(x=>x.eligible)??null,dryRun:true,
      message:'Chỉ mô phỏng chọn model. Chưa gọi API, chưa xác minh credential, quota hoặc giá thực tế.'};
  }
  #event(type,id,name,detail={}){
    this.db.prepare('INSERT INTO domain_events(entity_type,entity_id,event_name,created_at,detail_json) VALUES(?,?,?,?,?)')
      .run(type,id,name,this.clock(),JSON.stringify(detail));
  }
}
