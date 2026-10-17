# R2-12 — Test Report · 2026-10-15

**Status:** `CODE_COMPLETE_TESTED_OFFLINE`.

| Command | Result | Notes |
|---|---|---|
| `npm run test:r212` | **15/15 PASS** | Domain SQLite, real dispatcher mock fallback and guarded inbound API, view model |
| `npm run test:all` | **673/673 PASS** | All app+spike deterministic tests |
| `npm run check` | PASS | Syntax and generated API/OpenAPI drift check |
| `npm run typecheck:sdk` | PASS | Generated SDK definitions compile |
| `npm run test:negative-control` | PASS | Expected deliberate-regression nonzero behavior |
| `npm run build:web` | **BLOCKED (exit 127)** | `vite: not found` — JS bundle/UI not built |

## Verified

- Migrations v26→v27; immutable switch feed and unique retry dedupe; table guard on reopen.
- Quota warnings respect `used+reserved/uncertain` and a locally declared ceiling.
- Unknown source remains unknown, provider billing never asserted; paid models display job-bound approval requirement.
- Genuine primary 429 + equivalent free-account fallback with fake HTTP generates exactly one success event; preflight and no remote opt-in are non-billable and produce zero events.
- Data view drops extraneous fields; arbitrary URL queries/secrets rejected by request-policy.
- Existing historical migration tests were generalized to >=26 and pre-v27 simulation now removes v27 table before re-upgrade; no historical migration SQL was edited.

## Not performed

No actual remote provider invocation, account quota/billing verification, GPU/ComfyUI, voice model, Windows, browser or long-video tests; Vite not installed. Provider fallback telemetry only on completed equivalent free-LLM account switch; TTS and failed switch statuses are not supported.

## Evidence

Local test output can be reproduced with package scripts. Results below are from running the scripts on Node 22.16 with the supplied workspace, not from CI/Windows.
