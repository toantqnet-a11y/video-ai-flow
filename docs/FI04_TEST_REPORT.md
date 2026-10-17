# FI-04 Observed Test Report — 17/10/2026

Host: Linux; Node 22.16.0. The target Windows browser and GPU were NOT available. Offline PASS does not certify application release.

| Test/gate | Observed result | Limitation |
|---|---|---|
| Pre-FI04 original source `npm run test:all -- --concurrency=2` | 865/865 PASS, Node final TAP summary | Legacy FI-03 intermittent hang not reproduced on this run |
| FI04 new `npm run test:fi04` | 10/10 PASS | Includes positive/negative TAP runner, lock/build gate and backlog protection tests |
| `npm run test:all` after FI04 code | **875/875 PASS**, 150 test files, Node TAP exit 0 (52.5 s) | Linux full invocation; separate 19-batch Linux run also PASS; Windows soak still needed |
| `npm run test:all:batched` | **19/19 batches PASS, 875/875 tests**, 150 test files | Serial per-batch Linux isolation; Windows still unverified |
| `npm run backlog:check:fi04` | PASS, 59 unique tasks; 14 AI Video | Existing 42 historical entries preserved |
| `npm run check` / `npm run typecheck:sdk` | PASS / PASS | OpenAPI/static contracts only |
| `npm run test:negative-control` | PASS | Intentionally failing fixture correctly rejected |
| `npm ping --fetch-retries=0 --fetch-timeout=3500` | FAIL `EAI_AGAIN` | npm registry DNS/network unavailable |
| `npm run build:web` | exit 127 — `vite: not found` | Missing dependency, not frontend acceptance |
| `npm run test:live-http` | exit 1 — `ERR_MODULE_NOT_FOUND` | Fastify not installed, not actual live HTTP acceptance |
| `npm run acceptance:fi04:inspect` | NOT_READY: Node PASS; lock/Vite/Fastify/HyperFrames/Built UI/live HTTP BLOCKED | Inventory only |
| `npm run acceptance:fi04:verify` | exits 1 as designed (`--strict`) | Refuses a fake PASS when prerequisites not available |
| Windows/HyperFrames actual MP4/35-min/recovery/providers | NOT RUN | Must remain BLOCKED |

Test runner source `tools/fi04-test-control.mjs`; `--test-timeout=180000`, whole-suite watchdog 900000ms, defaults concurrency 2. Fail-closed complete TAP requirement; batched runner never retries or skips. This hardens a previous indefinite stall but cannot prove all causes of intermittent FFmpeg hangs have been eliminated. A genuine reproducible failing case should be isolated by per-file test timeouts and batch diagnostics.

Machine-readable gate inventory: `docs/evidence/FI04_runtime_gates.json`. Whole-suite TAP evidence was captured in the execution workspace and is intentionally excluded from user archives to avoid local path leakage; the test counts here are actual observed completed output.

## FI-04-04 additive observation — 2026-10-17
`npm run test:fi0404` 5/5 PASS including actual local 5-scene SP-04 queued fixture, draft and music snapshot. `npm run test:hyperframes` 8/8 PASS (mock/contract); finishing regression 12/12 PASS; `npm run test:all:batched` 19/19 batches and **880/880 tests PASS**. A separate unbatched attempt did not complete (last #634): no new direct full-suite green assertion. `acceptance:fi0404:real` exits 1 as required: lock missing, pinned CLI not installed. No genuine HyperFrames MP4. Master backlog now **60** unique IDs including FI-04-04. See `docs/FI0404_TEST_REPORT.md`.
