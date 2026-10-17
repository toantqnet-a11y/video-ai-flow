# Agent handoff — HyperFrames primary renderer

**Read first:** `docs/HYPERFRAMES_PRIMARY_RENDERER.md` → `docs/HYPERFRAMES_SELECTION_STATUS.md` → `docs/HANDOFF.md` recent section. No repository-wide rescan necessary.

**Code touched:** `packages/core/src/render-hyperframes.mjs`; `packages/core/src/render-ffmpeg-r2ext04.mjs`; `packages/core/src/index.mjs`; `apps/api/src/{render-export-r2ext0406,server}.mjs`; `apps/web/src/TimelineRenderWorkspace.jsx`; `packages/contracts/src/catalog.mjs`, generated `docs/api/openapi.json` and `packages/contracts/src/types.d.mts`; tests and docs.

**Commands:** `npm run test:hyperframes`; `npm run test:all`; `npm run check`; `npm run typecheck:sdk`; `npm run test:negative-control`. Expected: 7/7 focused, 747/747 total offline pass. Real HyperFrames renderer **not installed**, no MP4 from it. FFmpeg integration remains exercised explicitly.

**Next:** install locked HyperFrames CLI + build dependencies on connected Windows; verify generated HTML directly with `npx --no-install hyperframes check` / `render`, then test persisted queue as configured. Keep `render:ffmpeg` backward compatible and paid routing fail-closed. If page animation or media timing is incompatible, fix the HTML adapter and add a real CLI test rather than treating mocked tests as evidence.
