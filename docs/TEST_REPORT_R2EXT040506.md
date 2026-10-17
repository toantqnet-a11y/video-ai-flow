# Test report — R2-EXT-04/05/06 (2026-10-15)

## Verified on Linux/offline
- `node --test packages/core/test/render-ffmpeg-r2ext0406.test.mjs apps/api/test/render-export-r2ext0406.test.mjs packages/contracts/test/contracts-r005.test.mjs`: **14/14 PASS** (8 new: 4 core, 4 API).
- `npm run test:all`: **722/722 PASS**.
- `npm run check`: **PASS** (source checks and generated OpenAPI drift).
- `npm run typecheck:sdk`: **PASS** (typed client contracts).
- `npm run test:negative-control`: **PASS**.
- Real `node tools/demo-render-r2ext040506.mjs ...`: **PASS**. 3 actual PNG/WAV scenes; MP4 1920x1080, 30fps, H.264 video + AAC audio, duration target 8.533333s, measured 8.533008s (drift <0.001s); embedded burnt subtitle manually checked in sampled video frame (Vietnamese accents display correctly).
- `npm run build:web`: **BLOCKED**, `vite: not found` (exit code 127); NOT a pass.
- EXT-03 Remotion/HyperFrames benchmark remains `NOT_RUN`, not included in 722 tests.

## Negative / failure protections
- Fails if unpublished/non-v2/not-ready composition or extraneous paid request field.
- Renders only approved current video/scene/timeline asset pointers; rejects unknown job id cross-scope.
- Rejects changed asset SHA256 and path traversal; checks again after render before promoting output.
- Queue has same idempotency key semantics as existing SP-04; identical retry reuses same job.
- Authenticated private streaming downloads; browser buffer capped at 100MB except direct file handle streaming.

## Not proven
- Actual React browser rendering and web build (npm dependencies unavailable).
- GPU, live native Vietnamese TTS, ComfyUI production, large video, Windows symlinks/unicode.
- Full word-level subtitle timing, interactive transition editing, live imported clip preview, Remotion/HyperFrames performance/licensing decision.
- Resume partway through FFmpeg encoding; crash restarts whole render job (AI media stages unaffected).

**Conclusion:** Conditional completion on code/offline Linux only. Release and long-form performance **NOT_READY**.
