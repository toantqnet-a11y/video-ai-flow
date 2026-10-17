# R4-05/06/08 completion contract · 2026-10-16

## Implemented

### R4-05 Subtitle Editor → final MP4

- Existing multi-cue Vietnamese subtitle draft editor persists `r4_subtitle_drafts` (SQLite migration 32) independently of approved Composition v2.
- Render Drawer has an **explicit opt-in** for a saved subtitle draft revision, and a refresh button; no unsaved editor changes are rendered.
- `RenderExportService.preflight` verifies selected `subtitleDraftRevision`, exact `sourceDigest`, cue validity, pinned assets and disk capacity. Missing/stale draft blocks queue.
- Enqueue freezes `{revision,sourceDigest,overrides}` alongside approved Composition/style in immutable `render_snapshots.payload_json`; runner rebuilds and digest-checks the plan from that snapshot, even if a later tab edits the draft.
- FFmpeg burn-in uses snapshot-derived SRT through its existing libass filter. HyperFrames HTML is built with escaped per-cue absolute frame spans from the same snapshot. **No live HyperFrames MP4 was run.** Separate downloadable UTF-8 SRT is produced from the exact same cue plan.
- Render-output digest includes subtitle-draft fingerprint so changed subtitles cannot reuse the wrong MP4. Segment cache excludes subtitles deliberately: source scene audio/visual segments are reusable, final burn-in is rebuilt.

### R4-06 Background Music → queued export

- `POST /api/videos/:id/music/import` accepts validated MP3/WAV/M4A **up to 640 KiB**, fitting the existing 1 MiB JSON body limit. FFprobe verifies audio/duration before publication; imported media is content-addressed at `music/<videoId>/<sha256>.<ext>`.
- `GET /api/videos/:id/music` lists verifiable imported local tracks. Render Drawer supports upload, selecting a saved track, volume, in/out fades, loop and a rights-confirmation checkbox.
- Selected music pin/settings go into the same immutable SP-04 render snapshot and fingerprint. Preflight verifies SHA, path safety and fade limits; no silent paid/provider calls.
- After HyperFrames **or explicit FFmpeg renderer** produces a QA-passed base MP4, an optional FFmpeg second pass mixes looped music under the narration using H.264 stream copy / AAC encode and exports a separately SHA-addressed MP4. Base MP4 remains intact; post-mix output must pass codec, frame count and duration QA. Music is validated before and after use.
- Backup includes verified app-managed imported music, not unrelated files. Music is not generated, downloaded or licensed by the app. No automatic ducking, track edit automation, or streamed uploads >640 KiB yet.

### R4-08 release hardening and evidence

- `tools/r408-release-audit.mjs --verify` executes focused real FFmpeg/Music/Subtitle E2E, legacy R4 tests, R3 render, API contracts, SDK typecheck and negative-control. Every executed gate has status, exit code and time; outputs/logs with possible user data are not copied to the JSON evidence.
- CLI/Node/FFmpeg/probe/dependency checks are probed, not assumed. Vite/Fastify absent -> BLOCKED. Actual Windows/browser, HyperFrames MP4, 30–40 minute MP4, provider live tests, long-job crash/restart and production security review remain BLOCKED.
- `--strict` fails if release is not fully verified. **Release stays `NOT_READY`**. No new DB migrations or new job queue were introduced in this batch.

## Endpoints and user actions

`GET /api/videos/:id/music`; `POST /api/videos/:id/music/import` with `{extension,base64}`;
`POST /api/videos/:id/renders/preflight` and `POST /api/videos/:id/renders` optionally accept:

```json
{
  "revision": 1,
  "engine": "hyperframes",
  "subtitleDraftRevision": 2,
  "music": {
    "pin": {"relativePath":"music/VIDEO_ID/SHA256.mp3","sha256":"...","bytes":1000},
    "settings": {"volume":0.15,"fadeInSeconds":0.5,"fadeOutSeconds":1,"loop":true}
  }
}
```

For enqueue, also supply unique `requestKey`. Music bytes and SHA must match a verified local import; dots above are placeholders, not valid pins. Draft revision is optional; music is optional; **nothing** is implicitly enabled.

## Risks and acceptance remaining

- Cannot run real HyperFrames, web build, browser or Windows acceptance in current environment without installing dependencies. HyperFrames HTML cues are contract-tested only. HyperFrames MP4 plus BGM post-mix needs live validation.
- Base FFmpeg postmix is not a sound-design tool. Volume is capped at 0.6; there is no voice-sidechain ducking or automatic loudness matching.
- Browser JSON importer max 640 KiB, not long licensed soundtrack upload; larger-file streaming import is future scope.
- Full `npm run test:all` reached 842/844 with two artificial downgrade tests failing because their mock pre-v24 DB left behind v32 table. Those **test fixtures** were corrected and legacy 27/27 passed, but a full rerun timed out at ~625. **No global PASS is claimed.**
- DB backup excludes secrets/vault and unreferenced root files; imported music is included with SHA verification; production restore on Windows still pending.
