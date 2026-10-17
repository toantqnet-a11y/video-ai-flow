# FI-04 Handoff — 17/10/2026

Start here: `docs/FI04_STATUS.md` → `docs/FI04_TEST_REPORT.md` → `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json` → tail/head of `docs/WORKLOG.md`. The initial FI-03 archive remains immutable; this workspace includes only additive FI-04 work.

## Code changes
- `tools/fi04-test-control.mjs` + `tools/run-tests.mjs` + `tools/run-tests-batched.mjs`: enforce per-test timeout, whole-run watchdog, full TAP completion, lower test concurrency, process-tree kill, no automatic retries. Confirm running on CI/Windows; do not claim root cause of historical FI-03 intermittent FFmpeg hangs solved.
- `tools/fi04-runtime-gates.mjs`: read-only offline `--inspect`, explicit `--verify` with real Vite build/Fastify smoke requiring valid lock + installed deps. Strict missing dependency returns nonzero; report contains no secrets or local paths.
- `tools/FI04-Windows-Setup.ps1`: wrapper to staged FI-03 ResolveLock/Install/Verify, with extra FI-04 focused tests, backlog drift, runtime evidence. NEVER skip operator review/commit of package-lock.
- `tools/fi04-backlog.mjs` + `tools/fi04-merge-backlog.mjs`: strict deterministic 14-ID EP13 extraction, guards for duplicates and drift, preserve historical 42-task FI-02 entries verbatim, 3 FI-04 task items. Explicit partial status for existing SP-VID-01 and R0-VID-01.
- `docs/reference/VIDEO_AI_FLOW_EXECUTION_PLAN_V3.md` is the source roadmap snapshot. `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json` is generated; always rerun generation + drift tests after edits.
- No SQLite schema, queue, payment policy, providers, or render engine changed. HyperFrames stays pinned `0.8.159`.

## Next operator sequence
1. On trusted networked Windows 11, resolve lock, review SHA/integrity/dependency versions/usage licenses, commit; `npm ci` only after review.
2. Run `FI04-Windows-Setup.ps1 -Verify`, preserve redacted failure logs and evidence. Vite/Fastify real build cannot be checked on current offline host; DO NOT mark FI04-02/FI04-03 accepted until commands run successfully.
3. Repeat full suite to assess intermittent hang, especially video FFmpeg tests. Never suppress a failing test to gain green.
4. Continue `FI-04-04` genuine local HyperFrames render + actual 35-min/Windows/browser/live providers and security gates; avoid paid calls without consent.

FI-04-04 update (2026-10-17): new five-scene SP-04 queued acceptance harness and project-local CLI hardening implemented; real renderer blocked on missing verified lock and runtime; consolidated backlog now 60 IDs. See `docs/FI0404_HANDOFF.md`.
