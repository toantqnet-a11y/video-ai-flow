/**
 * R0-13 Paid Invocation Guard (server-only).
 * WHY: an AI routing preview or arbitrary JSON `paidApproval` field is never a
 * billing authorization. A person must explicitly approve one job+model+account
 * and its budget. The worker atomically reserves estimated cost BEFORE network
 * dispatch. Unknown external outcomes remain reserved; retry cannot bill twice
 * via the same invocation key or reuse remaining budget without new approval.
 *
 * USD values at HTTP boundary are converted to INTEGER MICRO-USD in SQLite.
 * This is a local-estimate ceiling, not a guarantee of actual provider invoice.
 */
import {randomUUID} from 'node:crypto';
import {transact} from './db.mjs';
import {DomainError} from './domain.mjs';

const reject=(code,status=403)=>{throw new DomainError(code,status)};
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,150}$/.test(x);
const micro=(value)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>10000 ||
     Math.abs(value*1e6-Math.round(value*1e6))>0.00001)reject('INVALID_PAID_BUDGET',400);
  return Math.round(value*1e6);
};
const safeApproval=r=>r&&({id:r.id,jobId:r.job_id,accountId:r.account_id,modelId:r.model_id,
  maxUsd:r.total_micro_usd/1e6,perCallMaxUsd:r.per_call_micro_usd/1e6,
  reservedUsd:r.reserved_micro_usd/1e6,remainingUsd:(r.total_micro_usd-r.reserved_micro_usd)/1e6,
  expiresAt:r.expires_at,revokedAt:r.revoked_at,createdAt:r.created_at,
  status:r.revoked_at!==null?'revoked':'approved'});

