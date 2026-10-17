# R2-12 — Quota & Fallback Monitoring Contract

**Status:** `CODE_COMPLETE_TESTED_OFFLINE` (2026-10-15). **Original scope:** EP12 US-12.2, monitoring UI (AI01 / AI03 / AI04), safe account/model badges, quota alerts, paid-approval guidance, observed switch history.

## Inputs & authority

- `GET /api/providers/monitor?limit=20` (authenticated, read-only; query only `limit=1..50`). Response: `ProviderMonitor` in shared catalog/OpenAPI/SDK. No tokens in URL; request guard rejects secret query keys.
- Data comes from local `provider_accounts`, `provider_models`, and **R2-08** `provider_quota_calls` (including reservations and uncertain holds). Provider network is never contacted by dashboard.
- `source=estimated` is an operator declaration, not provider quota. `source=unknown` is **never** converted to a positive remaining balance. `source=provider_verified` is only a persisted label: this dashboard still sets `billingVerified=false` and `liveQuotaChecked=false`.
- Limit is spent+reserved arithmetic: `max(0, localLimit - used - pendingUnits)`. At >=90% of **declared local** limit, report near-limit; at zero report exhausted. Disabled account/model takes precedence. Displays only 100 models with `truncated` flag and up to 50 switch events.
- Every costTier=paid model has `requiresPaidApproval=true`, irrespective of local remaining token estimate. Authorization remains **existing** R0-13 job-scoped paid approval UI; dashboard cannot grant/renew/revoke consent.

## Actual fallback history (not a preview)

- SQLite **migration v27** adds append-only `provider_switch_events` with immutable update/delete triggers and a unique `(job_id,attempt,to_model_id)` key. No prompts, credential data, billing secrets, or provider responses are recorded.
- The **existing** `createLlmDispatcher` writes an event only after a successful *remote LLM free-tier* switch from a primary model to another verified-allowlisted, equivalent model at the same provider; runtime-wide remote opt-in is already checked before execution. Events contain constrained account, model and provider IDs, `consent=explicit_remote_runtime`, `billing_gate=confirmed_free_allowlist`, and `status=succeeded`.
- A route preview, rejected/failed attempt, unset consent, paid-target attempt, and same-model execution are NOT recorded as successful fallback events. The event stream intentionally does not claim detailed failure history or full system coverage. **TTS/image/video fallback telemetry is not wired into this table**; the UI prominently states `switchCoverage=remote_llm_success_only`.
- Telemetry is deliberately best-effort after actual success to avoid retrying potentially billable calls due to local logging problems. Future central outbox telemetry should be engineered without changing core billing/consent gates.

## UI

`AI Models & Accounts → 6 · Giám sát quota & chuyển tài khoản`:
- User-triggered refresh; abort/unmount guard; no polling and no provider calls.
- Counters: near, exhausted, unknown, paid models; row badges; local remaining units; pointer to explicit job-scoped R0-13 approval in section 5.
- Recorded successful remote LLM switches only, with timestamp, provider and from/to IDs, runtime opt-in and gate. Empty feed says no successful events recorded (not "no switches ever").
- Fails closed on malformed server payloads; no optimistic quota or free entitlement claims.

## Out of scope / gates

No official provider balance or real billing reconciliation; no proactive notification service; no automatic fallback to paid; no switch control, no second job queue, no credential read; no Vite build/React-browser, Windows, real provider or 30–40 minute acceptance. Missing Vite is a dependency gate, not a code pass.

## Verification

`npm run test:r212` (15 tests), `npm run test:all` (673), `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control` pass offline. JSX live build blocked (`vite: not found`, exit 127).
