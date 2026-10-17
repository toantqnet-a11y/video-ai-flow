# WI-02 · Windows bootstrap and live local runtime verification
Date: 2026-10-17. Status: CODE_COMPLETE_TESTED_OFFLINE / WINDOWS_NOT_VERIFIED.

## Goal and scope
Implement a Windows operator workflow extending WI-01 prerequisite inventory with **real Vite build** and **real TCP loopback Fastify lifecycle** evidence, without claiming browser interaction, HyperFrames MP4, local provider inference, or release approval.

### Newly added tools
- `tools/WI02-Windows-Runtime.ps1`: exactly one operator-selected phase: `-Inspect`, `-ResolveLock`, `-Install`, `-Verify`. Uses existing FI-04 lock/install procedures. No automatic dependency install during inspect or verify.
- `tools/wi02-runtime.mjs`: reports sanitized prerequisite/build/socket gates; `--run` strictly refuses a non-Windows host, missing verified workspace lock, pinned project-local HyperFrames CLI, missing dependency binaries/browser, or insufficient 20 GiB disk.
- `tools/wi02-api-child.mjs`: actual server with `startApi({listen:true})` on loopback, isolated disposable SQLite dir, sanitized allowlisted environment, IPC readiness and graceful shutdown. Parent **discards stdout/stderr**, because the API prints a one-time pairing code that must never be persisted in report/test logs.
- `probeLocalHttp`: requests `/health` (200, correct app), `/api/channels` (401, not authenticated), unknown protected API (401), `/` (200 HTML with script), and security header; verifies released port after shutdown.
- `tools/wi02-runtime.test.mjs`: focused pure policy/CLI, fail-closed, local TCP contract and strict inspect tests (simulated network handler tests are **not** production proof).

## Operator steps (Windows 11, Node >=22.13, FFmpeg/FFprobe, Chrome/Edge)
Work in a **separate copy** of the workspace, trusted network for optional resolve and install; do not use the only copy of user data.

```powershell
.\tools\WI02-Windows-Runtime.ps1 -Inspect
# Only if no lock exists; inspect/license/security review + commit result.
.\tools\WI02-Windows-Runtime.ps1 -ResolveLock
# In a separate command AFTER reviewing verified lock:
.\tools\WI02-Windows-Runtime.ps1 -Install
.\tools\WI02-Windows-Runtime.ps1 -Verify
```

If reviewed `package-lock.json` already exists, **skip `-ResolveLock`**. `-Install` uses `npm ci` and validates the exact project-local HyperFrames 0.8.159 CLI. The script never sets remote LLM consent, invokes a model, runs `npx`, or replaces HyperFrames with FFmpeg. Each phase must be an explicit operator action.

### Release boundary
`RUNTIME_VERIFIED` means *only* WI-01 prerequisites + genuine Vite build + Fastify HTTP lifecycle and same-origin frontend are verified on that host. It never means `READY` or a successful video render. FI-04-04 five-scene HyperFrames proof, FI-04-05 browser UX, FI-04-06 35-minute 1080p render, interruption/recovery, local providers, full suite and security audit must still be assessed separately.

### Security and evidence
- Report only `schemaVersion`, task, timestamp/platform, gate classifications and counts, no keys/paths/port/pairing/token.
- `--run` and `--strict` fail nonzero on prerequisites/runtime failure; the app is never started on this unsupported Linux authoring host.
- Child inherits only basic OS environment keys; no `NODE_OPTIONS`, proxy variables, cloud credentials, workflow paths or provider URLs.
- Disposable database is deleted after shutdown. User DB is not opened or migrated.
- Real production startup/cleanup is tested only when the target Windows dependencies are available; local fake fixture assertions may not be substituted.
