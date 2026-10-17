# ContentStudio R1-06 Test Report — Master Script Approval

**Date:** 2026-10-14 | **Environment:** Node.js 22.16.0, Linux | **Status:** OFFLINE TESTS PASSED

| Check | Result | Evidence |
|---|---|---|
| R1-06 targeted tests | **13/13 PASS** | `apps/api/test/master-script-r106.test.mjs` |
| All application + Sprint 0 regressions | **450/450 PASS** | `docs/evidence/R106_test_all.log` |
| OpenAPI generated artifact check | **PASS** | `docs/evidence/R106_check.log` |
| TypeScript SDK typecheck | **PASS** | `docs/evidence/R106_types.log` |
| JSX TypeScript parser | **PASS** | `MasterScriptWorkspace.jsx` and `main.jsx` |
| React/Vite production build | **BLOCKED** | `vite: not found`, dependencies missing; `docs/evidence/R106_build.log` |
| Live Fastify HTTP, Windows, browser, live Ollama | **NOT TESTED** | Pending validation |

## What new tests assert
- v18 migration + SQLite immutable revision and approval triggers.
- Preview has no writes; saving a candidate leaves the canonical master script unchanged; explicit approval updates it.
- Draft selection follows chapter order, preserves draft IDs and SHA-256 lineage.
- Missing/duplicate chapters, foreign video variants, mismatched outline revisions are rejected.
- Manual edited script saves new immutable versions; no previous draft or score is modified.
- Concurrent requests and stale video row versions are blocked.
- Warning rules for content length/duplicate paragraphs and approval acknowledgement.
- Existing scenes block approval of changed script and preserve previously approved state.
- Legacy edit route **and direct SQLite UPDATE** cannot bypass candidate approval workflow.
- Restart of SQLite preserves approvals and immutable revision metadata.
- Six new HTTP route declarations match OpenAPI operation catalog.
- Manual script import follows the same Save → Approve boundary.

## Limits
Passing automated tests does not prove browser controls, audio/video rendering or Windows behaviour. npm build remains blocked. No AI model was invoked by R1-06 tests. Output quality/semantic correctness of a real 5,000-word script still needs end-to-end QA in R1-08.
