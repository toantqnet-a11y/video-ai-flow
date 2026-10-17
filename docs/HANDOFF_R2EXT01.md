# Agent handoff — R2-EXT-01 (2026-10-15)

Checkpoint: completed R2-01..13 offline, **R2-EXT-01 CODE_COMPLETE_TESTED_OFFLINE**, release NOT_READY. **Next task R2-EXT-02** (actual voice duration → frame math and subtitle timing). No renderer selected and no MP4 export has been implemented here.

**Start here (do not rescan repo):** `AGENTS.md` (last section), `docs/R2EXT01_COMPOSITION_CONTRACT.md`, `docs/TEST_REPORT_R2EXT01.md`, `docs/R2EXT01_STATUS.md`, tail `docs/WORKLOG.md`.

**Implementation files:** `packages/core/src/composition-r2ext01.mjs` (source hash & pin validator; preview/publish/historical revisions); `packages/core/src/db.mjs` (append v28 only); `packages/core/src/index.mjs`; `apps/api/src/{controllers,routes}.mjs`; `packages/contracts/src/catalog.mjs`; generated `docs/api/openapi.json`, `packages/{contracts, sdk}/...` declarations; `docs/contracts/composition-v1.schema.json`, generator `tools/generate-composition-schema.mjs`.

**Tests:** `npm run test:ext01`; `npm run test:all`; `npm run check`; `npm run typecheck:sdk`; `npm run test:negative-control`. `npm run build:web` BLOCKED missing Vite and `npm run test:live-http` BLOCKED missing Fastify dependencies. Windows/browser/GPU/TTS/30–40m still untested.

**Invariants:** This is a snapshot/publish **contract**, NOT a video renderer. `durationBasis:'scene_estimate'` and `captions.mode:'scene_estimate'` are temporary and intentionally not FFprobe alignment. `voice.measuredDurationMs` is advisory, NOT authoritative timeline time until EXT-02. `readiness.ready` is asset-publish eligibility, NOT release signoff. Don't silently modify v1 fields without schema version bump. Future adapter MUST rehash files and compare current intent at dispatch; immutable SQL cannot freeze disk data. No extra queue, paid/remote fallback, credential logging or changes to v1–v27 migration SQL. Continue append-only migration and update handoff docs on next task.
