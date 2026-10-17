# ContentStudio R1-04 — AI Judge & Scoring Test Report

**Date:** 2026-10-14 · **Environment:** Linux, Node.js 22, built-in SQLite. **Scope:** EP04 US-4.5 (local-only Ollama scoring adapter). **State:** Code + automated tests pass; real provider/browser/Windows NOT ACCEPTED.

| Check | Observed result |
|---|---|
| `npm run test:all` | **427/427 PASS** (414 prior + 13 new) |
| `npm run check` | PASS (JavaScript syntax, canonical OpenAPI unchanged after generation) |
| `npm run typecheck:sdk` | PASS, includes new scoring operation contracts |
| `npm run api:generate` | Generated API spec, contracts types, SDK declarations |
| `npm run build:web` | **BLOCKED**: `vite: not found` (frontend dependencies unavailable) |
| HTTP Fastify / React interactive browser / live Ollama / Windows | **NOT VERIFIED** |

## Specific automation coverage

1. Weighted rubric math (78.5/100 for a deterministic fixture) and refusal of model-supplied `total`.
2. Missing criteria, scores outside [0,10], NaN, unknown keys, missing feedback, absent suggestions.
3. Real SP-04 queue execution with mock judge; transactionally materialize fenced result to immutable SQLite table.
4. Re-evaluate and retain old score; unique idempotency key and configuration mismatch collision.
5. Video-scoped variant access; cross-video and missing variant rejected.
6. Paid/remote/disabled evaluator rejected before queue and again at worker execution.
7. Malformed JSON → one repair call → successful result.
8. Two malformed replies → stable failure without fictitious score; explicit retry is supported.
9. 429 uses retry/backoff instead of an immediate repair call; arbitrary remote/local endpoint blocked.
10. Draft prompt injection bounded as untrusted draft data (prompt design check only, not real model red-team).
11. Route registry and OpenAPI contract operations exist.
12. Pending evaluation survives persisted SQLite restart.
13. **v15→v16 migration** backfills stable variant IDs for historic chapter drafts without editing them.

**Artifacts:** `docs/evidence/R104_TEST_ALL.log`, `R104_CHECK.log`, `R104_SDK_TYPECHECK.log`, `R104_BUILD.log`.

**Limitations:** The evaluation scoring behavior and Ollama transport have not been validated against a real live model. Scores are AI opinions, not externally verified facts. Unit tests use deterministic mock responses; do not claim a model produced them.
