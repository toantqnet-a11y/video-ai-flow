# WI-03 — AI agent handoff (2026-10-17)

**Read:** `docs/WI03_TEST_REPORT.md` → `docs/WI03_STATUS.md` → `docs/WI02_CONTRACT.md` → last section `docs/WORKLOG.md` → `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json`.

## Code and CI
- `.github/workflows/wi03-windows.yml` hosted Windows workflow. Trigger: push to `wi03/windows-verification` branch or manually; no ongoing daily executions.
- `tools/wi03-windows-integration.mjs`: reports real Windows loopback Fastify socket, port release, headless Edge/Chrome rendered React pairing DOM, and sanitized prerequisite gates. It does NOT know or log the pairing token.
- `tools/wi03-windows-integration.test.mjs`: fail-closed classifier (including non-Windows and no-browser conditions).
- `.gitattributes`: mandatory LF for generated OpenAPI/SDK assets; Windows Git autocrlf previously caused false outdated artefacts.
- Reports from successful run 39014629188 are in its `wi03-windows-integration-evidence` GitHub Actions artifact (not persisted in main git).

## Next agent
1. Do not rerun Chocolatey blindly: its FFmpeg feed failed HTTP 504. Provision a trusted pinned portable tool in user environment or independently verified mirror with hashes.
2. Before claiming render acceptance, run FI-04-04 real renderer with subtitles/music, probe H264/AAC and inspect output.
3. Run user Windows 11 Chrome/Edge authenticated Timeline editing with gestures, 120/500 scenes, then FI-04-06 long render, forced recovery and provider E2E.
4. Retain single SP-04 queue, HyperFrames 0.8.159, FFmpeg only explicit opt-in. No remote/paid calls without user consent.
5. Keep `releaseStatus=NOT_READY` until all mandatory live gates PASS.
