# Video AI Flow — R3-VID-01 / R3-VID-02 — uncommitted agent handoff

**Date:** 2026-10-17  **Base:** `toantqnet-a11y/video-ai-flow` main after PR #5 (`b78b12c`), **with uncommitted R2-VID-06 batch applied before this one**.  **GitHub write operations:** ZERO. No commit, push, PR, release or model inference.

## Implementation

**R3-VID-01: browser timeline mixed preview**
- `packages/core/src/mixed-clip-fit-r3vid01.mjs`: pure scene-clock → source-clock projection; local loop/hold; visual in/out window; voice-preservation/mute invariants. Fit is full-scene `loop`, or `hold` (freeze outside a manually saved visual window).
- `apps/web/src/TimelineEditorR302.jsx` patch: fetch only the active selected clip via existing authenticated `getSceneClipFile`, expose a `<video muted playsInline>` element, read its real metadata duration, synchronize playback and seek to existing narration clock, pause on reorders/trim/locks, revoke Blob URL and abort old request. No new player emits voice or provider calls; missing/bad clips show errors instead of fake preview.
- `apps/api/src/server.mjs`: adjust default local content CSP to permit safe `blob:` image/video previews; never permit remote media origins.

**R3-VID-02: exact visual normalization and real mixed render**
- `packages/core/src/clip-normalize-r3vid02.mjs`: real bounded local ffprobe of ISO BMFF MP4/MOV + WebM, accepted codec and stream validation; planned loop or hold, bounded FFmpeg H264 4:2:0 fixed geometry/fps/exact frames; `-an -sn -dn` **strips original clip soundtrack**, source verified voice remains sole narration. Abort/kill/timeouts are handled by injecting the existing renderer's `runBinary`.
- `packages/core/src/render-ffmpeg-r2ext04.mjs` patch: run normalizer **only after pinned asset SHA validation and only on segment cache miss**; copy compatible no-audio H264 MP4s without re-encoding, then render scene using normalized visual + exact original narration, don't double-trim visual windows. Increment R3-08 segment cache version to prevent stale reuse. Existing final SRT/audio H264 QA remains authoritative. There is **no paid or remote fallback**.
- `packages/core/src/scene-video-r2vid.mjs` + `apps/web/src/SceneVideoPanelR2VID.jsx` + `packages/contracts/src/catalog.mjs`: secure imported MOV ≤8 MiB; ffprobe verifies source; locally transcodes to H264 MP4 for browser compatibility; stores SHA256 of original MOV, source codec, original container and transcoding provenance in asset metadata. Original MOV bytes are not retained: only normalized MP4 asset is retained. MOV transcode bounded by max 30s and 350 million source pixel-frames, ≤32 MiB normalized file, scoped to private scratch. MP4 retains existing path. No route or account credentials added. Future large-file streaming remains separate backlog.
- `packages/core/src/index.mjs`: export deterministic helpers; `tools/fi04-backlog.mjs` statuses revised but release remains `NOT_READY`. Regenerate checked-in OpenAPI/types and master 69-task backlog **locally** when applying this patch.

## Test evidence: actually executed here (offline, not on repo checkout)

Command: `node --test packages/core/test/*.test.mjs` in this batch root (Node v22 + FFmpeg v7.1.5): **8/8 PASS**.

1. Validate 6-second clip loops across 18-second narration while source audio stays muted.
2. Honor saved visual trim, hold first/last frame and reject unsafe clock inputs.
3. Genuine FFprobe MOV/MP4 family gate; reject audio-only MP4, fake input and unsupported format.
4. Generate **real 1-second MOV including a different soundtrack**, normalize to 3-second 90-frame H264 MP4 with NO source audio, then combine with distinct 3-second external voice and inspect H264/AAC.
5. Source-shorter-than-explicit-window refuses to mask missing frames; valid window holds exact 90 frames.
6. Exact H264 MP4 source without audio uses SHA-safe file-copy passthrough; no extra FFmpeg re-encode.
7. Render a **genuine 2-scene hybrid image + MOV + external voice + Vietnamese SRT** through FFmpeg, exactly 120 H264 video frames at 30 fps and AAC audio, ~4 seconds; inspect codec, frame count, dimensions and duration.

**NOT TESTED here:** full source repo unit/contract tests, Vite build, live Fastify HTTP after patch application, target Windows 11 Chrome/Edge paired UI, 120/500 scene performance, authentic Wan/ComfyUI GPU output, actual 35–40 minute video / interruption and restart, production threat review. Once local checkout exists, use the list below before any later user-approved batch commit.

## Apply — NO Git operations

After staging R2-VID-06 as an uncommitted working-tree patch, copy this batch to a local folder and run:

```sh
python tools/apply_r3vid01_02.py /absolute/path/to/video-ai-flow --check
python tools/apply_r3vid01_02.py /absolute/path/to/video-ai-flow
```

The installer validates all anchors and refuses partial writes; on failure during generated artifacts, reverts its own changes. **No Git commands**. `--check` performs no mutation. A checkout not matching baseline must be inspected/rebased manually rather than force-replaced.

### After applying, verify from repo root

```sh
node --test packages/core/test/mixed-clip-fit-r3vid01.test.mjs packages/core/test/clip-normalize-r3vid02.test.mjs packages/core/test/mixed-hybrid-r3vid02.test.mjs
npm run backlog:check:fi04
npm run test:all:batched
npm run check
npm run typecheck:sdk
npm run build:web
npm run test:live-http
```

**Next agent:** Check `packages/core/src/render-ffmpeg-r2ext04.mjs` for original `safePinnedPath`, existing `checkMp4Quality`, .segment-cache and `-map 1:a:0` rules. Do not relax hash pinning or lose pending voice. Test MOV ingestion through authenticated route with real local asset and check `originalSha256`. Do not mark Windows/GPU/35min acceptance PASS from the four-second fixture. Worklog updates are part of this uncommitted patch; continue the log when integrating newer tasks.
