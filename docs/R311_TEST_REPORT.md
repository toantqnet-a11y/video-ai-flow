# R3-11 — Verification Report · 2026-10-16

| Test / acceptance | Actual result |
|---|---|
| Dedicated `npm run test:r311` | **7/7 PASS**: ZIP64 structure, UTF-8/SRT/script/timeline/manifest SHA, corrupt and changed assets, unsafe path/duplicate names, scoped API errors, and one real completed ZIP from service |
| Python `zipfile.ZipFile.testzip()` / external `unzip -t` on actual generated ZIP64 fixture | **PASS**: no corrupt entries; valid UTF-8 and ZIP64 version 4.5 |
| Generated OpenAPI + SDK `npm run check` | **PASS**; includes `application/zip` and revision query |
| `npm run typecheck:sdk` | **PASS** |
| `npm run test:negative-control` | **PASS** |
| React JSX TypeScript parse | **PASS: 0 parse diagnostics** for modified Timeline screen |
| Contract routing/security suite `packages/contracts/test/contracts-r005.test.mjs` | **6/6 PASS**, after adding ZIP response media and explicit revision ingress allowlist |
| `npm run test:all` (initial) | **803/805 PASS, 2 FAIL** in the global contract suite because the first revision forgot binaryArchive contract assertion and query ingress allowlist; both were fixed and isolated contract suite reran 6/6 PASS. |
| `npm run test:all` (rerun after fixes) | **INCOMPLETE**: test process did not reach TAP summary (last visible #791); therefore do not claim full suite PASS. |
| `npm run build:web` | **BLOCKED**: Vite/front-end dependency installation unavailable in this environment. JSX was syntax parsed only. |
| Live Fastify HTTP, Windows browser, HyperFrames CLI | **NOT RUN** |
| Actual 35–40 minute render and ZIP64 >4 GiB | **NOT RUN** |

**Release: NOT_READY**. There is no verified new global test total. No AI provider calls, billed API, remote render or GPU work.
