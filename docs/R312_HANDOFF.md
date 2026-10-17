# R3-12 — Agent Handoff (2026-10-16)

**READ FIRST** `docs/R312_RENDER_DRAWER_CONTRACT.md`, `docs/R312_TEST_REPORT.md`, tail `docs/WORKLOG.md`, `AGENTS.md`. New baseline: R3-11 ZIP64 + R3-12. Do NOT start from R3-10 or earlier.

**Core** `packages/core/src/render-drawer-r312.mjs` (resolution derivative, measured scene progress). Preserves approved original Composition digest and frame timing; supported geometry only. Tests `packages/core/test/render-drawer-r312.test.mjs`.

**API** `apps/api/src/render-export-r2ext0406.mjs`: preflight with source check/real pinned hashes; enqueue adds explicit resolution to immutable payload; worker recomputes profile, renders and QA's it; GET includes `revision/sourceCurrent/drawer`. `routes.mjs`, `controllers.mjs`, `job-center.mjs` (allowlisted SSE stage). No DB migration, no second queue. Integration tests `apps/api/test/render-drawer-r312.test.mjs` include real 720p FFmpeg H264/AAC export, stale badge and fail-closed invalid options.

**UI** new `apps/web/src/RenderDrawerR312.jsx`, integrated in `TimelineRenderWorkspace.jsx`, styles in `style.css`. Uses existing authenticated SDK and SSE; slower poll fallback, manual retry only, output badges. Frontend DOM/browser and HyperFrames CLI NOT validated.

**API generation:** `packages/contracts/src/catalog.mjs` → `npm run api:generate` updates `docs/api/openapi.json`, `packages/contracts/src/types.d.mts` and `packages/sdk/src/client.d.mts`. No frontend bearer in URL, no paid API, no automatic FFmpeg fallback.

**Run:** `npm run test:r312`; `npm run test:ext040506`; `npm run check`; `npm run typecheck:sdk`; `npm run test:negative-control`; `npm run test:all` (may time out on other heavy FFmpeg tests); `npm run build:web` requires unavailable Vite. Full test attempt 810/811 exposed a preflight-code compatibility issue, fixed and verified with IA-01 4/4. Rerun interrupted. Record actual outcomes in test report.

**NEXT R3-13:** subprocess kill/crash recovery, disk-space preflight, staging cleanup, checkpoint idempotency. Then R3-14 on Windows/browser real HyperFrames + 35-min output. Release `NOT_READY`.
