# AI Agent handoff — R3-02 through R3-04 — 2026-10-16

**Read first:** `docs/R302_R304_CONTRACT.md` → `docs/R302_R304_TEST_REPORT.md` → `docs/IA02_HANDOFF.md` → `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json`.

**Source changes:**
- `packages/core/src/timeline-editor-r302.mjs` (NEW) + export in `packages/core/src/index.mjs`: read-only 4-lane manifest and atomic reordered presentation, not source offsets.
- `packages/core/src/composition-r2ext01.mjs`: reorders composition scenes using persisted presentation order. `packages/core/src/domain.mjs`: legacy timing PUT cannot bypass dedicated order endpoint.
- `apps/api/src/{controllers,routes}.mjs` + `packages/contracts/src/catalog.mjs`: GET manifest/PATCH order. OpenAPI and SDK declarations regenerated with `npm run api:generate`.
- `apps/web/src/{TimelineEditorR302.jsx,timeline-model-r302.mjs,playback-controller-r303.mjs,TimelineRenderWorkspace.jsx,style.css}`: virtualized four-lane view, one sound player, reactive caption/image, explicit persisted reorder and scene Inspector integration.
- `packages/core/test/timeline-editor-r302-r304.test.mjs`, `apps/web/src/timeline-r302-r304.test.mjs`, `apps/api/test/timeline-r302-r304.test.mjs`.

**Commands:** `npm run test:r302-r304`, `npm run test:all`, `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control`. With npm/browser available, `npm ci && npm run build:web && npm run test:live-http`; run real Windows/HyperFrames/30–40-min acceptance separately.

**Guardrails:** R3-04 never writes `scenes.idx`, script text, asset bytes or paid-provider state. R3-03 never auto calls paid models. Only one SP-04 job scheduler; HyperFrames primary, FFmpeg manually chosen fallback. Release `NOT_READY` until IA-02 gates pass.

**Next:** R3-05 Trim / Zoom / Snap, then R3-06 Waveform. Do not claim these are implemented; test in-browser before declaring R3 MVP complete. Evaluate clip preview integration and playhead/voice drift with real provider output.
