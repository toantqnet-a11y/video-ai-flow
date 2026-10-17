# R3-05 — Visual Trim Render Integration (2026-10-16)

**State:** CODE_COMPLETE_TESTED_OFFLINE. **Release:** NOT_READY. **Engine:** HyperFrames selected as default by PO; FFmpeg remains explicit manual fallback. Real HyperFrames CLI output not accepted/tested.

## Problem fixed

Until this checkpoint `timeline_documents.data_json.visualEdits` affected only the 4-track editor; Composition and MP4 ignored it. Now a saved visual window is converted to immutable `Composition v2` per-scene optional `visualWindow:{inFrame,outFrame}`. Prior v1 and historical v2 revisions **without this property** remain valid. No SQLite migration or new paid service/worker.

## Contract and playback model

- **Units:** `inMs/outMs` in persisted editor timeline, `[inFrame,outFrame)` in approved Composition v2; integer scene-local frames at the Composition profile FPS. Start is floor(ms × fps/1000), end is ceil; a minimum ~200ms active period is validated.
- Visual window is **display interval**, not a source-file seek interval. For video, source frame 0 is held before `inFrame`, the original video runs from its beginning over `inFrame..outFrame`, then its last active frame is frozen until the scene ends. If the source video is shorter than the active interval, reject rather than silently shorten/loop it. For still images, the first motion pose is held before the window and the last pose after it; `none` motion remains unchanged.
- Never modify `scene.durationFrames`, measured narration length, caption cue start/end, source scene index, manual media selection, or previously published Composition. Any saved trim requires new Composition approval.
- FFprobe timing can shorten a scene compared with the editor's estimated duration. An edited window outside measured final scene duration emits `VISUAL_WINDOW_CONFLICT`, and **preview/approval cannot become ready**. No silent clamp.
- Validator rejects injected keys, out-of-range frames, empty windows, redundant full windows, and digest tampering. Digest pins every accepted window and SHA-pinned media. Enqueue still uses existing SP-04 and rejects stale revision/source.

## Engine implementation

- **HyperFrames primary (prepared, not real-run):** Still-image effect uses scene-specific CSS keyframes and frozen pose intervals. Edited video clips are preprocessed **locally with FFmpeg** into `assets/visual-NNNN.mp4` before HyperFrames renders the final composed MP4; unedited assets are merely copied. Clip source duration and resulting frame count are verified by FFprobe. Staged files are deleted on failure; no auto-switch or network/cloud.
- **FFmpeg explicit manual path (actual short MP4 tested):** Still-image zoom/pan uses frame-clamped motion progress, and edited video uses `fps → trim(active) → tpad(clone start/end) → exact frame clock`. A too-short clip is rejected before render; per-segment frame count and final H264/AAC/size/fps/total frame count are checked. The final subtitle burn-in and voice track use the unchanged Composition clock.
- **Performance:** Preprocessing applies only to edited video clips and incurs local encoding CPU cost. No long-form benchmark yet. No promise of visual equivalence between CSS animation and FFmpeg expression at subframe precision without real HyperFrames/browser testing.

## Tests/evidence

- Focused `npm run test:r305-render` — 8 real/synthetic tests covering old v2 compatibility, digest validation, actual editor → immutable v2 publish, conflict blocker, HTML hold markup, lossless-frame hold verification, staged HyperFrames input with mocked CLI, too-short source rejection, and **actual 1280×720 30fps FFmpeg H264/AAC MP4** for edited video and image zoom.
- Other R3 regression, contracts, SDK, negative control tested. Full suite evidence in `docs/R305_RENDER_TEST_REPORT.md`.
- Reproducible self-contained FFmpeg-only demo: `node tools/r305-trim-demo.mjs --output=<absolute-path.mp4>` (outputs 90 frames/3 seconds; source 2.5sec; visual window 0.6–2.4sec; voice 2.3sec and unchanged caption). **Not** a HyperFrames render.

## Remaining release work

1. Install a locked, supported HyperFrames binary and Vite/Fastify dependencies, run real MP4 and review image/video hold boundaries on Windows in the browser.
2. Stress 120–500 scene timeline and 30–40 minute H264/AAC export (time/RAM/SSD/restart), including clips with/without edits and non-30fps projects.
3. Verify synchronized preview (currently scene still image/voice preview, not native rendered mixed video) and end-user trim interaction on hardware.
4. R3-07 versioned undo/redo; R3-08 segment caching, and further R3 export/recovery tasks.
