# FI-03 · Unblock and evidence hardening — 2026-10-16

## Actual fixes delivered

1. **Windows launcher bug fixed:** `verifyWorkspaceLock()` returns `.status`, but the production launcher incorrectly passed `.lock` to `dependencyInstallPlan()`. A perfectly valid lock would therefore always fail to start the product. Added `planLauncherInstall()` with fail-closed tests for valid, invalid, missing and preinstalled paths.
2. **Renderer process secret isolation:** HyperFrames previously inherited *all* backend environment variables (including possibly cloud model credentials). `sanitizedRendererEnv()` now allowlists Windows/Linux Chromium necessities and disables telemetry/update hints; rejects proxy/AI credentials. Unit-tested on Linux; still requires real Windows Chrome/HyperFrames run to verify compatibility.
3. **Windows staged setup tool:** `tools/FI03-Windows-Setup.ps1` requires an explicit **separate** `-ResolveLock`, `-Install`, or `-Verify` step. `-ResolveLock` only creates npm lock metadata on a networked machine; inspect and commit that lock before `-Install` which exclusively uses `npm ci`. `-Verify` performs full tests, SDK, API, build, live HTTP, genuine HyperFrames media and `npm audit`. No paid provider API and no automatic fallback.
4. **Low-cost 35-minute media control:** Actual FFmpeg H.264/AAC MP4 created with 63,000 frames and a 2,100-second duration (640×360, static picture, synthetic sine audio). The controlled process used ~54,672 KiB max RSS and 24.78 s wall time on this Linux host. Check SHA/FFprobe evidence `docs/evidence/FI03_ffmpeg_35min_360p_observed.json`. Reusable opt-in `npm run acceptance:fi03:ffmpeg35`. **Not a HyperFrames or real-project 1080p long-render result.**
5. **Test isolation option:** Added `--concurrency=1|2|4|8` to existing test runner, plus non-retrying `test:all:batched` test isolation for investigating nondeterministic hangs; NEVER reports an incomplete suite as PASS.

## Actual verification on this host

- BEFORE code changes, extracted FI-02 workspace test suite: **859 / 859 PASS**, exit 0 (log retained externally).
- New FI-03 focused: **6/6 PASS**; API artifact check PASS; SDK typecheck PASS; negative control PASS.
- FI-02 gate audit freshly executed after changes: **8 PASS / 12 BLOCKED / 0 FAIL**. Release NOT_READY.
- After code changes, full direct suite stalled near TAP #847; serial stalled near #506; batched runner got 11 PASS batches then stalled at next heavy FFmpeg group. **NO fresh 865/865 claim**. Intermittent test stalls remain to be investigated on a controlled host.
- npm registry `EAI_AGAIN`: no genuine `package-lock.json`; cannot install Vite, Fastify or HyperFrames here. This is a machine/network limitation, NOT fixed by inventing a lockfile.

## Required external acceptance (unresolved)

| Gate | Evidence needed | Current |
| --- | --- | --- |
| `package-lock.json` | Resolve online, human review, `npm ci` | BLOCKED network DNS |
| Frontend and HTTP | Vite build, Fastify live HTTP, browser interaction | BLOCKED deps |
| HyperFrames + subtitle + music | Genuine locally pinned CLI produces MP4; FFprobe and human inspection | BLOCKED CLI |
| Windows usability | Test actual drag/seek/subtitle editing, shutdown/start | BLOCKED OS |
| Production long video | >=35-minute HyperFrames 1080p real timeline; CPU/RAM/GPU/disk/time | BLOCKED; only 360p synthetic FFmpeg control |
| Recovery | Deliberate interruption of production render and restart, verify cache/output | BLOCKED host |
| Local LLM/TTS/image providers | Human consent, configured real providers, successful E2E | BLOCKED hardware/provider |
| Dependency/security audit | `npm audit`, browser/security review, Windows secret isolation | BLOCKED online/host |

**Release verdict: NOT_READY.** The key fixes are applied, but unsupported environments cannot be represented as passing release gates.
