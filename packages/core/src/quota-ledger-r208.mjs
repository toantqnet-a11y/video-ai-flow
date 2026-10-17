/**
 * R2-08 — durable provider quota reservation ledger.
 * WHY: a read of provider_models.quota_used alone is not a safe admission
 * decision when several workers can initiate calls before any finishes.
 * Reservations hold capacity on crash/unknown upstream outcome; they are
 * NEVER automatically refunded, reset or used as evidence of a free tier.
 */
import {transact} from './db.mjs';
import {DomainError} from './domain.mjs';

const fail=(code,status=409)=>{throw new DomainError(code,status)};
const keyOk=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,150}$/.test(x);
const modelOk=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(x);
const unitsOk=x=>Number.isSafeInteger(x)&&x>0&&x<=1_000_000_000;
const snapshot=r=>({invocationKey:r.invocation_key,modelId:r.model_id,
  reservedUnits:r.reserved_units,actualUnits:r.actual_units??null,status:r.status,
  createdAt:r.created_at,updatedAt:r.updated_at});

export class QuotaLedgerRepository {
  constructor(db,{clock=()=>Date.now()}={}){this.db=db;this.clock=clock;}
  /** Never call this "remaining provider quota": source=estimated is user-declared. */
  snapshot(modelId){
    if(!modelOk(modelId))fail('INVALID_MODEL_ID',400);
    const model=this.db.prepare(`SELECT m.id,m.status,m.cost_tier,m.quota_source,m.quota_limit,m.quota_used,
      a.status account_status FROM provider_models m JOIN provider_accounts a ON a.id=m.account_id WHERE m.id=?`).get(modelId);
    if(!model)fail('PROVIDER_MODEL_NOT_FOUND',404);
    const pending=this.db.prepare(`SELECT COALESCE(SUM(reserved_units),0) n,COUNT(*) c
      FROM provider_quota_calls WHERE model_id=? AND status IN ('reserved','uncertain')`).get(modelId);
    const known=model.quota_source!=='unknown'&&model.quota_limit!==null&&model.quota_used!==null;
    const remaining=known?Math.max(0,model.quota_limit-model.quota_used-pending.n):null;
    return {modelId,source:model.quota_source,limit:model.quota_limit,used:model.quota_used,
      pendingUnits:pending.n,pendingCalls:pending.c,remainingUnits:remaining,
      admitted: model.status==='active'&&model.account_status==='active'&&(!known||remaining>0),
      billingVerified:false,quotaVerified:model.quota_source==='provider_verified'};
  }
  list(modelId,{limit=50}={}){
    this.snapshot(modelId);
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail('INVALID_QUOTA_LEDGER_LIMIT',400);
    return {modelId,items:this.db.prepare(`SELECT * FROM provider_quota_calls WHERE model_id=?
      ORDER BY created_at DESC,invocation_key DESC LIMIT ?`).all(modelId,limit).map(snapshot)};
  }
  /** Reserve within SQLite BEGIN IMMEDIATE, so 2 workers cannot claim same tokens.
   * A key can NEVER be re-used to dispatch a second remote request.
   */
  reserve(modelId,{invocationKey,estimatedUnits}={}){
    if(!modelOk(modelId)||!keyOk(invocationKey)||!unitsOk(estimatedUnits))fail('INVALID_QUOTA_RESERVATION',400);
    return transact(this.db,()=>{
      const old=this.db.prepare('SELECT * FROM provider_quota_calls WHERE invocation_key=?').get(invocationKey);
      if(old)fail(old.model_id!==modelId||old.reserved_units!==estimatedUnits?'QUOTA_IDEMPOTENCY_CONFLICT':'QUOTA_INVOCATION_ALREADY_RESERVED');
      const available=this.snapshot(modelId);
      if(!available.admitted)fail('QUOTA_EXHAUSTED');
      // Unknown ceilings are not proof of available free calls; independent
      // remote consent and verified billing entitlement remain mandatory.
      if(available.remainingUnits!==null&&available.remainingUnits<estimatedUnits)fail('QUOTA_EXHAUSTED');
      const now=this.clock();
      this.db.prepare(`INSERT INTO provider_quota_calls
        (invocation_key,model_id,reserved_units,actual_units,status,created_at,updated_at)
        VALUES(?,?,?,NULL,'reserved',?,?)`).run(invocationKey,modelId,estimatedUnits,now,now);
      return snapshot(this.db.prepare('SELECT * FROM provider_quota_calls WHERE invocation_key=?').get(invocationKey));
    });
  }
  /** Success accounts provider-reported usage exactly once. If missing usage,
   * mark uncertain instead of fabricating zero spent or releasing the hold.
   */
  settle(invocationKey,{actualUnits}={}){
    if(!keyOk(invocationKey)||!unitsOk(actualUnits))fail('INVALID_QUOTA_SETTLEMENT',400);
    return transact(this.db,()=>{
      const prev=this.db.prepare('SELECT * FROM provider_quota_calls WHERE invocation_key=?').get(invocationKey);
      if(!prev)fail('QUOTA_RESERVATION_NOT_FOUND',404);
      if(prev.status==='settled'){
        if(prev.actual_units!==actualUnits)fail('QUOTA_SETTLEMENT_CONFLICT');
        return snapshot(prev);
      }
      if(prev.status!=='reserved')fail('QUOTA_RESERVATION_UNCERTAIN');
      const now=this.clock();
      this.db.prepare(`UPDATE provider_quota_calls SET status='settled',actual_units=?,updated_at=?
        WHERE invocation_key=?`).run(actualUnits,now,invocationKey);
      // Same request id is used by the historical usage table. This is an
      // idempotent write and cannot double-add used units on job replay.
      this.db.prepare(`INSERT INTO provider_usage_events(request_id,model_id,units,created_at)
        VALUES(?,?,?,?)`).run(invocationKey,prev.model_id,actualUnits,now);
      this.db.prepare(`UPDATE provider_models SET quota_used=quota_used+?,updated_at=?
        WHERE id=? AND quota_source<>'unknown'`).run(actualUnits,now,prev.model_id);
      return snapshot(this.db.prepare('SELECT * FROM provider_quota_calls WHERE invocation_key=?').get(invocationKey));
    });
  }
  /** If the transport fails after dispatch, outcome is ambiguous: hold funds.
   * Marking uncertain twice is idempotent; settled results remain immutable.
   */
  uncertain(invocationKey){
    if(!keyOk(invocationKey))fail('INVALID_QUOTA_RESERVATION',400);
    return transact(this.db,()=>{
      const prev=this.db.prepare('SELECT * FROM provider_quota_calls WHERE invocation_key=?').get(invocationKey);
      if(!prev)fail('QUOTA_RESERVATION_NOT_FOUND',404);
      if(prev.status==='settled')fail('QUOTA_ALREADY_SETTLED');
      if(prev.status==='reserved')this.db.prepare(`UPDATE provider_quota_calls SET status='uncertain',updated_at=? WHERE invocation_key=?`).run(this.clock(),invocationKey);
      return snapshot(this.db.prepare('SELECT * FROM provider_quota_calls WHERE invocation_key=?').get(invocationKey));
    });
  }
  /** On restart, in-flight calls cannot be safely considered unused. */
  recover(){
    return this.db.prepare(`UPDATE provider_quota_calls SET status='uncertain',updated_at=?
      WHERE status='reserved'`).run(this.clock()).changes;
  }
}
