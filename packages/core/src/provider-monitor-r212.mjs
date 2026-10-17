/** R2-12: local, read-only provider/fallback monitoring plus append-only actual switches.
 * Never infer provider billing balance, remote entitlement or a switch from a
 * preview, a quota reservation, or a user's manually entered "free" tier.
 */
import {DomainError} from './domain.mjs';
import {QuotaLedgerRepository} from './quota-ledger-r208.mjs';

const safeInt=x=>Number.isSafeInteger(x)&&x>=0;
const safeId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(x);
export class ProviderMonitorR212 {
  constructor(db,{clock=()=>Date.now()}={}){
    this.db=db;this.clock=clock;this.ledger=new QuotaLedgerRepository(db,{clock});
  }
  snapshot({limit=20}={}){
    if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new DomainError('INVALID_MONITOR_LIMIT',400);
    const models=this.db.prepare(`SELECT m.id,m.model_id,m.account_id,m.kind,m.location,m.cost_tier,m.status,
      a.name account_name,a.provider_id,a.status account_status
      FROM provider_models m JOIN provider_accounts a ON a.id=m.account_id
      ORDER BY a.priority,m.priority,m.id LIMIT 101`).all();
    // Bounded response; never return credentialId, endpoint or provider error body.
    const items=models.slice(0,100).map(m=>{
      const q=this.ledger.snapshot(m.id);
      const known=q.source!=='unknown'&&q.limit!==null&&q.used!==null&&q.remainingUnits!==null;
      const utilization=known&&q.limit>0?(q.used+q.pendingUnits)/q.limit:null;
      const disabled=m.status!=='active'||m.account_status!=='active';
      const exhausted=known&&q.remainingUnits===0;
      const nearLimit=known&&q.limit>0&&!exhausted&&utilization>=0.9;
      const state=disabled?'disabled':exhausted?'local_limit_exhausted':nearLimit?'local_limit_near'
        :!known?'quota_unverified':m.location==='local'?'local_configured':'local_limit_ok';
      return {id:m.id,modelId:m.model_id,accountId:m.account_id,accountName:m.account_name,
        providerId:m.provider_id,kind:m.kind,location:m.location,costTier:m.cost_tier,
        status:state,quotaSource:q.source,limit:known?q.limit:null,used:known?q.used:null,
        pendingUnits:q.pendingUnits,pendingCalls:q.pendingCalls,
        remainingUnits:known?q.remainingUnits:null,nearLimit,exhausted,
        requiresPaidApproval:m.cost_tier==='paid',
        // This field describes accounting *source*, not proof of free quota.
        billingVerified:false,observedAt:this.clock()};
    });
    const switches=this.db.prepare(`SELECT seq,job_id,attempt,from_model_id,to_model_id,account_id,
      provider_id,status,consent,billing_gate,created_at FROM provider_switch_events
      ORDER BY seq DESC LIMIT ?`).all(limit).map(row=>({seq:row.seq,jobId:row.job_id,
      attempt:row.attempt,fromModelId:row.from_model_id,toModelId:row.to_model_id,
      accountId:row.account_id,providerId:row.provider_id,status:row.status,
      consent:row.consent,billingGate:row.billing_gate,createdAt:row.created_at}));
    return {asOf:this.clock(),items,truncated:models.length>100,switches,
      switchCoverage:'remote_llm_success_only',
      billingVerified:false,liveQuotaChecked:false};
  }
  /** Record a real, successful equivalent free-account fallback ONLY. Caller
   * must have passed the runtime consent and free entitlement gates already.
   * This method cannot authorize a call, and must never run for a preview.
   */
  recordFreeSwitch({jobId,attempt,fromModelId,toModelId,accountId,providerId}={}){
    if(![jobId,fromModelId,toModelId,accountId,providerId].every(safeId)||
      !Number.isSafeInteger(attempt)||attempt<1||attempt>100000||fromModelId===toModelId)
      throw new DomainError('INVALID_PROVIDER_SWITCH',400);
    const origin=this.db.prepare(`SELECT m.model_id,m.kind,m.cost_tier,m.location,a.provider_id
      FROM provider_models m JOIN provider_accounts a ON a.id=m.account_id WHERE m.id=?`).get(fromModelId);
    const dest=this.db.prepare(`SELECT m.model_id,m.kind,m.cost_tier,m.location,m.account_id,a.provider_id
      FROM provider_models m JOIN provider_accounts a ON a.id=m.account_id WHERE m.id=?`).get(toModelId);
    if(!origin||!dest||origin.kind!=='llm'||dest.kind!=='llm'||
       origin.model_id!==dest.model_id||origin.provider_id!==dest.provider_id||
       dest.account_id!==accountId||dest.provider_id!==providerId||
       origin.location!=='remote'||dest.location!=='remote'||
       origin.cost_tier!=='free_unverified'||dest.cost_tier!=='free_unverified')
      throw new DomainError('PROVIDER_SWITCH_NOT_EQUIVALENT',409);
    this.db.prepare(`INSERT OR IGNORE INTO provider_switch_events
      (job_id,attempt,from_model_id,to_model_id,account_id,provider_id,status,consent,billing_gate,created_at)
      VALUES(?,?,?,?,?,?,'succeeded','explicit_remote_runtime','confirmed_free_allowlist',?)`)
      .run(jobId,attempt,fromModelId,toModelId,accountId,providerId,this.clock());
  }
}
