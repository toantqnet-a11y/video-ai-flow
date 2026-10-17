# R0-12 — Video Management · Test Report

**Date:** 2026-10-14 (Asia/Bangkok)  
**Scope:** EP03 US-3.1 / US-3.2 / US-3.3 / US-3.4  
**Status:** CODE_COMPLETE + TESTED_OFFLINE; NOT live HTTP/browser/Windows acceptance.

## Commands actually executed

```bash
npm test
npm run check
npm run typecheck:sdk
node --test spikes/SP-01/test/*.test.js spikes/SP-02/test/*.test.js spikes/SP-03/test/*.test.js spikes/SP-04/test/*.test.js spikes/SP-05/test/*.test.mjs spikes/SP-06/test/*.test.mjs spikes/SP-VID-01/test/*.test.mjs
```

- Application regression: **158/158 PASS** (15 additional R0-12 tests: 9 core, 3 API and 3 UI mapping tests; old tests still pass).
- Sprint 0 spike regression: **146/146 PASS** (earlier this task, before final UI projection-only refinements; no spike module was modified).
- Combined: **304/304** tests passed in the executed suites.
- API / OpenAPI drift: **PASS**, artifacts generated and checked.
- TypeScript SDK: **PASS**.
- JavaScript and JSX syntax: **PASS** via `node --check` and TypeScript `transpileModule` parse (not a Vite build).

## Acceptance results

| Acceptance | Result | Evidence |
|---|---|---|
| Channel-scoped list, cursor paging & search escaping | PASS Node test | `packages/core/test/video-r012.test.mjs` |
| Idempotent create and exact source preset snapshot | PASS Node test | core R0-12 tests |
| Optional explicit duration 1–120 minutes; no auto-AI job | PASS Node test | core R0-12 tests |
| Resume only a step with satisfied prerequisites | PASS Node test | core R0-12 tests |
| Rename optimistic lock, clone script-only, delete & restore | PASS Node test | core R0-12 tests |
| Job guard prevents deleting live work | PASS Node test | SQLite shared with SP-04 JobStore |
| Upgrade old v8 safely; v1–v8 checksums unchanged | PASS Node test | v8→v9 migration/backup tests |
| 404 cross-channel resume, 409 stale edit and soft-delete | PASS route adapter test | `apps/api/test/video-r012-routes.test.mjs` |
| Transport query allowlist blocks secret-bearing keys | PASS adapter test | local ingress tests |
| UI status and duration never invent percent or render success | PASS mapping test | `apps/web/src/video-library.test.mjs` |
| React + Vite production build | **NOT RUN** | npm dependencies absent in runtime |
| Real Fastify HTTP & browser keyboard/dialog test | **NOT RUN** | No live installed dependencies here |
| Windows + end-to-end 35-minute production run | **DEFERRED** | PO previously approved hardware deferral |

## Limitations / follow-on

- `progressPercent:null` until a real, authoritative video-level progress provider is integrated (EP12). **Do not show fake percentages**.
- Soft-delete retains video and assets indefinitely until a separately approved cleanup workflow exists.
- Thumbnail and media playback are still placeholders in R0; live assets and render belong to R2/R3.
- No guarantees of full keyboard focus trapping in dialogs until browser tests run.
- Server-side OpenAPI runtime body validation remains pending from R0-05.
- Video durations are **targets** until a renderer provides verified actual duration.
- `lastActiveStep` is advisory and checked against actual persisted script/scene prerequisites.
