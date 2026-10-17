# R2-EXT-07/08 — AI agent handoff · 2026-10-15

**Where to start:** `docs/R2EXT0708_STATUS.md` → `docs/R2EXT0708_CONTRACT.md` → `docs/TEST_REPORT_R2EXT0708.md`. Never scan whole repo first.

**Files changed:** `packages/core/src/visual-router-r2ext07.mjs`, `motion-brand-r2ext08.mjs`, `render-ffmpeg-r2ext04.mjs`, `db.mjs`, `index.mjs`; `apps/api/src/controllers.mjs`, `routes.mjs`, `render-export-r2ext0406.mjs`; `apps/web/src/VisualCostMotionPanel.jsx`, `TimelineRenderWorkspace.jsx`, `api.js`, `style.css`; `packages/contracts/src/catalog.mjs`, generated OpenAPI and SDK. New tests: `packages/core/test/visual-motion-r2ext0708.test.mjs`, `apps/api/test/visual-motion-r2ext0708.test.mjs`. Repro demo: `tools/ext0708-demo.mjs` (FFmpeg, local fixture). SQLite **v29 additive**, no historical SQL edits.

**Acceptance:** `npm run test:ext0708` 8/8, `npm run test:all` 730/730, `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control` PASS. `npm run build:web` blocked Vite unavailable. Demo short FFmpeg MP4 and JPEG pass; do not translate this into real AI render or Windows GPU acceptance. `npm run test:live-http` not signed off.

**Safety:** Visual router only suggests, no auto-dispatch. Payment always explicit existing R0-13 gate; no remote provider or unknown price permitted. Existing storage and SP-04 queue reused. Old composition/asset hashes verified at render. Immutable v29 style revisions and style hash pinned to each render; rendering old jobs uses saved style.

**Next:** install dependencies and validate UI in actual browser/Windows; complete EXT-03 fair render engine benchmark using same hardware; run 30–40-minute full media regression; plan R1-EXT-01 script skill style-preset integration separately. Advanced motion/x-fade/logo may be planned as follow-on, not silently called done.
