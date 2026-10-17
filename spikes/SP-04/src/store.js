/**
 * Durable dependency-aware JobStore.
 * Why fencing exists: a worker may finish after its lease expires and another
 * worker has claimed the job. Only the newest lease token may commit results.
 * Outbox events are inserted in the same SQLite transaction as job changes.
 * External provider calls are at-least-once after crashes; only DB commits are
 * effectively once per idempotency key. Provider-side billing cannot be fenced.
 */
import { randomUUID, createHash } from 'node:crypto';
import { openQueueDb, transaction } from './db.js';

const json = (v) => JSON.stringify(v ?? null);
const parsed = (v) => v == null ? null : JSON.parse(v);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nowClock = () => Date.now();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const minInt = (x, min, max, field) => {
  assert(Number.isInteger(x) && x >= min && x <= max, `${field}: invalid integer`);
  return x;
};

export class JobStore {
  constructor({ path = ':memory:', clock = nowClock, leaseMs = 1000, baseBackoffMs = 100, maxBackoffMs = 30_000 } = {}) {
    this.db = openQueueDb(path);
    this.clock = clock;
    this.leaseMs = minInt(leaseMs, 50, 86_400_000, 'leaseMs');
    this.baseBackoffMs = minInt(baseBackoffMs, 0, 86_400_000, 'baseBackoffMs');
    this.maxBackoffMs = minInt(maxBackoffMs, 0, 86_400_000, 'maxBackoffMs');
  }
  close() { this.db.close(); }
  emit(jobId, type, detail = {}) {
    this.db.prepare('INSERT INTO outbox(job_id,type,created_at,detail_json) VALUES (?,?,?,?)')
      .run(jobId, type, this.clock(), json(detail));
  }
  get(id) {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
    return row ? this.fromRow(row) : null;
  }
  fromRow(r) {
    return { ...r, payload: parsed(r.payload_json), result: parsed(r.result_json),
      payload_json: undefined, result_json: undefined, spec_hash: undefined };
  }
  countByStatus() {
    const counts = Object.fromEntries(this.db.prepare('SELECT status,count(*) AS n FROM jobs GROUP BY status').all().map(r => [r.status,r.n]));
    return { total: Object.values(counts).reduce((a,b) => a+b,0), ...counts };
  }
  list({ status, limit = 100, offset = 0 } = {}) {
    minInt(limit, 1, 1000, 'limit');
    minInt(offset, 0, 10_000_000, 'offset');
    const rows = status
      ? this.db.prepare('SELECT * FROM jobs WHERE status=? ORDER BY priority DESC,created_at,id LIMIT ? OFFSET ?').all(status,limit,offset)
      : this.db.prepare('SELECT * FROM jobs ORDER BY priority DESC,created_at,id LIMIT ? OFFSET ?').all(limit,offset);
    return rows.map(r => this.fromRow(r));
  }
  events({ after = 0, limit = 100, jobId } = {}) {
    minInt(after, 0, Number.MAX_SAFE_INTEGER, 'after');
    minInt(limit, 1, 1000, 'limit');
    const rows = jobId
      ? this.db.prepare('SELECT * FROM outbox WHERE seq>? AND job_id=? ORDER BY seq LIMIT ?').all(after,jobId,limit)
      : this.db.prepare('SELECT * FROM outbox WHERE seq>? ORDER BY seq LIMIT ?').all(after,limit);
    return rows.map(e => ({ ...e, detail: parsed(e.detail_json), detail_json: undefined }));
  }
  dependencies(id) {
    return this.db.prepare('SELECT depends_on FROM dependencies WHERE job_id=? ORDER BY depends_on').all(id).map(r=>r.depends_on);
  }
  _enqueueInTransaction({ id = randomUUID(), key, kind, payload = {}, deps = [], priority = 0, maxAttempts = 3 } = {}) {
    assert(typeof id === 'string' && id.length > 0 && id.length <= 150, 'invalid id');
    assert(typeof key === 'string' && key.length > 0 && key.length <= 300, 'idempotency key required');
    assert(typeof kind === 'string' && /^[a-zA-Z0-9:_-]{1,80}$/.test(kind), 'invalid kind');
    assert(Array.isArray(deps) && deps.every(d => typeof d === 'string') && new Set(deps).size === deps.length, 'invalid dependencies');
    minInt(priority, -100, 100, 'priority');
    minInt(maxAttempts, 1, 100, 'maxAttempts');
    // Stable spec hash prevents silently reusing a key for a changed prompt/voice/model.
    const specHash = hash({ kind, payload, deps: [...deps].sort(), priority, maxAttempts });
      const existing = this.db.prepare('SELECT id,spec_hash FROM jobs WHERE idem_key=?').get(key);
      if (existing) {
        assert(existing.spec_hash === specHash, 'idempotency key conflict: payload/dependencies changed');
        return { job: this.get(existing.id), reused: true };
      }
      assert(!deps.includes(id), 'job may not depend on itself');
      for (const dep of deps) assert(this.get(dep), `missing dependency: ${dep}`);
      const ts = this.clock();
      this.db.prepare(`INSERT INTO jobs(id,idem_key,kind,payload_json,spec_hash,priority,status,max_attempts,available_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'pending',?,?,?,?)`).run(id,key,kind,json(payload),specHash,priority,maxAttempts,ts,ts,ts);
      for (const dep of deps) this.db.prepare('INSERT INTO dependencies(job_id,depends_on) VALUES(?,?)').run(id,dep);
      this.emit(id, 'queued', { kind, deps });
      return { job: this.get(id), reused: false };
  }
  enqueue(spec={}) {
    return transaction(this.db,()=>this._enqueueInTransaction(spec));
  }
  /** R2-07: write the entire ordered DAG AND domain intents in one SQLite
   * transaction. Failed validation cannot leave paid/remote jobs half-queued.
   * Dependencies must point to existing jobs or earlier entries in this batch.
   */
  enqueueManyAtomic(entries,onCommitted=()=>{}) {
    assert(Array.isArray(entries)&&entries.length>=1&&entries.length<=1000,'invalid DAG size');
    assert(typeof onCommitted==='function','invalid DAG commit hook');
    return transaction(this.db,()=>{
      const alias=new Map();
      const jobs=entries.map(spec=>{
        const deps=(spec.deps??[]).map(id=>alias.get(id)??id);
        // An already queued/succeeded stage can be reused across asset DAG
        // requests. Gate payload references must point at its ACTUAL job id.
        const payload=spec.kind==='workflow:scene-assets'?{...spec.payload,
          voiceJobId:alias.get(spec.payload.voiceJobId)??spec.payload.voiceJobId,
          imageJobId:alias.get(spec.payload.imageJobId)??spec.payload.imageJobId}:spec.payload;
        const outcome=this._enqueueInTransaction({...spec,deps,payload});
        if(alias.has(spec.id))throw new Error('duplicate batch job id');
        alias.set(spec.id,outcome.job.id);
        return outcome;
      });
      onCommitted(jobs,this.db);
      return jobs;
    });
  }
  /** Explicit R2-07 retry: re-arm only failed jobs and blocked DAG gates as
   * ONE WAL transaction. Never retries successfully billed/inferred assets. */
  retryFailedBatch(ids,validate=()=>{}) {
    assert(Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.length<=1000,'invalid retry DAG');
    return transaction(this.db,()=>{
      validate(this.db);
      const ts=this.clock();let count=0;
      for(const id of ids){
        const row=this.db.prepare('SELECT status FROM jobs WHERE id=?').get(id);
        assert(row,'retry job missing');
        if(row.status==='cancelled')throw new Error('cancelled DAG cannot be retried');
        if(row.status!=='failed')continue;
        this.db.prepare(`UPDATE jobs SET status='pending',max_attempts=max_attempts+1,
          available_at=?,last_error=NULL,updated_at=? WHERE id=?`).run(ts,ts,id);
        this.emit(id,'manual_retry');count++;
      }
      return count;
    });
  }
  // Query for a runnable DAG node; no claimed job is returned to two workers.
  claim(workerId) {
    assert(typeof workerId === 'string' && workerId.length > 0, 'workerId required');
    return transaction(this.db, () => {
      const ts = this.clock();
      const row = this.db.prepare(`SELECT j.* FROM jobs j
        WHERE j.status='pending' AND j.available_at<=?
        AND NOT EXISTS (SELECT 1 FROM dependencies d JOIN jobs parent ON parent.id=d.depends_on
                        WHERE d.job_id=j.id AND parent.status <> 'succeeded')
        ORDER BY j.priority DESC, j.created_at, j.id LIMIT 1`).get(ts);
      if (!row) return null;
      const token = randomUUID();
      this.db.prepare(`UPDATE jobs SET status='running', attempt=attempt+1, lease_token=?,lease_until=?,worker_id=?,updated_at=? WHERE id=?`)
        .run(token, ts + this.leaseMs, workerId, ts, row.id);
      this.db.prepare(`INSERT INTO attempts(job_id,attempt,worker_id,started_at) VALUES(?,?,?,?)`)
        .run(row.id, row.attempt + 1, workerId, ts);
      this.emit(row.id, 'started', { attempt: row.attempt + 1, workerId });
      return this.get(row.id);
    });
  }
  heartbeat(id, token) {
    return transaction(this.db, () => {
      const ts = this.clock();
      const r = this.db.prepare(`UPDATE jobs SET lease_until=?,updated_at=?
        WHERE id=? AND status='running' AND lease_token=? AND lease_until>?`).run(ts+this.leaseMs,ts,id,token,ts);
      return r.changes === 1;
    });
  }
  complete(id, token, { result = null, asset = null } = {}) {
    return transaction(this.db, () => {
      const ts = this.clock();
      const j = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
      if (!j || j.status !== 'running' || j.lease_token !== token || j.lease_until <= ts) return false;
      if (asset) {
        assert(typeof asset.logicalKey === 'string' && asset.logicalKey.length > 0, 'asset logicalKey required');
        assert(/^[0-9a-f]{64}$/i.test(asset.checksum ?? ''), 'asset SHA-256 required');
        assert(typeof asset.filePath === 'string' && asset.filePath.length > 0, 'asset path required');
        const existing = this.db.prepare('SELECT * FROM assets WHERE logical_key=?').get(asset.logicalKey);
        // Another already-committed logical asset revision is immutable.
        assert(!existing || (existing.job_id === id && existing.checksum === asset.checksum), 'asset revision conflict');
        this.db.prepare(`INSERT OR IGNORE INTO assets(logical_key,job_id,checksum,file_path,committed_at) VALUES(?,?,?,?,?)`)
          .run(asset.logicalKey,id,asset.checksum,asset.filePath,ts);
      }
      this.db.prepare(`UPDATE jobs SET status='succeeded',result_json=?,lease_token=NULL,lease_until=NULL,worker_id=NULL,updated_at=? WHERE id=?`)
        .run(json(result),ts,id);
      this.db.prepare(`UPDATE attempts SET finished_at=?,outcome='succeeded' WHERE job_id=? AND attempt=?`).run(ts,id,j.attempt);
      this.emit(id,'succeeded',{ attempt:j.attempt, assetKey:asset?.logicalKey ?? null });
      return true;
    });
  }
  fail(id, token, { retryable = true, errorCode = 'WORKER_ERROR' } = {}) {
    return transaction(this.db, () => {
      const ts = this.clock();
      const j = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
      if (!j || j.status !== 'running' || j.lease_token !== token || j.lease_until <= ts) return false;
      const willRetry = retryable && j.attempt < j.max_attempts;
      const backoff = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** Math.min(20, j.attempt - 1));
      this.db.prepare(`UPDATE jobs SET status=?,available_at=?,last_error=?,lease_token=NULL,lease_until=NULL,worker_id=NULL,updated_at=? WHERE id=?`)
        .run(willRetry ? 'pending':'failed',ts+(willRetry ? backoff:0),String(errorCode).slice(0,100),ts,id);
      this.db.prepare(`UPDATE attempts SET finished_at=?,outcome=? WHERE job_id=? AND attempt=?`)
        .run(ts,willRetry ? 'retry':'failed',id,j.attempt);
      this.emit(id,willRetry?'retry_scheduled':'failed',{ attempt:j.attempt, errorCode:String(errorCode).slice(0,100) });
      if (!willRetry) this.failBlockedDependents();
      return true;
    });
  }
  // Scavenge leases lost to OS kill, machine power loss or disconnected workers.
  recoverExpired() {
    return transaction(this.db, () => {
      const ts = this.clock();
      const expired = this.db.prepare("SELECT * FROM jobs WHERE status='running' AND lease_until<=?").all(ts);
      for (const j of expired) {
        const retry = j.attempt < j.max_attempts;
        this.db.prepare(`UPDATE jobs SET status=?,lease_token=NULL,lease_until=NULL,worker_id=NULL,available_at=?,last_error='LEASE_EXPIRED',updated_at=? WHERE id=?`)
          .run(retry?'pending':'failed',ts,ts,j.id);
        this.db.prepare("UPDATE attempts SET finished_at=?,outcome='lease_expired' WHERE job_id=? AND attempt=?")
          .run(ts,j.id,j.attempt);
        this.emit(j.id,retry?'lease_recovered':'failed',{ attempt:j.attempt, errorCode:'LEASE_EXPIRED' });
      }
      this.failBlockedDependents();
      return expired.length;
    });
  }
  // Must be called within a transaction, including by recoverExpired/fail/cancel.
  failBlockedDependents() {
    let n = 0;
    while (true) {
      const rows = this.db.prepare(`SELECT DISTINCT j.id FROM jobs j JOIN dependencies d ON d.job_id=j.id
        JOIN jobs parent ON parent.id=d.depends_on WHERE j.status='pending' AND parent.status IN ('failed','cancelled')`).all();
      if (!rows.length) break;
      for (const {id} of rows) {
        this.db.prepare("UPDATE jobs SET status='failed',last_error='DEPENDENCY_FAILED',updated_at=? WHERE id=?")
          .run(this.clock(),id);
        this.emit(id,'failed',{ errorCode:'DEPENDENCY_FAILED' });
        n++;
      }
    }
    return n;
  }
  pause(id) { return this.manualTransition(id, 'paused', ['pending','running'], 'paused'); }
  resume(id) { return this.manualTransition(id, 'pending', ['paused'], 'resumed'); }
  cancel(id) { return this.manualTransition(id, 'cancelled', ['pending','running','paused'], 'cancelled'); }
  retry(id) {
    return transaction(this.db, () => {
      const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
      if (!row || row.status !== 'failed') return false;
      // Preserve monotonic attempt IDs (attempts PK), grant a fresh attempt budget.
      this.db.prepare("UPDATE jobs SET status='pending',max_attempts=max_attempts+1,available_at=?,last_error=NULL,updated_at=? WHERE id=?")
        .run(this.clock(),this.clock(),id);
      this.emit(id,'manual_retry');
      return true;
    });
  }
  manualTransition(id, to, allowed, event) {
    return transaction(this.db, () => {
      const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
      if (!row || !allowed.includes(row.status)) return false;
      this.db.prepare('UPDATE jobs SET status=?,lease_token=NULL,lease_until=NULL,worker_id=NULL,available_at=?,updated_at=? WHERE id=?')
        .run(to,this.clock(),this.clock(),id);
      if (row.status === 'running') this.db.prepare('UPDATE attempts SET finished_at=?,outcome=? WHERE job_id=? AND attempt=?')
        .run(this.clock(),event,id,row.attempt);
      this.emit(id,event);
      if (to === 'cancelled') this.failBlockedDependents();
      return true;
    });
  }
  getAsset(logicalKey) { return this.db.prepare('SELECT * FROM assets WHERE logical_key=?').get(logicalKey) ?? null; }
  attempts(id) { return this.db.prepare('SELECT * FROM attempts WHERE job_id=? ORDER BY attempt').all(id); }
}
