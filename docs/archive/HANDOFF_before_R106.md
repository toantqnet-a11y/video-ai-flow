# ContentStudio — Current AI Agent Handoff

**Updated 2026-10-14 — R1-05 / EP04 US-4.6 Retry with Feedback.**
**State: LOCAL_ONLY_CODE_COMPLETE_TESTED_OFFLINE.** Node.js 22 Linux: **437/437 tests PASS**, OpenAPI/typecheck PASS. Browser, Fastify real HTTP, Windows and live Ollama still UNVERIFIED.

## Start here (no repository-wide scan)
1. `AGENTS.md` → **this file** → `R1_Status.md` → `docs/TEST_REPORT_R105.md`.
2. Domain/SQLite: `packages/core/src/content-retry.mjs`, migration v17 in `packages/core/src/db.mjs`, normal immutable draft projector in `chapter-generation.mjs`.
3. Worker: `apps/api/src/content-retry.mjs` (only loopback Ollama, JSON, bounded output), existing queue registration `apps/api/src/server.mjs`.
4. Controller/routes: `apps/api/src/{controllers,routes}.mjs`; operation catalog `packages/contracts/src/catalog.mjs`, generated `docs/api/openapi.json`.
5. UI: `apps/web/src/{EvaluationWorkspace,RetryWithFeedback}.jsx` and `style.css`.
6. Tests: `apps/api/test/content-retry-r105.test.mjs` (10 tests), historical v15→v16 test updated to accept current migration count.

## Working changes
- From a **completed** AI Judge score, author edits its feedback and chooses an eligible active local Ollama model from the pinned Brief. An explicit click queues `content:retry` for **one** chapter. No implicit successive retry or paid call.
- R1-05 uses the existing persistent SP-04 queue and a private single-chapter batch (`retry:` request key) for immutable new drafts, preserving existing variant FKs and re-score support. Private batches are excluded from the original multi-model batch list.
- Request key is idempotent; pin source SHA-256, score ID, feedback and model. On queue-fenced success, materialize immutable new variant; side-by-side compare source/new; user may chấm lại and retry that variant again.
- Original draft, previous evaluations, all other chapters and master script remain untouched. Queue SSE never exposes full prompts/feedback; author-only API returns textual comparisons.
- Retry errors/disabled paid/remote models fail closed. No new queue, Vault or model registry was introduced.

## Verification and blockers
- `npm run test:all` **437/437 PASS**; `npm run check` **PASS**; `npm run typecheck:sdk` **PASS**; TS JSX parsing **PASS**.
- `npm run build:web` **BLOCKED**: `vite: not found` in the offline workspace. No browser or real Fastify HTTP acceptance.
- R1-07 must integrate remote model adapters through the Vault and job-scoped budget/policy guard **at execution**, not just in a UI preview.
- Live Ollama for real language quality, GPU, Windows remain pending per PO's temporary no-hardware decision.

## NEXT — R1-06 Master Script Approval
Select one successful draft revision per chapter, validate all chapter coverage/order, assemble master script, require explicit user approval and immutable history. Do not automatically approve based on AI scores or retry job completion. Ensure source lineage/reference stability and content length/duplication checks. Continue docs: WORKLOG, HANDOFF, DECISIONS, R1_Status and tests. **No pending PO decision blocks R1-06.**
