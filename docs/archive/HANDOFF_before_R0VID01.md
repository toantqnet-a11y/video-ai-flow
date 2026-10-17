# ContentStudio – AI Agent Handoff (CURRENT)

**2026-10-14 · Latest: R0-14 Mock Providers & CI.**  
**State:** `CODE_COMPLETE + TESTED_OFFLINE` (GitHub CI and real Windows/AI/GPU/browser **NOT accepted**).

## Reading order: do not scan everything

1. `AGENTS.md` → **this file** → `R0_Status.md` → `docs/TEST_REPORT_R014.md`.
2. Mock provider/CI details: `packages/providers/testkit/mock-providers.mjs`, `apps/api/test/mock-pipeline-r014.test.mjs`, `.github/workflows/ci.yml`, `tools/run-tests.mjs`.
3. Previous state archived at `docs/archive/HANDOFF_before_R014.md`; append-only detailed changes in `docs/WORKLOG.md`.
4. Original PRD, detailed EP01–EP13 and PO signoff are in the artifact bundle; DO NOT infer a feature was approved from mock outputs.

## What R0-14 added

- Four opt-in test-only providers `mock-llm`, `mock-tts`, `mock-image`, `mock-video`; deterministic outputs with valid local WAV/PNG/MP4 fixture, no network and no billing. Never register them automatically in the production server.
- Optional `providerIds` dependency injection on `apps/api/src/handlers.mjs`; default real provider IDs unchanged.
- Real SP-04 queue integration test exercises jobs, DAG dependency, retry, asset promotion, checksum and idempotency, plus explicit paid policy guard tests.
- Portable `tools/run-tests.mjs` for Windows/Linux: `npm test`, `npm run test:spikes:all`, `npm run test:all`.
- Linux+Windows GitHub Actions build matrix, OpenAPI/SDK checks and deliberately RED negative test control. Workflow **not yet executed** (not pushed/connected). No `package-lock.json`, so workflow currently runs `npm install`; move to `npm ci` after lockfile generation.

## Verified now (local Linux Node 22.16)

- `npm run test:all` **333/333 PASS** (187 app including six R0-14 checks + 146 Spike tests).
- `npm run check`: PASS; `npm run typecheck:sdk`: PASS.
- `npm run test:negative-control`: PASS (intentionally broken test correctly detected).
- `npm run build:web`: BLOCKED — Vite not installed; actual app/browser/HTTP/Windows/GPU or provider production verification remains pending. Do not call this complete in a product sense.
- See `docs/evidence/R014_*`, `docs/TEST_REPORT_R014.md`.

## Critical invariants (unchanged)

- Local/free first; no unsanctioned provider charges. `ProviderRegistry.invoke` is the last-mile paid/remote guard; never treat route previews or UI booleans as authority.
- Secrets only in backend Vault, never in mocks, client state, logs, queue events or source archives.
- One existing SP-04 SQLite queue. Scene asset promotion must verify fenced job/checksum and preserve frozen video config. Never rewrite old SQLite migrations.
- AI-generated video != FFmpeg image motion != static mock test MP4. Label all correctly.
- Code intent comments, worklog, task tracker and handoff must be updated after every task.

## Next task

**R0-VID-01 – AI Video capability catalog / scene preflight + UI.** Real ComfyUI/Wan inference awaits Windows/GPU. Finish R0-01 Windows launcher and R0-10 voice preview gaps as separate tasks; create `package-lock.json` when npm registry is available; then run GitHub matrix and actual Fastify/React smoke. No PO decision blocks R0-VID-01.
