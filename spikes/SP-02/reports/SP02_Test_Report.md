# SP-02 Verification Record — 2026-10-13

**Environment:** Linux container, Node.js v22.16.0, Python 3.13.5, FFmpeg `ffprobe` installed, eSpeak installed with `vi` voice. No actual Windows device connected.

- `npm test`: 22 tests passed, 0 failed. Test evidence: `reports/test-results.txt`.
- `node src/cli.js diagnose`: Edge Python dependency unavailable, custom local HTTP not configured, eSpeak ready. JSON: `reports/diagnostics.json`.
- Generated actual spoken Vietnamese with `node src/cli.js synth --provider offline`; `ffprobe` duration = **2.935147 seconds** and codec = PCM WAV. User-downloadable sample: `ContentStudio_SP02_Vietnamese_Offline_Speech.wav` (outside repository).
- Edge library installation attempt failed because the current runtime could not resolve the PyPI hostname. This is an environment network limitation, NOT evidence that the package no longer exists. Current Edge synthesis untested.
- Synthetic-tone MP3/WAV used to test transport and metadata are NOT spoken narration; Edge worker unit test uses a mock script.
- Portable logic tested on Linux. Windows PowerShell launcher and native file permissions remain pending hardware validation.

## Acceptance status

| Checkpoint | Result |
|---|---|
| One real Vietnamese speech audio file on disk | PASS (local eSpeak) |
| Recognize WAV/MP3 and duration via ffprobe | PASS |
| Provider failure + safe fallback | PASS (automated test) |
| Empty/invalid output, cancellation, oversized output | PASS (automated tests) |
| No unapproved paid usage | PASS (automated test) |
| Edge Hoài My/Nam Minh audio from live upstream | PENDING |
| Piper/VieNeu external localhost server | PENDING |
| Native Windows smoke test | PENDING |

**Overall:** `TESTED (offline) / PENDING_PROVIDER_AND_WINDOWS_VALIDATION`. Do not mark SP-02 DONE until Edge or an approved local neural TTS provider is tested live and Windows acceptance is completed.
