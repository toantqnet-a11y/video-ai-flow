# R0-13 – Paid Policy & Approval Guard / Test Report

**Date:** 2026-10-14 · **Status:** `CODE_COMPLETE + TESTED_OFFLINE` (NOT production signed off).

## Delivery

- DB migration **v10**: job-scoped approvals; per-call and total estimated USD budget in integer micro-USD; append-only audit and idempotent invocation reservations.
- Runtime `ProviderRegistry.invoke()`: remote consent remains mandatory; the old `paidApproval: {approved: true}` JSON is **not** accepted as paid permission. A trusted server policy and stored approval must authorize each paid call immediately before adapter dispatch. Unknown pricing fails closed; unverified remote free tier must have an explicitly vetted non-billable adapter (built-in Edge TTS only).
- HTTP API (covered by existing global Bearer + CSRF): `POST /api/paid/approvals`, `GET /api/jobs/:id/paid-approvals`, `GET /api/jobs/:id/paid-audit`, `POST /api/paid/approvals/:id/revoke`.
- UI: `apps/web/src/PaidApprovalPanel.jsx`, on the Provider Workspace: select planned job/model, set estimated total/per-call cap and expiry; explicit remote acknowledgement and typed approval; view/revoke ledger. Does not trigger AI request merely by approving.
- Job-model/account binding is mandatory at approve/reserve. Existing free/local jobs have no paid target and cannot be approved accidentally.

## Actual automated verification

| Verification | Command | Result |
|---|---|---|
| Application suite | `npm test` | **181/181 PASS** |
| Sprint 0 spike suites | `npm test` in `spikes/SP-01..06`, `SP-VID-01` | **146/146 PASS** |
| Generated OpenAPI drift + JS syntax | `npm run check` | **PASS** |
| Shared SDK declarations | `npm run typecheck:sdk` | **PASS** |
| JSX syntax through global TypeScript parser | `tsc --allowJs --checkJs false --jsx preserve --noEmit --noResolve apps/web/src/PaidApprovalPanel.jsx apps/web/src/ProviderWorkspace.jsx` | **PASS** (syntax only) |
| **Total Node tests** | 181 application + 146 spike | **327/327 PASS** |

Evidence: `docs/evidence/R013_app_tests.txt`, `R013_contract_check.txt`, `R013_types.txt`, `R013_jsx_parse.txt`, plus seven `R013_SP-*_tests.txt` files.

### Tests directly added or adjusted

- Typed human approval, validation and exact job-model binding; block nonexistent/non-billable jobs.
- Job/account/model scope, per-request max, total cap, expiry and revocation.
- Double invocation prevention across repo restart AND closing/reopening SQLite file.
- Network timeout remains `uncertain` and holds estimated budget (no blind refund/retry).
- Spoofed approval JSON cannot cause a paid provider dispatch.
- Unverified remote price cannot be treated as free.
- SQLite v9 → v10 checksum preservation and backup, immutable audit.
- API route/contract registration and metadata-only controller behavior.
- Updated an old integration test that had accepted unsigned paidApproval JSON; this obsolete unsafe behavior is intentionally rejected.

## Limitations / gates NOT verified

1. No live paid remote provider adapter is registered in this release: the dispatcher guard was verified via a **test adapter**, not by incurring any real charge.
2. Price calculations must come from a **trusted adapter**; without such a source, paid calls fail closed. A provider's real invoice can exceed a local estimate; caps are **estimated**, not a guaranteed real billing ceiling.
3. Paid jobs must be explicitly planned with `providerModelId` and `providerAccountId` in stored job metadata. R2 will wire that scheduling/pause-on-approval experience and real provider usage reconciliation.
4. Actual Fastify HTTP and React/Vite browser E2E cannot be claimed here (npm dependencies unavailable). Target Windows, GPU and network provider checks remain deferred by PO.
5. A request may still be billed remotely after cancellation/revocation if already sent. Budget reservation is conservative and never automatically refunded following an unknown network outcome.

**PO decision:** No additional approval necessary to proceed with the next task (R0-14). The user already authorized implementing an explicit budget/consent mechanism; no money was spent during this task.
