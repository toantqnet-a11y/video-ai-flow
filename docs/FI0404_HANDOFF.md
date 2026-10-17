# FI-04-04 handoff
Start: `docs/FI0404_CONTRACT.md` -> `docs/FI0404_STATUS.md` -> `docs/FI0404_TEST_REPORT.md` -> `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json` -> tail `docs/WORKLOG.md`. Do not rescan full repo.

## Changes
- `tools/fi04-hyperframes-acceptance.mjs`: --inspect inventory and --run opt-in real SP-04 queue with 5 local images and 5 local fixture voice files, 10 edited subtitle cues and locally selected looping WAV. Automated check for exact frame/codec/fps/size, SRT matching, source/version/queue/music; optional --save-review makes short MP4/SRT available for operator inspection only on PASS.
- `apps/api/src/render-export-r2ext0406.mjs`: remove environment-selectable arbitrary renderer; always pinned project-local HyperFrames.
- `tools/FI04-Hyperframes-Acceptance.ps1`, focused tests, npm scripts and generated backlog (60 IDs).

## Continue on Windows
1. Review and commit genuine npm lock with pinned HyperFrames 0.8.159, `npm ci` using FI04 staged setup.
2. Run `npm run acceptance:fi0404:real` or `tools/FI04-Hyperframes-Acceptance.ps1 -Run`. Verify fresh report status and inspect saved media: visible Vietnamese glyphs, caption timing, voice levels, music audible, first/middle/last frames. A test WAV is *not* Vietnamese speech.
3. Investigate real CLI warnings on installed version; follow installed CLI `render --help` as authority. Do not add silent fallback, global npx or paid API.
4. Keep FI-04-04 blocked until short real engine completes. Next FI-04-05 UI Windows, FI-04-06 35-minute actual real render, FI-04-07 recovery. Production NOT_READY until all independent gates.
