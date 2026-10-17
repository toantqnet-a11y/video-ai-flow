# R0-01 Test Report — Channel Workspace

**Date:** 2026-10-13 · **Runtime:** Linux, Node 22.16.0 · **Result:** `CODE_COMPLETE + TESTED_OFFLINE`

## Executed

- `npm test`: **35/35 PASS**. Includes ARC-01 regression and 13 additional tests for channel lifecycle, API handler routes, prompt composer/form, migration v3 → v4, idempotency and queue block rules.
- `npm run check`: PASS (Fastify-side JS syntax).
- Seven spike `npm test` suites: SP-01 4, SP-02 22, SP-03 35, SP-04 15, SP-05 16, SP-06 33, SP-VID-01 21 = **146/146 PASS**.
- React JSX `main.jsx` and `ChannelWorkspace.jsx` parsed with installed TypeScript syntax parser: **0 parse diagnostics**. This checks syntax only, NOT React rendering.
- `npm install --ignore-scripts --prefer-offline --fetch-retries=0` failed: registry DNS `EAI_AGAIN`; no Vite build, React browser E2E, or live Fastify HTTP verification possible.

## Key acceptance coverage

- Channels can be created idempotently; repeated key + changed payload returns 409.
- Immutable preset history, save same preset no extra version, videos keep creation-time snapshot.
- Search/status filter pure functions, responsive UI source written.
- Archive/soft-delete never permanently remove videos; restoration after restart is tested.
- Running/pending job blocks archive and soft-delete.
- Stale version returns conflict; unknown nested preset keys and paid/remote booleans rejected.
- 16:9, 9:16, 1:1 render pair validation.

## Remaining acceptance (do not claim complete)

- Browser click/keyboard/viewport E2E and Fastify real network pairing flow (npm unavailable).
- Windows filesystem/security checks.
- Upload channel avatar/character photo with safe streaming, and genuine TTS voice preview.
- Provider limits capability checks and dedicated paid approval workflow.
- Multi-process contention/versioning stress tests to validate optimistic locking at production scale.
