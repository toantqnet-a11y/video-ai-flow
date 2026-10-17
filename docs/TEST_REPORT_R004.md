# R0-04 — System Diagnostics | Test evidence

**Date:** 2026-10-14 · **Status:** CODE_COMPLETE / TESTED_OFFLINE; PENDING_LIVE_FASTIFY_BROWSER_WINDOWS.

## Scope

- Backend: sanitized diagnostics evaluator/service (`apps/api/src/diagnostics.mjs`); 2 authenticated REST routes; CPU/RAM, disk, SQLite WAL, FFmpeg/FFprobe+encoders, NVIDIA presence; provider registration status with optional literal-loopback ComfyUI status ping; 30s cache, in-flight deduplication.
- Frontend: React health dashboard, readiness KPIs, check cards, status guidance, refresh button, loading/error handling and responsive CSS.
- Security: process timeouts/maxBuffer, no shell, no raw errors, paths, prompt text, provider URLs or API credentials returned; global session+CSRF+Origin protections reused. No remote AI calls / no paid use.

## Commands actually run (Linux Node v22.16.0)

| Command | Result | Evidence |
|---|---|---|
| `npm test` | **79/79 PASS**, including **21 new tests** (19 API + 2 presentation helpers) | `docs/evidence/R004_app_tests.txt` |
| `cd spikes/SP-01 && npm test` | 4/4 PASS | `docs/evidence/R004_SP-01_regression.txt` |
| `cd spikes/SP-02 && npm test` | 22/22 PASS | `docs/evidence/R004_SP-02_regression.txt` |
| `cd spikes/SP-03 && npm test` | 35/35 PASS | `docs/evidence/R004_SP-03_regression.txt` |
| `cd spikes/SP-04 && npm test` | 15/15 PASS | `docs/evidence/R004_SP-04_regression.txt` |
| `cd spikes/SP-05 && npm test` | 16/16 PASS | `docs/evidence/R004_SP-05_regression.txt` |
| `cd spikes/SP-06 && npm test` | 33/33 PASS | `docs/evidence/R004_SP-06_regression.txt` |
| `cd spikes/SP-VID-01 && npm test` | 21/21 PASS | `docs/evidence/R004_SP-VID-01_regression.txt` |
| `npm run check` | PASS | API/source syntax (no JSX build implied) |
| `npm run diagnose:r004` | PASS | `docs/evidence/R004_local_diagnostics.json` (sanitized) |

**Automated total:** 79 integrated app tests + 146 SPIKE tests = **225/225 PASS**.

### Local smoke (this Linux sandbox; NOT the PO's Windows machine)

- FFmpeg and FFprobe were detected. H.264/libx264 and AAC encoder entries present. This proves tool discovery only, not a successful 35-minute 1080p render.
- SQLite temp database opened in WAL mode. CPU, RAM and disk space sampled without exposing paths.
- No NVIDIA GPU detected, no local ComfyUI workflow configured; no media inference attempted.
- The smoke runner opens and deletes its own temporary SQLite file; it does not open project data, read the API Vault or contact network services.

## Unit / integration coverage

- Basic media tools present/missing; missing encoder; low storage; unavailable SQLite; GPU absent; Windows not verified.
- No credential/raw response leakage from provider metadata or thrown command errors.
- Cache TTL, refresh, and concurrent deduplication; unconfigured ComfyUI causes zero network requests.
- Local-only ComfyUI endpoint validation; redirects rejected; endpoint responding does *not* imply inference readiness.
- Mock Fastify route registration for authenticated GET/POST; malformed refresh body rejected.
- Security global hook denies unauthenticated diagnostics; UI descriptions use allowlisted codes only.

## Remaining validations / limits

1. **Fastify real HTTP/inject tests** have not run because npm dependencies were not installed in this working sandbox. Mock route integration is not equivalent to live HTTP tests.
2. **React/Vite real browser**: JSX code has been implemented but not built in a browser with npm-installed dependencies. Status badges and responsive layout require browser QA.
3. **Windows machine**: PO deferred. GPU/VRAM inventory, ACL/DPAPI, drives, FFmpeg hardware encoder benchmark and user OS settings remain unverified.
4. **Live AI services**: no real Edge TTS, Cloudflare, ComfyUI/Wan or cloud provider call was made. Endpoint health ≠ model execution.
5. **Full 30–40-minute render** remains a separate R3 acceptance criterion. The readiness flag is a prerequisite check, not proof of long-form output or speed.
6. On unusually large project DBs, additional integrity scans belong to the explicit R0-02 maintenance command; dashboard uses cheap SQLite connection/WAL probes only.

**Overall:** R0-04 is ready for code review/integration continuation, not Windows/browser/provider production acceptance. No new PO decision required.
