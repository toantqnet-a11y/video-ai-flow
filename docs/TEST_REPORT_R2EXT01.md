# R2-EXT-01 — Offline Integration / Regression Report

**Date:** 2026-10-15 · **Scope:** engine-neutral JSON contract; actual render/export NOT in scope.

| Command | Result |
|---|---|
| `npm run test:ext01` | PASS — 12/12 targeted tests, real SQLite v28 + files + controllers + route contract |
| `npm run test:all` | PASS — 700/700 full suite (re-run after final edits) |
| `npm run check` | PASS — OpenAPI/SDK catalog drift + syntax |
| `npm run typecheck:sdk` | PASS — TypeScript declarations |
| `npm run test:negative-control` | PASS — intentional failing test is caught |
| `node tools/generate-composition-schema.mjs --check` | PASS — standalone JSON Schema matches catalog |
| `npm run build:web` | BLOCKED — `vite: not found`, dependency not installed |
| `npm run test:live-http` | BLOCKED — `ERR_MODULE_NOT_FOUND`, Fastify runtime dependencies missing |

**Covered:** draft/missing media denies publication; deterministic UTF-8/CRLF/emoji text and 16:9/9:16 frame math; immutable revision v28; idempotent publish; stale pointer & timeline conflict; local SHA256 corruption; persisted old snapshot audit; malicious JSON & fabricated digest validation; authenticated route metadata; controller publish failure has zero side effects. Existing cross-module R2-13 offline regressions preserved.

**Existing tests updated for forward-compatible migration assertions:** R2-12 monitor now requires >=27 rather than exactly v27; v23/v22 simulated rollback tests also remove new v28 table; quota backup filename expectation derives from current migration target rather than hardcoded v27. No prior migrations modified.

**Open release blockers:** Windows filesystem & migration upgrade, actual Fastify/browser, actual Edge/Piper/VieNeu and ComfyUI local GPU, audio-video sync, subtitle alignment, 30–40-minute end-to-end video, Remotion/HyperFrames real benchmark, actual MP4 ffprobe evidence. A passing Node suite cannot close those gates.
