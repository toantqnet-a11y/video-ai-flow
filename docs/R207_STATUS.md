# ContentStudio R2-07 — Task Status

**Task:** R2-07 — Queue DAG & Recovery / Selective Scene Assets  
**Date:** 2026-10-15  
**Status:** `CODE_COMPLETE_TESTED_OFFLINE` — **19/19 new focused tests, 593/593 full tests PASS**.

## Completed

- Additive SQLite v25: `asset_dag_runs` and `asset_dag_nodes`; unchanged prior migrations.
- Durable DAG using existing SP-04 queue: voice and/or ComfyUI image → scene gate → final asset-prepared gate.
- Recompute only missing/stale requested assets, reuse healthy assets; manual image protection.
- Queue + dependencies + job intent + run ledger share **one SQLite transaction**; request-key idempotency.
- Crash/lease recovery and fencing; process-restart handoff for already-produced files.
- Explicit retry with stale-context checks and renewed consent for Edge.
- Read-only preview, run listing/status; protected API and typed SDK contract generated.
- Aggregate measured voice duration separately from estimated scene duration (no timeline modification).
- Agent handoff, decisions, worklog, contract and test report refreshed.

## Limits

Offline with fake provider outputs only. No new visual DAG console; web build lacks Vite. Windows, live services, hardware, 30–40 min and subtitle/render validation remain pending. Internal SP-04 is an at-least-once worker model; remote calls can repeat on crashes.

**Next:** R2-08 per original roadmap, while maintaining R2-EXT-01/02/03/04 feature-plan dependencies (planned, not implemented). R2-EXT-02 owns exact audio-to-frame/caption synchronization. Inspect `docs/HANDOFF.md` before editing.
