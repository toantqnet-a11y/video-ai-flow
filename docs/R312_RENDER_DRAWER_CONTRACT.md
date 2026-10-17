# R3-12 — Render Drawer, Preflight, Honest Progress (2026-10-16)

## Goal
The timeline has local-only render settings and a truthful progress drawer. The approved Composition v2 is immutable; editing after export labels the old output as historic rather than overwriting it.

## API contract and controls
- `POST /api/videos/:id/renders/preflight`: `{revision, engine?:"hyperframes"|"ffmpeg-fastpath", resolution?:"source"|"720p"|"1080p", styleRevision?:positiveInt}`. Read-only, checks v2 approval, live row versions, exact SHA-256 pinned media and selected format/style; returns `{ready, blockers, revision, compositionDigest, engine, resolution, profile, sceneCount, hyperframesRuntimeVerified:false}`. `ready=true` does NOT imply HyperFrames CLI is installed.
- `POST /api/videos/:id/renders`: same fields plus explicit unique `requestKey`, once per user click. Identical queue guarded by existing SP-04 idempotency. No paid provider and no automatic FFmpeg fallback.
- `GET /api/videos/:id/renders/:jobId`: now includes `revision`, `resolution`, `sourceCurrent`, `drawer` (stage + measured completed/total scenes + fraction) and previous `output` QA URLs. The old output remains downloadable after subsequent timeline editing.
- R3-12 progress uses the existing authenticated `/api/jobs/events` bearer+cursor SSE. Durable `render_progress` now allows *only* `preparing`, `encoding`, `finalizing`, `verifying` stage labels. Browser reconnects/polls after SSE loss. Stage is not an estimated render percentage. Even at N/N encoded scenes, final mux/QA may remain unfinished.
- Browser new `RenderDrawerR312.jsx`: 720p/1080p/source, HyperFrames primary, FFmpeg opt-in, read-only preflight, guarded explicit enqueue/retry, job stage + dated output revision and stale-warning. Existing binary downloads remain available for finished historic outputs.

## Render geometry
- `renderProfileVariant` clones v2 Composition and recalculates digest *without modifying approved source*; time frame count, voice, subtitles and manual window remain identical.
- `16:9`: 720p=1280×720, 1080p=1920×1080. `9:16`: 720p=720×1280, 1080p=1080×1920. `1:1`: only source or 1080p=1080×1080. A square 720p option fails with `RENDER_RESOLUTION_UNSUPPORTED` rather than silently changing the aspect ratio.
- Enqueue pins the original revision SHA and requested rendition in immutable render job payload/snapshot. Worker independently recomputes the output derivative, verifies hashes and applies QA against target geometry. 720p and 1080p variants have distinct FFmpeg cache keys and HyperFrames output hashes.

## Safety / limitations
- Preflight is non-destructive and cost-free. It does not check free disk or predict VRAM/CPU usage; R3-13 will add disk preflight and crash recovery.
- Fast source edit between preflight and queue may create a 409; source is rechecked during enqueue, source assets again at worker runtime.
- Global stage SSE is filtered client-side by job ID; no token in URL. Error codes and stages are allowlisted; raw prompts/paths never enter events.
- No HyperFrames real render, Windows/browser interactive QA, 35-minute MP4 or dependency-install validation; release stays `NOT_READY`.
