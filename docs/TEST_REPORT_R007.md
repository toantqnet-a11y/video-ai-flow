# ContentStudio — R0-07 Test Report

**Task:** R0-07 AI Provider / Account / Model Registry (EP02). **Date:** 2026-10-14.  
**Status:** `CODE_COMPLETE + AUTOMATED_TESTS_PASS / NOT_PRODUCTION_VERIFIED`.

## Verified on this runner (Node 22, Linux)

- **Application Node tests: 143/143 PASS** (`npm test`). Prior baseline was 123; **20 new tests** cover provider repository, HTTP route adapters, local-only diagnostics and secret-in-use guard.
- **Prior spike regression suites: 146/146 PASS** across SP-01 (4), SP-02 (22), SP-03 (35), SP-04 (15), SP-05 (16), SP-06 (33), SP-VID-01 (21).
- **Combined:** 289/289 automated tests passed. These are separate test commands, NOT real provider calls.
- `npm run check`: PASS (syntax, OpenAPI drift); `npm run typecheck:sdk`: PASS.
- TypeScript compiler JSX syntax parsing of new `ProviderWorkspace.jsx` and changed `main.jsx`: zero diagnostics.
- SQLite migration v7→v8: preserved existing records and produced `.pre-v8-` snapshot; restart persistence PASS.
- Disabled/stale-version, duplicate model, quota estimation, idempotent usage, remote consent, paid gate, credential-provider mismatch, unsafe endpoint and local-only probe tests PASS.

## What the tests DO NOT prove

- React/Vite build and interactive browser UX: **not run** (dependencies unavailable locally).
- Real Fastify HTTP injection/live server: **not run** (Fastify dependency unavailable).
- Actual remote AI key validity, latest free-tier quota, paid account balance or pricing: **unknown**.
- GPU inference, Windows storage/OS Credential Manager, actual Edge TTS/ComfyUI live: **deferred** per PO.
- Live fallback across accounts / provider-specific API execution: **NOT implemented** in R0-07. The new route preview is dry-run only; execution will be integrated with R1/R2 and job queue and preserve cost gates.
- Local readiness probe can verify known Ollama/ComfyUI endpoint reachability only; it cannot certify model inference.

## Repeat commands

```bash
npm test
npm run check
npm run typecheck:sdk
for x in SP-01 SP-02 SP-03 SP-04 SP-05 SP-06 SP-VID-01; do (cd "spikes/$x" && npm test); done
```

**Result classification:** Offline code/test complete; pending real-runtime and provider/hardware acceptance.
