# ContentStudio — Agent Handoff (R2-11)

**Current:** R2-11 Selective Regeneration & Revert `CODE_COMPLETE_TESTED_OFFLINE` (16 focused, 658 full). **Next R2-12:** quota/fallback monitoring UI according to approved original roadmap, not an implicit provider billing/reconciliation feature. R2-13 is integration regression.

## Fast path (no full repo scan)

1. `AGENTS.md` → `R2_Status.md` → `docs/R211_SELECTIVE_REGEN_CONTRACT.md` → `docs/TEST_REPORT_R211.md`, then tail `docs/WORKLOG.md`.
2. Implementation: `packages/core/src/selective-regeneration-r211.mjs`, `regeneration-options-r211.mjs`; small snapshot changes in `scene-voice.mjs` and `scene-image.mjs`; `apps/api/src/controllers.mjs`, `routes.mjs`; `packages/contracts/src/catalog.mjs`; web `SceneVoiceWorkspace.jsx`, `SceneImageWorkspace.jsx`, `AssetLibraryWorkspace.jsx`.
3. Tests: `packages/core/test/selective-regeneration-r211.test.mjs`, `apps/api/test/selective-regeneration-r211.test.mjs`, `apps/web/src/selective-regeneration-r211.test.mjs`.
4. Existing queue: `spikes/SP-04/src/store.js`, `packages/core/src/asset-dag-r207.mjs`, `packages/core/src/manifest.mjs`; no alternate job queue.
5. Original scope source: `Video_AI_Flow_Development_Execution_Plan_v3.md`, R2-11 EP06 US-6.4/6.5; note prior R2-09/10 delivery titles had deviated somewhat from original v3 naming, so always read actual backlog.

## Invariants

- Only a user click schedules per-scene regenerate, and only ONE `voice|image` per request; new `regenerationKey` differentiates a requested revision while preserving cache input hashes for normal calls. Same key + mutated options or source = 409; do not disable this check.
- `selectVoice` requires a healthy committed voice from same scene, job provenance, current source text/config and explicit optimistic row version. A newer queued voice must not override a restored revision. Do not treat an old text narration as current.
- `selectSceneImage` continues to pin and protect manually selected visual revisions. Remote Edge requires fresh consent; local TTS defaults need operator config; no auto-paid provider calls.
- v26 migrations immutable; if expanding beyond this feature, add v27 rather than rewrite existing migrations. Keep private binary downloads authenticated.
- Always update comment-for-intent, `WORKLOG`, `HANDOFF`, `AGENTS`, status, tests; do not declare real GPU/browser/Windows passes absent evidence.

## Reproduce

`npm run test:r211 && npm run test:all && npm run check && npm run typecheck:sdk && npm run test:negative-control`.
`npm run build:web` currently BLOCKED: no Vite installed. A JSX syntax pass is not equivalent to a production web build.
