# R2-10 — Test Report (2026-10-15)

**Scope:** Quota Transparency / Read-only Ledger UX. **Base:** R2-09; SQLite v26 retained.

| Command | Outcome | Evidence |
| --- | --- | --- |
| `npm run test:r210` | PASS **18/18** | 13 UI/validation, 2 SDK auth, 2 API ingress, 1 core SQLite read-only |
| `npm run test:all` | PASS **642/642** | No failures; includes all prior suites/spikes |
| `npm run check` | PASS | Node syntax and generated OpenAPI/SDK current |
| `npm run typecheck:sdk` | PASS | Existing TypeScript SDK |
| `npm run test:negative-control` | PASS | Deliberate fixture regression exits nonzero |
| JSX TypeScript parser | PASS | `QuotaLedgerPanel.jsx` and `ProviderWorkspace.jsx`: 0 parse diagnostics |
| `npm run build:web` | BLOCKED | Vite not installed: `sh: 1: vite: not found` (exit 127) |

### Validation cases

- Held units reduce locally computed remaining, and a real SQLite inspector read never alters reserved/uncertain rows or used quota.
- Unknown/estimated/provider_verified source flags do not claim actual provider billing or free entitlement.
- Error/malformed data, negative units, oversized histories, cross-model responses and invalid settled calls fail closed.
- `uncertain` calls are shown as still holding quota; no operator UI refund/settle is added.
- In-memory bearer-session GET, no key in URL/body; existing request ingress limits permit only known pagination query keys.
- Past R2-01..09 functionality remains covered by entire offline suite.

### Not verified

No Fastify/browser runtime, Windows or model/provider API, GPU/native inference, production accounting, Remotion/HyperFrames render, or 30–40-minute performance. Tests operate against offline fixtures. Paid approval and quota ledger internals are not modified in R2-10.
