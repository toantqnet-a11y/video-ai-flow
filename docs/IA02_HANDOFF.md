# IA-02 Agent Handoff — 2026-10-16

**READ FIRST:** `docs/IA02_STATUS.md` → `docs/IA02_ACCEPTANCE_PLAN.md` → `docs/evidence/IA02_gates.json`. No repository-wide scan needed.

**Current state:** HyperFrames SELECTED as local primary, but **REAL HYPERFRAMES MP4 NOT RUN**. Acceptance runner on Linux reported **5 PASS, 11 BLOCKED**, release `NOT_READY`; 751/751 regression PASS. FFmpeg produced a distinct five-scene control clip (429 exact frames). Do not count it as a HyperFrames video or a release pass.

**Changed files:** `packages/core/src/render-hyperframes.mjs` (root `data-start=0`/`data-no-timeline`), `packages/core/test/render-hyperframes-policy.test.mjs` (contract assertion), `tools/ia02-{acceptance,hyperframes-acceptance}.mjs`, `tools/ia02-gates.test.mjs`, root `package.json`, `docs/IA02_{STATUS,TEST_REPORT,ACCEPTANCE_PLAN,HANDOFF}.md`, `docs/evidence/IA02_gates.json`, `docs/evidence/IA02_35min_plan_qa_latest.json`, `docs/{HANDOFF,WORKLOG,DECISIONS,VIDEO_AI_FLOW_EXTENSION_BACKLOG.json}`, `AGENTS.md`, `README.md`.

**Run:** `npm run test:ia02`; `npm run test:all`; `npm run check`; `npm run typecheck:sdk`; `npm run test:negative-control`; `npm run acceptance:ia02`; on Windows/with installed dependencies `npm run acceptance:ia02:strict` plus manual UI verification.

**Why the real CLI harness matters:** `tools/ia02-hyperframes-acceptance.mjs` creates a 5-scene SHA-pinned v2 composition from real local PNG/WAV, queues `render:hyperframes` in the same SP-04 SQLite job store, asserts one idempotent job, runs production handler, FFprobe-checks H264/AAC/exact frames, verifies durability after reopen and saves MP4 optionally. It does **not** fake CLI output. If engine absent, gate is `BLOCKED`, no silent FFmpeg fallback.

**First blocker:** npm registry DNS EAI_AGAIN in this environment (no Vite, React, Fastify, HyperFrames packages). Install lockfile on network-connected target Windows, run `npx --no-install hyperframes lint` and `check` from a staged composition. Test 5 scenes before attempting 30–40 minute MP4. If actual CLI breaks contract, fix HTML adapter; add a real CLI regression, do not downgrade gate silently. Preserve old migrations/queue/revisions/paid-consent fences.
