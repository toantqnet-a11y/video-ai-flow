# ContentStudio — AI Agent Handoff (current)

**Updated:** 2026-10-14 · **Latest task:** R0-06 (EP12 Job persistence and SSE safety integration).  
**Status:** `CODE_COMPLETE / TESTED_OFFLINE`. R0 remains **OPEN**. No Windows/browser/live provider acceptance.

## First 5 minutes — read only these

1. `AGENTS.md` (mandatory code comments, work logs, paid-security rules).
2. This file, then `R0_Status.md` and `docs/R0_BACKLOG_AUDIT.md`.
3. `docs/TEST_REPORT_R006.md` for verified commands and limitations.
4. For next task R0-13, inspect only `packages/core/src/provider-accounts.mjs`, `apps/api/src/{controllers,handlers}.mjs`, `packages/providers/src/`, `spikes/SP-04/src/store.js` and current paid policy documentation. Do not scan all source.

## Latest changes / navigation map

- **R0-06:** `apps/api/src/job-center.mjs` is the only public projection for JobStore metadata and SSE. Use `createJobCenter(store)`; no raw job store row should be returned from HTTP. `apps/api/src/routes.mjs` defines job list/control/history/SSE endpoints; `apps/api/src/request-policy.mjs` allows only non-secret query keys. UI `apps/web/src/JobCenter.jsx` is connected to authenticated SSE via Zustand updates in Shell. Contract: `packages/contracts/src/catalog.mjs` and generated `docs/api/openapi.json`. Tests: `apps/api/test/jobs-r006.test.mjs`.
- **R0-12:** video lifecycle and v9 schema in `packages/core/src/{domain,db}.mjs`, `apps/web/src/VideoWorkspace.jsx`, API routes.
- **R0-07:** provider accounts/metadata and route preview in `packages/core/src/provider-accounts.mjs` and `packages/providers/src/readiness.mjs`; **preview is not payment authorization**.
- Shared data: SQLite WAL + SP-04 queue, SP-06 Vault, SP-02/03/VID adapters. No duplicate scheduler.

## Last actual tests

- `npm test`: **167/167 PASS**.
- All 7 Sprint 0 suites: **146/146 PASS**.
- `npm run check`, `npm run typecheck:sdk`, JSX parse: PASS.
- Logs: `docs/evidence/R006_*.txt`.
- **Not executed successfully:** real Fastify HTTP, React/Vite browser build, Windows/DPAPI/GPU, real TTS/image/video AI inference (dependencies/services unavailable).

## Next task: R0-13 — Paid policy and approval guard (P0)

Enforce paid-API consent/cost ceilings at the actual provider invocation boundary, not only in routing preview. Persist safe audit events; no auto spending. Reuse current Vault and same queue. Add tests for quota unknown, forced paid fallback, approval expiry/revocation, job idempotency and sensitive-token non-disclosure. Then R0-14 CI.

**Do not claim R0 is Done.** Audit indicates R0-01 Windows launcher, R0-10 voice preview, R0-13, R0-14 and R0-VID-01 have pending gates; see `docs/R0_BACKLOG_AUDIT.md`. No fresh PO decision needed to code next task.

---

## Previous handoff (archived excerpt)
# ContentStudio — Current AI Agent Handoff

**Updated:** 2026-10-14 · **Latest task:** R0-12 (EP03 Video Management).  
**Next:** R0 backlog reconciliation → R1-01 content-generation foundation (unless unstarted R0 mandatory tasks remain).  
**Status:** `CODE_COMPLETE / TESTED_OFFLINE`; no production/browser/Windows acceptance.

## Start in ~5 minutes (do not scan the whole repo)

1. Read `AGENTS.md` → this file → `R0_Status.md` → `docs/TEST_REPORT_R012.md`.
2. Video domain code: `packages/core/src/domain.mjs` (`createVideo`, `listVideoPage`, `resumeVideo`, `cloneVideo`, `softDeleteVideo`, `restoreVideo`), migration v9 in `packages/core/src/db.mjs`.
3. HTTP adapter: `apps/api/src/{controllers,routes,request-policy}.mjs`; API catalog: `packages/contracts/src/catalog.mjs` → generated `docs/api/openapi.json`, SDK types.
4. React: `apps/web/src/VideoWorkspace.jsx`, `video-library.mjs`, `store.js`, `main.jsx`, `style.css`.
5. Tests: `packages/core/test/video-r012.test.mjs`, `apps/api/test/video-r012-routes.test.mjs`, `apps/web/src/video-library.test.mjs`.
6. Don't touch immutable prior migration SQL (v1–v8). R0-12 only appends v9, with an upgrade/rollback test.

## Delivered in R0-12

- Channel-scoped library; filtered/searchable, keyset-paginated list (20 per page), with light list payload (no master script or full presets).
- New video inherits channel preset snapshot, optional duration override, persisted request idempotency; **no automatic AI job** on creation.
- Resume video to validated Content / Scenes / Timeline / Video Config step, without re-enqueuing jobs.
- Rename, lightweight duplicate (script + current config; no scenes/assets/jobs/history), soft-delete, restore. Optimistic rowVersion conflicts and active-job delete block.
- Status badges are factual; unknown progress stays null. Display target vs actual duration explicitly. UI includes empty/error/loading states and confirmation for destructive action.
- Updated OpenAPI/SDK, security query allowlist, migrated schema v9, Intent comments. Older app tests updated only where they explicitly asserted the latest schema was v8 or prior return shape.

## Tests (actual evidence)

- `npm test` **158/158 PASS**; Sprint 0 spike regression **146/146 PASS** (304 tests total).
- `npm run check`, `npm run typecheck: