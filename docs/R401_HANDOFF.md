# R4-01 handoff — 2026-10-16

**Base:** complete R3-13/14 workspace, HyperFrames primary, FFmpeg manual fallback, `NOT_READY`.

**Changes:** `packages/core/src/preset-diff-r401.mjs` added; `packages/core/src/domain.mjs` refactored `_commitVideoConfigCandidate` to reuse ONE atomic IMMEDIATE transaction from ordinary override updates and selective apply; two new POST routes/controllers/contract operations; generated OpenAPI/SDK; video configuration comparison and checkbox UI; regression tests, docs. No migration/queue/provider calls.

**Read first:** `docs/R401_PRESET_DIFF_CONTRACT.md`, `docs/R401_TEST_REPORT.md`, `AGENTS.md`, `docs/HANDOFF.md`, `docs/WORKLOG.md`. Do not scan all historical sprint documents.

**Run:** `npm run test:r401`, `node --test apps/api/test/video-config-r011.test.mjs apps/web/src/video-config-form.test.mjs packages/core/test/domain.test.mjs packages/contracts/test/contracts-r005.test.mjs`, `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control`. Full suite timed out, Vite missing; don't report global PASS. Restore dependencies then test UI with browser and R3-14 Windows/HyperFrames actual render gates.

**Invariant:** Never rewrite frozen video preset, never apply unselected fields, never replace user media, never silently invoke AI or spend credits, never auto-fallback from HyperFrames. Digest and channel/video optimistic versions must be rechecked within transaction. Optional-field removal cannot be represented and is disabled in UI.

**Next:** R4-02 verified backup/restore for SQLite snapshot + referenced media with hashes; separate vault secrets and explicit non-destructive dry-run before any restore.
