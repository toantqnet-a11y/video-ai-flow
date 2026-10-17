# Test Report — R2-EXT-07/08 (2026-10-15)

| Command | Result | Evidence |
|---|---|---|
| `npm run test:ext0708` | PASS **8/8** | 4 core, 4 API; router, cost/non-dispatch, immutability, version conflicts, real MP4/JPEG, queue idempotency and auth route |
| `npm run test:all` | PASS **730/730** | Prior 722 plus 8 new tests |
| `npm run check` | PASS | API route/operation drift, OpenAPI regenerated |
| `npm run typecheck:sdk` | PASS | TypeScript SDK public declarations |
| `npm run test:negative-control` | PASS | Security/error regression red test |
| `node tools/ext0708-demo.mjs` | PASS | Actual FFmpeg output from a fixture PNG + WAV, H264/AAC, 1920×1080 30fps, tested QA; JPEG thumbnail created |
| JSX parse (global TypeScript AST) | PASS | `VisualCostMotionPanel.jsx`, `TimelineRenderWorkspace.jsx` syntax only, **NOT** browser acceptance |
| `npm run build:web` | BLOCKED (exit 127) | `vite: not found` (npm dependencies absent) |

**Measured FFmpeg fixture:** expected ~2.667 sec, actual ~2.700 sec, drift +0.033 sec, video H264, audio AAC, output 1920×1080 30fps, QA PASS. Branded JPG generated from encoded frame. No inference models or paid API used; this is deterministic local media. Remotion and HyperFrames benchmark NOT RUN.

**Still unverified:** real browser, Windows, GPU ComfyUI, Edge/Piper/VieNeu, long video 30–40 min, true phoneme/word alignment, vendor costs, new actual export font quality and end-to-end automated visual routing.
