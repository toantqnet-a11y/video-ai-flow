# ContentStudio R0-02 Test Report — 2026-10-13

## Scope / evidence

**Task:** R0-02, EP09 US-9.1. Node.js **v22.16.0** / Linux sandbox. Automated results are **not** Windows or production validation.

| Check | Observed result |
|---|---|
| `npm test` — canonical core/API/web tests including 16 new migration tests | **51/51 PASS** |
| Seven historical SPIKE suites SP-01/02/03/04/05/06/VID-01 | **146/146 PASS** |
| Total separately executed automated suites | **197/197 PASS** |
| `npm run check` — API Node syntax | **PASS** |
| `npm run diagnose` | Linux Node22, FFmpeg & FFprobe available; Windows=false |
| Historical migrations v1–v4 SQL literal equality with R0-01 | **PASS** |
| Full Fastify HTTP / React/Vite browser E2E | **NOT EXECUTED** (npm dependencies unavailable) |
| Windows filesystem / backup permissions / GPU / live AI | **NOT EXECUTED** |

## Core acceptance tests

- New empty DB initializes v1–v5 and WAL/FK; no redundant backup.
- Existing v4/legacy v3 DB with channel/preset data upgrades and retains data; verified v4 snapshot contains committed rows even with a live WAL connection; applying current schema again creates no extra backup.
- Existing SP-04 queue-only DB preserves existing jobs and snapshots before domain schema initialization.
- Migration ledger checksum alteration, missing version, unknown/future version, missing required columns, unrelated unversioned DB, and FK/cross-video relation faults fail closed without migration.
- Injected v5 DDL failure rolls back its earlier trigger creation and leaves schema at v4 with backup retained; corrected schema can upgrade subsequently.
- Database v5 rejects new cross-video asset assignments at DB boundary.
- SQLite snapshot can be copied into a separate file, verified, and opened read-only to retrieve old version/data; metadata-only `inspect` and safe manual `backup` CLI tested.

## Limitations / residual risks

- Backup covers SQLite (including queued jobs), **not the whole media asset directory** or OS vault; full backup is later scope.
- No automated hot-restore. Do not overwrite the live DB or remove WAL/SHM while the app is running.
- No Windows-specific filesystem/ACL test; POSIX chmod mode tested only on Linux.
- Concurrent independent app launchers need single-instance guard; production failover/performance and browser/HTTP tests remain open.

**Status:** CODE COMPLETE + TESTED OFFLINE. **Not production accepted**.
