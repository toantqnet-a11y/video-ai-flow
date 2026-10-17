# R2-EXT-02 — Agent handoff (2026-10-15)

**Checkpoint:** Original R2-01..13 + R2-EXT-01 + R2-EXT-02 `CODE_COMPLETE_TESTED_OFFLINE`, release `NOT_READY`. Next **R2-EXT-03 real renderer POC gate**, with R2-EXT-04 backend render adapter after engine choice. No claim of Windows, real AI TTS or MP4 export. 14 focused + 714 complete tests PASS.

## Read these first

1. `AGENTS.md` **last section**, `docs/R2EXT02_TIMING_CONTRACT.md`, `docs/TEST_REPORT_R2EXT02.md` and `docs/R2EXT02_STATUS.md`.
2. `packages/core/src/composition-timing-r2ext02.mjs` for measured timing, manual-lock and validator; original `packages/core/src/composition-r2ext01.mjs` for v1 health/read/publish.
3. `docs/RENDER_ENGINE_POC_GATE.md` and `docs/VIDEO_AI_FLOW_EXTENSION_PLAN_20261015.md` for next implementation. SP-04 scheduler reused, not duplicated.

## Changed source

`packages/core/src/composition-timing-r2ext02.mjs` (new), `composition-r2ext01.mjs` (v2 historical validator delegation ONLY), `packages/core/src/index.mjs`, `apps/api/src/{controllers,routes}.mjs`, `packages/contracts/src/catalog.mjs`, generated OpenAPI + type declarations, `tools/generate-composition-schema.mjs` (transitive refs only), `tools/generate-timed-composition-schema.mjs` (new), `docs/contracts/composition-{v1,v2}.schema.json`, `package.json` and new tests `packages/core/test/composition-timing-r2ext02.test.mjs`, `apps/api/test/composition-timing-r2ext02.test.mjs`.

## Tests / launch blockers

Run `npm run test:ext02`, `npm run test:ext01`, `npm run test:all`, `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control`. Real FFprobe required for measured tests (will skip those if absent). Web build blocked by missing Vite; Fastify runtime not installed. No JS source code dependencies added, no DB schema change after v28.

## Critical invariants / next task

- V1 still uses `scene_estimate`, no auto-upgrade, no retroactive edits to historical v1 snapshots; v2 is **opt-in** via `/composition/timing`.
- Verified FFprobe audio duration owns automatic scene timing, not metadata or WPM. Source timeline `timingLocked:true` owns manual timing. A mismatch or incomplete file blocks ready publish.
- Single scene-level cue: measured voice stop before padding, **no word-level alignment** unless a future model supplies real, verified boundaries. No guessed word timings.
- Publish requires digest + rowVersion and re-preview, then atomic immutable v28 insert. Future render dispatch revalidates filesystem bytes; preview alone is not render-proof.
- No remote paid call, no credential in logs, no second queue. Remotion vs HyperFrames currently neither benchmarked nor selected; run identical fixtures, 3 workloads × >=3 trials for each real engine.
- Keep handoff/status/test logs updated; don't replace old migration SQL or claim Windows/browser/long-form acceptance.
