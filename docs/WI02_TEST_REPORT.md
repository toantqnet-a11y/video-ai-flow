# WI-02 · Actual test report — 2026-10-17

| Gate | Observed result | Boundary |
|---|---|---|
| `npm run test:wi02` | **10/10 PASS** | Pure policy, fail-closed, local HTTP fixture, secure spawn/env rules; **not actual installed Fastify** |
| `npm run test:wi01` | **9/9 PASS** | Windows preflight policy (tested on Linux) |
| `npm run test:fi04` | **10/10 PASS** | FI-04 hardening/backlog regression |
| `npm run test:fi0404` | **5/5 PASS** | HyperFrames acceptance *offline* fixture |
| `npm run test:fi0405` | **10/10 PASS** | Timeline UX logic (not real Chrome/Edge) |
| `npm run test:fi0406-fi0410` | **19/19 PASS** | Offline release/recovery policies |
| `npm run backlog:check:fi04` | **68 distinct task IDs; 14 AI-video IDs preserved** | No generator drift |
| `npm run check` | PASS | Syntax/OpenAPI/contracts consistency |
| `npm run typecheck:sdk` | PASS | SDK typecheck |
| `npm run test:negative-control` | PASS | Intentional failure correctly detected |
| `npm run acceptance:wi02:inspect` | **5 PASS / 7 BLOCKED prerequisites** | Linux Node 22; no Windows/locked npm graph/runtime |
| `node tools/wi02-runtime.mjs --run --strict` | exit 1 (expected) | No fake runtime pass with missing prerequisites |
| Full `npm run test:all:batched` | **928/928 PASS, 20/20 batches** | Offline Node, not live Windows runtime |
| Real `npm ci`, Vite build, Fastify listen/socket, Windows Chrome/Edge | **BLOCKED / NOT EXECUTED** | No approved lock/dependencies/Windows machine |
| Real HyperFrames MP4, 35-minute video, crash recovery, AI providers, security signoff | **BLOCKED / NOT EXECUTED** | Outside WI-02 runtime milestone; do not mark READY |

Evidence: `docs/evidence/WI02_windows_runtime.json` (redacted, inspect-only). No npm install, remote provider or cloud calls were made. Any passing local fake HTTP fixture proves test instrumentation only; it is not proof of the real Fastify application's behavior. WI-02 includes the separate real-worker code path for a future authorized Windows execution.

**Release verdict: NOT_READY.**
