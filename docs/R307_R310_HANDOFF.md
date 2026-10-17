# R3-07..10 — AI Agent Handoff · 2026-10-16

**Fast read:** `docs/R307_R310_CONTRACT.md` → `docs/R307_R310_TEST_REPORT.md` → `AGENTS.md` → tail `docs/WORKLOG.md`. Workspace source ZIP is cumulative: DO NOT rebuild from older EXT archive.

**New source:** `packages/core/src/timeline-history-r307.mjs` (v30 immutable undo), `packages/core/src/render-ffmpeg-r2ext04.mjs` (v31 SHA cache), `apps/api/src/render-export-r2ext0406.mjs` (frozen snapshots and SRT); `packages/core/src/db.mjs` v30/v31 migrations; catalog, generated OpenAPI/SDK, API routes/controllers, two React editors, two new core test files plus one API test.

**Tests:** `npm run test:r307-r310`, `npm run test:ext040506`, `npm run test:r302-r304`, `npm run test:r305-r306`, `npm run test:r305-render`, `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control`. `npm run acceptance:long-plan` is **plan-only**, not a real 35-minute render. `npm run test:all` timed out and is **not verified** (see report), frontend requires Vite install.

**Important behavior:** Editing after render enqueue leaves the queued immutable snapshot intact; no silently updating the render content. Re-enqueue a fresh approved Composition for a new version. Undo/redo produce new timeline versions and require new Composition approval. FFmpeg segment cache is optional and ONLY used for explicitly selected FFmpeg path, not HyperFrames.

**Next:** R3-11 asset ZIP with scene assets / SRT / timeline JSON, safe names and checksum manifest. Then R3-12..14 etc. Prioritize real HyperFrames CLI, Vite build, Windows browser UI, and 35-minute MP4 acceptance. Never infer HyperFrames support from fake CLI. Keep release `NOT_READY`.
