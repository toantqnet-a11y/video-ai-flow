# FI-03 Test report — 2026-10-16

| Check | Observed | Meaning |
| --- | --- | --- |
| FI-02 unmodified baseline | 859/859 PASS, exit 0 | Evidence before FI-03 code changes |
| `npm run test:fi03` | 6/6 PASS | New launcher env, FFmpeg fixture safety tests |
| `npm run check` | PASS | OpenAPI/generated API and syntax |
| `npm run typecheck:sdk` | PASS | TypeScript SDK |
| `npm run test:negative-control` | PASS | Deliberate test failure detected correctly |
| `npm run test:all` after edits | INCOMPLETE (last TAP #847) | Timed out, cannot claim PASS |
| `node tools/run-tests.mjs --all --concurrency=1` | INCOMPLETE (last TAP #506) | Timed out, cannot claim PASS |
| `npm run test:all:batched` | 11 successful batches then INCOMPLETE | Isolated test hang; no automatic retries |
| R3-08/09 cache test standalone | 4/4 PASS | Does not resolve intermittent suite hang |
| HyperFrames policy + R3-13 safety standalone | 9/9 PASS | Offline mock/safety only |
| `node tools/fi02-release.mjs --verify-focused` | 8 PASS / 12 BLOCKED | Latest release inventory, NOT_READY |
| Real 35-min FFmpeg control | PASS, 63,000 frames at 360p | Not representative of 1080p, not HyperFrames |
| `npm ping` | FAIL, EAI_AGAIN | Package install and build blocked |
| Vite build, Fastify live HTTP, Windows | BLOCKED | Dependency/host unavailable |
| Real HyperFrames + 35min + recovery | BLOCKED | Production acceptance unavailable |

**Release verdict: NOT_READY.** All numbers reflect observed runs; new focused PASS cannot replace a full-suite result.
