# R2-06 Test Report — 2026-10-15

**Result:** `CODE_COMPLETE_TESTED_OFFLINE`. Node v22.16.0 / Linux sandbox. Baseline R2-05 had 560/560 tests PASS.

| Command | Observed result |
|---|---|
| `npm run test:r206` | **14/14 PASS** (new focused tests) |
| `npm run test:r205` | **20/20 PASS** (migration fixture updated to emulate genuine pre-v23 schema) |
| `npm run test:all` | **574/574 PASS** (full regression; 560 previous + 14 new) |
| `npm run check` | **PASS**, generated contracts up-to-date |
| `npm run typecheck:sdk` | **PASS** |
| `npm run build:web` | **BLOCKED** — `vite: not found`, no installed frontend node modules in provided archive |

**Test coverage:** v24 schema, immutable revision updates, SHA registry cross-scene metadata, same-scene manual import dedupe, conflicting concurrent image selection vs scene row version, newer image intent protected against outdated import, missing/corrupt/restored media reconciliation and retained user pointers, orphan preservation, SQLite restart and v23→v24 migration backfill, selective manual media preservation, source-only scene invalidation, independent generated revisions.

**Limitations:** No real Windows/browser/ComfyUI GPU/Piper/VieNeu, data-dir permission stress, 30–40 minute media pipeline or video renderer acceptance. `reconcile` reports orphan paths but deliberately never auto-deletes. Physical content hardlink dedupe is not implemented. R2-07 queue DAG and comprehensive cross-process crash recovery still open.
