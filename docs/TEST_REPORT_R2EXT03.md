# R2-EXT-03 Test Report — Harness only

2026-10-15 | Linux container | Node 22.16.0 | FFmpeg/FFprobe 7.1.5 | Chromium present | `registry.npmjs.org` `EAI_AGAIN`

| Test | Result | Evidential scope |
|---|---|---|
| `npm run test:ext02` | PASS 14/14 | Audio→scene frame timing regressions, FFprobe sample |
| `npm run test:ext03` | PASS 7/7 | Workloads/FFprobe/hash/HTML escaping/no fabricated render results |
| `npm run poc:ext03:prepare` | PASS | 3 deterministic fixtures + 18 correctly `NOT_RUN` rows |
| `npm run test:all` | PASS 714/714 | Existing offline regression unchanged |
| `npm run check` | PASS | API/catalog checks unchanged |
| `npm run typecheck:sdk` | PASS | Type declarations unchanged |
| `npm run test:negative-control` | PASS | CI red control unchanged |
| `npm run build:web` | BLOCKED (`vite: not found`) | npm dependencies absent |
| `npm run test:live-http` | BLOCKED (`ERR_MODULE_NOT_FOUND`) | Fastify runtime dependencies absent |
| Real Remotion MP4 | NOT RUN | Missing package install/network |
| Real HyperFrames MP4 | NOT RUN | Missing package install/network |
| Fair wall/RAM/CPU comparison | NOT MEASURED | Both engines must run 3×3 trials |
| Native Vietnamese voice + human visual review | NOT RUN | Synthetic English WAV in fixture |

Previous POC `outputs/baseline-ffmpeg.mp4` is valid real FFmpeg H.264, 1080x1920; it is **not** a Remotion nor a HyperFrames result. Production engine is **UNDECIDED**. No GPU/Windows/long-form acceptance.
