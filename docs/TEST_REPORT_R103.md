# R1-03 — Parallel Chapter Generation | Test evidence

Date: 2026-10-14. Environment: Linux; Node.js v22.16.0; Node built-in SQLite.

## Verified by execution

| Check | Result |
|---|---|
| `npm run test:all` | **414/414 PASS**; baseline 405 + 9 focused tests |
| `npm run check` / OpenAPI drift | PASS |
| `npm run typecheck:sdk` | PASS |
| TypeScript JSX syntax parser | PASS (parsing only; not browser build) |
| Migration v15 on fresh DB and file-backed restart | PASS |
| Multi-model DAG concurrency | PASS, two model branches make progress concurrently |
| Chapter continuity summary | PASS, isolated per model, chapters ordered |
| Versioned immutable draft store | PASS; master script not modified |
| Failed chapter and descendants retry | PASS; previously successful chapters preserved |
| Job idempotency / saved-outline pinning / disabled model guard | PASS |
| Local-only Ollama endpoint SSRF prevention | PASS (mock HTTP) |
| `npm run build:web` | **BLOCKED**: `vite: not found` (no npm frontend dependencies available) |
| Fastify actual HTTP / browser UI / live Ollama model / Windows | **NOT VERIFIED** |

## Code coverage / test intent

Focused tests: `apps/api/test/chapter-generation-r103.test.mjs` (9). The queue is the existing SP-04 implementation; this task did not build a separate scheduler. Live model quality, 35-minute runtime and paid provider behavior cannot be inferred from mocked output. Test double emits simple paragraphs for protocol validation, not publishable content.

## Risk notes

- R1-03 executor currently supports **only active local Ollama LLMs**; 1–3 models may run concurrently. Models registered with remote or paid locations are rejected at dispatch even when present in the brief. Account-aware remote adapter, credential vault, actual provider quota and approved paid calls remain R1-07 gates.
- JobStore external requests are at-least-once after a crash; the SQLite DB result commit is lease-fenced. Live remote billing and vendor idempotency are not validated.
- Output validation rejects very short/malformed or excessive outputs; it cannot guarantee narrative quality or exact chapter duration.
- No browser or Windows usability signoff. No live HTTP or integrated install.

State: **CODE COMPLETE FOR LOCAL MODEL SUBSET + AUTOMATED TESTS PASS**, NOT R1-03 fully product-accepted / production-ready.
