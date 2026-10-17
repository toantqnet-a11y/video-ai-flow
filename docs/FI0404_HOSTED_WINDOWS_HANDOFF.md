# FI-04-04 — Hosted Windows genuine HyperFrames media gate (2026-10-17)

## Purpose & safety
The WI-03 hosted Windows Vite/Fastify/Edge integration passed, but did **not**
render an MP4. FI-04-04 must not be marked PASS until genuine project-local
HyperFrames 0.8.159 completes the SP-04 queue, with five scenes, ten Vietnamese
subtitle cues, enabled music, ffprobe H.264/AAC/frame-count QA and output hash.

## New opt-in CI execution
- `.github/workflows/fi0404-windows-real-render.yml` only runs on
  `fi04/real-hyperframes-windows` push or explicit `workflow_dispatch`.
- `tools/FI0404-Install-FFmpeg-CI.ps1` only works inside Windows x64 GitHub Actions.
- ZIP: `https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.zip`
- SHA-256: `db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec`
  (obtained from publisher's corresponding static .sha256 file on 2026-10-17).
- The third-party Gyan build is GPLv3. It is downloaded to a disposable runner
  only, **not** packaged into the distributed application.
- Hash mismatch, HTTP/network failure, missing executables or version mismatch
  must FAIL the job; never fall back to Chocolatey, floating binaries or mock
  FFmpeg. URL/hash updates require explicit source review.
- No paid provider calls, production projects, user credentials or GPU inference.

## Run and evidence
1. Validate pinned dependencies with `node tools/ci-github-lock.mjs`, then
   `npm ci --ignore-scripts --no-audit --no-fund`.
2. Install verified Windows FFmpeg/FFprobe and run real `-version` checks.
3. Run offline/fixture tests and `tools/fi04-hyperframes-acceptance.mjs --run
   --strict --save-review --report=docs/evidence/FI0404_hyperframes_real.json`.
4. Download `fi0404-windows-render-evidence` from the workflow run (artifact
   has a short retention period). Review MP4 and SRT manually to check subtitle
   glyphs and audible music; a green automated job does NOT certify either.
5. Update `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json` **via generator/source**
   only after observing a real successful run. Keep release `NOT_READY`.

## Remaining after automated proof
Real Windows 11 operator visual/audio signoff, authenticated Timeline drag/trim
(FI-04-05), 35+ minute Full HD render (FI-04-06), OS crash/recovery
(FI-04-07), provider/GPU (FI-04-08) and security/release gates.

## Handoff
Read `docs/WI03_HANDOFF.md`, `tools/fi04-hyperframes-acceptance.mjs`, the
new workflow and installer, then the latest `docs/WORKLOG.md`. Preserve the
single SP-04 queue and exact local HyperFrames version. Avoid any synthetic
stand-in if the real render fails; classify the observed failure and fix it.
