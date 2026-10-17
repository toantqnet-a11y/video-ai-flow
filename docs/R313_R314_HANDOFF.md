# R3-13 / R3-14 — Agent handoff (2026-10-16)

**BASELINE:** R3-12 ZIP + R3-13 disk/crash safety + R3-14 acceptance harness. Full source in latest artifact ZIP.

**Read first:** `docs/R313_RENDER_RECOVERY_CONTRACT.md`, `docs/R314_ACCEPTANCE_PLAN.md`, `docs/R313_R314_TEST_REPORT.md`, latest `docs/WORKLOG.md`, `AGENTS.md`. No repository-wide rescan necessary.

**Modified source:** `packages/core/src/render-safety-r313.mjs` (new: statfs preflight, estimate and orphan cleanup); `packages/core/src/render-ffmpeg-r2ext04.mjs` (`runBinary` process-tree cancellation and timeout); `apps/api/src/render-export-r2ext0406.mjs` (disk admission at preflight AND worker); `apps/api/src/server.mjs` (conservative startup cleanup); `apps/web/src/RenderDrawerR312.jsx` (capacity display and low disk messaging); `packages/contracts/src/catalog.mjs` + generated OpenAPI/SDK declarations; `tools/r314-acceptance.mjs` (new gated real/offline evidence, always protects blocked statuses).

**Tests:** `packages/core/test/render-safety-r313.test.mjs` and `tools/r314-acceptance.test.mjs`, `npm run test:r313-r314`; legacy `npm run test:r312`, `npm run test:ext040506`. `npm run acceptance:r314` (not strict) generates truthful evidence. Full suite and frontend availability recorded in `docs/R313_R314_TEST_REPORT.md`.

**Important:** R3-14 is an acceptance harness, not acceptance completion. Linux cannot certify real Windows UI, real HyperFrames CLI, 35-minute video or real AI providers. `NOT_READY` until observed proof. HyperFrames remains primary; FFmpeg fallback is manual only.

**Next:** Install frontend/API/HyperFrames dependencies in target environment, fix any build/browser problems, complete real HyperFrames 5-scene and 35-min E2E + OS-kill/restart tests; then R4 stabilization only after MVP quality gates.
