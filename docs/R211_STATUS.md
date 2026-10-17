# ContentStudio R2-11 — Selective Regeneration & Revert

**Date:** 2026-10-15  
**Delivery:** `CODE_COMPLETE_TESTED_OFFLINE`  
**Source of scope:** original `Video_AI_Flow_Development_Execution_Plan_v3.md`, R2-11 (EP06 US-6.4/6.5): independently regenerate scene voice/image, retain verified versions and undo activation; regenerating one scene makes **zero new provider calls** for unaffected media/scenes.

## Implemented

- Single-scene `POST /api/scenes/:id/assets/regenerate` with `kind=voice|image`, `requestKey`, `expectedRowVersion`, strictly validated voice/image options. Never uses a second job queue.
- `regenerationKey` added only when the user deliberately re-generates; provider input hashes are *unchanged for old regular calls* for backward-compatible cache.
- Repeating a completed key returns its existing job without new inference; same key with changed settings/source rejects with `REGENERATION_KEY_CONFLICT`.
- Local ComfyUI by default; Edge remote requires explicit consent for each request. No paid provider/fallback introduced.
- `POST /api/scenes/:id/voice/select` restores checked, same-scene immutable narration versions without model invocation. SHA-256/size/symlink protections, current script and config, source job and intent, optimistic rowVersion and concurrent intent checks all enforced.
- Image undo is the established safe `POST /api/scenes/:id/image/select`; R2-11 adds voice undo button alongside it in Assets UI.
- Explicit ↻ regenerate controls in Scene Voice and Scene Image workspaces (including an editor-side source-staleness check) (new key per click). Asset Library shows a restore action for verified voice as well as image.
- No migration: retains SQLite v26 and single SP-04 queue. No edit to old migration SQL or any generated asset binary.

## Verification

- **16/16 R2-11 focused** (`npm run test:r211`).
- **658/658 all-project offline** (`npm run test:all`).
- `npm run check`: PASS (OpenAPI generated and checked).
- `npm run typecheck:sdk`: PASS.
- `npm run test:negative-control`: PASS.
- JSX syntax for SceneVoiceWorkspace/SceneImageWorkspace/AssetLibraryWorkspace: TypeScript parser 0 diagnostics.
- `npm run build:web`: BLOCKED (`vite: not found`, exit 127), NOT a proven React build success or failure.

## Remaining acceptance

- Install npm/Vite deps then run real frontend build and browser/Windows integration.
- Actual Edge/Piper/VieNeu speech; ComfyUI inference with checkpoint and GPU; long-form 30–40 minute tests.
- 2+ process simultaneous regenerate race/lock load and interrupted filesystem verification require live stress tests.
- R2-12 scope per original plan: quota and fallback monitoring UI; R2-13 integration regression. Later renderer/Remotion/HyperFrames extension tasks are separate and **not implemented**.
