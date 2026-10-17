# R0-05 — API Contracts & Typed SDK — Verification Report

**Date:** 2026-10-14 · **Environment:** Linux, Node v22.16.0 · **Scope:** R0-05 offline testing.

## Implemented and verified

| Check | Actual result | Evidence |
|---|---|---|
| App tests (Core + HTTP route wrappers + React pure modules + contracts + SDK) | **95/95 PASS** | `docs/evidence/R005_app_tests.txt` |
| Spike SP-01 FFmpeg | 4/4 PASS | `docs/evidence/R005_SP-01_regression.txt` |
| SP-02 TTS | 22/22 PASS | `docs/evidence/R005_SP-02_regression.txt` |
| SP-03 Image | 35/35 PASS | `docs/evidence/R005_SP-03_regression.txt` |
| SP-04 Queue | 15/15 PASS | `docs/evidence/R005_SP-04_regression.txt` |
| SP-05 Timeline | 16/16 PASS | `docs/evidence/R005_SP-05_regression.txt` |
| SP-06 Security | 33/33 PASS | `docs/evidence/R005_SP-06_regression.txt` |
| SP-VID-01 AI Video adapter | 21/21 PASS | `docs/evidence/R005_SP-VID-01_regression.txt` |
| Source syntax + OpenAPI generated artifact drift | **PASS** | `docs/evidence/R005_check.txt` |
| TypeScript API SDK declaration compile | **PASS** | `docs/evidence/R005_types.txt` |

**Total:** 95 app + 146 Spike = **241/241 offline automated tests PASS**. R0-05 itself added **16** application tests.

**Contract-focused tests:** 35 registered HTTP operations vs catalog, OpenAPI generation, published security/CSRF and SSE, GET secret metadata boundary, allowed query parameters, typed frontend API operations, transient memory-only credentials, route traversal prevention, stable public error codes, legacy frontend compatibility, split CRLF/UTF-8 frame parsing, dedup and resume with Last-Event-ID header.

## Not verified (do not mark DONE / hardware accepted)

- `npm install` attempted and failed with DNS `EAI_AGAIN registry.npmjs.org`: see `docs/evidence/R005_npm_install.txt`. **No live Fastify HTTP/inject tests or React/Vite browser E2E** performed.
- No real Windows/DPAPI/GPU tests, ComfyUI/Wan AI video or Edge TTS live call, 35–40 minute 1080p render.
- OpenAPI JSON and TypeScript declarations are a versioned **published contract**, not evidence that Fastify's Ajv validators were wired or exercised. Full runtime JSON Schema validation is a future integration task.
- No costs incurred and no remote AI service invoked during R0-05.

**R0-05 state:** CODE_COMPLETE / TESTED_OFFLINE. **Next:** preset/video snapshot work under R0-08/R0-11 with SDK-based API additions.
