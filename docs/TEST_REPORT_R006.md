# R0-06 — Job persistence API, redacted SSE & backlog audit

**When:** 2026-10-14 · **Environment:** Linux, Node.js v22.16.0 · **Task:** R0-06 (EP12 US-12.1)

## Delivery

- Reuses the one existing SP-04 SQLite `JobStore` and runner. **No new queue, Redis or database.**
- `apps/api/src/job-center.mjs`: strict safe DTO projection, bounded filtering, status transitions and cursor rules. Never expose payload, scene script/prompt, lease token, worker ID, file path, API credentials or arbitrary provider error text.
- Backend: `GET /api/jobs[?status&limit]`, `GET /api/jobs/:id`, `GET /api/jobs/events/history[?after&limit]`, `POST /api/jobs/:id/{pause,resume,cancel,retry}`. SSE `/api/jobs/events` emits redacted frames, uses backpressure/drain and Last-Event-ID header (no tokens in URL).
- Queue creation responses for diagnostic/scene assets are now redacted, too.
- `apps/web/src/JobCenter.jsx`: status counts, filtering, refresh, per-job controls, visible error and warning. Reconciles after authenticated SSE notifications; no provider payload is rendered.
- OpenAPI 3.1 and TypeScript SDK regenerated from the authoritative operation catalog. API request-policy allowlist updated for non-secret query keys only.
- `docs/R0_BACKLOG_AUDIT.md`: reconciles every canonical R0 task to actual deliverables. R0-13 and R0-14 are not silently marked complete.

## Tests actually executed

| Command | Result | Evidence |
|---|---:|---|
| `npm test` | **167/167 PASS** | `docs/evidence/R006_app_tests.txt` |
| SP-01 | 4/4 PASS | `docs/evidence/R006_sp01.txt` |
| SP-02 | 22/22 PASS | `docs/evidence/R006_sp02.txt` |
| SP-03 | 35/35 PASS | `docs/evidence/R006_sp03.txt` |
| SP-04 | 15/15 PASS | `docs/evidence/R006_sp04.txt` |
| SP-05 | 16/16 PASS | `docs/evidence/R006_sp05.txt` |
| SP-06 | 33/33 PASS | `docs/evidence/R006_sp06.txt` |
| SP-VID-01 | 21/21 PASS | `docs/evidence/R006_spvid.txt` |
| `npm run check` | PASS | `docs/evidence/R006_check.txt` |
| `npm run typecheck:sdk` | PASS | `docs/evidence/R006_typecheck.txt` |
| TypeScript JSX parser on `JobCenter.jsx`, `main.jsx` | PASS | executed inline in runtime |

**Total:** 167 application + 146 independent Sprint 0 tests = **313/313 PASS**. Nine new tests since R0-12 (158 to 167).

## Acceptance criteria evidence

- [x] Database persists job and queue event after closing/reopening SQLite.
- [x] State transition: pause/resume/cancel; conflicts and invalid identifiers handled.
- [x] Authenticated route-adapter tests for list/detail/control/event history (not a live Fastify server).
- [x] Secret-bearing payload, worker lease and returned asset/job responses redacted.
- [x] SSE event detail redacted and replayed by cursor; cursor/input validation.
- [x] Queue/store independent regression tests pass, including process crash recovery from earlier SP-04 tests.
- [x] OpenAPI generated and SDK typecheck passes.
- [ ] Actual Fastify HTTP/SSE connection under network load, React browser tests: dependencies unavailable in current runtime.
- [ ] Windows background restart, GPU and external inference: hardware/credentials not present.
- [ ] Remote provider cancellation guarantee: cannot promise; HTTP UI explicitly warns potentially billable requests can continue after cancel.

**Release status:** `CODE_COMPLETE / TESTED_OFFLINE` only. The workflow is not yet production-ready, and R0 is not released.
