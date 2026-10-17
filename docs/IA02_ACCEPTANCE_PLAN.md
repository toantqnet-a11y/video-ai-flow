# IA-02 — Full-system acceptance gates (2026-10-16)

**Product choice:** HyperFrames is the default **local** render engine. FFmpeg is an explicit alternative only, never an automatic failure fallback. **Release: NOT_READY.**

## What this checkpoint actually validated

1. Installed Node v22.16.0 / FFmpeg 7.1.5 / FFprobe present on Linux.
2. HTML adapter contract from actual five-scene SHA-pinned WAV/PNG Composition v2: root now includes `data-start="0" data-no-timeline`. The former root could trigger HyperFrames' 45-second timeline readiness wait on each run; this aligns with the documented HTML schema (timeline-free composition). Clips use immutable frame-derived timestamps and escaped Vietnamese text.
3. Full offline regression: 751/751 PASS; 7/7 focused tests; OpenAPI drift, strict TypeScript SDK, deliberate negative-control PASS.
4. Actual persisted FFmpeg five-scene 720x1280 MP4 (429/429 frames, H.264/AAC and FFprobe QA); this validates **only the manual FFmpeg path**. IA-02 gate runner reports this as `ffmpeg-five-scene` and never as HyperFrames evidence.
5. Re-ran 300-scene/600-media long-form **PLAN** / 65,400 frames / 36.33 minutes: valid composition and media hashes; **no 36min MP4**.
6. `--strict` intentionally exits 1 while any mandatory gate is unverified. This is required behavior, not a test failure.

## Current release blockers

| Gate | Status | Work needed |
|---|---|---|
| Project npm dependencies Vite, React, Fastify | BLOCKED | Install on network-connected host; run npm scripts without mocks |
| HyperFrames package / real CLI MP4 | BLOCKED | Install pin/lock version, run actual five-scene queue acceptance |
| Interactive browser UI | BLOCKED | Real React build, login, Timeline render selection/progress, download |
| Windows target | BLOCKED | Windows launch/FFmpeg/Chrome with persisted SQLite and playback |
| AI provider inference | BLOCKED | Edge/Piper/VieNeu/ComfyUI real run with consent and logs |
| 30–40 minute exported MP4 | BLOCKED | Full render, memory/disk/abort/recovery/performance QA |

**Do not** mark Windows/HF passed because Chromium is installed on Linux or because a mock CLI exited successfully. No paid/provider endpoints were invoked in IA-02.

## On a network-connected Windows machine

From `ContentStudio/`, with Node 22+, FFmpeg/FFprobe and Chrome installed:

```powershell
npm install --no-audit --no-fund
npm install --save-dev --save-exact hyperframes
npm run test:all
npm run check
npm run typecheck:sdk
npm run test:negative-control
npm run build:web
npm run test:live-http
npm run acceptance:ia02:strict
```

The initial npm installation should create `package-lock.json`; retain it and use `npm ci` on subsequent runs. Explicitly check `node_modules/hyperframes/package.json` and the installed CLI help (`npx --no-install hyperframes --help`, **never** plain npx with auto-install). The IA-02 runner uses an installed local CLI, not `npx` or a cloud renderer. It produces `docs/evidence/IA02_gates.json` and can save separate two MP4s with `--hyperframes-output=...` and `--ffmpeg-output=...` arguments. Compare actual MP4 frames, codec, dimensions, sound, captions and playback before signing off.

For the UI, use `Start-ContentStudio.cmd`/`Run-Windows.ps1`, pair locally, create an approved 5-scene composition with actual assets, check HyperFrames default and explicit FFmpeg alternative, retry/cancel, download, reopen after restart. Then do the 30–40 minute case with controlled concurrency and disk headroom; collect CPU/RAM/render elapsed time and stop/cancel behavior. Mark every gate with concrete evidence (machine, CLI version, SHA, logs). No automatic paid fallback or cloud render.

## Result semantics

- `PASS`: command ran and evidence recorded here.
- `BLOCKED`: command deliberately did not run because prerequisite absent; not a pass.
- `FAIL`: command ran but did not meet the acceptance contract.
- `NOT_READY`: any gate blocked; `FAILED`: any gate failed.
- `READY_FOR_MANUAL_REVIEW`: all automated gates passed; user must still review qualitative video and release.

The JSON gate matrix is `docs/evidence/IA02_gates.json`. Run from project root:

```bash
npm run test:ia02
npm run acceptance:ia02
# strict release gate intentionally returns nonzero until remaining blockers are resolved
npm run acceptance:ia02:strict
```
