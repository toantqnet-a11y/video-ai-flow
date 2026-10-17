# R3-02 / R3-03 / R3-04 — Test report

**Date:** 2026-10-16 · **Status:** CODE_COMPLETE_TESTED_OFFLINE, production release NOT_READY.

## Tests that actually ran

- `npm run test:r302-r304` — **13 / 13 PASS** focused: versioned reorder, foreign/duplicate/missing IDs rejection, no-op, manual-lock offset rebase, 500-scene SQLite stress, changed composition digest/order, 500-scene viewport-bound visible clips, keyboard/drag permutation model, rapid async seek audio fencing, same-file seek reuse, missing audio.
- `npm run test:all` — **772 / 772 PASS** (Node regression suite).
- `npm run check` — generated OpenAPI in sync, Node syntax and catalog checks PASS.
- `npm run typecheck:sdk` — PASS.
- `npm run test:negative-control` — PASS.
- TS JSX parser: `TimelineEditorR302.jsx` and `TimelineRenderWorkspace.jsx` parse without diagnostics.
- `npm run build:web` — **BLOCKED**, `vite: not found` (dependencies unavailable), not a PASS.
- Browser/Windows/real HyperFrames/FFprobe long output — **NOT EXECUTED**.

## Known open issues

1. Browser rendering, media element events with real source audio, position drift, drag/drop and upload interactions need Playwright/manual UX validation.
2. Timing manifest uses locked values or scene estimates; precise measured voice timing remains owned by Composition v2's FFprobe render gate. Playback never claims to synthesize word-level timings.
3. Media lane has no video-clip browser playback yet; music lane placeholder; waveform, trim, snap planned for R3-05/R3-06; selection-to-inspector conflict UX still needs browser QA.
4. Real 35-minute HyperFrames MP4 and fair EXT-03 benchmark pending; no Windows GPU/provider tests; release remains `NOT_READY`.
