# ContentStudio — R2-12 Handoff

**Current:** R2-12 `CODE_COMPLETE_TESTED_OFFLINE` (15 focused / 673 full). **Next:** R2-13 Integration Regression from original R2 plan. Extensions R2-EXT remain planned.

## Fast handoff (avoid scanning repo)

Read `AGENTS.md`, `R2_Status.md`, `docs/R212_PROVIDER_MONITOR_CONTRACT.md`, `docs/TEST_REPORT_R212.md`, tail `docs/WORKLOG.md`, and current `docs/HANDOFF.md`.

- Core: `packages/core/src/provider-monitor-r212.mjs`; migration v27 at tail `packages/core/src/db.mjs` (do not edit v1..v27 SQL after rollout).
- API: `apps/api/src/controllers.mjs`, `routes.mjs`, `request-policy.mjs`; the only written fallback telemetry comes from `apps/api/src/llm-dispatch.mjs` after **real success**.
- UI: `apps/web/src/ProviderMonitorPanel.jsx` + pure `provider-monitor-r212.mjs` composed in `ProviderWorkspace.jsx` after existing paid authorization section. No UI writes.
- Typed API: `packages/contracts/src/catalog.mjs`; generated `docs/api/openapi.json`, `packages/contracts/src/types.d.mts`, `packages/sdk/src/client.d.mts`.
- Tests: `packages/core/test/provider-monitor-r212.test.mjs`, `apps/api/test/provider-monitor-r212.test.mjs`, `apps/web/src/provider-monitor-r212.test.mjs`; `npm run test:r212`.

## Invariants

1. Quota snapshots are **local only**, include reservations/uncertain calls; unknown remains unknown. No implicit API calls, charges or false billing approval.
2. Real provider switch event ONLY if runtime switched successfully to same-model, same-provider free allowlisted account after existing consent. The event stream is not comprehensive; no synthetic fallback events.
3. No second queue; existing R0-13 paid job-bound approvals untouched, no automatic paid fallback.
4. Read-only GET is authenticated, bounded; never return credential IDs, secret strings or prompts.
5. In R2-13, benchmark against real Windows/browser/long-form before release; `vite: not found` is an OPEN gate.
6. Incremental migrations v28+, never mutate v27 schema in a future task.

## Reproduce

`npm run test:r212 && npm run test:all && npm run check && npm run typecheck:sdk && npm run test:negative-control`; `npm run build:web` currently exit 127 (missing Vite).
