# R2-08 — Provider Quota Ledger & Fail-Closed Free LLM Dispatch

**State:** `CODE_COMPLETE_TESTED_OFFLINE` (2026-10-15). This is NOT live-provider, Windows or billing verification.

## Scope

R2-08 introduces a persistent *local* accounting/reservation layer so two workers cannot both treat the same remaining **operator-declared** token ceiling as free capacity. It does **not** fetch quota from providers, infer actual prices, validate account billing status, or replace R0-13 paid approval.

**Migration v26**, append-only after v25, adds `provider_quota_calls`: opaque `invocation_key` (PK), `model_id`, `reserved_units`, `actual_units`, `status` (`reserved`, `settled`, `uncertain`), timestamps. No raw script, user prompt, file path, API key or upstream response. Tables/indices and immutability triggers guard identity and forbid deletion. Old schema checksums untouched. Existing provider_usage_events and quota_used remain the settled accounting source.

## Reservation lifecycle (only authenticated internal code can write)

1. Runtime must already pass existing job pinning, remote consent, provider identity, independently confirmed `free_unverified` no-billing entitlement, vault credential availability, and provider/account active checks.
2. If a **known local quota ceiling** exists for a free LLM model, operator config `CONTENTSTUDIO_LLM_QUOTA_RESERVATIONS_JSON` MUST supply that model's conservative positive integer `estimatedUnits` per invocation (including output). Missing config fails closed as `LLM_QUOTA_ESTIMATE_REQUIRED`. A user-entered `estimated` quota is never treated as provider verified.
3. Within `BEGIN IMMEDIATE`, ledger rejects disabled accounts/models and `quota_used + outstanding reserved/uncertain + requested units > quota_limit`. Insert is unique by `sha256(quota:jobId:internalModelId:task:attempt)`; a repeated key cannot dispatch again (the external side effect is not replayable).
4. On successful response with plausible provider-reported usage count, ledger atomically transitions to `settled`, adds one `provider_usage_events` entry and increments `provider_models.quota_used`. An unexpectedly high actual count is recorded, even if above estimate, so next calls are blocked.
5. On timeout/HTTP/provider parse failure or successful response lacking usage data, mark `uncertain` and KEEP the hold. It is never automatically released. On application startup, `recover()` makes all abandoned `reserved` rows uncertain; no silent retry/refund. Operator/manual reconciliation of uncertain calls is intentionally deferred until trusted provider-side evidence exists.
6. Unknown quota (`source=unknown` / no limit): does not establish free entitlement; existing R1-07 remote and R0-13 cost guards remain. The old usage path is retained for calls without a defined token ceiling. Paid jobs are STILL governed by job-scoped R0-13 `PaidPolicyRepository`, not auto-approved by this ledger. No automatic paid/local/remote switching added.

**Safe read:** `GET /api/provider-models/:id/quota-ledger?limit=1..100` (default 50), same bearer/local/CSRF security framework, sanitized summary and at most 100 opaque call records. No reserve/settle HTTP endpoints. The route-preview sees consumed pending capacity and returns `QUOTA_RESERVED` when pending holds exhaust otherwise available capacity; `QUOTA_EXHAUSTED` for reported used >= limit. A preview never executes a job or grants an entitlement.

## Invariants and limits

- `estimated` and `provider_verified` are different; **provider_verified cannot be set by the user API**.
- Conservatively sized token estimates are OPERATOR responsibility; this registry cannot guarantee external limits, provider invoices or exact tokens for malformed upstream reports.
- Same logical job `attempt` cannot call twice after a crash; a new deliberate retry attempt may be queued, subject to fresh capacity and existing user consent/billing policies.
- Transaction serializes reservations per SQLite database; no separate scheduler, no remote probe. Unknown/upstream-in-flight is never automatically counted as unused.
- Historical same-job repeated-free LLM dispatch behavior was intentionally corrected: once a capped request settles, attempting the same `(job,model,task,attempt)` again fails before HTTP. Legacy R1-07 test updated to assert this safety rule.
- Race with external provider quota changes and manually edited local quota remains unresolved; official quota sync/reconciliation and paid-provider per-call reservation coordination are future tasks.

## Relevant code and tests

- Core: `packages/core/src/quota-ledger-r208.mjs`, `packages/core/src/db.mjs` (v26), `packages/core/src/provider-accounts.mjs` (read-only planner).
- Dispatch: `apps/api/src/llm-dispatch.mjs` (free, known-ceiling token budget), `apps/api/src/server.mjs` (config/startup recovery), `apps/api/src/{controllers,routes,request-policy}.mjs` (safe read).
- Contracts: `packages/contracts/src/catalog.mjs` + generated OpenAPI and TS SDK.
- Tests: `packages/core/test/quota-ledger-r208.test.mjs`, `apps/api/test/quota-ledger-r208.test.mjs`, historical provider and remote LLM suites.

## Pending acceptance

Live Gemini/Groq/OpenRouter quota semantics and fee/reconciliation proof; actual Fastify HTTP/browser UI (dependencies missing in offline workspace); Windows; concurrent multi-process and network-partition stress; operator UI for discrepancy resolution; 30–40-minute project performance. Use the R2-09/EXT roadmap for additional work, do not claim production-grade billing accuracy.
