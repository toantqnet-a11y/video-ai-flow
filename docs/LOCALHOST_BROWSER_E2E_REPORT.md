# LOCALHOST-02 — Real Browser + Fastify + SQLite E2E Verification
**Date:** 2026-10-18 · **Status:** `PASS` for hosted Linux localhost production browser integration; product release `NOT_READY`.

## Evidence (verified, not simulated UI)
- GitHub Actions workflow **Localhost Browser E2E** run **39114179615**, head `2696cb47`, Ubuntu hosted, actual **/usr/bin/google-chrome** (headless).
- Reviewed locked dependencies (`npm ci --ignore-scripts`), real `npm run build:web`, production static Vite assets served by actual Fastify loopback with a disposable private SQLite DB. No route-injection mocks or Playwright dependency.
- A one-time pairing secret was entered via real Chromium input event and kept in memory; never logged/committed. Unauthorized `GET /api/channels` returned **401**.
- Browser performed actual React UI input/clicks and server round trips. Durable state and safety assertions:

| Stage | Evidence | Result |
| --- | --- | --- |
| UI bootstrap | Live React pairing screen, empty code disabled | PASS |
| Auth | One-time browser pairing against local Fastify | PASS |
| Channels | Browser created real channel, SQL repository confirms durable row | PASS |
| Videos | Browser created real video and opened saved workflow | PASS |
| Content | Manual Master Script preview → save candidate → explicit approval; exact content persisted to video | PASS |
| Draft guard | Browser-native `window.confirm` rejected leaving an unsaved split preview; UI remained on Builder | PASS |
| Scene proposal | Preview caused **zero scene writes**, Next Voice disabled before save | PASS |
| Scene commit | Explicit versioned save resulted in **7 persisted scenes**; Next Voice TTS selected | PASS |
| Editor | Real Timeline UI and actual HyperFrames Render Drawer mounted inside authenticated browser | PASS |
| Fail closed | Missing voice/media disables Render MP4; SP-04 job count **zero**, no provider inference or paid request | PASS |

**Evidence URL:** https://github.com/toantqnet-a11y/video-ai-flow/actions/runs/39114179615

### Why an initial run failed and was fixed
- PR run `39114112487` failed a browser race: SQLite create succeeded before React enabled its Video sidebar button. Harness now waits for enabled UI navigation rather than treating persistence as React completion; rerun **39114179615 PASS**. This is a test synchronization fix, not a backend production bug.
- Earlier PR run `39113994084` passed the basic flow before adding the browser-native unsaved navigation guard.
- Output includes only machine-readable stage names and high-level readiness; no pairing codes, user documents, screenshots or full DOM dumps.

## Not tested (not permitted to claim)
- Real Edge/VieNeu TTS, local Ollama LLM, ComfyUI image/video GPU inference; any calls would require independent consent/configuration.
- Source voice and visual assets, actual 5-scene or 35–40-minute HyperFrames encode, H.264/AAC visual/audio inspection, renderer crashes/recovery, resource benchmarking.
- Detailed authenticated 120/500-scene Timeline gesture QA (drag/reorder/trim/undo/redo/waveform/zoom), mobile/tablet quality and human acceptance.
- **Session lifecycle warning:** browser credentials are intentionally in memory only. After hard browser reload the one-time pairing code cannot be reused while the API server remains paired. Existing security design requires server restart for re-pairing; must be resolved through an operator-mediated secure re-pair design before claiming smooth session recovery. Do NOT save bearer/CSRF to localStorage to bypass.
- This is hosted Ubuntu localhost evidence, not automatic proof of another OS or real end-user workstation.

## Scope / handoff
- `tools/localhost-browser-e2e.mjs`: browser test with temporary data/profile and isolated real Fastify listener, Native CDP and assertion against real SQLite + single queue. Cleans up browser, API and temp directory.
- `.github/workflows/local-browser-e2e.yml`: reproducible CI using reviewed lock, production build and headless Chrome.
- No backend production feature or schema modified by this test-only PR. `releaseStatus=NOT_READY`.
- Next phase: secure browser refresh/session recovery with explicit user authorization; test realistic navigation/data reload and browser gestures. Separately run actual user-approved TTS/local image, render MP4 short and full length with metrics. Never treat this E2E result as GPU/render acceptance.
