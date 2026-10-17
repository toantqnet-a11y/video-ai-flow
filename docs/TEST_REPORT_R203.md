# R2-03 — Edge TTS production voice jobs / Offline test evidence

**Date:** 2026-10-15  
**Scope:** EP06, narration for R2-01 scenes.  
**Status:** CODE_COMPLETE_TESTED_OFFLINE, **NOT** browser/Windows/live Edge accepted.

## Scope delivered

- Integrates the real SP-02 `EdgeTtsAdapter` → `TtsService` with the existing `ProviderRegistry` → **single SP-04 durable queue**. Only user-consented Edge TTS remote calls are allowed; no paid/unknown providers or silent fallback.
- `POST /api/scenes/:id/voice/jobs`, `POST /api/videos/:id/voice/jobs` (at most 50 scenes), `GET /api/scenes/:id/voice/status`, and private `GET /api/scenes/:id/voice/audio`. Global bearer, CSRF for mutations, localhost-only and no-store middleware retained.
- UI under **Scenes → ② Voice TTS** with Hoài My/Nam Minh, speed 0.5–2×, explicit online consent, per-scene or per-page batch, status, measured duration and authenticated Blob playback.
- SQLite **append-only migration v21**: `scene_voice_intents`, latest requested job/input hash/text digest/config revision. Stable job idempotency key from immutable scene+voice+rate+config, not a time/random request key.
- Before/after provider invocation and during **atomic manifest promotion**, validate current text, video config and latest intent. Old-running jobs never take ownership of a newer scene voice. Fenced queue writes protect worker leases. Reconciliation is replayable.
- Audio signature and codec validation, **FFprobe-measured duration in seconds**, preserved as committed asset metadata (milliseconds in status). Estimated scene duration is **not silently rewritten**; actual timing is shown separately pending timeline reconciliation (R2-07).
- Cache uses current committed asset only if checksum/file is valid and exact input hash matches; duplicate creation does not invoke provider. Voice bytes are private and accessed through bearer-authenticated SDK; URL never contains credentials.

## Executed evidence (Linux, Node 22)

| Command/check | Observed |
|---|---|
| `npm run test:all` | **524/524 PASS** (includes 11 new R2-03 tests) |
| `node --test packages/core/test/scene-voice-r203.test.mjs` | 9/9 PASS |
| `node --test packages/sdk/test/scene-voice-r203.test.mjs` | 2/2 PASS |
| `npm run check` | PASS, generated OpenAPI up to date |
| `npm run typecheck:sdk` | PASS |
| TypeScript JSX parse of `SceneVoiceWorkspace.jsx` and `main.jsx` | PASS |
| FFprobe reads local synthetic PCM WAV fixture | PASS (codec `pcm_s16le`, ~0.1 s) |
| API route/catalog exact match, mock pipeline | PASS in full suite |

### Cases covered

- No consent, invalid voice/provider/speed, unsafe or too-long scene text refused before enqueue.
- Duplicate identical requests reuse durable job; changed voice creates new immutable hash/intention.
- Queue + mock remote Edge adapter + FFprobe metadata + checksum promotion + replay + cache + bearer audio playback.
- Superseded job **before** network, during network, and **after** successful queue result/before promotion cannot overwrite latest input.
- Scene text mutation fences dispatch, status and playback.
- Invalid provider audio signature fails closed without asset promotion.
- Out-of-scope, duplicate or oversized batch and scene ownership are validated up front.

## Limits / open gates

- **No live Edge TTS request performed.** Python package `edge-tts`, network access, voice fidelity and real provider uptime/conditions not verified. Edge is an unofficial online adapter; lack of API key does not promise unlimited/free availability. User consent is explicitly required for each batch/request.
- **No full Fastify runtime or React/Vite build/browser playback verified**: required npm runtime dependencies unavailable in this environment. JSX parsing is not a browser test.
- **No Windows test**, no 30–40-minute audio production benchmark, no provider throttling/operational SLA, no end-to-end timing sync into timeline/FFmpeg.
- Historical pre-R2-03 voice queue jobs without an intent snapshot are *fail-closed* at promotion and require explicit regeneration; no silent migration of unverified old voice output.
- Asset file cleanup/orphan reconciliation, selective invalidation, local TTS fallback and timeline timing reconciliation are tracked for R2-04/R2-06/R2-07.

**R2-03 verification conclusion:** implementation + offline regression passed. Do not use “live production verified” or “Windows ready” in the release tracker.
