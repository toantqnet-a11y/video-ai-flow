# SP-VID-01 — ComfyUI AI-Video Local Protocol Spike

**Status:** `TESTED_PROTOCOL + REAL_MP4_IMPORT / PENDING_REAL_AI_INFERENCE_AND_WINDOWS_GPU`.

This adds real **video-file plumbing**, NOT a claim that a live text-to-video / image-to-video model ran. The ComfyUI tests use a mocked loopback HTTP server and a **real FFmpeg-generated 1-second MP4 fixture** to validate transport and decoding. The fixture is NOT generative video and is NOT image-motion disguised as AI output.

## Current scope
- `src/comfy-video.mjs` — ComfyUI `/prompt`, `/history/{promptId}`, `/upload/image` (I2V), `/view` (MP4 only; explicit remux of WebM remains future work). Requires user-supplied **API-exported** workflow JSON and exact node input bindings. Supports prompt, negative prompt, seed, output resolution, fps, requested duration (when mapping exists). Does **not** guess Wan node IDs or silently change duration.
- `src/contracts.mjs` — local-only endpoint validation, request guard, fingerprints, explicit paid/remote block.
- `src/media.mjs` — bounded downloads, ffprobe stream validation, SHA-256, immutable MP4 revision, `.partial` staging and atomic rename, manual video import.
- `src/service.mjs` — video service and SP-04 `video:generate` queue handler bridge. Stays separate from future R2/R3 production API/router.
- `src/cli.mjs` — endpoint diagnostics; no automatic generation/model weight downloads.
- `test/` — 21 deterministic tests including mocked ComfyUI T2V/I2V, malicious filenames, abort/timeout, real video probe/import, and **integration with the existing SP-04 SQLite queue**.

## Run
Prerequisites: **Node.js >=22.13**; **FFmpeg/FFprobe installed** and accessible on PATH for media validation/tests.

```bash
cd SP-VID-01
npm test
node src/cli.mjs diagnose
```

On Windows PowerShell: `./Run-Windows.ps1 -Mode test` or `-Mode diagnose`.

To actually run AI inference later, PO needs compatible GPU/VRAM or an explicitly approved provider. A developer must install ComfyUI, the chosen model weights, and export a working **API-format** workflow. Bindings match the particular workflow (example: `{"prompt":{"nodeId":"10","input":"text"}, "image":{"nodeId":"31","input":"image"}, "durationSeconds":{"nodeId":"21","input":"length","transform":"frames"}}`). This is a **binding example, not a working Wan2.2 model configuration**.

### Minimal integration example (once a real workflow exists)
```js
import { ComfyVideoAdapter } from './src/comfy-video.mjs';
import { VideoAssetService } from './src/service.mjs';
const service = new VideoAssetService({
  dataRoot:'./data',
  adapter:new ComfyVideoAdapter({
    origin:'http://127.0.0.1:8188',
    workflowPath:'./my-wan-workflow-api.json',
    bindings: {
      prompt:{nodeId:'YOUR_PROMPT_NODE', input:'YOUR_TEXT_INPUT'},
      image:{nodeId:'YOUR_LOAD_IMAGE_NODE', input:'image'},
      // Optional: fps, seed, width, height, durationSeconds fields as supported by your workflow
    },
  }),
});
// const result = await service.generateScene({projectId:'demo',sceneId:'scene001',
//   request:{mode:'image_to_video',prompt:'Slow cinematic move',durationSeconds:4,imageBytes:pngBuffer}});
// The above call is illustrative: it requires an installed model, valid workflow & PNG bytes.
```

## Known limits / integration gates
1. **No live model generation tested.** No NVIDIA GPU or ComfyUI process running here; `diagnose` reports not reachable. A model-specific workflow and license/weight check are pending. ComfyUI itself is free to run; actual hardware, model licenses and energy are not free.
2. **Only local ComfyUI transport** implemented; no Seedance/Google Flow API. Google Flow supports **manual export then import**; no web scraping. Remote paid API needs EP02/EP12 consent/budget approval and SP-06 secure endpoint/vault wiring.
3. **Queue at-least-once** may submit a local generation twice after OS crash. SP-04 fencing deduplicates DB commits, **not** provider executions or orphan physical files. Reconciliation, staged-write/DB two-phase lifecycle and canceled-job cleanup are ARC-01/R2 integration tasks.
4. **Workflow capabilities are model-specific**. Actual min/max duration, supported resolution and VRAM must be checked against installed weights and exported workflow. A `durationSeconds` frame binding requires `fps` and does not imply every model honors exact seconds.
5. Preview/timeline/render glue, browser player sync, SSE authenticated routes, and project database migrations remain EP13 R2/R3 tasks. This spike validates transport/assets, not end-to-end 35-minute AI rendering.
6. For 30–40-minute complete videos, **Hybrid** (AI video + image motion + imported clips) remains PO-approved default. UI must visibly distinguish `ai_video` / `imported_video` / `image_motion`.
7. `ffprobe` duration is extracted from stream metadata, **not** a guarantee all frames visually decode correctly; full frame decoding and AV-sync QA required before production.

## Agent handoff
Read `../AGENTS.md` → `../docs/HANDOFF.md` → `../Sprint_0_Status.md` → this README. Next task: `ARC-01` technical integration baseline. Do not assume this module is already connected to the React/Fastify app.
