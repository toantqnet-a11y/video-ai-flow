# R0 Release Readiness / Gap Closure — Test Evidence
**Date:** 2026-10-14 · Task: R0-GATE-01 · Target: Windows local-first · Executor: automated Linux container

## Honest result
**R0 P0 channel-avatar gap implemented and validated offline; RELEASE GATE STILL OPEN.** No live browser, npm-installed Fastify, Windows GPU, external TTS or real model execution has been accepted. PO previously approved deferring hardware validation; that does not convert an unexecuted test into PASS.

| Check | Command | Result | Evidence / limitation |
|---|---|---|---|
| Baseline before changes | `npm run test:all` | PASS 372/372 | `baseline_tests.log` captured separately during task |
| All tests after changes | `npm run test:all` | **PASS 378/378** | 6 added tests: 3 core, 1 route, 2 SDK |
| Generated contracts / syntax | `npm run check` | PASS | OpenAPI JSON and SDK typings regenerated |
| TypeScript SDK | `npm run typecheck:sdk` | PASS | Global TypeScript compiler present |
| CI red-test control | `npm run test:negative-control` | PASS | Test runner catches intentional failing fixture |
| React build | `npm run build:web` | **BLOCKED** | `vite: not found` (dependencies not installed) |
| Dependency download | `npm install --no-audit --no-fund --fetch-retries=0 --fetch-timeout=9000` | **BLOCKED** | npm registry DNS: `EAI_AGAIN` |
| Real Fastify smoke | `npm run test:live-http` | **BLOCKED** | `ERR_MODULE_NOT_FOUND`: Fastify not installed |
| Windows host + provider test | — | DEFERRED | PO-approved later validation |
| Hosted CI workflow | — | NOT RUN | No GitHub push/workflow execution performed |

## R0-GATE avatar functionality tested
- `GET /api/channels/:id/avatar` authenticated binary; unconfigured returns 404; no file path in response.
- `PUT /api/channels/:id/avatar` validated PNG/JPEG, base64 and 256 KiB maximum, 2048 px dimensions; unsupported SVG rejected.
- Bounded PNG zlib/CRC validation; bounded browser image stream; local private file under `/data/channel-avatars/<UUID>/`.
- Immutable SQLite migration **v12** revision history; cross-channel DB guard; optimistic `rowVersion`; duplicate identical input does not advance revision.
- File SHA-256 checked upon read; corruption or missing file fails closed. Soft-delete rejects read.
- React upload/preview component fetches through memory-only authenticated SDK, uses revoked object URL; no bearer/URL token or persistent image storage.
- Old migrations **v1–v11 left intact**; two legacy tests updated to expect additive newer migrations instead of hard-coding exactly v11.
- Stabilized an SP-VID-01 provider timeout test by allowing 650 ms so heavily loaded CI does not turn a deliberate generation timeout into a network race; adapter production logic unchanged.

## Risks / explicit follow-ups
1. **HTTP + UI P0 verification:** Real Fastify `app.inject()` smoke script has been authored as a required Linux/Windows CI step. Must execute on an npm-enabled runner and pass before R0 operational sign-off. Build React/Vite and perform browser smoke with uploaded avatar.
2. **Cross-device P0:** Validate Windows 11 startup, filesystem permissions/locking, SHA/checksum reads, security origin handling and 1-command launcher when hardware available.
3. **TTS:** Edge/Piper/VieNeu live synthesis remains unverified, although R0-10 adapter and offline tests exist.
4. **AI Video:** ComfyUI/Wan real inference and GPU/VRAM validation remain unverified; R0-VID-01 capability records are user-declared, not provider-verified.
5. **Avatar image decoder:** PNG structure, CRC and pixel stream validated; JPEG structural dimensions/signature validated, but JPEG raster decoding and visual orientation should receive browser/FFmpeg smoke when dependencies exist. Uploaded JPEG metadata is preserved on local disk.
6. **Crash cleanup:** If a process dies between writing an avatar file and committing SQLite, a bounded orphan file can remain; future EP09 storage cleanup should reconcile orphan files. Old avatar revisions are intentionally retained.

## Sign-off
- **Code complete / offline-tested:** Avatar gap and amended contract, yes.
- **R0 Ready for Engineering Continuation:** Yes — R1 can be developed without a Windows machine using mocks.
- **R0 Product Acceptance / Production Ready:** **No**, outstanding checks above.
- **PO action needed now:** None; unchanged PO agreements.
