# ContentStudio — Agent Handoff (R2-10)

**Latest:** R2-10 Quota Transparency UX (**18/18 focused, 642/642 offline**). **Next:** R2-11 per original roadmap. Web build blocked by absent `vite`, not by verified React build failure.

## Read first

1. `AGENTS.md`, `R2_Status.md`, `docs/R210_STATUS.md`, `docs/R210_QUOTA_UX_CONTRACT.md`, `docs/TEST_REPORT_R210.md`, last `docs/WORKLOG.md` entry.
2. Web: `apps/web/src/{ProviderWorkspace.jsx,QuotaLedgerPanel.jsx,quota-ledger-view.mjs}`. Tests `apps/web/src/quota-ledger-r210.test.mjs`, `packages/sdk/test/quota-ledger-r210.test.mjs`, `apps/api/test/quota-ux-r210.test.mjs`, `packages/core/test/quota-inspection-r210.test.mjs`.
3. Existing source of truth: `packages/core/src/quota-ledger-r208.mjs` and v26 in `packages/core/src/db.mjs`. API `GET /api/provider-models/:id/quota-ledger?limit=20` already exists from R2-08.
4. Historical handoff: `docs/HANDOFF_R209.md`; extension backlog `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json`.

## Hard invariants

- Local-first; one SP-04 job queue; SQLite migrations strictly append-only after v26.
- No silent paid requests; R0-13 job-scoped approval and R2-08 local quota holds remain independent and unchanged.
- R2-10 is **read-only**: no provider polling, no refund/settle/reset, no release of uncertain holds, no new public write endpoint, no secret/prompt paths in the UI.
- `provider_verified` field is not financial reconciliation. `admitted` does not grant remote/free entitlement. Unknown cap is not zero nor infinite; shown as unknown.
- Real provider/browser/Windows/30–40min/Remotion/HyperFrames testing remains open.

## Reproduce

`npm run test:r210 && npm run test:all && npm run check && npm run typecheck:sdk && npm run test:negative-control`.
`npm run build:web` requires installing Vite dependencies; previously exit 127. JSX syntax verified with installed TypeScript `createSourceFile(... ScriptKind.JSX)`.

## Next

For R2-11, check the authoritative original task definition. The available tracker only calls remaining items `quota UX, regression`; avoid billing/backend policy changes based on an assumed title. Track any uncertainty explicitly. Preserve AGENTS/HANDOFF/WORKLOG updates and comments explaining intent.
