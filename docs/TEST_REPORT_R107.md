# R1-07 — Remote LLM & Persistent Queue: Verification Report

**Date:** 2026-10-14  ·  **Scope:** EP02 + EP04 + EP12, Gemini/Groq/OpenRouter optional LLM routes.

## Evidence executed in this environment

| Check | Result | Notes |
|---|---|---|
| `npm run test:all` | **PASS · 468/468** | 450 previous + **18** new R1-07 tests, Node 22 on Linux |
| `npm run check` | **PASS** | JS syntax including remote module; OpenAPI generated artefacts unchanged and valid |
| `npm run typecheck:sdk` | **PASS** | No public API surface changed |
| Remote protocol tests | **PASS (mocked HTTP)** | Official HTTPS destinations, auth header usage, JSON parsing/size limits, redaction |
| Model/account security tests | **PASS (mocked)** | Vault scope; disabled/relabelled provider blocked; no direct arbitrary URL |
| Free plan opt-in and quota tests | **PASS (mocked)** | Explicit operator allowance; same-model/account fallback; usage ledger |
| Paid approval and crash-risk tests | **PASS (mocked)** | Job-bound approval, budget reservation, stable invocation idempotency, locked Vault, no paid retry |
| Multi-stage R1 pipeline test | **PASS (mocked)** | Outline → Chapter → Judge → Retry using remote-model adapters |
| SQLite restart test | **PASS** | Queued chapter persists across DB + queue reopening; mock HTTP completion after restart |
| `npm run build:web` | **BLOCKED** | `vite: not found` (npm dependencies unavailable here) |
| `npm run test:live-http` | **BLOCKED** | `ERR_MODULE_NOT_FOUND` (Fastify missing) |
| Live Gemini/Groq/OpenRouter requests | **NOT RUN** | No API keys / entitlements in this environment; **zero billable invocations** |
| Windows/Browser | **NOT RUN** | PO approved deferred hardware validation |

## Main implementation

- New `apps/api/src/llm-dispatch.mjs` implements fixed HTTPS provider protocols and a server-only dispatch guard. Official endpoints as of 2026-10: Gemini `models.generateContent`, Groq and OpenRouter `chat/completions`. No custom user-defined remote endpoints invoked with credentials.
- R1-02/03/04/05 repositories gain **opt-in** `allowRemoteModels=false` by default; previous tests and local Ollama workflow retain safe defaults. Fastify may opt in only when `CONTENTSTUDIO_REMOTE_LLM_CONSENT=1`.
- Queue job payloads now **pin providerModelId and providerAccountId** for R0-13 paid approval; no client-provided approval bypass.
- Free-labeled remote accounts require exact model ID in `CONTENTSTUDIO_CONFIRMED_NO_BILLING_MODEL_IDS`. This means the operator independently checked that the account cannot be billed. An unverified editable cost badge is insufficient.
- Paid requests require a preconfigured **independently verified per-call maximum estimate** plus R0-13's explicit job/account/model approval. Budget is reserved before network request; uncertain outcomes remain reserved and no automatic paid retry is allowed.
- Free auto-fallback only among active accounts serving the exact **same provider and model name**, each with separately confirmed non-billable access; usage only after a confirmed provider response, marked estimated/unknown as originally configured.
- Reuse SP-04 queue and SQLite, plus Vault credential access. No new DB migration or second worker scheduler was introduced.

## Gaps and explicit caveats

1. **Live provider functionality is NOT verified**; provider model availability, pricing, free tier entitlements and rate policies may change.
2. Externally billed requests may cost more than a local estimate; the operator must verify limits with the provider, and R0-13 is a local enforcement layer, not an upstream billing guarantee.
3. Free callbacks that time out after upstream acceptance may be duplicated on retry. Provider-level idempotency depends on provider support. Paid callbacks are conservatively not redispatched.
4. Only simple per-account request throttling and existing SP-04 exponential retry/backoff are in place; provider-specific `Retry-After`, shared organization quota, and token input/output forecasting need further integration.
5. Quota is not described as provider-verified unless backed by trusted provider evidence. Usage is recorded only when the provider supplies a valid token total.
6. `ContentStudio` production browser/Fastify E2E remains unverified because npm dependencies are absent. Windows remains deferred by PO.

**Outcome:** R1-07 `CODE_COMPLETE_TESTED_OFFLINE`; **NOT** live provider / browser / Windows / billing acceptance.
