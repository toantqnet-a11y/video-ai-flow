# SP-05 — 500-scene, four-track Timeline Editor spike

**Task:** SP-05, maps to EP11 US-11.1, US-11.2 and drag/trim portions of US-11.4; prototype only.  
**Current status:** CODE_COMPLETE + 16/16 unit tests on Linux; browser interaction/performance verification is **not yet passed**, Windows **PENDING_HARDWARE_VALIDATION**.

## Run

Requires **Node.js 22+**. No `npm install`, cloud account or AI API required.

```bash
cd SP-05
npm test
npm start
# open http://127.0.0.1:4175
```

Windows PowerShell: `./Run-Windows.ps1 -Mode preview` or `./Run-Windows.ps1 -Mode test`. The independent `ContentStudio_SP05_Timeline_Prototype.html` (at output bundle root) can be opened offline without Node; it bundles the same HTML/CSS/JS.

## Features implemented

- 500 sample scenes × 4.2s = **exactly 35:00**, with immutable scene IDs and integer-millisecond durations.
- 4 lanes (media, text, voice, music); viewport virtualization using prefix times + binary search; timeline ruler is generated only for visible ticks.
- Click scene to select/seek; HTML5 drag between visible media clips to reorder; right-edge trim handle (1–30 seconds); independent zoom (6–44 px/s), scroll, playhead, playback clock.
- Undo/redo (max 25 snapshots), scene inspector edit, automatic localStorage persistence, explicit stale-asset flags for changed script or image prompt.
- Scene voice waveform **demo** by default, real PCM envelope when WAV/MP3 is explicitly loaded into browser through Inspector. Uploaded audio remains **session-only**, and only selected scene audio can play.
- Localhost-only preview server, no AI inference and no paid APIs.

## Architecture

`src/engine.mjs` → pure timeline math, ordering, duration and waveform PCM decoding (future React/Vite reusable).  
`src/app.mjs` → browser-only UI spike, event handling, virtualization and preview.  
`src/style.css` → UI. `index.html` → shell. `src/server.mjs` → localhost preview.  
`test/engine.test.mjs` → Node deterministic tests (16 cases). `test/browser_sp05.py` → browser integration checks **prepared, blocked by environment policy**.

**Why no React dependencies yet?** Package registry not reachable in execution environment. Rather than submit an untested React scaffold, this Spike produces a functional standalone browser implementation with dependency-free domain engine. **ARC-01 / R3 must port app.mjs UI to React/Vite + Zustand** while retaining the engine contract and acceptance tests. Do not confuse this prototype with the finished editor.

## Test evidence & limitations

- Node 22 `npm test` → **16 PASS / 0 FAIL** (see `reports/unit-results.txt`).
- Browser integration suite written with Playwright: drag/drop, undo, zoom, virtual scroll, scene edit persistence, transport and actual WAV decoding. **NOT PASS / NOT RUN**: installed Chromium has managed enterprise `URLBlocklist: ["*"]`, returning `net::ERR_BLOCKED_BY_ADMINISTRATOR` for both `http://127.0.0.1` and `file://`; see `reports/browser-blocker.md`. Therefore **no measured browser FPS, render latency or functional browser claims**.
- No Windows user PC is available. No real video/assets, no timeline-native FFmpeg render; production async queue and asset service integration deferred. Playback clock is simulated for empty/demo scenes; real media playback is limited to per-scene uploaded audio, not final AV sync.
- No framework/state persistence on server and no collaborative edits; localStorage is demo-only and not a substitute for SQLite/API snapshots. Music bar is a placeholder (no actual soundtrack). Trim changes scene timeline duration, not source audio cutting/stretching.

## Definition of Done before production integration

1. Run browser integration tests successfully on unlocked Chromium, measure 500-scene scroll/seek/drag/trim/zoom and memory.
2. Run Windows browser compatibility tests when PO has hardware; verify large project UI responsiveness.
3. Port UI to approved React/Vite/Zustand stack; store edit decision lists in SQLite with version controls.
4. Connect real media and synchronization to timeline, add tested source-audio trimming and tracks, integration with SP-04 queue/EP08 renderer.
5. Verify keyboard focus/a11y, touch drag, and import/export of timeline revisions.

**Next:** SP-06 — security and API key vault.
