# R0-10 — Voice Preview Test Evidence

Date: 2026-10-14. Linux Node.js 22.16.0.

| Check | Actual result |
|---|---|
| `node --test apps/api/test/voice-preview-r010.test.mjs packages/sdk/test/voice-preview-r010.test.mjs apps/web/src/voice-preview-form.test.mjs` (before relocation to sdk/test) | **12/12 PASS** |
| `npm run test:all` | **372/372 PASS** (application + prior seven spikes) |
| `npm run check` | **PASS**, generated OpenAPI synchronized |
| `npm run typecheck:sdk` | **PASS** |
| `npm run build:web` | **BLOCKED**, `vite: not found` (dependencies not installed) |
| Python `edge_tts` | **MISSING**, upstream Edge speech not exercised |
| Piper/VieNeu actual local HTTP | **NOT TESTED** (no endpoint configured) |
| Fastify real HTTP + React browser | **NOT TESTED** (dependencies unavailable) |
| Windows/target GPU | **DEFERRED** per PO |

## Assertions (offline)
- Valid and invalid voice, rate conversion, 350-char cap; explicit per-call consent for Edge; rejects extra input fields, unsupported voices.
- No implicit fallback when local provider is missing; never invokes provider for archived/deleted channel; bounded concurrent requests; sanitized errors.
- Confirms in-memory waveform-like WAV fixture passes signature validation, oversized or mismatched audio fails; this is **not** evidence of real Edge synthesis.
- Route delivers no-store binary, validates content type; SDK sends bearer/CSRF in headers and never query string, rejects forged MIME/sizes and blocks path traversal.
- Contract test now registers preview route and checks both binary OpenAPI MIME types.

## Follow-up acceptance criteria
- On a connected dev host: install Python `edge-tts`, create real HoaiMy/NamMinh audio, verify playback, timeout/error handling.
- On configured Piper/VieNeu localhost server: test voice and audio protocol, no accidental remote request.
- With npm dependencies: browser manual/E2E test switching voices and rapid cancels; Fastify HTTP auth/CSRF and `.mp3` headers; Windows hosted CI execution.
