# R2-04 — Piper / VieNeu Loopback TTS & Explicit Edge Fallback

**Run date:** 2026-10-15  ·  **Scope:** EP06 US-6.2 · **Implementation:** CODE_COMPLETE_TESTED_OFFLINE

## Delivery

- Two operator-configured local HTTP adapters (`piper`, `vieneu`) register with the existing `ProviderRegistry` only when a literal-`127.0.0.1` synthesis URL is configured. No remote URL, DNS hostname, URL credentials, query parameters, arbitrary provider ID or user-provided URL is allowed. Default: both OFF.
- Reuse SP-02 `LocalHttpTtsAdapter` + `TtsService` atomic file creation + `FFprobe` verification; output is a real persisted WAV/MP3 asset, not browser speech. The adapter contract is documented in `docs/R204_LOCAL_TTS_CONTRACT.md`.
- Primary provider selection per scene/batch: `edge`, `piper` or `vieneu`. Edge requires request-scoped remote consent; local-only does not. One explicit optional **Edge -> configured local** fallback may be pinned per request. Never fallback from local to remote or to paid providers; Edge outages alone do not trigger local generation unless a fallback was selected.
- v22 migration appends a new migration (v21 SQL unchanged) and rebuilds the formerly edge-only voice intent table to pin primary and fallback provider/voice IDs, preserving old Edge intent rows.
- One SP-04 SQLite queue and existing checksum/FFprobe/manifest promotion fences. The saved source hash, video config revision, latest intent/job ID and entire voice routing snapshot are checked before dispatch, before local fallback and before DB activation. Cache keys include the **fallback policy**, which prevents a previously created voice under a different policy from being misidentified as equivalent.
- `GET /api/tts/local-providers?probe=true` lists safe provider ID, configured voice and bounded health state, **never the URL or local port**. Browser UI offers only configured local providers and makes fallback a visible opt-in. Audio remains bearer-authenticated.

## Tests executed (Node v22.16, Linux)

| Test or check | Result |
|---|---|
| `npm run test:r204` | **16/16 PASS**, 10 core policy/queue tests + 6 API adapter/HTTP bridge tests |
| `npm run test:all` | **540/540 PASS** (previous baseline: 524) |
| `npm run check` | PASS; generated OpenAPI is current |
| `npm run typecheck:sdk` | PASS |
| `npm run test:negative-control` | PASS; injected regression produced nonzero exit and TAP failure as expected |
| TypeScript JSX parse | PASS (0 syntax errors in `SceneVoiceWorkspace.jsx`, `main.jsx`) |
| Mock HTTP loopback synthesis | PASS; POST JSON+headers returned actual 0.1-second fixture WAV; SP-02 wrote file; FFprobe recognized `pcm_s16le` |
| Mock local health + unknown/redirected provider + invalid audio | PASS; invalid sources did not become voice files |
| Explicit fallback and no silent fallback | PASS; failed Edge mock calls either used pinned Piper local or never invoked it |
| Late/outdated job and checksum/cache protection | PASS |
| Real Piper/VieNeu model invocation or natural voice quality | **NOT TESTED** |
| Fastify live HTTP, React/Vite production build, browser audio, Windows | **NOT TESTED** (dependencies/runtime unavailable in current environment) |
| Continuous 30–40 minute synthesis / timing-based timeline synchronization | **NOT TESTED** |

## Security and known constraints

- The test HTTP server runs on `127.0.0.1` with a **synthetic PCM audio fixture**; this tests the real adapter, headers, file output and probe but **not the Piper/VieNeu inference engines**. The custom local HTTP bridge must exist and return actual WAV/MP3. ContentStudio does not install, launch or silently provision either engine.
- Native Piper or VieNeu servers may have different request paths, payloads or authentication protocols; configure a compatible local bridge. The optional `text` body format supports Piper servers that take raw text, but no direct native-model acceptance is claimed.
- The read-only health request only checks whether the local endpoint replies successfully; `ready` means service connectivity, **not speech quality or loaded model readiness**.
- A fallback call may still create orphan voice files if the user edits the script while a slow request is running. Old assets cannot be promoted; orphan reclamation is R2-06.
- Edge TTS's upstream availability, terms and actual audio have not been verified. No paid provider activation or remote fallback was introduced.
- The previously deferred R0/R1 full release readiness and live Windows test gates remain OPEN.
