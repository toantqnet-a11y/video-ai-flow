# FI-04-06 → FI-04-10 Test Report — 2026-10-17
**Observed on Linux 2026-10-17; release NOT_READY.** No Windows, installed Vite/Fastify, real HyperFrames CLI, configured real providers, or paid network API executed.

| Test / invocation | Actual result | Boundaries |
|---|---|---|
| `npm run test:fi0406-fi0410` | **19/19 PASS** | Evaluator negatives, fake output rejection, real disposable Node OS kill + SQLite lease recovery, loopback constraints, release deny. Not actual long video. |
| `npm run test:all:batched` | **909/909 PASS, 20/20 batches, 153 test files** | Fresh complete offline suite including prior tests and new tests. Earlier intermittent hangs remain historical risk on Windows. |
| `npm run backlog:check:fi04` | **PASS, 66 unique IDs** | 42 FI-02 backlog + 14 AI-video + 10 FI-04 tasks. |
| `npm run check` | **PASS** | Syntax/contracts/OpenAPI; not frontend build. |
| `npm run typecheck:sdk` | **PASS** | TypeScript SDK only. |
| `npm run test:negative-control` | **PASS** | Intentional failing test rejected. |
| `node tools/fi0407-recovery.mjs --simulate` | **Synthetic recovery checks PASS**: child SIGKILL, 1 lease recovered, stale token fenced, second attempt succeeds. Command exits nonzero because *real* recovery remains NOT_READY. | Real OS termination of disposable Node worker, but no HyperFrames, no 35-min MP4, no real Windows worker process. |
| `node tools/fi0409-security-performance.mjs --verify` | **Focused security regression PASS**, lock/audit/Windows review BLOCKED | Npm audit not run without reviewed lock and explicit online permission. |
| `node tools/fi0406-long-render.mjs --inspect` | **BLOCKED** | No 35-min source project, Windows or pinned installed HyperFrames; read-only inventory no media. |
| `node tools/fi0408-provider-e2e.mjs --inspect` | **NOT_READY** | No local HTTP contact in inspect mode; no inference. |
| `node tools/fi0410-final-release.mjs --inspect --strict` | **NOT_READY**, exit 1 (expected) | No live/human gates can be passed by offline test files. |
| `npm run build:web` | **FAILED exit 127**, `vite: not found` | Dependencies not installed, not a discovered frontend code issue. |
| Real Windows 1080p HyperFrames 35–40min | **BLOCKED** | Pinned CLI and Windows machine required; all `FI-04-06` release gates pending. |
| Real Windows long OS recovery, local LLM/TTS/ComfyUI inference, npm audit, human A/V | **BLOCKED** | Not run, NOT READY. |

**CI discipline:** standalone focused PASS cannot be substituted for production acceptance. The fresh full batched offline suite PASS is valid for test code only. Output reports stored in `docs/evidence/FI0406_long_render.json`, `FI0407_recovery.json`, `FI0408_providers.json`, `FI0409_security.json`, `FI0410_release.json`, each with truthful unavailable stages.
