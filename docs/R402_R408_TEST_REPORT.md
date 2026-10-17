# R4-02..08 test results — 2026-10-16

| Run | Observed result |
|---|---|
| `npm run test:r402-r408` | **10/10 PASS**, combined core/API tests. Covers WAL snapshot/hash/tamper, safe restore, protected file quarantine, Job Center projection, optimistic subtitle draft, 1s FFmpeg soundtrack MP4, style lint, release gate NOT_READY. |
| `node --test packages/contracts/test/contracts-r005.test.mjs` | **6/6 PASS**, Fastify route catalog parity, OpenAPI security and data boundaries. |
| `npm run test:r401` | **12/12 PASS**, preset diff regression after schema v32. |
| `npm run check` | **PASS**, including generated OpenAPI synchronization. |
| `npm run typecheck:sdk` | **PASS**. |
| `npm run test:negative-control` | **PASS**, deliberate failing test detected. |
| `npm run audit:r408` | Successful audit execution; **release verdict NOT_READY**. Node/FFmpeg/FFprobe present; Vite/Fastify/HyperFrames absent; Windows/real 35-minute MP4 not verified. |
| `npm run build:web` | **BLOCKED, exit 127**, `vite: not found`. UI was not compiled/browser tested. |
| `npm run test:all` | **TIMED OUT** (tool execution cutoff after 210s) at last reported test **#621**. No global PASS claim. |
| Real HyperFrames, Windows browser, 35-minute MP4, production recovery | **NOT TESTED**. |

The focused tests contain a real 1-second FFmpeg post-mix using generated H.264/AAC and a SHA256-verified local WAV input. This does not prove music works with the HyperFrames production worker.
