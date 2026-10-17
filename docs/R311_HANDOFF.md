# R3-11 — Next AI Agent Handoff · 2026-10-16

**Read first:** `docs/R311_PROJECT_ZIP_CONTRACT.md` → `docs/R311_TEST_REPORT.md` → tail `docs/DECISIONS.md` → `AGENTS.md`. Do NOT rebuild from an older R3 archive.

**Core ZIP64:** `packages/core/src/project-zip-r311.mjs`. `projectZipEntries` validates approved v2 scene/media pins and assembles safe archive entries; `writeZip64` streams ZIP64 STORE and rehashes file bytes. No external npm zip dependency.

**Backend:** `apps/api/src/project-zip-r311.mjs` generates private staging ZIP after checking revision/video; `apps/api/src/controllers.mjs` and `routes.mjs` expose authenticated project ZIP stream, remove file on completion/disconnect; `request-policy.mjs` explicitly allows only `revision` query on project export route. Fastify backend live HTTP untested.

**Frontend/SDK:** `TimelineRenderWorkspace.jsx` has ZIP Export button for approved revisions, aborts if dirty. `packages/sdk/src/client.mjs` streams direct to File System Access; fallback Blob capped 100MiB. `packages/contracts/src/catalog.mjs` + `openapi.mjs` include binaryArchive, `tools/generate-api.mjs` generated types and OpenAPI.

**Tests:** `npm run test:r311` 7/7, isolated contracts 6/6, `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control` PASS. Python ZIP64+unzip external smoke PASS. Full suite attempted twice: initial 803/805 with two contract errors fixed and contract rerun, subsequent incomplete. No full green claim. Frontend Vite missing.

**Important limitations:** No ZIP re-import or SQLite data; only approved scene resources, ordered dialogue not original Master Script, SRT and scene timeline. Music lane is placeholder, so no music asset. >4 GiB actual ZIP not tested. No real HyperFrames/Windows/35-minute MP4. Release `NOT_READY`.

**Next:** R3-12 onwards per `Video_AI_Flow_Development_Execution_Plan_v3.md`; prioritize export UI/browser file picker validation and live installed HyperFrames. Keep one queue, no paid auto fallback, and persist comments/work logs. Test corruption, disk full, early aborted HTTP and 500-scene/long bundles on Windows before marking ZIP production-ready.