export class PaidPolicyRepository {
  constructor(db,{clock=()=>Date.now(),jobLookup=null}={}){this.db=db;this.clock=clock;this.jobLookup=jobLookup;}
  /** Approval is a deliberate authenticated+CSRF-protected action, never implied by route planning. */
  approve(input={}) {
    if(!input||typeof input!=='object'||Array.isArray(input)||
       Object.keys(input).some(k=>!['jobId','accountId','modelId','maxUsd','perCallMaxUsd','expiresMinutes','confirmation'].includes(k)) ||
       input.confirmation!=='AUTHORIZE_PAID_USAGE'||!validId(input.jobId)||!validId(input.accountId)||!validId(input.modelId))
      reject('EXPLICIT_PAID_CONFIRMATION_REQUIRED',400);
    const max=micro(input.maxUsd),perCall=micro(input.perCallMaxUsd);
    if(perCall>max||!Number.isSafeInteger(input.expiresMinutes)||input.expiresMinutes<1||input.expiresMinutes>1440)
      reject('INVALID_PAID_BUDGET',400);
    if(this.jobLookup){
      const job=this.jobLookup(input.jobId);
      if(!job)reject('JOB_NOT_FOUND',404);
      if(job.payload?.providerModelId!==input.modelId||job.payload?.providerAccountId!==input.accountId)
        reject('PAID_JOB_TARGET_REQUIRED',409);
      if(['succeeded','cancelled'].includes(job.status))reject('JOB_NOT_BILLABLE',409);
    }
    const row=this.db.prepare(`SELECT m.id,m.account_id,m.status AS model_status,m.cost_tier,
      a.status AS account_status,a.provider_id FROM provider_models m
      JOIN provider_accounts a ON a.id=m.account_id WHERE m.id=?`).get(input.modelId);
    if(!row||row.account_id!==input.accountId||row.model_status!=='active'||row.account_status!=='active'||row.cost_tier!=='paid')
      reject('PAID_MODEL_NOT_ELIGIBLE',409);
    const now=this.clock(),id=randomUUID();
    transact(this.db,()=>{
      this.db.prepare(`INSERT INTO paid_approvals(id,job_id,account_id,model_id,total_micro_usd,per_call_micro_usd,expires_at,created_at)
        VALUES(?,?,?,?,?,?,?,?)`).run(id,input.jobId,input.accountId,input.modelId,max,perCall,now+input.expiresMinutes*60000,now);
      this.#audit('approved',id,null,0,now);
    });
    return safeApproval(this.#row(id));
  }
  #row(id){return this.db.prepare('SELECT * FROM paid_approvals WHERE id=?').get(id);}
  get(id){return safeApproval(this.#row(id));}
  list(jobId){
    if(!validId(jobId))reject('INVALID_JOB_ID',400);
    return this.db.prepare('SELECT * FROM paid_approvals WHERE job_id=? ORDER BY created_at DESC').all(jobId).map(safeApproval);
  }
  audit(jobId){
    if(!validId(jobId))reject('INVALID_JOB_ID',400);
    return this.db.prepare(`SELECT a.seq,a.action,a.approval_id AS approvalId,a.invocation_key AS invocationKey,
      a.amount_micro_usd/1000000.0 AS estimatedUsd,a.at
      FROM paid_policy_audit a JOIN paid_approvals g ON a.approval_id=g.id
      WHERE g.job_id=? ORDER BY a.seq DESC LIMIT 200`).all(jobId);
  }
  revoke(id){
    const now=this.clock();
    return transact(this.db,()=>{
      const old=this.#row(id);if(!old)reject('PAID_APPROVAL_NOT_FOUND',404);
      if(old.revoked_at===null){
        this.db.prepare('UPDATE paid_approvals SET revoked_at=? WHERE id=?').run(now,id);
        this.#audit('revoked',id,null,0,now);
      }
      return safeApproval(this.#row(id));
    });
  }
  /** Prevent duplicate network dispatch after crash: reservation key is unique and never reused. */
  reserve({approvalId,jobId,accountId,modelId,providerId,invocationKey,estimateMicroUsd}={}){
    if(!validId(approvalId)||!validId(jobId)||!validId(accountId)||!validId(modelId)||
       !validId(invocationKey)||!Number.isSafeInteger(estimateMicroUsd)||estimateMicroUsd<=0)
      reject('INVALID_PAID_INVOCATION',400);
    const now=this.clock();
    // A paused/cancelled/expired queue lease may not start new paid work.
    // This is a check at dispatch, not only when the user approves a budget.
    if(this.jobLookup){
      const job=this.jobLookup(jobId);
      if(!job||job.status!=='running')reject('PAID_JOB_NOT_RUNNING');
      if(job.payload?.providerModelId!==modelId||job.payload?.providerAccountId!==accountId)reject('PAID_JOB_TARGET_REQUIRED');
    }
    return transact(this.db,()=>{
      const g=this.#row(approvalId);
      if(!g)reject('PAID_APPROVAL_REQUIRED');
      const row=this.db.prepare(`SELECT m.account_id,m.cost_tier,m.status AS model_status,a.provider_id,a.status AS account_status
        FROM provider_models m JOIN provider_accounts a ON a.id=m.account_id WHERE m.id=?`).get(modelId);
      if(!row||row.provider_id!==providerId||row.account_id!==accountId||row.model_status!=='active'||row.account_status!=='active'||row.cost_tier!=='paid')reject('PAID_MODEL_MISMATCH');
      if(g.job_id!==jobId||g.account_id!==accountId||g.model_id!==modelId)reject('PAID_SCOPE_MISMATCH');
      if(g.revoked_at!==null)reject('PAID_APPROVAL_REVOKED');
      if(g.expires_at<=now)reject('PAID_APPROVAL_EXPIRED');
      if(estimateMicroUsd>g.per_call_micro_usd||estimateMicroUsd>g.total_micro_usd-g.reserved_micro_usd)reject('PAID_BUDGET_EXCEEDED');
      if(this.db.prepare('SELECT 1 FROM paid_invocations WHERE invocation_key=?').get(invocationKey))reject('PAID_INVOCATION_ALREADY_RESERVED',409);
      this.db.prepare('UPDATE paid_approvals SET reserved_micro_usd=reserved_micro_usd+? WHERE id=?').run(estimateMicroUsd,approvalId);
      this.db.prepare(`INSERT INTO paid_invocations(invocation_key,approval_id,job_id,model_id,estimate_micro_usd,status,created_at,updated_at)
        VALUES(?,?,?,?,?,'reserved',?,?)`).run(invocationKey,approvalId,jobId,modelId,estimateMicroUsd,now,now);
      this.#audit('reserved',approvalId,invocationKey,estimateMicroUsd,now);
      return {invocationKey,estimateUsd:estimateMicroUsd/1e6,status:'reserved'};
    });
  }
  /** Mark confirmed dispatch outcome, never refund automatically on network errors. */
  finish(invocationKey,status){
    if(!['settled','uncertain'].includes(status))reject('INVALID_PAID_OUTCOME',400);
    const now=this.clock();
    return transact(this.db,()=>{
      const row=this.db.prepare('SELECT * FROM paid_invocations WHERE invocation_key=?').get(invocationKey);
      if(!row)reject('PAID_INVOCATION_NOT_FOUND',404);
      if(row.status==='reserved'){
        this.db.prepare('UPDATE paid_invocations SET status=?,updated_at=? WHERE invocation_key=?').run(status,now,invocationKey);
        this.#audit(status,row.approval_id,invocationKey,row.estimate_micro_usd,now);
      }
      return {invocationKey,status:row.status==='reserved'?status:row.status};
    });
  }
  #audit(action,approvalId,invocationKey,amount,now){
    this.db.prepare('INSERT INTO paid_policy_audit(action,approval_id,invocation_key,amount_micro_usd,at) VALUES(?,?,?,?,?)')
      .run(action,approvalId,invocationKey,amount,now);
  }
}

/** Paid network work always enters through this non-exported authorization boundary. */
export function createPaidInvocationPolicy(repository){
  return async function executePaid({approvalId,jobId,accountId,modelId,providerId,invocationKey,estimateMicroUsd},dispatch){
    repository.reserve({approvalId,jobId,accountId,modelId,providerId,invocationKey,estimateMicroUsd});
    try {const result=await dispatch();repository.finish(invocationKey,'settled');return result;}
    catch(error){repository.finish(invocationKey,'uncertain');throw error;}
  };
}
