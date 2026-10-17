# ContentStudio – AI Agent Handoff (current)

**2026-10-14 · Latest:** R0-13 Paid Policy & Approval Guard. **State:** CODE_COMPLETE + TESTED_OFFLINE; **R0 NOT ACCEPTED YET**.

## Read in order (do not scan whole project)

1. `AGENTS.md` → this file → `R0_Status.md` → `docs/TEST_REPORT_R013.md`.
2. For cost guard work only: `packages/core/src/paid-policy.mjs` + `packages/providers/src/index.mjs` + `apps/api/src/{controllers,routes,server}.mjs`.
3. For UI: `apps/web/src/PaidApprovalPanel.jsx`, rendered by `ProviderWorkspace.jsx`.
4. Contracts: `packages/contracts/src/catalog.mjs` → generated `docs/api/openapi.json` and SDK declarations.
5. Earlier implementation context is archived at `docs/archive/HANDOFF_before_R013.md`; append-only history lives in `docs/WORKLOG.md`.

## What changed in R0-13

- SQLite migration **v10** is appended to `packages/core/src/db.mjs`; v1–v9 are unchanged.
- `PaidPolicyRepository`: per-job+account+model confirmation (must match stored planned target), deadline, max estimated USD and per-call ceiling. All amounts stored as integer micro-USD. No keys or prompt text in grants/audit.
- `ProviderRegistry.invoke` denies unsigned/old paidApproval booleans. It requires a server-owned durable spending policy and trusted adapter estimator; unverified prices fail closed. Non-billable remote Edge TTS is explicitly marked as vetted, still requires remote consent.
- Authenticated+CSRF paid API CRUD/read/audit and typed consent UI; no paid provider actually called.
- Added 14 R0-13 app tests (including migration/restart/route tests) and revised 1 obsolete unsafe assertion. Updated checked-in OpenAPI/SDK.

## Actual evidence

- `npm test`: **181/181 PASS**.
- Seven spike test suites: **146/146 PASS**; combined **327/327**.
- `npm run check`, `npm run typecheck:sdk`, JSX syntax: PASS.
- Evidence files in `docs/evidence/R013_*`; report `docs/TEST_REPORT_R013.md`.
- No real Fastify HTTP, Vite browser, Windows or real paid AI invocation acceptance.

## Invariants for next agent

- User-approved default is free/local; **no auto paid fallback**. Router preview is never authorization.
- Runtime guard MUST revalidate a job-bound grant and reserve estimated spend *before* any paid provider network call. Errors/restart retain reservation as uncertain; no silent retries/refunds. Remote consent is separate.
- Current free/local generation jobs do not carry a paid provider target; UI appropriately refuses granting money to them. R2 must explicitly plan billable jobs and pause/notify before trying a paid adapter.
- Queue stays SP-04 only; secrets only server Vault; no raw prompts/API keys in logs/SQLite approval ledger. Never edit historical migrations.
- Existing 4-track timeline drag in MVP; hardware verification deferred, not considered DONE.

## Next task / dependency

**R0-14 – Mock Providers & CI Tests:** build GitHub Actions Linux/Windows smoke matrix, deterministic mock LLM/TTS/image/video adapters, API contract/security test jobs and documented red failure. Do not mark real providers or Windows hardware validated from a hosted runner alone.

Then reconcile R0-01 Windows bootstrap, R0-10 TTS preview, R0-VID-01 video provider capabilities and browser/HTTP integration. R1 waits on security/contract coverage, not target GPU hardware.

**PO blockers:** none. User has no Windows machine right now; do not request one.
