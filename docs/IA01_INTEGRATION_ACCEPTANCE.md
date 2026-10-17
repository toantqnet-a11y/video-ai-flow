# IA-01 — Integration & Acceptance Gate (post R2-EXT-08)

**Date:** 2026-10-16. **Classification:** Local Linux acceptance partial; **overall release NOT READY**.

## Purpose / non-negotiables

R2-EXT-04/05/06/07/08 produced real FFmpeg output, but short demos did not exercise the **entire** scene/pin/publish/queue chain. IA-01 adds that cross-module gate with 5 independently pinned voice+image scenes, a real Composition v2 publish, a persisted SP-04 render job, MP4 and ffprobe QA. Every voice is an existing WAV *fixture*; artwork is a PNG *fixture*. No real TTS/GPU, paid provider, network access, Windows, browser, or Remotion/HyperFrames outcome is claimed.

## Run from repository root

```sh
npm run test:acceptance          # 4 Node tests, including real local FFmpeg
npm run acceptance:five-scenes   # 1080x1920, 30fps, 5-scene MP4 QA JSON
npm run acceptance:long-plan     # 300 scenes, 600 pinned assets, 36.33-min plan ONLY
npm run test:all
npm run check
npm run typecheck:sdk
npm run test:negative-control
npm run build:web                # requires npm/Vite: blocked here
npm run test:live-http           # requires npm/Fastify: blocked here
```

To keep an MP4 outside the temporary workspace: `node tools/integration-acceptance.mjs --full-res --output=./my-fixture.mp4 --report=docs/evidence/IA01_five_scene_full_res_qa.json`. This command does not call any AI service.

### Gate A — Actual local five-scene MP4

- Input: 5 distinct scene texts, 5 WAVs, 5 PNGs; all SHA-pinned, all persisted as immutable asset revisions. Portrait 1080×1920/30fps profile belongs to channel preset (not forged at render time).
- v2 measured FFprobe timing, exact frame accumulation, single full-scene Vietnamese SRT cue per scene (NOT word-level forced alignment).
- Explicit immutable composition publish, queued FFmpeg job through **one** existing SP-04 store/runner, identical submission idempotency, persisted success after DB reopen.
- MP4 H.264/AAC, correct resolution, FPS, duration AND **exact frame count**.
- Negative gates: file tampering fails SHA check before enqueue; changing video revision blocks render enqueue with `RENDER_STALE_COMPOSITION` and leaves all historical assets intact.
- Actual result: **429/429 video frames**, 14.300 seconds at 30 fps, MP4 output and FFprobe QA PASS. See `docs/evidence/IA01_five_scene_full_res_qa.json`.

### IA-01 defect found and repaired

Previously the output could contain **428 frames for a declared 429-frame composition**, even when `format.duration` showed 14.300 sec. Cause: AAC/concat timestamp offset can push the first video frame to +1/fps. Changed the final FFmpeg filter to normalize the frame clock and allow a bounded 2-frame tail pad, while retaining `-frames:v` and existing SHA/published-state guards. **FFprobe `nb_frames` must now exactly equal `composition.totalFrames`**. A new negative test confirms one-frame loss fails the QA even if container duration matches. Do not confuse frame-count QA with perceptual sync QA.

### IA-02 — Long-form capacity rehearsal (NOT a rendered 35-minute MP4)

- 300 real SQLite scene rows, 300 independently pinned PCM WAV assets and 300 verified PNG revisions, 300 real FFprobe voice measurements, contiguous captions/frame offsets.
- 65,400 frames at 30 FPS = **36 min 20 sec**; 2×300=600 asset revisions.
- This stresses **data planning and media preflight** only. It does **not** measure 36-minute encode duration, seek behavior, GPU, Windows drivers, 600-job crash restart, storage pressure during encoding or scene-perfect visual/audio playback.
- Evidence: `docs/evidence/IA02_35min_plan_qa.json`.

## Release blockers — do not sign off early

| Gate | State | How to close |
|---|---|---|
| Linux 5-scene local media -> MP4 | **PASS** | Review exported samples visually for text collision/safe margins and listen for cutoffs. |
| Long-form Composition v2 preflight | **PASS (plan only)** | Real 30–40-min MP4 and timed seek/QA remain pending. |
| Real React/Vite build + browser | **BLOCKED** | Online `npm install` (here DNS EAI_AGAIN), `npm run build:web`, open app, inspect scene editing/subtitle/drag operations. |
| Fastify authentication/private route | **BLOCKED** | Install Fastify and `npm run test:live-http` + real browser session. |
| Target Windows launcher, FFmpeg filesystem and GPU | **PENDING** | Run CI Windows job AND local target-machine acceptance; CI runner alone is not GPU proof. |
| Live Edge, Piper, VieNeu, ComfyUI | **PENDING** | Controlled real inference with user's hardware and output QA. No automatic paid calls. |
| Engine comparison (EXT-03) | **NOT RUN** | Install Remotion/HyperFrames and run 3 workloads × ≥3 repeats per engine on the same host, record license/CPU/RAM quality. |
| Disk-full/kill-9/restart while encoding | **PENDING** | Test with temp storage quotas and valid file backups on target; current job can restart entire render (AI stages persist). |

**Gating principle:** Local deterministic execution proves only that specific path on this Linux runtime. IA-01 does not change the existing user-visible release status `NOT_READY`.
