# Verification · R4-05/06/08 · 2026-10-16

| Evidence | Result |
|---|---|
| `npm run test:r405-r406` (includes real 1920×1080 H.264/AAC post-mix video) | **12/12 PASS** |
| `npm run test:r312` render/preflight regression | **6/6 PASS** |
| Legacy v22/v23 migration fixture regression | **27/27 PASS** after test-fixture correction |
| `npm run check` (generated OpenAPI checks) | PASS |
| `npm run typecheck:sdk` | PASS |
| `npm run test:negative-control` | PASS |
| TypeScript JSX transpile parser: Render Drawer / Subtitle Panel | No syntax diagnostics (NOT browser build) |
| Real output `Video_AI_Flow_R405_R406_FFmpeg_Finishing_Demo.mp4` | 1920×1080, 30 fps, 80 frames, **2.667 s**, H.264/AAC, FFprobe PASS |
| SRT two edited cues | UTF-8 Vietnamese 1.333s/1.334s, pinned to same job PASS |
| Draft overwritten after enqueue | Frozen earlier draft survives, PASS |
| Invalid music SHA, expired draft revision | Preflight blocks, PASS |
| Music imported, listed and included in verified backup | PASS |
| `npm run audit:r408:verify` | **10 PASS / 11 BLOCKED / 0 FAIL**; `NOT_READY` |
| `npm run test:all` | **Not established**. One run 842/844 due outdated artificial migration fixture; fixed and rechecked 27/27, later full attempt stopped at ~625 (environment timeout). |
| `npm run build:web`, live HTTP | BLOCKED: Vite/Fastify missing |
| Actual HyperFrames MP4, Windows, 35-minute render, GPU, production security | BLOCKED: no evidence |

The FFmpeg output demonstrates subtitle burn-in and the music-enabled durable render pipeline, **not** HyperFrames performance or full-release acceptance. Do not turn any BLOCKED into PASS without observed evidence.
