# R0-VID-01 — AI Video Capability Catalog & Preflight

**Date:** 2026-10-14 · **Epic:** EP13 US-13.1/13.2 · **Status:** CODE_COMPLETE / TESTED_OFFLINE, **NOT hardware/provider accepted**.

## Delivered

- SQLite **migration v11** adds `video_model_capabilities` with FK to `provider_models`, revision and user-declared JSON limits. Old migrations remain unchanged.
- New core service `packages/core/src/video-capabilities.mjs`: strict bounds validation; declared T2V/I2V support; max clip seconds, size, FPS, GPU/VRAM hint; optimistic locking; safe metadata listing and pure preflight.
- Authenticated APIs: `GET /api/video-providers/capabilities`, `PUT /api/provider-models/:id/video-capabilities`, `POST /api/video-providers/preflight`, generated OpenAPI 3.1 & TypeScript SDK.
- UI `apps/web/src/VideoProviderCapabilities.jsx` inside AI Models & Quota: select configured video model, show local/remote/paid badges, edit capability limits, preflight a scene and receive localized blockers/warnings; explicit non-generative Image Motion suggestion.
- Video **enqueue boundary** now requires a selected video model, passes the same capability checks, and rejects remote/paid or unconfigured non-ComfyUI worker targets. The active job handler remains local ComfyUI and does not auto-switch to paid/remote. I2V raw bytes via HTTP are rejected pending secure server-side reference loading in R2.
- Stable error codes and explicit distinction between user metadata, quota estimates, actual inference verification and provider billing approval.

## Verified in this environment

| Evidence | Result |
|---|---|
| `npm run test:all` | **350/350 PASS** (204 application + 146 Spike regression) |
| R0-VID-01 new automated tests | **17/17 PASS** (core persistence, preflight, paid policy, routes/queue) |
| `npm run check` | PASS including OpenAPI drift |
| `npm run typecheck:sdk` | PASS |
| TypeScript JSX syntax parsing (2 files) | PASS |
| `npm run build:web` | **BLOCKED** (`vite: not found`; npm dependencies absent) |
| Live Fastify HTTP / Windows CI / GPU / ComfyUI/Wan generation | **NOT RUN** |

Artifacts: `docs/evidence/R0VID01_*.txt`.

## Limits / release gate

- Capability entries are **user-declared** and **never evidence of working models**, official free API credit, quotas or actual GPU capacity. A passing preflight means metadata limits match only.
- Runtime ComfyUI workflow must be set explicitly; real T2V/I2V cannot be accepted without provider/GPU tests. I2V job submission depends on secure local image asset references (R2).
- Paid API approval is scoped to an actual frozen queue job at dispatch (R0-13). The preflight UI does not grant it. No Seedance/Google Flow/Veo remote generation is implemented here.
- `image_motion` is a **suggestion only**, not silently auto-generated; automated Hybrid fallback is an R2 workflow behavior requiring controlled queue integration.
- A green preflight does not guarantee worker availability. Before production, validate ComfyUI workflow, Windows GPU/VRAM and browser/Fastify HTTP tests.

**PO decisions:** none. Approved Hybrid default/free-local first remains unchanged.
