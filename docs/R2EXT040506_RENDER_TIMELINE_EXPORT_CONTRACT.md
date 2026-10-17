# R2-EXT-04/05/06 — Render / Timeline / MP4 Contract (2026-10-15)

## SCOPE / TRUTHFUL STATUS

- **EXT-04:** local **FFmpeg-only fast path implemented and runtime-tested**. No Remotion or HyperFrames has been selected (EXT-03 benchmark remains blocked). API uses the one existing durable SP-04 job store; not a second scheduler. No direct remote/paid AI calls.
- **EXT-05:** browser source preview/scene inspector, manual timing lock, frame ruler and explicit approval/export controls implemented in React. **Browser/Vite smoke untested** because `vite` missing. This is **MVP**, not a full nonlinear timeline with transitions/video clip live playback/drag reordering.
- **EXT-06:** export of real local H.264/AAC MP4 with **scene-level Vietnamese subtitles burned** via FFmpeg subtitles/libass. FFprobe validates profile, codec, duration and media streams; a 3-scene **8.533008 s real MP4** was produced from deterministic PNG+WAV fixtures. **Windows, long-form 30–40min, GPU/native-TTS and live browser playback NOT accepted**.

## End-to-end path

1. Create voice and visual assets, select immutable revisions using existing R2-03/04/05. `Composition v2` (`POST /api/videos/:id/composition/timing/preview`) recalculates audio duration with ffprobe.
2. Edit timeline using `PUT /api/videos/:id/timeline` with optimistic `rowVersion`. If `timingLocked`, preserve manual length/caption range; failing locks produce blockers. Do not reorder scenes here: order is canonical in Scene Builder.
3. Explicit `POST /api/videos/:id/composition/timing/revisions` with preview digest + current video rowVersion, which publishes an immutable snapshot; only `readiness.ready` may be published.
4. Explicit `POST /api/videos/:id/renders` with `{revision,requestKey}`. The queue uses kind `render:ffmpeg` and video-scoped idempotency; freezes the published revision reference, no prompt data in response.
5. Worker checks live video/scene/timeline revision + pinned SHA256, verifies local paths remain in the dataRoot, renders image (static/zoom/pan/ken_burns) or input clip, pads audio to each frame duration, burns SRT, QA-checks output, rechecks pinned files and scene state, atomically renames a private `renders/<video>/<digest>.mp4`. No auto-billing.
6. `GET /api/videos/:id/renders/:jobId` returns sanitized status and scene count; authenticated `GET .../mp4` sends private MP4 stream, not a public URL. Chrome/Edge file picker streams to disk without buffering. Non-supporting browsers use a bounded 100MB Blob download. SSE also emits sanitized progress events.

## Security and integrity

- Strict contract validation, v2-only rendering, revision and scene pointer fencing, SHA-256 of input bytes (both before and after encoding), no symlink/path escape, no shell interpolation, FFmpeg process timeouts and AbortSignal. If HTML input contains markup, subtitle cue string escapes it before writing to SRT.
- Private output path is digest-addressed, not a static public folder. Old completed exports are re-probed before reuse. Final files are not stored in asset registry (render output is a job result).
- Long-form caveat: in-process FFmpeg encoder can contend with concurrent media jobs (SP-04 concurrency currently 2). No configurable render concurrency cap beyond shared worker concurrency, no per-scene persistent cache and no resumable encoding mid-scene. A crash restarts the render job, but never reruns completed provider AI jobs.
- FFprobe metadata cannot prove perceptual subtitle correctness or audio waveform sync. Manual screenshot/audio review remains an explicit acceptance gate. The included sample image and WAV fixtures are synthetic and not real native Vietnamese TTS.

## Test commands / deliverables

```
npm run test:ext040506
npm run test:all
npm run check
npm run typecheck:sdk
npm run test:negative-control
node tools/demo-render-r2ext040506.mjs docs/evidence/EXT040506_demo.mp4
```

Tests: 8 new focused tests (4 core + 4 API), full 722/722 PASS, deterministic 3-scene local MP4 QA PASS (1920×1080 @30fps H264/AAC, expected 8.533333 s, actual 8.533008 s, drift <0.001 s). `build:web` remains blocked (`vite: not found`). No new SQLite migration.

## Gate remaining before declaring production-ready

1. `npm ci` and `npm run build:web` on Windows/Chrome or Edge; test UI scene preview, edit/save/undo locks, signed MP4 download and long-form file picker.
2. EXT-03 real Remotion vs HyperFrames benchmark same hardware ≥3 repeats ×3 workloads; licensing/transitive review. Replace FFmpeg fast-path as primary ONLY AFTER evidence, keep fast-path for simple assets.
3. 30–40 minute stress with hundreds of scenes: duration drift, cumulative AAC sync, subtitles/glyphs, CPU/RAM, pause/cancel/disk-full, Windows Unicode paths/FFmpeg font availability, cold/warm rerender and output size.
4. Harden quality gates with perceptual video frame sampling, audio dropout detection and in-browser streaming clip preview. R3 advanced edits/transitions and R4 optimized render/export remain follow-up.
