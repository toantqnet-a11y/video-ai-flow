# R3-05 Visual Window Render — Actual Test Evidence (2026-10-16)

**Platform:** Linux x86_64, Node v22.16.0, built-in experimental SQLite, FFmpeg and FFprobe installed. **Release:** NOT_READY.

| Command / scope | Observed result |
|---|---|
| `npm run test:r305-render` | **8/8 PASS**; includes immutable v2 compatibility and window digest validation, timed projection/publish, conflicting voice-based duration, HyperFrames image CSS contract, FFmpeg lossless video hold/30-frame test, mocked HyperFrames staging + short video rejection, actual local FFmpeg 720p H264/AAC with 90 exact video frames (edited video + image motion). |
| `npm run test:r305-r306` | **10/10 PASS** existing editor/waveform focused suite. |
| `npm run test:r302-r304` | **13/13 PASS** timeline/playback/reorder regression. |
| `npm run test:r301` | **8/8 PASS** scene inspector regression. |
| `npm run test:ext02` | **14/14 PASS** measured voice/timed composition regression. |
| `npm run test:hyperframes` | **7/7 PASS** HyperFrames adapter/queue mock (NOT real HyperFrames binary). |
| `node --test packages/core/test/render-ffmpeg-r2ext0406.test.mjs` | **4/4 PASS**, including real MP4. |
| `npm run test:all` | **790/790 PASS** (all application and spike tests; `tools/run-tests.mjs --all`; wall time ~32.6 seconds). No ignored test skips in final TAP. |
| `npm run check` | PASS, generated OpenAPI/API drift check green. |
| `npm run typecheck:sdk` | PASS. |
| `npm run test:negative-control` | PASS. |
| Composition v1 & v2 schema drift checks | PASS after regenerating from catalog. |
| `npm run build:web` | **BLOCKED:** `vite: not found` (exit 127). |
| `npm run test:live-http` | **BLOCKED:** `ERR_MODULE_NOT_FOUND` missing Fastify runtime. |
| Real HyperFrames `render` and browser preview | **NOT_RUN:** project runtime unavailable. |
| Windows / GPUs / production real voice / 30–40 minute MP4 | **NOT_RUN:** no target hardware or genuine workload acceptance. |

**Reproducible short MP4 control:** `node tools/r305-trim-demo.mjs --output=/mnt/data/Video_AI_Flow_R305_Visual_Trim_FFmpeg_Control.mp4`. Output verified with FFprobe: 1280×720, H264/AAC, 30 FPS, **90/90 frames**, 3.000s, ~1.5MB, visual window frames 18–72, original voice 2.3s and subtitles to 2.3s. This is **FFmpeg output**, not HyperFrames. `ContentStudio_R305_Demo_Proof.json` contains the independent technical result.

**Caveat:** File/probe/structural assertions plus lossless-clip tests do not replace visual inspection in the final target HyperFrames/Windows browser. HyperFrames tests execute staging and mock-CLI rejection only; no final HyperFrames MP4 has been rendered. A real editor preview of trimmed motion remains pending; the interface displays visual markers and frozen still/voice, not a final composited live preview.
