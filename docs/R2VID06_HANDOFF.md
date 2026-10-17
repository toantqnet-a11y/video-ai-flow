# R2-VID-06 — AI Clip Resource/Cost Estimator (uncommitted batch)

Date: 2026-10-17. Base: `toantqnet-a11y/video-ai-flow` `main` AFTER merged PR #5 (`b78b12c24cadbc53e067daa7dc94cca82d24238a`).

## Status

**IMPLEMENTED IN LOCAL PATCH ONLY**. No GitHub commits, pushes, PRs, automation runs, or GPU requests were made for this task. The patch has seven local pure Node tests (PASS) and two integration tests prepared for the full repository (not executed here). Full repo/Windows CI and a genuine GPU benchmark are **not verified**. `releaseStatus=NOT_READY` remains unchanged.

## What is included

- `packages/core/src/clip-resource-r2vid06.mjs` is a pure, side-effect-free estimator. It returns frame count, pixel-frame workload, RGBA-equivalent reference quantity (explicitly **not** GPU RAM or temp disk), configured workload budget, and operator-declared VRAM minimum/capacity. It blocks policy workloads above the cap or configurations where a declared VRAM budget is smaller than the declared model minimum. If capacity is set but model minimum unknown, it blocks. It does not fabricate native GPU information or model benchmarks.
- Optional runtime projection is available only when the operator supplies an empirical **seconds per million pixel-frames** calibration for their own local workflow; no model-specific throughput is assumed. Bounds are illustrative, not confidence intervals. Direct local provider API billing is $0; **total electricity, hardware depreciation and provider licensing costs are unknown**, not zero.
- Operator-owned environment variables configure workload limits at process startup; these are never accepted from untrusted request JSON. Malformed settings prevent the service from starting rather than authorizing GPU work. The worker rechecks configured limits immediately before actual provider dispatch.
- Existing authenticated `GET /api/scenes/:id/video/preflight` now returns `resourceEstimate` and warnings. Existing single-scene and 40-scene SP-04 queue paths invoke this preflight: an exceeded resource guard prevents queue submission. Worker has an independent secondary fence.
- Scene Inspector renders the read-only estimate when user clicks **Kiểm tra AI local**. Scene Builder's **Dự toán clip** button aggregates multiple read-only scene preflight responses and never queues or spends. Browser code cannot override limits.
- No new HTTP route or contract changes; checked-in OpenAPI / SDK signatures are unaffected. Backlog master JSON is regenerated consistently with its generator, and log/handoff are updated by the installer.

## Optional local-only configuration

| Environment variable | Default | Meaning |
|---|---|---|
| `CONTENTSTUDIO_VIDEO_MAX_PIXEL_FRAMES` | `250000000` | Application workload cap (`width × height × fps × seconds`). It is NOT a GPU VRAM measurement. |
| `CONTENTSTUDIO_VIDEO_AVAILABLE_VRAM_GB` | unset | Claimed available VRAM, never auto-detected. Requires model minimum to make meaningful comparison. |
| `CONTENTSTUDIO_VIDEO_MODEL_MIN_VRAM_GB` | unset | Operator-declared minimum for the currently configured local workflow, NOT an independently verified benchmark. |
| `CONTENTSTUDIO_VIDEO_REQUIRE_VRAM_BUDGET` | `0` | When `1`, block queue until declared available VRAM is set. |
| `CONTENTSTUDIO_VIDEO_BENCHMARK_SEC_PER_MPIXEL_FRAME` | unset | Estimated elapsed seconds per 1,000,000 pixel-frames derived from a real LOCAL operator benchmark (not provided by task). |

If VRAM capacity is set and minimum omitted, generation is blocked. Do not set the declarations to invented values just to remove warnings. Budget can be adjusted locally after actual model evaluation and VRAM/quality testing.

## Install locally WITHOUT commit

1. Extract the ZIP into a writable folder; do NOT copy its test-only `domain.mjs` shim (the archive excludes it).
2. From within a clone/checkout at or after merged PR #5, use `python tools/apply_r2vid06.py <local-repo-path> --check` where `tools/...` is the extracted patch's installer. After a successful dry-run, rerun without `--check`. The script edits the working tree only.
3. Test in the destination checkout: `node --test packages/core/test/clip-resource-r2vid06.test.mjs packages/core/test/clip-resource-r2vid06-integration.test.mjs`, `npm run backlog:check:fi04`, `npm run test:all:batched`, `npm run check`, `npm run build:web`. Run a real Windows/GPU acceptance separately. Commit or push **only later** when the user explicitly asks.

## Risk/limitations

- No automatic probing of GPU hardware, temperature, GPU usage, available disk, or native ComfyUI/Wan success. The pixel-frame guard is an application-level budget, not a reliable VRAM estimator.
- No paid/remote provider adapter and no fallback to Seedance/Veo. All cost figures are restricted to **direct local inference API usage**, not overall operating cost. No calls to paid providers or external websites were made by this patch.
- Existing **in-process** GPU mutex and queue SP-04 are reused. Shared cross-process GPU scheduling remains a separate unresolved dependency.
- The batch UI may make up to 40 authenticated *local, read-only* preflight calls, but no AI generation until user explicitly clicks queue.
- Do not mark release READY from pure Node tests alone; Windows 11 user actions, actual GPU VRAM usage and reliable runtime benchmark are mandatory acceptance evidence.
