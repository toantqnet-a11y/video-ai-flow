# Renderer decision — HyperFrames primary (2026-10-16)

## Decision
The product owner selected **HyperFrames** as the primary local renderer. FFmpeg remains an **explicit** manual alternative and is still used for media probing, thumbnail extraction, and legacy exports. Remotion is not selected. This is a product choice, **not an evidence-based performance winner**: the EXT-03 real-engine 18-run benchmark remains NOT_RUN.

## Runtime and safety

- Composition v2 / SHA-pinned assets remain the authoritative input. No migration or parallel job queue. Newly queued exports default to `render:hyperframes` in the shared SP-04 queue. Existing `render:ffmpeg` jobs continue using the old worker; this preserves restart semantics.
- `POST /api/videos/:id/renders` supports `engine: "hyperframes" | "ffmpeg-fastpath"` (optional; default is HyperFrames). Different engine selections cannot share an idempotency request key.
- On missing HyperFrames executable, the job fails `HYPERFRAMES_NOT_INSTALLED`. **Never** silently switch to FFmpeg or HeyGen cloud. Select `ffmpeg-fastpath` manually in the Timeline UI for a local compatibility export.
- Renderer only invokes local `hyperframes render`. No `npx`, `cloud render`, remote asset sources, API calls, plugin runtime, or downloaded scripts. `HYPERFRAMES_NO_TELEMETRY=1`, `HYPERFRAMES_NO_UPDATE_CHECK=1`, `DO_NOT_TRACK=1` are passed to the child process.
- The approved immutable Composition v2 maps to HTML with `data-composition-id`, `data-duration`, `data-fps`, timed scene clips, captions and audio. Only checksum-verified local media are copied to an isolated staging directory. HTML escapes user-provided text. No external fonts/scripts. Timestamp quantization is from integer frame indices; audio ends before tail padding.
- Existing technical MP4 QA checks H.264, AAC, dimensions, FPS, frame count, duration, and nonempty output. A failed QA never publishes an MP4. Recheck pinned sources after render, then atomic rename. Style + composition + renderer version make separate immutable export keys.

## Install on an Internet-connected Windows machine

1. Install Node.js **22+**, FFmpeg/FFprobe, Git, and a suitable Chrome/Chromium/Puppeteer runtime per the HyperFrames version you install.
2. In `ContentStudio/`, run `npm install`, then `npm install --save-dev hyperframes` (which records a project package lock). Inspect `node_modules/hyperframes/package.json` and the installed CLI version; do not rely on floating production versions.
3. Verify the CLI: `npx --no-install hyperframes --help`. `--no-install` prevents network fallback. The app invokes the local package entry with `node` so Windows `.cmd` shim issues are avoided.
4. Start ContentStudio normally and explicitly approve a Composition v2. In Timeline select **HyperFrames (default)** and render. Review output `QA MP4: PASS` and video/audio/subtitle alignment.
5. If HyperFrames is missing or fails quality inspection, review the error; **manually select** `FFmpeg (dự phòng thủ công)` instead. No automatic engine or paid service fallback.

### Acceptance still open

- Real HyperFrames CLI rendering from the generated HTML has **not run** here: npm registry DNS unavailable; CLI not installed. Mocked adapter tests check HTML structure, command dispatch, checksum fences, and fail-closed behavior, **not** output correctness for the real CLI.
- Browser UX, Windows build, real GPU providers, audio/video alignment, and 30–40-minute exports still need hardware acceptance. EXT-03 comparative benchmark is optional for the product choice, but remains necessary for performance claims.
- Existing short FFmpeg MP4 smoke tests remain a **legacy path** acceptance, not evidence that HyperFrames has rendered video.

## Changed files / agent path

`packages/core/src/render-hyperframes.mjs` (adapter), `packages/core/src/render-ffmpeg-r2ext04.mjs` (safe subprocess cwd/env), `apps/api/src/render-export-r2ext0406.mjs` (engine-specific durable jobs), `apps/api/src/server.mjs` (worker wiring), `apps/web/src/TimelineRenderWorkspace.jsx` (selector), `packages/contracts/src/catalog.mjs` + generated contracts/SDK, tests, and docs.

**Run:** `npm run test:hyperframes`, `npm run test:all`, `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control`. None requires network or a real HyperFrames CLI. Real-engine QA is a separate gate.
