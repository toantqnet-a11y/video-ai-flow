# R4-01 test report — 2026-10-16

| Command/evidence | Observed result |
|---|---|
| `npm run test:r401` | **12/12 PASS**, core selection/atomic commit/locks + REST catalog/UI smoke |
| `node --test apps/api/test/video-config-r011.test.mjs apps/web/src/video-config-form.test.mjs packages/core/test/domain.test.mjs packages/contracts/test/contracts-r005.test.mjs` | **20/20 PASS**, unchanged R0-11 config and legacy contracts/domain |
| `npm run check` | PASS (including generated OpenAPI check) |
| `npm run typecheck:sdk` | PASS |
| `npm run test:negative-control` | PASS |
| `npm run test:all` | **ATTEMPTED, TIMEOUT**, last printed test #613; no complete suite verdict. No `not ok` line observed in partial log, but this does not prove the remaining tests passed. |
| `npm run build:web` | **BLOCKED**, Vite missing (exit 127) |
| Real HyperFrames, Windows browser, 35-min MP4 | NOT RUN / BLOCKED (unchanged from R3-14) |

No new render or AI provider job was triggered by R4-01. No claim of production UI/browser acceptance. Previous baseline was 820/820 PASS before these edits; cannot add twelve new tests to it and call that a new global pass.

**Release verdict:** NOT_READY.
