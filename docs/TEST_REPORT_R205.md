# R2-05 Test Report — Scene Image Generation

**Date:** 2026-10-15. **Status:** `CODE_COMPLETE_TESTED_OFFLINE`; production/browser/Windows/hardware gates still open.

| Executed | Result | Evidence |
|---|---|---|
| `npm run test:r205` | **20/20 PASS** | 13 core + 4 mock HTTP ComfyUI + 3 SDK tests |
| `npm run test:all` | **560/560 PASS**, 0 fail/skip | Whole monorepo including prior R0–R2 and spike checks |
| `npm run check` | **PASS** | Node code checks + generated OpenAPI agreement |
| `npm run typecheck:sdk` | **PASS** | strict TypeScript SDK typecheck |
| TS 5.8 JSX parse | **0 diagnostics** | SceneImageWorkspace.jsx, main.jsx and web API facade |
| `npm run build:web` | **BLOCKED**, exit 127 | `vite: not found` (node_modules absent in this runtime) |

### Verified offline paths

- A real **HTTP server** on literal `127.0.0.1` mimics ComfyUI `GET /system_stats` / `POST /prompt` / `GET /history` / `GET /view`; the SP-03 adapter fetches real valid PNG fixture bytes, and the actual image decoder verifies pixels/dimensions before scene promotion. Fake JSON and HTTP redirect to external host are rejected. Workflow file fingerprint change blocks worker calls.
- Validation fails closed without a configured API workflow, without a committed scene prompt, with an incorrect media type, forged remote provider or invalid seed/size; no implicit paid API fallback.
- Idempotent queue requests, current-job pointer, stale queue job before dispatch, prompt edit after synthesis but before promotion, update revision lock, manual imported image and previous revision selection; multiple **sequential successful image generations** become distinct immutable image assets. Cached requests preserve job/intent to maintain consistent status.
- Image import checks actual binary signature, MIME consistency and FFmpeg decode. Authenticated SDK image GET requires pairing, sends bearer only in header, refuses HTML/mismatched MIME/signature/path traversal and cancels oversized streams.
- v23 migration/backfill tested on simulated v22 ledger with previously selected manual image; previous audio intent records/tables remain available. Security contract generation stays deterministic.

### NOT verified (do not claim ready)

- Actual ComfyUI diffusion image output, installed checkpoint/custom nodes, target GPU throughput/VRAM, image quality or license; mock HTTP is **not** real inference.
- Fastify runtime and React/Vite browser build/E2E, Windows launcher/integration, 30–40-minute continuous generation, multi-process concurrency/load, power consumption.
- Complete R2-06 global artifact checksum/index/recovery/orphan cleanup and R2-07 DAG-based crash recovery. Existing SP-04 queue remains the sole worker.

**Next:** R2-06 asset hash/revision registry hardening, selective invalidation, reconciliation and crash-safety with existing committed media.
