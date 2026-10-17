# ContentStudio — Agent Handoff (R2-09)

**Latest:** R2-09 Asset Library UX & Selective Recompute Inspection. **11/11 focused, 624/624 all offline; no failed tests.** `npm run build:web` blocked (`vite: not found`). **Next:** R2-10 per approved original roadmap; R2-EXT remains planned.

## Read first (do not scan full tree)

1. `AGENTS.md`, `R2_Status.md`, `docs/R209_STATUS.md`, last block of `docs/WORKLOG.md`, `docs/R209_ASSET_LIBRARY_CONTRACT.md` and `docs/TEST_REPORT_R209.md`.
2. Core `packages/core/src/asset-library-r209.mjs` with existing `packages/core/src/manifest.mjs`; no new DB migration after R2-08's v26.
3. HTTP `apps/api/src/{controllers,routes,request-policy}.mjs`, contract `packages/contracts/src/catalog.mjs`; generated SDK/OpenAPI are never edited by hand.
4. UI `apps/web/src/{AssetLibraryWorkspace.jsx,asset-library-view.mjs,main.jsx}`. Image revision selection is R2-05 `POST /api/scenes/:id/image/select`, not a duplicate implementation.
5. Tests: `packages/core/test/asset-library-r209.test.mjs`, `apps/api/test/asset-library-r209.test.mjs`, `apps/web/src/asset-library-r209.test.mjs`.

## Hard invariants

- One SP-04 queue, one v26 SQLite project DB and append-only migrations if later needed; never mutate historical migration SQL/checksums.
- R2-09 GETs only: no inference, no automatic DAG jobs, no file deletion, no billing, no returned absolute paths/prompt text/secrets. Public read results are safe metadata.
- Asset restore is explicitly user-triggered, same-scene healthy image only, checked by R2-05 optimistic rowVersion and image-intent locking. Manual selections always win over stale jobs.
- R0-13 paid approvals and R2-08 token-cap reservations are independent safety controls and unchanged.
- R2-EXT-01..08 / Remotion/HyperFrames are plans; don't claim live renderer proof.

## Reproduce

`npm run test:r209 && npm run test:all && npm run check && npm run typecheck:sdk && npm run test:negative-control`.
`npm run build:web` currently fails without Vite; install dependencies in an allowed environment and then verify a real browser/Windows session.

## Next action

Read the approved task definition for **R2-10**. If the original tasks are only described at group level (`asset UI, selective regen, quota UX, regression`), request a precise scope before changing financial/provider controls. Avoid inventing readiness claims. Historical handoff: `docs/HANDOFF_R208.md`.
