# ARC-01 — Test Report · 2026-10-13

**Runtime used:** Linux, Node v22.16.0, FFmpeg present. Target Windows test postponed per PO.

## ARC-01 tests executed

Command: `npm test`.

| Suite | Scenario coverage |
|---|---|
| `packages/core/test/domain.test.mjs` | Migrations, CRUD, preset snapshots, archived channel, master script, scene validation, timeline version conflicts, SQLite restart persistence |
| `packages/core/test/assets.test.mjs` | Asset atomic file+pointer commit, missing-file reconciliation, SP-04 fenced queue asset promotion replay, reject wrong SHA-256 |
| `apps/api/test/integration.test.mjs` | Same SQLite queue and domain, real diagnostic worker, consent gates, token pairing/CSRF/Origin, mocked local adapter file pipeline |
| `apps/api/test/routes.test.mjs` | Route registration contract and error mapping, SP-06 actual encryption/vault route methods |

**Result:** 22 tests PASS, 0 fail. `npm run check` PASS.

## Regression suites (previous spikes, rerun from bundled source)

| Source | Results |
|---|---:|
| SP-01 – FFmpeg | 4 / 4 |
| SP-02 – TTS | 22 / 22 |
| SP-03 – Image | 35 / 35 |
| SP-04 – Queue | 15 / 15 |
| SP-05 – Timeline | 16 / 16 |
| SP-06 – Security | 33 / 33 |
| SP-VID-01 – AI Video | 21 / 21 |
| **Total regression** | **146 / 146** |

**Combined test cases: 168/168 PASS**, but do not interpret this as production or browser verification.

## Verification not possible or not attempted

- `npm install` failed with `EAI_AGAIN registry.npmjs.org` (offline); React/Vite production build and Fastify HTTP runtime have **not** been executed.
- No live Microsoft Edge TTS, no ComfyUI image/video GPU inference, no Wan model benchmarks, no Cloudflare API run.
- No Windows file ACL/DPAPI/FFmpeg benchmark, browser drag&drop/seek/500 scene profiling.
- No 30–40 minute end-to-end app render / LLM scoring.

**Task status:** CODE_COMPLETE + TESTED_OFFLINE; PENDING_DEPENDENCY_INSTALL/BROWSER/WINDOWS validation.
