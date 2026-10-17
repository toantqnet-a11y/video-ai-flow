# Test Report — R2-11
**Date:** 2026-10-15 · **Environment:** Linux Node v22.16 / SQLite experimental, offline fake voice and image worker outputs.

| Gate | Observed | Status |
|---|---:|---|
| `npm run test:r211` | 16/16 | PASS |
| `npm run test:all` | 658/658 | PASS |
| `npm run check` | OpenAPI up-to-date | PASS |
| `npm run typecheck:sdk` | tsc exit 0 | PASS |
| `npm run test:negative-control` | intentional break detected | PASS |
| JSX parse (3 modified workspaces) | 0 diagnostics | PASS (syntax only) |
| `npm run build:web` | `vite: not found`, exit 127 | BLOCKED |

Cases: normal input cache hashes preserved; repeat key idempotence across completed revisions; key reuse/options conflict; voice-only and image-only independent requests with zero other scene/provider jobs; remote Edge consent missing; row conflict; invalid options; generated asset revisions preserved, verified older voice/audio reactivation without inference, preempted queued job cannot overwrite undo; corrupt/cross-scene/stale narration rejects; concurrent intent replacement detects race; original image undo works unchanged; route/API/OpenAPI/SDK contract checks. SQLite latest schema remains v26; no new migration.

**Limits:** Model/audio correctness, true voice-format production bytes, real provider quota/billing, ComfyUI checkpoint GPU, actual browser build, Windows, long-form render and multi-process high-load stress unverified. Focused fake worker samples validate manifest/queue semantics, not audio fidelity.
