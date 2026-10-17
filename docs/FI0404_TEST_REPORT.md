# FI-04-04 — Observed test and acceptance report (2026-10-17)

**Release: NOT_READY.** Host Linux / Node 22.16.0. Target Windows browser, reviewed npm lock and HyperFrames binary were unavailable. No paid/cloud provider was invoked.

| Test / gate | Actual result | What it proves |
| --- | --- | --- |
| `npm run test:fi0404` | **5/5 PASS** | Fail-closed proof invariants, CLI inspect safety, pinned-only production dispatch, **real local SQLite five-scene SP-04 snapshot/subtitle/music fixture** (without actual renderer) |
| `npm run test:fi04` | **10/10 PASS** | Existing FI-04 lock/build, test runner, backlog/drift checks |
| `npm run test:hyperframes` | **8/8 PASS** | Local adapter mock/contract tests; **not a rendered HyperFrames MP4** |
| `npm run test:r405-r406` | **12/12 PASS** | Existing subtitle/music/FFmpeg finishing regressions |
| `npm run test:all:batched` | **19/19 batches PASS; 880/880 tests; 151 files** | Full *batched offline* suite completed, exit 0. This is not a full live Windows E2E suite. |
| `npm run test:all` unbatched attempt | **INCOMPLETE; last TAP test #634** | Truncated due test-process timeout/termination; **no new direct global PASS** (FI-04 predecessor had 875/875 PASS before this task). Intermittent hang risk still open. |
| `npm run backlog:check:fi04` | **PASS; 60 unique task IDs** | 42 FI-02 historical + 14 AI Video + 4 FI04 tasks |
| `npm run check` | **PASS** | API syntax/OpenAPI artifact checks |
| `npm run typecheck:sdk` | **PASS** | Generated SDK types |
| `npm run test:negative-control` | **PASS** | Runner rejects intentional failures |
| `npm run acceptance:fi0404:inspect` | **BLOCKED**, exit 0 (inventory) | Lock unavailable, CLI not installed; inventory does not claim render |
| `npm run acceptance:fi0404:real` | **BLOCKED**, exit 1 (strict) | Missing reviewed lock + local CLI; no engine run, no MP4. Report `docs/evidence/FI0404_hyperframes_real.json` |
| Native HyperFrames five-scene real MP4 | **NOT RUN** | Must await approved `package-lock.json`, npm ci, installed project-local CLI and operator run |
| Windows UI, real voice provider, >=35min MP4/recovery | **NOT RUN** | Separate release gates; FI-04-04 acceptance cannot replace them |

**Integrity policy:** real output is required to be H264/AAC, exact frame count at chosen FPS and output resolution, 5 scenes, 10 matching Vietnamese edited subtitle cues, selected local music and SHA evidence. `--save-review` preserves short video/SRT for human caption and music inspection only after actual automated PASS. An FFmpeg-only result or mock cannot satisfy the real engine gate.

**Evidence files:** `docs/evidence/FI0404_hyperframes_inspect.json`, `docs/evidence/FI0404_hyperframes_real.json`. They contain BLOCKED snapshots here and no private machine paths, credentials or child stderr. Test output retained outside distributable ZIP; never interpret a partial TAP stream as success.
