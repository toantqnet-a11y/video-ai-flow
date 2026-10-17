# R0-14 – Deterministic Mock Providers & Cross-OS CI

**Date:** 2026-10-14  
**Status:** `CODE_COMPLETE + TESTED_OFFLINE`; GitHub-hosted CI **NOT EXECUTED**, Windows hardware/real AI NOT ACCEPTED.

## Scope / shipped deliverables

1. `packages/providers/testkit/mock-providers.mjs`: four opt-in offline adapters. LLM emits clearly marked mock text; TTS synthesizes a small valid **test-tone** WAV (not a voice); Image copies a committed PNG fixture; AI Video copies a verified H.264/AAC fixture (not generative video). All outputs are deterministic. No credentials, browser APIs, cloud calls or fees.
2. `packages/providers/testkit/fixtures/mock-video.mp4`: 1-second MP4 built during development with FFmpeg; committed into the source archive so CI doesn't need FFmpeg to fabricate test media.
3. `apps/api/src/handlers.mjs`: optional `providerIds` mapping is injected by tests only. Production defaults (`edge`, `comfyui`, `comfyui-video`) remain unchanged. No automatic mock registration in the live server.
4. Six test cases in `packages/providers/testkit/mock-providers.test.mjs` and `apps/api/test/mock-pipeline-r014.test.mjs`: four modalities, repeatability, no-network guard, retryable and terminal errors, abort, paid-consent enforcement, actual SQLite JobRunner DAG and asset promotion with checksum/idempotency.
5. `tools/run-tests.mjs`: explicit cross-platform `node --test` file inventory for Windows/Linux; covers application and seven Spike suites without requiring shell glob expansion.
6. `.github/workflows/ci.yml`: GitHub Actions Node 22 matrix (Ubuntu and Windows); install, application + Spikes, OpenAPI drift, SDK typecheck, deliberate failing-test detection, Vite build, Windows diagnostic smoke.
7. `tools/ci-negative-control.mjs` + `tools/fixtures/intentional-failure.test.mjs`: intentionally failing test isolated from normal discovery. Control returns success only if child test exits nonzero and emits TAP `not ok`.

## Actual local execution (Linux Node v22.16.0)

| Command | Result | Evidence |
|---|---|---|
| `npm test` | **187/187 PASS** (181 previous + 6 new) | `docs/evidence/R014_app_tests.txt` |
| `npm run test:spikes:all` / `node tools/run-tests.mjs --spikes` | **146/146 PASS** | `docs/evidence/R014_spikes.txt` |
| `npm run test:all` | **333/333 PASS** | `docs/evidence/R014_all_tests.txt` |
| `npm run check` | PASS, OpenAPI artifacts up to date | `docs/evidence/R014_contract_check.txt` |
| `npm run typecheck:sdk` | PASS | `docs/evidence/R014_types.txt` |
| `npm run test:negative-control` | PASS: RED test caught | `docs/evidence/R014_negative_control.txt` |
| `npm run build:web` | **BLOCKED**: `vite: not found` (npm dependencies not installed in isolated runtime) | `docs/evidence/R014_web_build.txt` |

No attempt to claim `npm run build:web` or live Fastify HTTP as PASS. The workflow definition was authored but **has not run on GitHub**. User does not have a Windows device for hardware acceptance; hosted CI will not establish GPU, real TTS, real image/video generation, or long-duration 1080p render suitability.

## Known risks / next checks

- **Missing `package-lock.json`**: workflow uses `npm install`; generation of lockfile with real registry access and switch to `npm ci` required for reproducible CI. Failure to install must be a RED CI result; never skip build/tests to produce a green badge.
- **CI execution pending**: push source to GitHub, inspect both OS jobs and fix any Windows-specific issues; there is no evidence from hosted runners yet.
- Real Fastify HTTP and browser E2E still not run locally; CI Vite build is a compile smoke, not browser E2E.
- Mock video is a prebuilt FFmpeg fixture; success **does not** establish Wan/ComfyUI inference or video AI correctness.
- FFmpeg/ComfyUI/Edge TTS and provider costs require separate verification before production.

**PO:** No new decision required for R0-14. Continue next with R0-VID-01 capabilities/preflight, or close remaining launcher/voice-preview and HTTP/browser gates in R0 before R1.
