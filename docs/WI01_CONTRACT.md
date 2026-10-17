# WI-01 · Windows Integration readiness inventory — 2026-10-17

## Scope
Code-only, read-only local Windows **preflight**, on top of FI-04-10 workspace. It is NOT FI-04-10 release acceptance. There is no assumption that any physical Windows machine is currently available.

Implemented:
- `tools/wi01-windows-preflight.mjs` reports 12 current machine prerequisite gates with fixed, actionable remediation identifiers. The pure `classifyWindowsPreflight` supports offline policy regressions; actual runtime is always taken from process.platform, file metadata, and local binary exit status.
- Rejects inconsistent/invalid lock with `FAIL` rather than suppressing it. Reports `BLOCKED` for unreviewed lock, missing Vite/Fastify, missing pinned HyperFrames project-local CLI, non-Windows machine, absent browser or insufficient disk.
- Checks locally available FFmpeg, FFprobe, Node >=22.13, architecture, conservative **20 GiB** free disk estimate; browser file presence is NOT browser interaction evidence.
- `--inspect` prints a redacted status and optionally writes only under `docs/evidence`; `--strict` exits nonzero if *any* prerequisite is blocked.
- `tools/WI01-Windows-Preflight.ps1` exposes Windows `-Inspect` and `-Strict` wrapper without silent `npm install` or AI calls.
- Preserved canonical 14 AI-video tasks, 10 FI-04 tasks, plus `WI-01` in the generated master backlog (67 unique IDs).

## Runbook (on user-authorized Windows 11 device)

```powershell
# In a COPY of the project; read-only inspection, even if the lock is absent:
.\tools\WI01-Windows-Preflight.ps1 -Inspect

# Only if missing, on a trusted network, generate then REVIEW and commit lock:
.\tools\FI04-Windows-Setup.ps1 -ResolveLock
# Review package-lock.json, dependencies, licenses and integrity; commit lock.
.\tools\FI04-Windows-Setup.ps1 -Install
.\tools\WI01-Windows-Preflight.ps1 -Strict

# After prerequisite PASS, separately run actual runtime and rendering acceptance:
.\tools\FI04-Windows-Setup.ps1 -Verify
.\tools\FI04-Hyperframes-Acceptance.ps1 -Run
# Browser, true 35-minute 1080p HyperFrames and physical restart remain manual.
```

Do not run `-ResolveLock` if a lock exists. Do not work on the only copy of a project. No command auto-pays for inference, enables a cloud provider, installs floating dependencies, asserts visual quality or makes a release decision.

## Evidence boundary
`PREREQUISITES_OK` means **only** that preflight prerequisites appear installed on this machine. It is NOT `READY`, `RELEASE_PASS`, browser UX proof, model inference evidence or an actual HyperFrames long output. The preflight always sets `operatorAcceptanceStatus: NOT_RUN` and `releaseStatus: NOT_READY`. Release gate must be separately reviewed after all genuine test media, app UX and security gates.
