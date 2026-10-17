# R2-10 — Quota Transparency UX / Safe Ledger Inspector

**Date:** 2026-10-15  |  **Status:** CODE_COMPLETE_TESTED_OFFLINE

## Scope and authoritative assumptions

The R2-original task tracker after R2-09 describes remaining work as **quota UX and regression**, without a more granular approved R2-10 feature definition. This sprint deliberately implements only the *read-only, low-risk* quota UX against the existing R2-08 ledger. It does not interpret the lack of a detailed task contract as permission to modify paid authorization, reserve/reconcile rules or billing.

## What ships

`AI Models & Accounts → 2. Model & hạn mức → Sổ quota` opens a model-specific quota inspector. One authenticated, existing read-only request is made when the user opens the inspector; **Cập nhật** is an explicit user action, and switching models aborts/stops stale results. No poll or automatic provider call. One page is limited to the 20 newest internal calls.

`GET /api/provider-models/:id/quota-ledger?limit=20` is the **existing R2-08 endpoint**. R2-10 changes no route, protocol, SDK type, database schema or migration. Its response fields are subject to client-side validation before display:

- `source ∈ unknown,estimated,provider_verified` is treated as metadata, not proof of available provider quota or no-charge status.
- `limit/used/pendingUnits/remainingUnits` only show numeric values when the local ledger has a known ceiling. `remainingUnits` comes from the existing backend snapshot, so **holds including uncertain calls are subtracted**. The model list's old estimate explicitly says it does not subtract holds.
- `admitted` represents only local guard conditions, **not** external permission to call or free/paid entitlement. `billingVerified` is never inferred true in this view.
- `reserved`, `settled`, `uncertain` are the only accepted call statuses. Uncertain calls continue holding quota. Client does not expose invocation keys, arbitrary provider response, prompts, paths or credentials. The maximum displayed history size is 20 records, even if a malicious/malformed response reports more.
- The view rejects cross-model or malformed responses instead of inventing a plausible-looking balance. On fetch failure, it displays **no** numeric availability.

All R0-13 paid approvals, R2-08 token estimates, holds, job retries, and provider entitlement/consent remain unchanged. There are **no controls** to refund, settle, release, reset, sync provider, or auto-retry unknown outcomes.

## Code map

- `apps/web/src/ProviderWorkspace.jsx`: entry button for each configured model and cautious per-row language.
- `apps/web/src/QuotaLedgerPanel.jsx`: on-demand read, `AbortController`, accessible status/history UX.
- `apps/web/src/quota-ledger-view.mjs`: pure validation, bounded safe projection, source caveats and labels.
- `apps/web/src/style.css`: responsive grid and status colors.
- `apps/web/src/quota-ledger-r210.test.mjs`: 13 presentation/security tests.
- `packages/sdk/test/quota-ledger-r210.test.mjs`: 2 authenticated SDK path tests.
- `apps/api/test/quota-ux-r210.test.mjs`: 2 query/ingress safety tests.
- `packages/core/test/quota-inspection-r210.test.mjs`: 1 actual SQLite non-mutating read test.

No new SQLite migration; v26 and old checksums preserved. No new OpenAPI/SDK surface; existing generated artifacts must still match.

## Verification / limitations

R2-10 18/18 tests; project suite 642/642; `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control` pass; TypeScript JSX syntax diagnostics 0 for changed React modules. `npm run build:web` **BLOCKED** (`vite: not found`) in provided offline environment.

Not tested: real Fastify/browser pairing and Web UI, Windows, quota from Gemini/Groq/etc, payment statement reconciliation, ComfyUI/Edge/Piper/VieNeu real providers, multi-worker/30–40-minute stress. No automatic provider status, free entitlement, or live billing verification can be claimed. R2-EXT-07 smart visual router remains planned.
