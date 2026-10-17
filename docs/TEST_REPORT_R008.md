# R0-08 — Preset Schema & Revision | Test Report

**Date:** 2026-10-14 · **Task:** R0-08 · **Status:** Code Complete / Tested Offline; not browser/Windows/prod verified.

| Evidence | Command | Result |
|---|---|---|
| Core + API + SDK + UI logic regression | `npm test` | **108/108 PASS** |
| API generated-file drift, JS syntax | `npm run check` | **PASS** |
| TypeScript SDK operation types | `npm run typecheck:sdk` | **PASS** |
| 7 Sprint0 spike suites | `(cd spikes/SP-XX && npm test)` | **146/146 PASS** |
| Historic migration integrity | Compare R0-05 v1–v5 SQL against R0-08 SQL | **Unchanged** |
| Total separately executed automated tests | 108 + 146 | **254/254 PASS** |

## New R0-08 coverage

- Canonical schema/default/typed limits, unknown key + credential injection rejection, non-finite numeric input and paid/remote rejection.
- Create v1 and v2, historical read-only access, old video keeps v1, new video gets v2, no-op/reordered JSON causes no revision, optimistic lock conflict cannot create orphan history.
- Direct SQL UPDATE/DELETE against preset history blocked by SQLite trigger, v5→v6 upgrade with pre-upgrade backup, persisted revision across restart.
- Registered routes: POST revision + GET historical revision + static capability metadata; error codes are sanitized; OpenAPI uses exact canonical schema.
- UI pure version-diff helper checks changed field order and prevents nonallowlisted secret properties appearing in diff.

## Deferred evidence

- `npm install`/React browser build, real Fastify HTTP and live JSON Schema middleware enforcement not repeated here; previous R0-05 environment reported `EAI_AGAIN`. Node route-handler simulation is **not** HTTP E2E.
- Windows real filesystem/ACL, browser UI comparison interaction, OS Key Vault, provider account/quota truth, GPU and real AI inference remain untested. Defer hardware per PO decision, but do not call these PASS.
- R0-07 provider registry not yet implemented, so static UI options are not live compatibility/availability claims.

See `docs/evidence/R008_app_tests.txt`, `R008_check.txt`, `R008_typecheck.txt`, `R008_SP-*_regression.txt` for raw outputs.
