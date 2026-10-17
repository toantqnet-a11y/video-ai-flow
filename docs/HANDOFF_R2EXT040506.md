# Agent handoff · R2-EXT-04/05/06 · 2026-10-15

## Fast start (avoid repo scan)
Read `AGENTS.md` → `docs/R2EXT040506_STATUS.md` → `docs/R2EXT040506_RENDER_TIMELINE_EXPORT_CONTRACT.md` → `docs/TEST_REPORT_R2EXT040506.md` → `docs/WORKLOG.md` tail.

New code:
- `packages/core/src/render-ffmpeg-r2ext04.mjs`: checksum-safe local FFmpeg segments, SRT, concat, FFprobe QA, atomic private export. Current FFmpeg is **fast-path** not primary selected renderer.
- `apps/api/src/render-export-r2ext0406.mjs`: SP-04 `render:ffmpeg` handler, version-scoped enqueue/read/download; no new worker queue.
- `apps/api/src/server.mjs`, `controllers.mjs`, `routes.mjs`: instantiate + register worker and private GET/POST.
- `packages/contracts/src/catalog.mjs`, `openapi.mjs`, generated OpenAPI/types, `packages/sdk/src/client.mjs`: 3 operations, private bounded MP4 and FileSystemAccess streaming.
- `apps/web/src/TimelineRenderWorkspace.jsx`, `main.jsx`, `style.css`: source preview, timing lock, publish, enqueue, job polling, direct-save and bounded fallback.
- `packages/core/test/render-ffmpeg-r2ext0406.test.mjs`, `apps/api/test/render-export-r2ext0406.test.mjs`: 8 focused tests.
- `tools/demo-render-r2ext040506.mjs`: 3-scene deterministic PNG+WAV end-to-end sample; `docs/evidence/EXT040506_demo.mp4` + QA JSON.

Commands: `npm run test:ext040506`, `npm run test:all`, `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control`. Previous full suite 714 → now **722 PASS**. Web build blocked by Vite package not installed; no attempt to report an unrun UI build as pass.

## Next agent priorities
1. Execute EXT-03 fair Remotion/HyperFrames benchmark using Windows/npm; preserve FFmpeg fast-path, choose primary only after licenses and metrics.
2. Install dependencies and run frontend build/live Fastify HTTP and UI e2e (desktop and mobile); audit file picker permission, cancel, navigation refresh.
3. Stress-test 30–40min and 100s of scenes; profile RAM/CPU/concat accumulated sync, font paths and output size; implement output streaming/range and native background render concurrency throttling before large releases.
4. Add EXT-07 smart visual cost routing; no auto-paid inference. Advanced timeline transitions/clip preview can follow in R3.

## Engineering constraints
Never mutate SQLite migration v1..28, auto-enable paid fallback, persist bearer tokens, or create another queue. Keep code comments intent-focused and update `AGENTS.md`, `HANDOFF.md`, `WORKLOG.md`, decisions, backlog and test reports before handing off.
