/**
 * R0-06: read-only projection and state transitions for the ONE SP-04 SQLite queue.
 * WHY: store.get()/list() contain prompt text, provider payload, lease tokens and
 * possible credentials. They must NEVER cross the authenticated HTTP/SSE boundary.
 * Keep a deliberately small allowlist here instead of serializing DB rows.
 */
import {DomainError} from '../../../packages/core/src/index.mjs';
const statuses=new Set(['pending','running','paused','succeeded','failed','cancelled']);
const actions=new Set(['pause','resume','cancel','retry']);
const publicRenderStages=new Set(['preparing','encoding','finalizing','verifying']);
const eventTypes=new Set(['queued','started','succeeded','failed','paused','resumed','cancelled',
  'retry_scheduled','manual_retry','lease_recovered','render_progress']);
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,150}$/.test(value);
const safeKind=value=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,80}$/.test(value)?value:'unknown';
// Arbitrary uppercase provider text may masquerade as an error code.
// Use an explicit allowlist so no provider data can leak via SSE or job reads.
const publicErrors=new Set(['WORKER_ERROR','HANDLER_MISSING','LEASE_EXPIRED','DEPENDENCY_FAILED',
  'RATE_LIMIT','QUOTA_EXCEEDED','PROVIDER_UNAVAILABLE','TIMEOUT','ABORTED','NETWORK_ERROR','INVALID_INPUT']);
const safeCode=value=>publicErrors.has(value)?value:null;
const intOrNull=value=>Number.isSafeInteger(value)&&value>=0?value:null;

export function publicJob(job){
  if(!job)return null;
  return {
    id:job.id,kind:safeKind(job.kind),status:statuses.has(job.status)?job.status:'failed',
    priority:job.priority,attempt:job.attempt,maxAttempts:job.max_attempts,
    createdAt:intOrNull(job.created_at),updatedAt:intOrNull(job.updated_at),
    availableAt:intOrNull(job.available_at),lastError:safeCode(job.last_error),
    // Scene/video IDs are navigation identifiers, never content or prompts.
    projectId:safeId(job.payload?.projectId)?job.payload.projectId:null,
    sceneId:safeId(job.payload?.sceneId)?job.payload.sceneId:null
  };
}
export function publicJobEvent(event){
  // Never expose outbox detail_json directly, even after its producer changes.
  const detail=event.detail??{};
  return {
    seq:event.seq,jobId:event.job_id,type:eventTypes.has(event.type)?event.type:'unknown',createdAt:intOrNull(event.created_at),
    detail:event.type==='render_progress'?{attempt:intOrNull(detail.attempt),errorCode:safeCode(detail.errorCode),
      completedScenes:intOrNull(detail.completedScenes),totalScenes:intOrNull(detail.totalScenes),
      stage:publicRenderStages.has(detail.stage)?detail.stage:null}:
      {attempt:intOrNull(detail.attempt),errorCode:safeCode(detail.errorCode)}
  };
}
export function validCursor(cursor){
  if(typeof cursor!=='string'||!/^(0|[1-9]\d{0,15})$/.test(cursor))throw new DomainError('INVALID_EVENT_CURSOR',400);
  const after=Number(cursor);
  if(!Number.isSafeInteger(after))throw new DomainError('INVALID_EVENT_CURSOR',400);
  return after;
}
export function createJobCenter(store){
  return {
    list(query={}){
      const allowed=new Set(['status','limit']);
      if(Object.keys(query).some(k=>!allowed.has(k)))throw new DomainError('INVALID_JOB_FILTER',400);
      const status=query.status;
      if(status!==undefined&&!statuses.has(status))throw new DomainError('INVALID_JOB_FILTER',400);
      const limit=query.limit===undefined?100:Number(query.limit);
      if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw new DomainError('INVALID_JOB_LIMIT',400);
      return {items:store.list({status,limit}).map(publicJob),counts:store.countByStatus()};
    },
    get(id){
      if(!safeId(id))throw new DomainError('INVALID_JOB_ID',400);
      const job=store.get(id);
      if(!job)throw new DomainError('JOB_NOT_FOUND',404);
      return publicJob(job);
    },
    events(cursor='0',limit=100){
      const after=validCursor(cursor);
      if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw new DomainError('INVALID_EVENT_LIMIT',400);
      return store.events({after,limit}).map(publicJobEvent);
    },
    transition(id,action){
      if(!safeId(id))throw new DomainError('INVALID_JOB_ID',400);
      if(!actions.has(action))throw new DomainError('INVALID_JOB_ACTION',400);
      if(!store.get(id))throw new DomainError('JOB_NOT_FOUND',404);
      // SP-04 lease fencing rejects late commits. A running remote provider
      // request may nevertheless continue and incur cost after pause/cancel.
      const success=store[action](id);
      if(!success)throw new DomainError('JOB_STATE_CONFLICT',409);
      return this.get(id);
    }
  };
}

/** Returns a bounded SSE frame from sanitized public metadata only. */
export function jobEventFrame(event){
  return `id: ${event.seq}\nevent: job\ndata: ${JSON.stringify(publicJobEvent(event))}\n\n`;
}
