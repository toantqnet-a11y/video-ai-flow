# R2-08 — Offline Test Report

**Date:** 2026-10-15 · **Result:** `CODE_COMPLETE_TESTED_OFFLINE`

| Command | Result |
| --- | --- |
| `npm run test:r208` | **20/20 PASS** |
| `npm run test:all` | **613/613 PASS** (R2-07 baseline 593 + 20 new) |
| `npm run check` | **PASS**, OpenAPI and SDK generated artifacts current |
| `npm run typecheck:sdk` | **PASS** |
| `npm run test:negative-control` | **PASS** (deliberate failure produces nonzero exit) |
| `npm run build:web` | **BLOCKED**: exit 127, `vite: not found` |

### Verified behavior

New tests exercise v26 migration from v25 and backup, append-only schema guards, transaction-scoped reservation, capacity exhaustion and route preview, idempotent settlement, provider report >estimate, uncertain transport/omitted usage, persisted restart recovery, replay and retry attempt IDs, invalid input, secret-free authenticated URL query allowlist, and actual guarded free LLM dispatcher using a fake upstream. Prior 593 offline tests continue to pass, including R0-13 paid policy and R2-07 DAG.

**Limits:** No live paid/remote API request; network calls use test doubles. `provider_verified` quota remains unavailable without a trusted adapter. No GPU, native Edge/Piper/VieNeu, browser Vite build, Windows, multi-instance concurrency benchmark or 30–40 min E2E video acceptance. Do not infer real provider billing correctness from 613 passing unit/integration tests.
