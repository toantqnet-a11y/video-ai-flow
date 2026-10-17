# R2-12 · Quota & Fallback Monitoring UI

**CODE_COMPLETE_TESTED_OFFLINE** — 2026-10-15

- Delivered: read-only provider monitoring aggregate and React dashboard; account/model status badges; near/exhausted/unknown alerts; R0-13 paid approval guidance; persistent *successful* equivalent free remote LLM switch events.
- SQLite v27 (append-only table) and all existing migrations retained.
- API catalog/OpenAPI/SDK synchronized; `GET /api/providers/monitor?limit=...` uses authenticated local API, no external quota probe.
- Tests: **15/15** focused; **673/673** full; API/typecheck/negative control PASS.
- Blocked: `npm run build:web` due missing Vite (`vite: not found`). Browser/Windows/live provider/30–40 min NOT accepted.
- Coverage caveat: fallback events only from successful real free LLM account switches; not Edge→Piper or ComfyUI, not failed attempts and not dry-run.
- **Next:** R2-13 cross-module integration/regression, then EXT-01/02/03/04/06 gates; no auto-paid provider fallback.
