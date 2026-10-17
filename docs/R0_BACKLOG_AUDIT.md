# ContentStudio — R0 backlog reconciliation (2026-10-14)

Source of truth: `Video_AI_Flow_Development_Tasks_v3.csv` (planning) plus actual code and test evidence. **Do not treat a task as production-accepted because unit tests pass.**

| Canonical backlog task | Assessment after R0-06 | Specific evidence / gap |
|---|---|---|
| R0-01 · Monorepo / Windows one-command | CODE_COMPLETE / TESTED_OFFLINE | One-command startup, dependency/build checks, lock+health+browser and 10 new tests verified on Linux; Windows shell/app runtime is pending. Earlier Channel UI belongs to canonical R0-09/10. |
| R0-02 · DB/migrations | OFFLINE PASS | SQLite WAL, schema migration v1–v9, backup smoke tests; Windows/file ACL pending. |
| R0-03 · Vault security | OFFLINE PASS | Auth/CSRF/localhost/key vault offline; DPAPI and real Fastify HTTP pending. |
| R0-04 · Diagnostics | OFFLINE PASS | Sanitized local health checks; GPU/Windows/browser pending. |
| R0-05 · API/SDK | OFFLINE PASS | Generated OpenAPI/TS, SDK SSE; live Fastify/browser pending. |
| **R0-06 · Job persistence + SSE** | **OFFLINE PASS (this task)** | One SP-04 queue, redacted job read model, filtered list, per-job transitions, durable replay and bounded SSE. See `docs/TEST_REPORT_R006.md`. |
| R0-07 · Provider/account registry | OFFLINE PASS, execution incomplete | Catalog/config/readiness, not full AI provider run/fallback; linked to R0-13 and R2. |
| R0-08 · Preset revision | OFFLINE PASS | Immutable revisions, compare UI; browser verification pending. |
| R0-09 · Channel CRUD UI | OFFLINE PASS | Implemented under project task R0-01 Channel Workspace; canonical backlog uses R0-09. Avatar upload pending. |
| R0-10 · Content/Voice/Media channel UI | PARTIAL | Channel settings UI exists; real TTS voice preview pending. |
| R0-11 · Video configuration snapshot | OFFLINE PASS | Immutable origin, safe overrides, no auto-regeneration. |
| R0-12 · Video library | OFFLINE PASS | Channel-scoped create/search/resume/clone/archive/restore; browser validation pending. |
| **R0-13 · Paid policy + approval guard** | **OFFLINE PASS, runtime integration partial** | SQLite v10 explicit job-scoped approvals, conservative budget reservations, durable audit, typed consent UI and trusted invocation gate. No live paid adapter or R2 wait/resume yet. |
| **R0-14 · Mock providers & CI** | **OFFLINE PASS; HOSTED CI PENDING** | Four test-only provider adapters, SQLite mock pipeline, Ubuntu/Windows workflow defined; 333/333 local Node tests pass. GitHub workflow, dependency install, Vite browser/build and target Windows/GPU checks remain unverified. |
| **R0-VID-01 · Video provider capabilities & UI** | **PARTIAL** | SP-VID-01 local ComfyUI adapter exists; provider metadata and Media settings exist, but live capability/preflight, per-video controls and rendered AI video not verified. |

## Release gate

R0 is **NOT** signed off. Before closing R0, deliver R0-14 and reconcile the R0-13 live paid invocation integration during R2; reconcile R0-VID-01 scope, complete R0-10 voice preview or explicitly defer via PO, and perform Fastify/React integration in a runner with dependencies. Windows/GPU acceptance remains deferred by PO and must remain visible as a separate gate.

## Dependency order (recommended)

1. R0-13: implemented and offline tested; still requires R2 live adapter/job wait-resume integration.
2. R0-14: local code + deterministic tests completed; **GitHub CI has not run**, and missing dependencies must produce a visibly RED job. Generate package-lock, switch to `npm ci`, verify both runner OS jobs before acceptance.
3. R0-VID-01: capability metadata and UI configuration/preflight; real ComfyUI/Wan inference pending hardware.
4. R0-10 unfinished avatar/voice preview as P1, contingent on provider verification; document if explicitly deferred.
5. Continue R1-01 only when R0 contract/security gates are covered, even if Windows/GPU E2E is deferred.

**PO decisions:** No additional PO question is required to start R0-14. The approved default remains local/free only, with notice + explicit authorization before paid calls.

## 2026-10-14 — R0-VID-01 reconciliation
- **CODE_COMPLETE + TESTED_OFFLINE:** safe video model capability metadata (SQLite v11), UI in AI Models, dry-run scene preflight, cost/local badges, server-enforced queue guard for configured local T2V. **17 tests added**, total 350/350 PASS.
- **NOT VERIFIED / follow-up R2:** real ComfyUI/Wan GPU inference, image-to-video reference loading, remote paid Seedance/Veo dispatch, automatic Hybrid fallback and provider-reported free quotas. A passing metadata preflight is not a model execution guarantee.
- Remaining R0 gaps include Windows validation of R0-01 launcher, channel real TTS voice preview R0-10, actual Fastify/browser run, Windows-hosted CI and lockfile.

**2026-10-14 R0-01 update:** CODE_COMPLETE/TESTED_OFFLINE, 360/360 Node tests pass; no actual Windows PowerShell or React/Fastify live validation. Next R0-10.
