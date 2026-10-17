# R3-05 / R3-06 — Test Report (2026-10-16)

Environment: Linux Node 22.16, SQLite built-in, FFmpeg installed. Testing uses offline fixtures and synthetic real WAV/encoded MP3, no AI API, GPU, Windows or browser.

| Command | Observed result |
|---|---|
| `npm run test:r305-r306` | **10/10 PASS** — visual-window storage/reset/conflict/audio isolation, inspector-duration invalidation, PCM16 WAV, real local FFmpeg MP3 decode, LRU caching and contracts. |
| `npm run test:r302-r304` | **13/13 PASS** — pre-existing virtualization/playback/order regression. |
| `npm run test:r301` | **8/8 PASS** — pre-existing inspector regression. |
| `node --test packages/contracts/test/contracts-r005.test.mjs` | **6/6 PASS** — includes exact route query allowlist and generated OpenAPI schema. |
| `npm run check` | PASS — includes OpenAPI generation drift. |
| `npm run typecheck:sdk` | PASS. |
| `npm run test:negative-control` | PASS — intentional failed test detected. |
| JSX TypeScript `transpileModule` | PASS — zero parse diagnostics (global TypeScript). |
| `npm run build:web` | **BLOCKED**, exit 127 (`vite: not found`; frontend deps unavailable). |
| `npm run test:all` | **NOT COMPLETED**: attempted twice (120s then 300s limit), stopped at EXT-08 heavy real FFmpeg branded render after last emitted test #574. One initial catalog query-allowlist failure was identified and corrected; focused catalog rerun passed. **Do not claim a new 780+ full-suite pass**. |

R3-05 visual trim is an **editor-only MVP**: render adapter does NOT use the new boundaries. R3-06 waveform draws from verified audio; real browser performance, Windows and HyperFrames end-to-end remain unverified. Release `NOT_READY`.
