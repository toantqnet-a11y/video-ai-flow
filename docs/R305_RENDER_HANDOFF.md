# Agent handoff — R3-05 Render Integration, 2026-10-16

**First read:** `docs/R305_RENDER_INTEGRATION_CONTRACT.md` → `docs/R305_RENDER_TEST_REPORT.md` → `AGENTS.md` → `docs/WORKLOG.md` tail. **Next: R3-07 immutable timeline revisions/undo/redo.** Work in ZIP workspace, not a remote Git checkout unless explicitly available.

**Files changed**:
- `packages/core/src/visual-window-r307.mjs` (new) — shared scene-local frame-window/hold maths; video FFmpeg filter; HTML image keyframe progress.
- `packages/core/src/composition-timing-r2ext02.mjs` — optional visual window in immutable v2 preview and validation; readiness `VISUAL_WINDOW_CONFLICT` if saved bounds exceed measured voice scene.
- `packages/core/src/render-hyperframes.mjs` — CSS hold for edited image-motion, local FFmpeg staging for edited video, FFprobe exact frames/source-length checks, existing SHA fence and CLI fail-closed.
- `packages/core/src/render-ffmpeg-r2ext04.mjs` — exact visual-window filtering for image/video, source-short and output frame-count guards, unchanged voice/SRT clocks.
- `packages/contracts/src/catalog.mjs`, regenerated OpenAPI, SDK types, JSON schemas v1/v2. No new API endpoint, DB migration, or extra job queue.
- `apps/web/src/TimelineRenderWorkspace.jsx` — read-only exported visual window frames and conflict hint (browser build not done).
- `packages/core/test/visual-window-render-r307.test.mjs` — eight tests including real short FFmpeg MP4, mocked HyperFrames CLI is expressly **not** a real engine test.
- `tools/r305-trim-demo.mjs`, `package.json` (`npm run test:r305-render`); docs and backlog updated.

**Verified:** eight focused PASS, previous R3/EXT regression PASS, full Node/spike suite PASS (see evidence). `npm run check`, SDK typecheck, negative control PASS. Static JSX has **not** been browser built (Vite unavailable). HyperFrames real CLI, native Windows, provider voice, 35-minute output all pending. Release `NOT_READY`.

**Follow-up R3-07:** Preserve the version-fenced `timeline_documents` and immutable composition revisions; introduce undo/redo as new versioned user actions, not historical in-place edits. Ensure `visualWindow` survives reorder/undo and a new published Composition is required. Avoid paid/provider calls, no auto FFmpeg fallback. Run `npm run test:r305-render && npm run test:r305-r306 && npm run test:r302-r304 && npm run test:all && npm run check && npm run typecheck:sdk`.
