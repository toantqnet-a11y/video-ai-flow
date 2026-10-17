# IA-02 Test Report — 2026-10-16

**Scope:** Full-system acceptance automation and HyperFrames primary-renderer HTML contract. **Outcome:** CODE_COMPLETE_TESTED_OFFLINE / RELEASE_NOT_READY.

| Check | Actual result | Evidence |
|---|---|---|
| `npm run test:ia02` | 7/7 PASS (includes HyperFrames policy) | Focused Node tests |
| `npm run test:all` | **751/751 PASS** | Captured at IA-02 execution; adds four gate tests over prior 747 |
| `npm run check` | PASS | API artifacts current |
| `npm run typecheck:sdk` | PASS | strict TS typecheck |
| `npm run test:negative-control` | PASS | intentional failing test detected |
| `node tools/ia02-acceptance.mjs --with-media` | 5 PASS, 11 BLOCKED | `docs/evidence/IA02_gates.json` |
| FFmpeg live control video | PASS | 5 scenes, 429 frames, portrait 720x1280, H264/AAC, SHA-probed; **not HyperFrames** |
| 300-scene long plan | PASS plan only | `docs/evidence/IA02_35min_plan_qa_latest.json`, `renderedMp4=false` |
| IA-02 `--strict` | Exit code 1 (EXPECTED) | Release remains NOT_READY |
| `npm install --offline` | BLOCKED (`ENOTCACHED`) | Missing package cache |
| `npm ping --fetch-retries=0` | BLOCKED (`EAI_AGAIN`) | No registry DNS; Vite/Fastify/HF not installable here |
| Real HyperFrames MP4 | NOT_RUN | No installed local HyperFrames binary; no performance claim |
| Windows/browser/AI provider/long MP4 | NOT_RUN | Requires target host/dependencies |

**Fixed:** HyperFrames's root `<div data-composition-id="contentstudio">` now declares `data-start="0" data-no-timeline`; documented for root timing and timeline-free operation. The generated scenes are still subject to a real HyperFrames `lint`/`check`/`render` on a connected host; this does not prove Chrome frame-accurate animation.

**Guardrails:** no external media, no automatic FFmpeg or paid fallback, no new database migration or queue. Existing IA-01 output remained unchanged; IA-02 is a verification and readiness upgrade, not a product feature release.
