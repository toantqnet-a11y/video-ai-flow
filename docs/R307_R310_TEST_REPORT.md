# R3-07→R3-10 — Test report (2026-10-16)

| Suite/step | Actual result |
|---|---|
| Dedicated combined suite (`npm run test:r307-r310`) | **12/12 PASS** (7 focused core + 5 render API) |
| New history (`packages/core/test/timeline-history-r307.test.mjs`) | **3/3 PASS** |
| New cache/SRT (`packages/core/test/render-cache-srt-r308-r310.test.mjs`) | **4/4 PASS** (FFmpeg H.264/AAC short MP4 generated) |
| Render/API/contracts (`npm run test:ext040506`) | **15/15 PASS**, including one new frozen-job/SRT tamper test |
| R3-02..04 regression | **13/13 PASS** |
| R3-05/06 regression | **10/10 PASS** |
| R3-05 actual trim render regression | **8/8 PASS** |
| Composition v1/v2 regression | **21/21 PASS** |
| Historic v22/23 database migration fixtures | **27/27 PASS** after updating artificial downgrade test fixtures for v30/v31 (production migration code unchanged before v30) |
| `npm run check` / generated OpenAPI / SDK typecheck | **PASS** |
| Negative-control CI | **PASS** (deliberate failure exits nonzero) |
| JSX static syntax parse via installed TypeScript | **PASS: 0 parse diagnostics** on two modified React screens |
| 36m20s/300-scene composition-only planner | **PASS**; 65,400 frame timing, 600 asset SHA, voice FFprobe verified; **NO MP4** |
| `npm run test:all` | **INCOMPLETE / TIMED OUT** at test #581 in this environment. Log found two artificial downgrade-fixture failures and both were fixed/tested individually. Do **not** claim new full-suite total. |
| `npm run build:web` | **BLOCKED**: `vite: not found` (no frontend dependency installation) |
| HyperFrames real final render | **NOT RUN** |
| Windows browser, GPU, 35-minute real video, full long-form SRT | **NOT RUN** |

**Release status: NOT_READY**. Prior checkpoint reported 790/790 full suite, but that number does not certify this change. Local verified new tests total 8 (3 history, 4 cache, 1 additional API). FFmpeg short real MP4 reproducible, no paid API/provider invoked.
