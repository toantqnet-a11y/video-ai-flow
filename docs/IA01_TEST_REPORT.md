# IA-01 — Integration test evidence (2026-10-16)

Source: `tools/integration-acceptance.mjs`, `tools/integration-acceptance.test.mjs`, `tools/long-form-plan-acceptance.mjs`, `packages/core/src/render-ffmpeg-r2ext04.mjs`.

| Command/gate | Result | Important limitation |
|---|---|---|
| `npm run test:acceptance` | **4/4 PASS** | 5-scene queue/render + corrupted SHA + stale edit + missing frame negative QA |
| `npm run acceptance:five-scenes` | **PASS**, 1080×1920/30fps, 5 scenes, 429 frames, 14.300s | Wave audio & image are fixtures, not model results |
| FFprobe `-count_frames` | **429 read frames** | Validates frame count only, not Vietnamese speech pronunciation |
| `npm run acceptance:long-plan` | **PASS**, 300 scenes, 600 assets, 36.33min Composition preflight | No 36-min MP4; no performance claim |
| `npm run test:all` | **734/734 PASS** | Linux Node unit/integration + spikes |
| `npm run test:ext040506` and `test:ext0708` | PASS | No browser |
| `npm run check` | PASS | Contracts/API drift unchanged |
| `npm run typecheck:sdk` | PASS | SDK only |
| `npm run test:negative-control` | PASS | Deliberate red test detected |
| `npm install` | BLOCKED `EAI_AGAIN` npmjs.org | No lockfile; no network available |
| `npm run build:web` | BLOCKED 127 `vite: not found` | Not a UI pass |
| `npm run test:live-http` | BLOCKED `ERR_MODULE_NOT_FOUND` Fastify | Not an HTTP pass |
| Windows / GPU / browser / live providers | NOT RUN | Hardware/runtime acceptance pending |
| EXT-03 Remotion vs HyperFrames | NOT RUN | No benchmark outcome inferred |

**Measured full-resolution local FFmpeg:** MP4 SHA-256 `30325749e62fa907e48113682456bd42aaa51e918a36ccfaed711f2deadfb5cb`; filesize 1,546,300 bytes; 14.300 seconds, H.264/AAC, 1080×1920 at 30fps. 5 subtitle cues preserve Vietnamese in the SRT input; there is no optical/glyph-perfect automated acceptance. Fixed missing-frame negative control. Manual caption safe-area and baked-in-text overlap checks remain recommended.

Artifacts: `docs/evidence/IA01_five_scene_full_res_qa.json`, `docs/evidence/IA02_35min_plan_qa.json`. Release **NOT_READY**.
