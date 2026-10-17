# R2-13 · G3–G6 integration/regression contract

**Origin:** approved `Video_AI_Flow_Development_Execution_Plan_v3.md`, R2-13 “Scene + 100+ asset failure suite”; EP05/06/12 QA. This QA task does **not** add an API, migration, paid-provider adapter or second queue.

## Scenarios and exact evidence

| Gate | Deterministic offline assertions | Acceptance boundary |
|---|---|---|
| G3 Scene source | 110 Vietnamese paragraphs, whitespace/CRLF/emoji, exact UTF-16 offsets and join/coverage | No text loss or implicit correction; quality/editing review remains manual. |
| G4 100+ assets | 53 scenes × 2 types = 106 media revisions, 160 queued jobs; complete and verify SHA, restart SQLite, resubmit with zero new provider stages. | Local mock media only. Successful committed job never replays after restart. |
| G4 Failure recovery | One failed image among 106 stage jobs: 105 successful providers, 104 promoted assets until retry; explicit retry dispatches only failed image and promotes 106 final assets. | No lost successful output, no other job/provider replay. |
| G4 Crash/atomicity | Crash after successful stage commit but before domain promotion, re-open and recover; DB trigger injected write failure in >100-asset submission leaves all tables clean; real blocked asset directory leaves pointer unchanged; missing image provider returns 503 before enqueue. | Failure injection is NOT proof of real Windows ENOSPC, physical power loss, or end-to-end GPU availability. |
| G4 File corruption | Corrupted manually pinned image is never silently replaced or treated as healthy. | Need actual storage-failure/backup testing on target device. |
| G5 Rate limits/consent | Synthetic `RATE_LIMITED` (429 equivalent) retry capped at configured attempts; failed graph stays failed across restart; Edge consent and cross-video scene scope fail closed. | Simulated error, not a real HTTP 429 or verified provider Retry-After behavior. |
| G5 Intent fences | Outdated mocked stage cannot activate over user-selected image; production image handler explicitly refuses provider invocation on stale intent; idempotency conflict prevents changed inputs under same key. | No paid API invoked by these tests; they do not prove a provider will not bill a remote operation interrupted *before* DB commit. |
| G6 Live release | `npm run readiness:r213` snapshots binaries and **always** reports NOT_READY until independently accepted. | Windows, browser/Fastify, native TTS, ComfyUI checkpoint, real disk-full/cancel, provider 429, and 30–40-minute output are open. |

## Repeatable commands

```bash
npm run test:r213
npm run test:all
npm run check
npm run typecheck:sdk
npm run test:negative-control
npm run readiness:r213
npm run build:web
npm run test:live-http
```

`npm run test:r213` uses the SP-04 durable scheduler and real SQLite WAL/domain storage with local deterministic files and fake provider handlers. Real `createJobHandlers()` is also exercised for pre-dispatch stale-intent refusal. **The test WAV is synthetic silence**, not TTS speech. Synthetic rate limits are thrown as `RATE_LIMITED` errors. Offline elapsed times are not throughput benchmarks for 35-minute video render.

## G6 target checklist before signoff

1. Windows: clean `npm install`, full suite, launcher, SQLite and power-loss recovery on the target machine; preserve immutable revisions and backup before destructive disk tests.
2. Browser: `npm run build:web`, Fastify authenticated HTTP smoke, React UI flows for scenes/assets/quota/manual revert.
3. Providers: live Piper/VieNeu/Edge voice + measured FFprobe, local ComfyUI with real checkpoint/GPU, bounded 429/Retry-After and transparent billing audit; no automatic paid calls.
4. Storage: perform ENOSPC/read-only/permission-denied/restart validation using an expendable test profile and independent backup.
5. Media: after R2-EXT-01/02/03/04/06, render a real 5-scene MP4 (H.264/AAC), inspect sync and captions, then benchmark 30/35/40 minutes with resources recorded. FFmpeg baseline alone does not certify Remotion or HyperFrames.

**Release decision:** original R2-01..13 code + deterministic offline tests complete; **R2 production release NOT signed off**. Do not set status `DONE` until G6 is evidenced.
