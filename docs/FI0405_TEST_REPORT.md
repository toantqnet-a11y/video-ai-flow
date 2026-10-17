# FI-04-05 actual test report — 2026-10-17
Host: Linux, Node 22.16.0. Release verdict `NOT_READY`.

| Command/observation | Actual result | Interpretation |
| --- | --- | --- |
| `npm run test:fi0405` | **10/10 PASS**, exit 0 | Keyboard seek guards, edit isolation, zoom anchoring, stale-voice invalidation, CDP report safety/negative control, JSX structural checks |
| `npm run test:fi04` | **10/10 PASS**, exit 0 | Existing FI04 runtime/backlog checks |
| `npm run test:r302-r304` | **13/13 PASS**, exit 0 | Existing API/core/browser-independent timeline tests including 500-scene model stress |
| `npm run backlog:check:fi04` | PASS; **61 unique task IDs** | 42 historical + 14 AI Video + 5 FI04 |
| `npm run check` | PASS | API/artifact/syntax checks; **not Vite JSX build** |
| `npm run typecheck:sdk` | PASS | SDK typechecking |
| `npm run test:negative-control` | PASS | Deliberately bad test detected |
| `TimelineEditorR302.jsx` global TypeScript parser | No JSX parse diagnostics | Syntax parse only; not React runtime compile |
| `npm run test:all:batched` fresh attempt | **INCOMPLETE**; batches **1–10 PASS**, global command timed out before batch 11 completion | No new global PASS. Predecessor FI-04-04 baseline was 880/880 PASS batched. Keep intermittent suite hang under investigation. |
| `npm run acceptance:fi0405:inspect` | NOT_READY inventory, exit 0 | Inspection not UI proof |
| `npm run acceptance:fi0405:browser` | NOT_READY, exit 1 | No paired Chromium CDP Vite tab; no genuine Windows browser acceptance |
| `npm run build:web` | FAILED exit 127 (`vite: not found`) | Missing installed npm dependencies and reviewed lock; do not claim frontend build success |
| Real Windows drag/undo/trim/waveform/500-scene browser E2E | **NOT RUN** | Requires operator target PC |

No AI providers, paid API or cloud endpoints contacted. Report evidence: `docs/evidence/FI0405_windows_ui.json` generated as BLOCKED inventory. Distinguish R3 offline 500-scene model regression from browser 500-scene performance.
