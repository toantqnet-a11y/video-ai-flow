# R2-EXT-02 — Test evidence (2026-10-15)

**Status:** `CODE_COMPLETE_TESTED_OFFLINE`; production/release: `NOT_READY`.

| Command | Observed result |
|---|---|
| `npm run test:ext02` | **PASS 14/14** (real FFprobe WAV fixture when FFprobe installed) |
| `npm run test:ext01` | **PASS 12/12** backward-compatible v1 composition tests |
| `npm run test:all` | **PASS 714/714**, 0 failures, 0 skips |
| `npm run check` | PASS (`api:check` up to date) |
| `npm run typecheck:sdk` | PASS |
| `npm run test:negative-control` | PASS (intentional failing test detected) |
| `node tools/generate-{composition,timed-composition}-schema.mjs --check` | PASS (both schemas in sync) |
| `npm run build:web` | **BLOCKED** exit 127 — Vite not installed (`vite: not found`) |
| `npm run test:live-http` | **BLOCKED** exit 1 — Fastify runtime deps unavailable (`ERR_MODULE_NOT_FOUND`) |

**Coverage:** actual WAV 1234ms FFprobe overrides deliberately incorrect metadata 99999ms, 30fps math (38 audio frames, 7 padding, 45 total), caption stops at audio end; Unicode/CRLF text preserved; multi-scene accumulated frame offsets and deterministic hash; manual-locked timing/captions unchanged; locked audio cutoff and noncontiguous manually placed clips blocked; missing TTS FFprobe never called; FFprobe failure yields explicit blocker; corrupt SHA failure; v1/v2 historical immutable revision coexistence; digest mismatch, forged word-level timing or extra key rejection; concurrent timeline mutation fencing; no provider calls; authenticated operation catalog and controller integration.

**Not verified:** actual TTS synthesis/vocal syllable alignment, Windows, Fastify/React browsers, Remotion/HyperFrames render, MP4/AAC/SRT/VTT outputs, 30–40-minute media sync, end-to-end throughput. Tests use WAV fixtures rather than generating AI audio and test no video codecs.
