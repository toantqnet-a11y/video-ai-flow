# ContentStudio – AI Agent Handoff (CURRENT)

**2026-10-14 · Latest task: R0-VID-01 – Video model capabilities and safe preflight.**  
**State:** `CODE_COMPLETE / TESTED_OFFLINE`; NO real ComfyUI/Wan/Windows/React/Fastify acceptance.

## Read in 4 steps (don't scan entire repo)

1. `AGENTS.md` → this file → `R0_Status.md` → `docs/TEST_REPORT_R0VID01.md`.
2. Current task: `packages/core/src/video-capabilities.mjs`, `apps/api/src/{controllers,routes}.mjs`, `apps/web/src/VideoProviderCapabilities.jsx` and `packages/contracts/src/catalog.mjs`.
3. Tests: `packages/core/test/video-capabilities-r0vid01.test.mjs`, `apps/api/test/video-capabilities-r0vid01.test.mjs`. Old R0-13 schema-version tests adapted to allow additive migrations.
4. Previous complete context: `docs/archive/HANDOFF_before_R0VID01.md`; append-only history: `docs/WORKLOG.md`; product decisions: `docs/DECISIONS.md`.

## What changed

- SQLite migration **v11**: `video_model_capabilities` stores only bounded user-declared data, FK to model ID, optimistic revision. Earlier migration SQL unchanged.
- **Read/list, save, pure preflight** of T2V/I2V modes, max duration, dimensions, FPS, GPU/VRAM hint. User declarations **never become inferred model support or verified free quota**.
- Three secure API routes with OpenAPI-generated TS SDK, UI embedded in **AI Models & Quota**; badges for local/remote/paid and blockers/warnings; Image Motion suggestion explicitly labeled *not AI video*.
- **Queue enforcement for video:** require `providerModelId`, preflight local metadata and allow only configured local ComfyUI worker. Paid/remote and T2V outside limits fail before enqueue; I2V queue blocked pending safe reference loading in R2.
- No network/provider inference or paid calls occur in preflight. Job dispatch paid permission stays in R0-13 `ProviderRegistry.invoke`.

## Tests actually run

- `npm run test:all` **350/350 PASS** (204 app + 146 spike).
- `npm run check` PASS; `npm run typecheck:sdk` PASS; JSX syntax parse (2 files) PASS.
- `npm run build:web`: **BLOCKED** (`vite: not found`). CI matrix exists but not yet executed; no live Fastify, Chrome, Windows GPU, Wan/Comfy inference test.
- Evidence: `docs/evidence/R0VID01_*.txt`.

## Critical invariants

- Local/free first; **no silent paid or external provider switch**. UI metadata and preflight do not authorize spending. Google Flow website credits ≠ guaranteed API-free quota.
- Job queue: still ONE SP-04 SQLite scheduler. Capability revision is independent of immutable video preset history. Secrets live only in Vault.
- Mock MP4 and FFmpeg Image Motion are **not** AI-generated video. Do not label preflight as a live model capability test.
- All code changes need intent comments, regression tests, updated worklog/handoff/status and migration checksum preservation.

## Next task / outstanding R0 gates

**R0-01 canonical Windows one-command bootstrap (partially developed)**, then **R0-10 real TTS preview UI**; resolve npm install/lockfile and run GitHub Windows/Linux CI + actual Fastify/React. Browser, GPU and Windows real inference acceptance remain deferred by PO. R2 must implement verified ComfyUI inference and secure I2V source-asset resolution before AI video generation is considered usable.

**PO blockers: none.**
