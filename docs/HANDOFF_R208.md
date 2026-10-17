# ContentStudio — AI Agent Handoff, R2-08

**Completed:** R2-08 Quota Ledger & Fail-Closed Routing. **20/20 focused; 613/613 offline.** Web build BLOCKED (`vite: not found`). **Next task:** R2-09 from approved original roadmap; extensions still planned.

## Read only these first

1. `AGENTS.md`, `R2_Status.md`, `docs/R208_STATUS.md`, `docs/R208_QUOTA_LEDGER_CONTRACT.md`, recent entries of `docs/WORKLOG.md`.
2. `packages/core/src/quota-ledger-r208.mjs`, `packages/core/src/provider-accounts.mjs` (readiness planner), and migration 26 in `packages/core/src/db.mjs`; do not alter checksummed v1–25.
3. `apps/api/src/llm-dispatch.mjs`: only user-capped **free** LLM calls require operator-configured token capacity; R0-13 paid policy remains independently enforced. `apps/api/src/server.mjs` recovers holds at startup.
4. `apps/api/src/{controllers,routes,request-policy}.mjs`, `packages/contracts/src/catalog.mjs`, generated OpenAPI/TS; test scripts in `package.json`.
5. `packages/core/test/quota-ledger-r208.test.mjs`, `apps/api/test/quota-ledger-r208.test.mjs`, plus historical `apps/api/test/remote-llm-r107.test.mjs` adjusted once for replay prevention.

## Invariants

- Never treat unverified quota/billing tier as free evidence; no paid without explicit R0-13 approved invocation. Estimated token hold is a **local** ceiling, not a provider guarantee.
- A reserved/uncertain invocation key cannot dispatch again. Crash restart recovers ambiguous calls as uncertain; no auto refund or wiping ledger.
- Server's read-only GET `/api/provider-models/:id/quota-ledger` exposes bounded metadata, no prompt text, secrets or reserve/settle endpoints. API protection uses allowlisted query `limit` only.
- One SP-04 queue, one canonical SQLite DB, migrations append-only. Existing manually pinned scenes, voice/image DAG, source snapshots and R2-EXT plans untouched.
- `.env.example` has `CONTENTSTUDIO_LLM_QUOTA_RESERVATIONS_JSON`; unknown values are not invented.

## Reproduce

`npm run test:r208 && npm run test:all && npm run check && npm run typecheck:sdk && npm run test:negative-control`

Web build separately `npm run build:web`, expected to fail without installing Vite. No live inference, Windows or long form has been accepted. This is **code+offline tests**, not production billing verification. Source workspace includes R0→R2-08 modules and updated handoff logs. Read `docs/TEST_REPORT_R208.md` for evidence.
