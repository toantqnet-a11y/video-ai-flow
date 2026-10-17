# ContentStudio Sprint 0 — SP-02 TTS Proof of Concept

**Backlog:** SP-02 · EP06/EP02 · P0 · Backend · 2026-10-13  
**Status:** `TESTED (offline) / PENDING_PROVIDER_AND_WINDOWS_VALIDATION` — not fully DONE.

## What is implemented

- `EdgeTtsAdapter` via Python `edge-tts`, voices `vi-VN-HoaiMyNeural` and `vi-VN-NamMinhNeural` (static known IDs). Narration is piped to Python on **stdin**, not exposed in process command-line arguments; on success the real MP3 bytes are copied into a new versioned scene asset.
- `LocalHttpTtsAdapter` for configured localhost HTTP TTS servers, using POST JSON (`{text,voice,rate}`) or UTF-8 plain text; accepts WAV or MP3. Providers like Piper, VieNeu, Coqui need a **matching endpoint / wrapper** — they do *not* all share one native API contract. This is a generic endpoint adapter, not a verified specific server integration.
- `EspeakTtsAdapter` offers a real, **offline Vietnamese voice** where the optional `espeak` executable is installed. Robotic quality, for verification and emergency fallback only; does not claim professional/neural speech quality.
- `TtsService`: free/local-only routing; per-provider voice mapping; transient-failure fallback; cancellation/timeout; strict script/project/scene checks; atomically commits unique assets to `data/{projectId}/scenes/{sceneId}/audio/{assetId}.{mp3|wav}`; ffprobe verifies codec/duration before committing. Partial files removed on error.
- Built-in error codes and minimal structured events without sending text, tokens, secret keys or provider responses to logs.

## Requirements

- Node.js 22+; `ffprobe` on PATH (from FFmpeg). Node dependencies: **none**.
- Edge provider (optional): Python 3.10+ and `edge-tts` installed into that same Python environment (`python -m pip install -r requirements-edge.txt`). Online connection required; unofficial service can change, be blocked or restricted. Do not promise free and uninterrupted use.
- Local provider (optional): a local TTS service, e.g. `http://127.0.0.1:8000/tts`, **already exposing the selected JSON or text HTTP contract and returning audio bytes**.
- Offline eSpeak (optional): `espeak` binary with Vietnamese `vi` voice. Installed on the current Linux test host, may require separate installation on Windows.

## Usage

```bash
cd SP-02
npm test
node src/cli.js diagnose

# Privacy: speech text travels by stdin. On Windows PowerShell use Run-Windows.ps1.
printf 'Xin chào. Đây là bản ghi âm thử nghiệm.\n' | node src/cli.js synth --provider offline

# Edge: install Python dependency first, then execute
printf 'Xin chào. Đây là giọng Hoài My.\n' | node src/cli.js synth --provider edge --voice vi-VN-HoaiMyNeural

# Local JSON HTTP endpoint example (adapt to actual server contract)
TTS_LOCAL_ENDPOINT=http://127.0.0.1:8000/tts node src/cli.js diagnose
printf 'Xin chào\n' | TTS_LOCAL_ENDPOINT=http://127.0.0.1:8000/tts node src/cli.js synth --provider local

# Explicit opt-in: auto tries Edge, configured localhost, then eSpeak
printf 'Xin chào\n' | TTS_ENABLE_ESPEAK=1 node src/cli.js synth --provider auto
```

Windows PowerShell entry:

```powershell
.\Run-Windows.ps1 -Mode diagnose
.\Run-Windows.ps1 -Mode test
.\Run-Windows.ps1 -Mode speak
```

Optional environment: `TTS_PYTHON` (Python executable), `TTS_ESPEAK_BINARY`, `TTS_DATA_ROOT`, `TTS_LOCAL_ENDPOINT`, `TTS_LOCAL_BODY_FORMAT=json|text`, `TTS_LOCAL_VOICE`, `TTS_ENABLE_ESPEAK=1`.

## Verified evidence on current Linux environment

| Test | Result | Limitation |
|---|---|---|
| Node unit/integration tests | **22/22 pass**; `reports/test-results.txt` | External Edge endpoint and real Piper/VieNeu service mocked |
| Real Vietnamese offline speech generated | **PASS**, WAV 2.935147 s, valid codec/duration from `ffprobe`; standalone WAV supplied separately | eSpeak voice is robotic, not neural |
| Edge Python bridge (mock worker producing fixture MP3) | PASS | Does **not** establish Edge remote availability |
| Real Edge library setup | BLOCKED | `edge-tts` missing; pip attempted, container DNS lookup failed |
| Windows/real local HTTP TTS | PENDING | No user's Windows PC or running Piper/VieNeu endpoint |

Synthetic tone fixtures in `test/fixtures/` exist solely to test WAV/MP3 transport/validation. The real offline speech sample was generated using `espeak -v vi` by the application, not from a fixture.

Run `node src/cli.js diagnose` to inspect actual local dependencies. This diagnostic does **not** contact Microsoft, so `dependency_ready_network_unchecked` must not be treated as a successful synthesis test.

## Provider capability matrix

| Provider | No GPU | Offline | Vietnamese | Format | Validation |
|---|---|---|---|---|---|
| Edge Python / Hoài My & Nam Minh | Yes | No | Known IDs | MP3 | Code/test mock; actual upstream **unverified** |
| Custom local HTTP (Piper/VieNeu/Coqui wrappers) | Depends on server | If server local/offline | Depends on installed voice | WAV/MP3 | Loopback integration passed; actual model server **unverified** |
| eSpeak local | Yes | Yes | `vi` | WAV | **Real Vietnamese WAV verified** on Linux, quality is basic |

A provider advertises only capabilities that its own adapter supports; paid/remote adapters cannot participate silently. A separately authorized, auditable paid-service gate belongs to later EP02/EP12 implementation.

## Important design / handoff notes

- `src/service.js` is the single atomic file-commit boundary. Adapter result bytes are never directly written into shared final paths.
- `src/edge.js` uses `src/python/edge_bridge.py` worker; never log `text` or worker stderr. Worker exit codes (`20` dependency, `21` input, `22` remote failure) are part of this SP-02 contract.
- `src/local.js` defaults to loopback only and disallows redirects; remote endpoints are tagged `remote_unapproved`, rejected by the service cost gate.
- This spike intentionally has **no queue, SQLite, UI or multi-scene batch**. Later `R2-03`, `R2-04`, EP12 wire to durable jobs and asset_versions. Provider wrappers may require auth request customization, capability probing and speech chunking.
- No end-to-end guarantee about Edge TTS availability, provider quotas, Windows speech quality, timestamps, or 30–40 min consistency until separately verified.

**Next:** SP-03 image/GPU adapter spike can proceed without waiting for Windows. Return to SP-02 real Edge/Piper/VieNeu and native Windows validation when an appropriate environment is available.
