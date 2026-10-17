# R2-EXT-03 — Render-engine POC contract

**Status:** `POC_HARNESS_COMPLETE_GATE_BLOCKED` · 2026-10-15. This is *not* `CODE_COMPLETE_TESTED_OFFLINE` for the actual comparison, because **neither engine has rendered any MP4 here**.

## Inputs and workload parity

Source: `spikes/EXT-03/assets/` from the earlier companion POC. Builder: `spikes/EXT-03/scripts/benchmark-r2ext03.py`. It outputs three deterministic scene manifests: 1 / 5 / 15 scenes, FFprobe-measured audio duration `ceil((voiceSeconds + 0.45)*30)` frames per scene, each media sha256 pinned. The Remotion JSX and HyperFrames HTML use the same captions (Vietnamese glyph test) and PNG/WAV (English fixture); same 1080x1920, 30 fps and H.264 CRF 20. Both show caption only during audio and animate images ~1→1.025 linear zoom. Does not invent per-word timestamps.

## Gate criteria

1. Both engines installed from pinned dependencies, versions+transitive licenses reviewed; on same OS, hardware, fonts, Chrome, FFmpeg.
2. Three workloads × minimum three alternated real engine runs, no fake performance result for NOT_RUN; cold/warm and machine conditions noted.
3. Each result has actual MP4 + FFprobe check of video H.264, audio present, 1080x1920, 30fps, duration drift ≤0.125s; output log, duration, sampled process-tree RSS/CPU and MP4 file size.
4. Human checks: compare scene boundary/3 frames each, Vietnamese accent rendering, images, audio dropout, subtitle cutoff. These **cannot** be certified by FFprobe metadata.
5. Production choices require legal check of Remotion's custom licensing especially for an automation product; HyperFrames Apache-2.0 and its transitive dependency licenses also require verification.
6. Win + native TTS + 30–40 min remains **separate acceptance gate**, not implicitly closed by short synthetic fixture.

## Current evidence and blockers

- `npm run test:ext03`: 7 harness-only tests PASS.
- `npm run test:ext02`: 14 tests PASS, R2-EXT-02 remains offline complete.
- `npm run test:all`: 714 PASS (application regression unchanged).
- `npm view remotion version --fetch-timeout=6000 --fetch-retries=0`: `EAI_AGAIN` for `registry.npmjs.org` in current runner.
- Both `node_modules` absent → runner writes **18 NOT_RUN entries**, median values NOT_MEASURED, no renderer selected.
- Prior FFmpeg baseline MP4 H.264 1080×1920 exists and was probed, but is **not** either renderer.

## Decision

`ADR-R2EXT03`: Keep Composition v2 and queue unchanged, no database migration, no production render selection. Prepare accurate benchmark harness without automatic remote download, paid provider calls or a secondary job queue. **R2-EXT-04 must wait for real benchmark gate** (unless separately authorized to implement an explicitly provisional FFmpeg-only adapter).
