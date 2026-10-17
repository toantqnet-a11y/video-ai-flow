# R0-GATE-01 — File map for next agent
**Read `docs/HANDOFF.md` first; no repository-wide scan needed.**

| File | Reason changed |
|---|---|
| `packages/core/src/channel-avatar.mjs` | New bounded, private image validation/upload/read service |
| `packages/core/src/db.mjs` | Additive v12 SQLite migration + schema/owner integrity checks |
| `packages/core/src/domain.mjs` | `avatarId` in channel DTO; old domain data unchanged |
| `packages/core/src/index.mjs` | Export avatar service |
| `apps/api/src/channel-avatar.mjs` | Authenticated upload/read routes (auth installed globally) |
| `apps/api/src/server.mjs` | Register avatar service/routes |
| `apps/web/src/ChannelAvatar.jsx` | React avatar upload, revocable authenticated image Blob preview |
| `apps/web/src/ChannelWorkspace.jsx` | Hook avatar into list and channel info |
| `apps/web/src/api.js` | SDK image getter facade |
| `apps/web/src/style.css` | Avatar cards, responsive settings panel |
| `packages/contracts/src/{catalog,openapi}.mjs` | Binary image OpenAPI contract and input schema |
| `packages/sdk/src/client.mjs` | Bounded Blob image fetch using memory-only bearer |
| `tools/generate-api.mjs`, generated `docs/api/openapi.json`, `packages/{sdk,contracts}/src/*.d.mts` | Synced types/contracts; generated files must NOT be hand-edited |
| `packages/contracts/test/contracts-r005.test.mjs` | New route completeness tests |
| `packages/core/test/channel-avatar-r0gate.test.mjs` | Validation, SQLite history, tamper and scope tests |
| `apps/api/test/channel-avatar-r0gate.test.mjs` | Handler contract tests |
| `packages/sdk/test/avatar-r0gate.test.mjs` | Auth and bounded image stream tests |
| `packages/core/test/{paid-policy-r013,video-capabilities-r0vid01}.test.mjs` | Make migration tests forward-compatible with additive version >11 |
| `spikes/SP-VID-01/test/adapter.test.mjs` | Stabilize short intentional timeout under CI load; no production adapter change |
| `tools/run-tests.mjs` | Limit concurrent test files to 4 for reproducible CI |
| `tools/live-http-smoke.mjs`, `.github/workflows/ci.yml`, `package.json` | Add mandatory real Fastify smoke on installed CI runner |
| `docs/{HANDOFF,WORKLOG,DECISIONS,R0_RELEASE_READINESS,TEST_REPORT_R0_GATE}.md`, `R0_Status.md`, `AGENTS.md`, `README.md` | Status, evidence, decision and handoff update |

**Current verification**: 378/378 Node tests PASS; `npm run check` and `npm run typecheck:sdk` PASS. UI build and live HTTP blocked by npm registry DNS in this environment. Windows/GPU deferred per PO.
