# FI-04-05 → FI-04-10 — Windows acceptance / AI-agent handoff
Date: 2026-10-17. Product release remains **NOT_READY**.

## Short context (read in this order)
1. `docs/FI0404_HOSTED_WINDOWS_TEST_REPORT.md` — real 5-scene HyperFrames/FFmpeg short MP4 PASS, *human A/V review not performed*.
2. `docs/FI0405_FI0410_TEST_REPORT.md` — observed gates from this branch.
3. `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json` — authoritative task statuses, 69 unique IDs.
4. `tools/fi0405-browser-acceptance.mjs`, `tools/fi0406-long-render.mjs`, `tools/fi0407-recovery.mjs`, `tools/fi0408-provider-e2e.mjs`, `tools/fi0409-security-performance.mjs`, `tools/fi0410-final-release.mjs`.
5. Last section of `docs/WORKLOG.md`.

## What code already does
- **FI-04-05:** React keyboard/trim/drag/reorder/model regression; loopback-only CDP inspection against an *already authenticated* Windows Chrome/Edge Timeline. Presence of DOM controls or headless pairing UI is not user-gesture proof. Real manual drag/trim, waveform/zoom and 500-scene viewport remain unverified.
- **FI-04-06:** strict, consent-required, EXISTING Windows project/Composition v2 and explicit music/subtitle selection; one durable SP-04 HyperFrames queue; 35–40 min Full HD; FFprobe/H264/AAC and SRT/music integrity checks. Code now uses case-safe, symlink-rejecting Windows output/SRT file verification. **No real 35-minute project has run.**
- **FI-04-07:** kills a disposable OS child; proves SQLite lease expiry/fencing and second attempt recovery with **synthetic handler**. Separate read-only actual MP4 post-recovery inspection now verifies H264/AAC, >=35 min, stable checksum and bytes. **No real long HyperFrames worker has been killed/restarted.**
- **FI-04-08:** only fixed loopback GET handshake for Ollama/ComfyUI; new safe existing-local-voice media probe does **not** claim model inference. No GPU/Wan/VieNeu/Piper inference tested. No paid API calls.
- **FI-04-09:** focused local security regression and separately requested online npm audit. No Windows secret disclosure review, production threat model or renderer/GPU VRAM measurements.
- **FI-04-10:** fail-closed release matrix, no arbitrary JSON can mark READY. It will return NOT_READY until mandatory witnessed release gates are independently approved.

## Hosted Windows CI
`.github/workflows/fi0405-fi0410-windows-gates.yml` runs only on branch `fi04/acceptance-05-10` or explicit manual dispatch.
It uses reviewed npm lock, Windows Server 2022, real Fastify socket, Chrome/Edge React pairing DOM, TypeScript/Vite build, FFmpeg hash, focused FI0405–10 regressions, actual child-kill **synthetic** lease recovery, read-only local provider inventory, network npm audit and fail-closed security/release inventories. It uploads sanitized `FI0410_*.json` to a 7-day artifact.
It never authenticates into real user projects and makes no AI inference/cloud provider calls.

## Windows 11 operator steps (not executable on hosted disposable runner)
1. Check reviewed lock and dependencies, install FFmpeg/FFprobe with a trusted binary/verified SHA256, run Windows `npm ci`, `npm run build:web` and WI-02 socket smoke.
2. FI-04-05: pair application in an **isolated test profile**, open Timeline; validate authenticated reorder drag/buttons, trim cancel/save, undo/redo, waveform voice alignment, playback without overlap, zoom scroll; test 120 and 500 scenes; visually witness and record screenshots without secrets. CDP inspector expects local port 9222; do not expose remote debugging to LAN. Example: `node tools/fi0405-browser-acceptance.mjs --run --report=docs/evidence/FI0405_windows_ui.json` on the paired test tab. This is **read-only** and by design cannot certify manual gestures.
3. FI-04-06: prepare pre-existing test project with a published Composition v2 of >=2100 and <=2400 seconds, 1080p / 1920px, at least five scenes, selected ten+ subtitle cues and music. Run (explicit local render consent, no paid model):
   `node tools/fi0406-long-render.mjs --run --confirm-local-render --data-root=<existing-test-data> --video-id=<id> --selection-file=<local-approved-json> --request-key=<unique-id> --report=docs/evidence/FI0406_long_render.json`.
   Measure actual runner/host CPU, RAM, disk and GPU/VRAM externally: parent RSS alone is not renderer RSS or VRAM. Watch final MP4/SRT and hear audio before signoff.
4. FI-04-07: start a **separate** real 35+min HyperFrames test job, witness its active encoding, terminate actual render OS worker, wait for the lease to expire and safely restart the application; check at-least-two attempts, stale lease fencing, no published partial output, final H264/AAC/SRT and checksum. Use `node tools/fi0407-recovery.mjs --verify --data-root=<existing-test-data> --job-id=<actual-job-id> --report=docs/evidence/FI0407_recovery.json`. CLI evidence is technical only; record witnessed OS kill separately.
5. FI-04-08: on a trusted Windows 11 machine with chosen **local** Ollama and ComfyUI services, optionally run `node tools/fi0408-provider-e2e.mjs --probe-local --report=docs/evidence/FI0408_providers.json`. This contacts only fixed loopback GET paths; real TTS/LLM/GPU inference needs additional explicit consent, measured files and human QA; never opt into remote/paid services implicitly.
6. FI-04-09/10: perform security threat review, check credentials/process env/renderer isolation, npm audit with explicit network consent, full green test suite and genuine performance profiling. Run `node tools/fi0410-final-release.mjs --inspect --strict --report=docs/evidence/FI0410_release.json`; it is **expected to exit nonzero** until formal release evidence has been reviewed. No production deployment or release flag update before operator approval.

## Decisions / guardrails
Keep HyperFrames **0.8.159**, single SP-04 queue, FFmpeg only the explicitly selected preprocessing/manual path, no silent renderer substitution, no auto cloud/paid API calls. Keep code purpose-comments and append to WORKLOG + this handoff whenever acceptance evidence changes. Never interpret a successful short test MP4 as a successful 35+ minute Full HD project.

## Next agent decision
After hosted CI PASS: retain partial Windows Server verification and advance only with a real authenticated Windows 11 Timeline test and a genuine 35–40 minute Composition v2 render/recovery. If local GPU or operator hardware is absent, mark task BLOCKED, retain completed automated test evidence, and continue non-hardware code/UX work rather than inventing PASS.

## Observed hosted verification (2026-10-17)
- Run **39024552073** Windows Server 2022 hosted acceptance SUCCESS; npm audit 0 vulnerabilities, tests, real Fastify/React pairing, synthetic OS-kill lease fencing PASS.
- All production operator gates remain BLOCKED. Read `docs/FI0405_FI0410_TEST_REPORT.md` for exact separation and 7-day artifact expiry.
- Optional local voice file inspector: `node tools/fi0408-provider-e2e.mjs --inspect-voice --data-root=<local-data> --voice-relative=<existing-audio-file> --report=docs/evidence/FI0408_voice.json` (expected nonzero until genuine inference and human QA).
