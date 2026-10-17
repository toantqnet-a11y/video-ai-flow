# FI-04-05 · Windows Timeline UX safety contract
Date: 2026-10-17 · STATUS: `CODE_UX_HARDENED__WINDOWS_BROWSER_BLOCKED`

## Behavior and changes
- The existing four-track timeline remains on the R3 API/SQLite optimistic revision contract; no queue, provider, renderer, schema migration or cloud call added.
- Edits are independent: after drafting order, visual trim inputs cannot create a second simultaneous unsavable draft; after drafting trim, drag/reorder is blocked until visual is saved or **Bỏ sửa Visual** restores the currently persisted in/out points. Existing cancel order remains accessible.
- Audio is a SINGLE native HTMLAudioElement with authenticated blob URLs. A saved or drafted reorder changes scene position/voice mapping: `setScenes` now cancels stale pending loads, revokes the previous blob URL, pauses and resets the audio clock before allowing new playback. Unchanged manifest does not interrupt playback.
- Accessible keyboard seek in focused scroll region: Left/Right ±1s; Shift+Left/Right ±5s; Home/End; Space play/pause. Real media errors remain visible, never fake speech. Timeline zoom is anchored near current cursor and clamped.
- Music lane shows accurate guidance: music selection belongs in Render Drawer; the timeline does **not** claim to preview background music. This does not make real MP4/Music rendering pass.
- On-screen accessibility includes focus-visible outlines, focusable track region and keyboard hints. R3 timeline binary seek and viewport virtualization remain unchanged.

## Verification tiers
1. **Code / unit:** `npm run test:fi0405`, `npm run test:r302-r304`, `npm run test:fi04`, `npm run backlog:check:fi04`, `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control`.
2. **Browser automated read-only probe:** On a dedicated, paired Windows Edge/Chrome CDP test profile, open a seeded Timeline in Vite. `npm run acceptance:fi0405:browser` inspects ONLY a local browser tab and tests DOM/keyboard seeking/500-scene virtualization; it does not modify video data or call provider APIs. Browser need not send credentials to the runner.
3. **Manual Windows QA:** Test mouse drag reorder and persisted reload; keyboard move and optimistic conflict (two tabs); Undo/Redo and restore after reload; trim, save, cancel and conflict; zoom scroll positioning; waveform seek and singleton voice; subtitle readable; 120/500 scenes; viewport widths and memory; refresh/cross-tab navigation dirty guard. Confirm no paid request or silent FFmpeg fallback. Capture redacted evidence, video ID hash, browser version, disk/CPU/RAM and reproduction steps for failures.
4. **Release:** Dependency lock/Vite/Fastify real runtime, Windows browser QA and HyperFrames acceptance are separate. Browser DOM inspection never satisfies manual Windows interactions. FI-04-05 remains blocked unless separately attested.

## Setup (Windows operator)
- Review/commit actual npm lock and `npm ci`; run local API and Vite on loopback in separate terminals.
- Use a *dedicated* test browser profile with Chrome/Edge started with `--remote-debugging-port=9222`, local test tab `http://127.0.0.1:5173` (not regular personal browsing profile). Pair/login through UI and load a video timeline with assets.
- In PowerShell run `./tools/FI0405-Windows-Timeline-Acceptance.ps1` from project root. It intentionally returns nonzero until all manual gates are observed; machine-produced `docs/evidence/FI0405_windows_ui.json` is only machine-observed proof.

## Explicit limits
The supplied Linux host lacks genuine reviewed package-lock and Vite/Fastify. Therefore no actual React build, Fastify, Windows interactive UI or 500-scene browser run was proven; no unattended authenticated browser test was faked. Real HyperFrames, native TTS, 35-minute render and crash recovery remain BLOCKED.
