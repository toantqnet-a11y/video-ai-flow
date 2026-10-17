# FI-02 · Actual test observations — 2026-10-16

| Check | Result | Boundaries |
|---|---|---|
| `npm run test:fi02` | **7/7 PASS**, exit 0 | Gate classification, lock policy, launcher fail-closed and strict negative tests |
| `npm run test:fi01` | **7/7 PASS**, exit 0 | FI-01 pinned dependency regressions |
| `node --test tools/fi02-release.test.mjs tools/fi01-release-gates.test.mjs tools/launcher-core.test.mjs` | **21/21 PASS**, exit 0 | Windows *logic* tested on Linux only |
| `npm run test:hyperframes` | **8/8 PASS**, exit 0 | Mock/contract, not actual HyperFrames rendered MP4 |
| `npm run test:r313-r314` | **9/9 PASS**, exit 0 | Safety / acceptance harness |
| `npm run test:r405-r406` | **12/12 PASS**, exit 0 | Subtitle / BGM FFmpeg finishing regressions |
| `npm run check` | PASS, exit 0 | OpenAPI, generated artifact consistency and syntax |
| `npm run typecheck:sdk` | PASS, exit 0 | SDK typechecking |
| `npm run test:negative-control` | PASS, exit 0 | Deliberate failing fixture correctly rejected |
| `npm run acceptance:fi02:focused` | **8 PASS / 12 BLOCKED / 0 FAIL** | Snapshot created this invocation. Does not include full test:all |
| `node tools/fi02-release.mjs --strict` | Exit 1 (expected) | Refuses to issue release-ready status with missing evidence |
| `node tools/launch.mjs diagnose` | `PACKAGE_LOCK_BLOCKED`, `NPM_DEPENDENCIES_MISSING`, `UI_BUILD_MISSING` | Host diagnostic |
| `npm run build:web` | Exit 127 (`vite: not found`) | Frontend not built |
| `npm ping` | `EAI_AGAIN registry.npmjs.org` | npm registry unreachable; cannot create a genuine lockfile here |
| `npm run test:all` | **INCOMPLETE** — invocation timed out after TAP test #629 | No FI-02 full-suite PASS claim; FI-01 had 852/852 PASS before modifications |
| Real HyperFrames/Windows/browser/35-min MP4/recovery | **BLOCKED / NOT RUN** | No production acceptance implied |

Exact machine-readable evidence: `docs/evidence/FI02_release_gates.json`. Full-suite partial stdout was not counted as a success. Existing real FFmpeg short video proves only the FFmpeg path.

**Release verdict: `NOT_READY`.** The next productive step is installing reviewed, locked dependencies on the intended Windows computer and running genuine HyperFrames acceptance and a long-video/restart trial.
