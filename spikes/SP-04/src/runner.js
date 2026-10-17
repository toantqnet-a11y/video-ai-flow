/**
 * In-process concurrent worker loop for durable SQLite jobs.
 * Provider handlers receive AbortSignal and periodically heartbeat their lease.
 * Never assume AbortSignal stops remote work: a stale worker is fenced at commit.
 * Restarts are safe because recoverExpired() requeues abandoned leased work.
 */
import { randomUUID } from 'node:crypto';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errorCode = e => typeof e?.code === 'string' ? e.code : 'WORKER_ERROR';

export class JobRunner {
  constructor(store, handlers, { concurrency = 3, pollMs = 20, heartbeatMs = 100, workerId = randomUUID() } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) throw new Error('invalid concurrency');
    if (!Number.isInteger(pollMs) || pollMs < 1) throw new Error('invalid pollMs');
    if (!Number.isInteger(heartbeatMs) || heartbeatMs < 1 || heartbeatMs >= store.leaseMs) throw new Error('heartbeat must be shorter than lease');
    this.store = store;
    this.handlers = handlers;
    this.concurrency = concurrency;
    this.pollMs = pollMs;
    this.heartbeatMs = heartbeatMs;
    this.workerId = workerId;
    this.active = new Map();
    this.running = false;
    this.loopPromise = null;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.store.recoverExpired();
    this.loopPromise = this.loop();
  }
  async loop() {
    while (this.running) {
      this.store.recoverExpired();
      while (this.running && this.active.size < this.concurrency) {
        const job = this.store.claim(this.workerId);
        if (!job) break;
        const controller = new AbortController();
        const task = this.execute(job, controller);
        this.active.set(job.id, { task, controller });
        void task.finally(() => this.active.delete(job.id));
      }
      await sleep(this.pollMs);
    }
  }
  async execute(job, controller) {
    const handler = this.handlers[job.kind];
    const timer = setInterval(() => {
      try {
        if (!this.store.heartbeat(job.id, job.lease_token)) controller.abort();
      } catch { controller.abort(); }
    }, this.heartbeatMs);
    try {
      if (!handler) throw Object.assign(new Error('handler missing'), {code:'HANDLER_MISSING',retryable:false});
      const output = await handler(job.payload, { signal:controller.signal, jobId:job.id, attempt:job.attempt });
      // Handlers return { result, asset }; never log untrusted payload/provider output.
      this.store.complete(job.id, job.lease_token, output ?? {});
    } catch (error) {
      this.store.fail(job.id, job.lease_token, {retryable:error?.retryable !== false, errorCode:errorCode(error)});
    } finally {
      clearInterval(timer);
    }
  }
  /** Graceful stop: avoid leaving uncompleted handler promises in this process. */
  async stop({ abort = false } = {}) {
    this.running = false;
    if (abort) for (const {controller} of this.active.values()) controller.abort();
    if (this.loopPromise) await this.loopPromise;
    await Promise.allSettled([...this.active.values()].map(x => x.task));
  }
  async waitForIdle({ timeoutMs = 10_000 } = {}) {
    const deadline = Date.now()+timeoutMs;
    while (Date.now()<deadline) {
      const s = this.store.countByStatus();
      if (this.active.size===0 && s.pending === undefined && s.running === undefined) return s;
      await sleep(this.pollMs);
    }
    throw new Error('waitForIdle timed out');
  }
}
