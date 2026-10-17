# AI Agent Handoff — IA-01 (2026-10-16)

**Start here, do not scan entire repo:** `docs/IA01_STATUS.md` -> `docs/IA01_INTEGRATION_ACCEPTANCE.md` -> `docs/IA01_TEST_REPORT.md` -> relevant source -> tail `docs/WORKLOG.md`.

**Purpose / changes:** user selected next Integration & Acceptance stage after R2-EXT-07/08. Added real five-scene WAV/PNG → SQLite asset revisions → FFprobe Composition v2 → explicit publish → SP-04 render job → FFmpeg MP4 → strict QA & DB reopen. Added optional 300-scene long-form **planning** rehearsal; no actual 30–40-minute MP4. Added CI step for cross-platform scripted acceptance. No paid AI calls.

**Code edited:** `packages/core/src/render-ffmpeg-r2ext04.mjs` (timestamp normalization + exact frame QA), `tools/integration-acceptance.mjs`, `tools/integration-acceptance.test.mjs`, `tools/long-form-plan-acceptance.mjs`, `package.json`, `.github/workflows/ci.yml`. Docs/evidence in `docs/IA01_*`, existing `docs/{WORKLOG,HANDOFF,DECISIONS,VIDEO_AI_FLOW_EXTENSION_BACKLOG.json}`, `AGENTS.md`, `R2_Status.md`, `README.md`.

**Key defect fixed:** An MP4 previously showed correct nominal duration but was missing one H.264 frame. Encoder/container priming offset moved first frame to 0.033sec. Normalize FPS start timestamp; bound cloned tail padding to 2 frames; require `nb_frames === totalFrames`; negative QA test prevents recurrence. Run actual `ffprobe -count_frames` when auditing external render sample.

**Reproduce:** `npm run test:acceptance` (4/4), `npm run acceptance:five-scenes` (429 frames /14.3sec), `npm run acceptance:long-plan` (300 scenes/600 assets/36.33min manifest), `npm run test:all` (734/734), API/SDK/negative tests. npm Vite/Fastify blocked by DNS `EAI_AGAIN`, no real Windows/browser/GPU acceptance. Existing migration v1–v29 untouched; no new DB tables; one SP-04 queue; no new spend permissions.

**Next actions:** install npm dependencies on a connected machine, run `ci:verify`, inspect UI in browser including image/audio preview and captions; Windows localhost/FFmpeg file-path gate; real 30–40min MP4 and disk-pressure tests; finish EXT-03 fair engines POC. Only after those close can release status change from NOT_READY. R1-EXT-01 Superpowers-style script skill workflow remains unimplemented but may be done without those providers.
