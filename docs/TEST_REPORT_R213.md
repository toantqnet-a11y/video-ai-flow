# R2-13 — Integration Regression Test Report · 2026-10-15

**Scope:** cross-module EP05/06/12 G3–G6; incremental tests only, no provider feature changes.
**State:** `CODE_COMPLETE_TESTED_OFFLINE`; **release:** `NOT_READY` pending live gates.

| Executed command | Actual result | Evidence / reason |
|---|---|---|
| `npm run test:r213` | **15/15 PASS** | 13 integration tests + 2 release-gate tests. |
| `npm run test:all` | **688/688 PASS** | Includes app, mock provider, and spike suites. |
| `npm run check` | **PASS** | Node syntax and generated OpenAPI/SDK artifact drift check. |
| `npm run typecheck:sdk` | **PASS** | TypeScript public API contract. |
| `npm run test:negative-control` | **PASS** | Deliberately broken control fails as expected. |
| `npm run readiness:r213` | **PASS snapshot; NOT READY** | Linux, Node 22.16; FFmpeg/FFprobe present; Vite absent. |
| `npm run build:web` | **BLOCKED (exit 127)** | `vite: not found` (workspace dependency not installed). |
| `npm run test:live-http` | **BLOCKED (exit 1)** | `ERR_MODULE_NOT_FOUND` (Fastify/runtime dependency unavailable). |

## Verified deterministic outcomes

- G3: Unicode and source offsets preserved (110 Vietnamese paragraphs, emoji and CRLF).
- G4: 53 scenes × voice/image = **106 media assets**, **160 DAG jobs** (106 stages, 53 gates, 1 final). All revision SHA checks healthy. New request after restart requires only 53 gates + 1 final job; **zero new local provider calls**.
- G4: one injected failed image with **105 successful stage jobs** leaves 104 active revisions (the other successful voice remains staged in affected scene). Explicit retry invokes only 1 missing image; all 106 healthy revisions become active after final gate.
- G4: crash after stage `succeeded` and before promotion recovers without reinvocation. Simulated SQLite commit failure rolls back all DAG rows/jobs/outbox/intents; corrupted pin and filesystem directory failure do not change selected pointers.
- G5: synthetic rate-limit failure retries only up to maxAttempts and propagates failure; no paid switch. Edge without consent, forged scene IDs and altered idempotency request fail closed. Real handler preflight blocks stale manual-image requests before provider `invoke`.
- G6: readiness snapshot explicitly refuses production signoff even if all binaries were available on Windows.

## Known limitations (not PASS)

- R2-13 used **synthetic local provider outputs**. PNG from checked-in fixture and generated valid silent WAV are not live AI-generated imagery or speech.
- SQLite injected `RAISE(ABORT)` and blocked directory test are **not** physical disk-full or power-loss reproduction.
- Synthetic `RATE_LIMITED` is **not** a genuine remote HTTP 429. Retry-After/policy billing require separate live tests.
- A worker may execute at least once and crash *before* successful DB commit, so remote provider execution/billing cannot be assumed exactly-once; successful **committed** jobs are fenced against re-dispatch in these tests.
- No native Windows, actual browser/build/Fastify HTTP, GPU/ComfyUI inference, Piper/VieNeu, official provider quota/billing, MP4 render or 30–40-minute performance validation.

## Files

`packages/core/test/integration-regression-r213.test.mjs`, `tools/r213-readiness.mjs`, `tools/r213-readiness.test.mjs`, `docs/R213_INTEGRATION_ACCEPTANCE.md`, `docs/evidence/R213_release_readiness.json`, `docs/TEST_REPORT_R213.md`. No migration, API route, credentials or user media were changed.
