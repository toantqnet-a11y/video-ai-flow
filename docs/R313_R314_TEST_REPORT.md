# R3-13 / R3-14 Test Report · 2026-10-16

## Commands and observed results

- `npm run test:r313-r314`: **9/9 PASS**. Six core disk/cancel/cache-recovery tests, one API end-to-end fake low-space admission/recheck using a pinned Composition v2, two R3-14 safety gate tests. No real Windows OS-tree kill.
- `npm run test:r312`: **6/6 PASS**, includes actual 720p FFmpeg export + staged render queue.
- `npm run test:ext040506`: **15/15 PASS**, including FFmpeg/MP4 regression.
- `npm run check`: **PASS**; generated OpenAPI and type files in sync.
- `npm run typecheck:sdk`: **PASS**.
- `npm run test:negative-control`: **PASS**.
- `npm run acceptance:r314`: **completed**, `docs/evidence/R314_release_gates.json`: **8 PASS / 14 BLOCKED / 0 FAIL**; overall `NOT_READY`. Contains real FFmpeg five-scene **429-frame** MP4 control, real SQLite/FFprobe **300-scene, 65,400-frame, 36.33-minute PLAN**, and disk headroom estimate **9,677 MiB + 512 MiB reserve** for the hypothetical 35-min render profile. No long MP4 actually rendered.
- `npm run build:web`: **BLOCKED / exit 127**, `vite: not found` (dependencies not installed).
- `npm run test:live-http`: **NOT RUN** (Fastify missing).
- Real `hyperframes` CLI, target Windows/browser UX, real provider voices/images and 30–40 minute MP4: **NOT RUN / BLOCKED**.

## Full-suite status

`npm run test:all`: **820/820 PASS, 0 failed, 0 skipped** (143.46 seconds), including new R3-13 API failure/recovery and R3-14 strict-gate checks. This was run after the final production-code and test changes. Actual HyperFrames/Windows/browser/long-video gates remain blocked.

## Remaining R3-14 acceptance requirements

Install project dependencies, run actual Windows browser and real HyperFrames CLI, then run 35-min video render with actual assets, frame QA, live seek/subtitle preview, disk-full/crash-and-restart, incremental render and output provenance. Output must remain revision-pinned and user-approved; no paid provider silently called.

**Release verdict:** `NOT_READY`.
