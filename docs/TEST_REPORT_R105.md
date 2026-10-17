# ContentStudio — R1-05 Test Report (2026-10-14)

## Scope and environment
EP04 US-4.6: explicit Retry with Feedback, selected chapter only, new immutable version and lineage, comparison, AI re-score, manual repeated iteration. Tested on Linux / Node.js 22.16 using local SQLite, real SP-04 JobStore/JobRunner and mock LLM responses; no API keys or chargeable provider calls.

## Evidence
- `npm run test:all` — **437/437 PASS** (previous 427 + 10 R1-05 tests). Raw evidence: `docs/evidence/R105_all_tests.log`.
- `node --test apps/api/test/content-retry-r105.test.mjs` — **10/10 PASS**.
- `npm run check` — PASS, including generated contract drift check.
- `npm run typecheck:sdk` — PASS.
- JSX syntax via TypeScript 5.8 parser — both new and changed JSX files have 0 parse diagnostics (not a browser functional test).
- `npm run build:web` — **BLOCKED**, Vite missing (`vite: not found`). No production UI build claim.

## Acceptance coverage
| Acceptance case | Result |
|---|---|
| Retry only a successfully scored source draft | PASS |
| Author-edited feedback is pinned before generation | PASS |
| Generate one new immutable variant, preserve original and master | PASS |
| Re-score a retry variant; subsequent Retry from new score | PASS |
| No paid/unregistered or off-Brief local model | PASS |
| Idempotent request/resubmit; conflicting request rejected | PASS |
| Failed provider / malformed response produces failed job, no fake draft | PASS |
| Retry of failed queue job with same pinned source/feedback | PASS |
| Request and compare scoped to original video | PASS |
| Restart from SQLite and replay job, no duplicate run | PASS |
| Source fingerprint tampering blocked at worker and requeue | PASS |
| HTTP route/catalog paths agreed | PASS |

## Limitations that remain open
- Live Ollama output quality not verified; mock LLM validates protocol and durable workflow only.
- React/Vite browser, Fastify real HTTP, Windows launcher and browser automated E2E not verified in current environment.
- Provider quotas and paid consent: **only local Ollama allowed** for R1-05. Remote adapters can be enabled only after R1-07's vault, quota, cost and safety integration.
- Diff view currently compares texts side-by-side, not word-level color diff.

**Status:** `LOCAL_ONLY_CODE_COMPLETE_TESTED_OFFLINE` — NOT production accepted.
