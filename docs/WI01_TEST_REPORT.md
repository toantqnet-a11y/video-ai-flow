# WI-01 — Test report (2026-10-17; actual Linux host)

| Command / gate | Observation |
|---|---|
| `npm run test:wi01` | **9/9 PASS** |
| `npm run test:fi0406-fi0410` | **19/19 PASS** (prior acceptance regression) |
| `npm run test:fi04` | **10/10 PASS** |
| `npm run test:fi0404` | **5/5 PASS** |
| `npm run test:fi0405` | **10/10 PASS** |
| `npm run backlog:check:fi04` | **67 IDs, 14 AI-video**, no generator drift |
| `npm run check` | PASS |
| `npm run typecheck:sdk` | PASS |
| `npm run test:negative-control` | PASS (deliberate test failure caught) |
| `npm run acceptance:wi01:inspect` | 5 PASS / 7 BLOCKED / 0 FAIL, `NOT_READY` |
| `node tools/wi01-windows-preflight.mjs --inspect --strict` | exit **1** expected, non-Windows/dependency blocker |
| `npm run build:web` | exit **127**, Vite missing |
| `npm ping --fetch-retries=0 --fetch-timeout=5000` | failed: `EAI_AGAIN` DNS; did NOT create lockfile |
| `npm run test:all:batched` | **INCOMPLETE** due outer execution timeout after **batch 10/20**; no full suite PASS claimed |
| Batch 11 direct isolation (`node --test --test-concurrency=1` 8 files) | **73/73 PASS**, does not prove reliability of all-suite harness |
| Windows / browser / actual HyperFrames MP4 / 35-minute recovery | **NOT RUN** |

Last **previous** full-suite proof was **909/909 PASS** for FI-04-10, before WI-01 edits. It is not valid to claim WI-01 has a new 918/918 global PASS.

No paid model calls, provider inference, npm installation or fake HyperFrames media. Preflight recorded `diskFreeGiB: 29`, Linux/Node 22.16, local FFmpeg+FFprobe and absent Windows, lock/installed packages/Chromium Windows binaries. No production release proof.
