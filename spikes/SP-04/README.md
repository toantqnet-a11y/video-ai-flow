# SP-04 — Durable SQLite Job Queue & Fencing (Sprint 0)

**Status:** CODE COMPLETE + LOCAL TESTS PASS. **NOT production-ready**; native Windows, network filesystem, true provider file staging and real AI handlers have not been validated.

## Goal and delivery
Proof-of-concept for a long-form ContentStudio workflow (100+ scenes): in-process worker pool backed by persistent SQLite, dependencies, retry/backoff, heartbeat/lease expiry, fenced completion, logical asset revision uniqueness, outbox events and replayable SSE.

### Architecture

```
Future Fastify / UI
       | GET /api/jobs*, SSE /api/events/stream
 JobStore ────────── SQLite (WAL + FULL durability)
       │              ├─ jobs, dependencies, attempts
 JobRunner (workers) ├─ assets (logical revision uniqueness)
       │              └─ outbox (transactional event history)
  handlers[kind]       (TTS/Image/AI-video/FFmpeg adapters later)
```

**Important semantics:** `succeeded` means a handler result was committed. A provider call may execute more than once if a process crashes after the external side effect but before SQLite commit. Tokens fence DB commits, **not provider charges**. In production, content-addressed filesystem staging + atomic rename + validation, reconciliation and per-provider idempotency are additional requirements.

## Run (Node.js 22.13+)

```sh
cd SP-04
npm test
node src/cli.js demo ./data/queue.sqlite
node src/cli.js status ./data/queue.sqlite
```

No external npm dependencies. Node 22 `node:sqlite` is experimental and emits a warning. **PoC choice only**; stable native binding/migration still needs technical review.

Use `Run-Windows.ps1 -Mode Test` on Windows when a machine is available. The cross-process termination test is verified only on Linux at present.

### Public contract

```js
import { JobStore } from './src/store.js';
import { JobRunner } from './src/runner.js';
const store = new JobStore({ path: './data/queue.sqlite', leaseMs: 1000 });
const a = store.enqueue({ key:'video:abc:scene:1:voice:hash', kind:'tts', payload:{sceneId:'1'} }).job;
const b = store.enqueue({ key:'video:abc:scene:1:image:hash', kind:'image', deps:[a.id] }).job;
const runner = new JobRunner(store, {
  tts: async (payload,{signal,attempt}) => ({ result:{durationMs:5000}, asset:{logicalKey:'video:abc:scene:1:voice:hash',checksum:'a'.repeat(64),filePath:'data/voice.wav'} }),
  image: async (payload,{signal}) => ({result:{success:true}})
});
runner.start();
await runner.waitForIdle();
await runner.stop();
store.close();
```

This example demonstrates only queue contracts; sample checksum/path are placeholders, **not generated media**. Real handlers must validate files before announcing success. Store deliberately records only opaque payload in SQLite and never prints it to logs. Credentials should not be in payloads (refer to a credential ID, resolved at execution).

### Supported operations

| Operation | Contract | Behaviour |
|---|---|---|
| Enqueue | `enqueue({key,kind,payload,deps,priority,maxAttempts})` | Idempotency key is unique; conflicting inputs throw |
| Claim | `claim(workerId)` | Atomic; only deps with `succeeded` state eligible |
| Renew | `heartbeat(id,token)` | Token + lease checks; stale renewal fails |
| Complete | `complete(id,token,{result,asset})` | Atomic success + asset uniqueness + outbox |
| Error | `fail(id,token,{retryable,errorCode})` | Bounded retry with exponential backoff; terminal errors propagate |
| Recovery | `recoverExpired()` | Lost claims are requeued or failed; old tokens invalid |
| Controls | `pause(id)`, `resume(id)`, `cancel(id)`, `retry(id)` | Persisted; in-flight stale completions blocked |
| Observability | `countByStatus()`, `list()`, `events({after})`, `attempts(id)` | Replay on reconnect from cursor; GET reconciliation |

`src/api.js`: read-only endpoints `/api/jobs/summary`, `/api/jobs`, `/api/events?after=<seq>` and SSE `/api/events/stream` supporting `Last-Event-ID`. **Bind to loopback only**; authenticated write API and origin protection are out of scope for this spike (SP-06).

## Crash recovery test evidence

Test `test/crash.test.js` launches a **real OS child process**, waits until at least 12/100 jobs have finished and some are running, sends SIGKILL, waits for leases to expire, starts a new worker, verifies 100/100 `succeeded`, **100 unique committed asset logical keys**, recovered abandoned leases, no further work claimed on replay, and outbox catch-up from a pre-crash cursor. The `assets` table references fake `staging/*.wav` paths for this test; **not a demonstration of real TTS or media files**.

### Known limitations / production follow-up

- SQLite `node:sqlite` API is still experimental in Node 22; verify Windows and evaluate `better-sqlite3` or another supported binding before productization.
- No physical file atomic rename, checksum verification or stale staging-file cleanup. Integrate with SP-02/SP-03, create `asset_staging` + manifest/checksum preflight and orphan GC later.
- No metered provider calls; no quota/cost approval in runner. **Never register a paid handler without EP02/EP12 approval gate.**
- Single-host/local loopback architecture; no distributed/remote workers, no multi-machine lease assumption. System clock changes can affect lease expiry; review monotonic lease strategy for production.
- Runnable dependency DAG requires dependencies created first; no graph editing; dependents failing after parent permanent error require explicit manual retry after parent recovery.
- No event retention/pagination compaction; outbox growth and SSE subscriber limits require productization.
- No UI and no real FFmpeg/TTS/Comfy provider integration in SP-04.
- Not load/soak-tested at scale beyond 100 jobs; OS crash test on Windows and sudden power-loss reliability remain unverified.

**Next:** SP-05 500-scene Timeline spike. Keep SP-04 as tested PoC, not Windows-complete.
