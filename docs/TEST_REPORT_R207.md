# R2-07 — Offline Test Report

**Date:** 2026-10-15  |  **Status:** `CODE_COMPLETE_TESTED_OFFLINE`

## Executed locally on provided workspace

| Command | Outcome |
|---|---|
| `npm run test:r207` | **19/19 PASS** |
| `npm run test:r206` | **14/14 PASS** (asset registry regression) |
| `npm run test:r205` | **20/20 PASS** (image generation regression) |
| `npm run test:all` | **593/593 PASS** full project and spikes |
| `npm run check` | **PASS**, generated OpenAPI/SDK up to date |
| `npm run typecheck:sdk` | **PASS** TypeScript contract checks |
| `npm run test:negative-control` | **PASS**, deliberate failing test yields nonzero exit |
| `npm run build:web` | **BLOCKED:** `vite: not found` (dependency missing, exit 127) |

## Focused coverage

R2-07 cases cover: nonmutating preview; one-transaction DAG scheduling; ordered provider → gate → final dependencies; idempotent request key and conflict; Edge remote consent and no partial writes on invalid batch; rollback on trigger failure; manually pinned media; scope-limited voice/image; invalid pinned media; process restart between worker completion and promotion; partially failed stage without corrupting selected pointers; late manual selection; deduplicated existing stage jobs with corrected dependency remapping; all-reused asset flow with no generation; explicit atomic retry of failed providers and dependent gates; Edge retry new consent; stale retry blocked; TOCTOU source conflict rollback; atomic failed-node insertion rollback; expired lease reclaims under new fencing token. Gate reports source-preserved FFprobe voice timing for future subtitle/timeline sync.

Provider jobs in the new focused tests use **deterministic fake local outputs**; SQLite, SP-04 queue transitions and real manifest promotion are used. This is not evidence of actual Piper, VieNeu, Edge or ComfyUI model quality. Existing R2-03/R2-05 tests cover FFprobe/image verification separately.

## Acceptance still pending

- Native Piper/VieNeu/Edge TTS and ComfyUI GPU workflow end-to-end.
- Real Fastify bearer/CSRF HTTP and React UI (dependencies unavailable in this workspace).
- Windows execution/launcher and performance on 30–40 minute projects under scene concurrency/VRAM pressure.
- End-to-end subtitle timecode alignment, render/MP4 export and real Remotion/HyperFrames POC.

Do **not** mark R2-07 production validated. No tool-triggered paid provider calls occurred during the test suite.
