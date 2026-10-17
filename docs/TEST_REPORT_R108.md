# ContentStudio R1-08 — Long Content & Policy Regression

**Date:** 2026-10-14  ·  **Task:** R1-08  ·  **Environment:** Linux, Node 22.16.0 (experimental built-in SQLite).
**Engineering status:** `CODE_COMPLETE_TESTED_OFFLINE`, **NOT** a release sign-off or a promise of production video length/quality.

## Implementation and rationale
- Added `packages/core/src/long-content-audit.mjs`: deterministic structural QA for complete multi-model chapter sets. Reports missing/duplicate chapters, >20% word-count drift, exact repeated chapters/long paragraphs, missing summaries and estimated duration drift. Only sanitized metrics and warning codes leave the module: no prompts, script text, provider keys or snippets.
- Added `tools/r108-long-form-rehearsal.mjs`: execute real content repositories, R1-03 chapter handler, existing SP-04 durable JobStore + scheduler and R1-06 explicit Master Script approval with **synthetic, deterministic AI outputs**. No network calls, provider credentials, real generation or billing.
- Added 11 automated tests in `apps/api/test/long-content-r108.test.mjs` and `packages/core/test/long-content-audit-r108.test.mjs`. Includes same job idempotency, 15-job DAG, retry, 30/35/40-minute word estimates, missing content warnings, free quota exhaustion, denied paid provider, durable lease recovery and rejection of stale commit after simulated worker death.
- No schema migrations, production generation policy changes, externally exposed endpoints or new scheduler.

## Evidence executed locally

| Gate | Result | What this proves |
|---|---|---|
| `npm run test:r108` | **11/11 PASS** | Focused R1-08 regression tests |
| `npm run test:all` | **479/479 PASS** (468 previous + 11) | Node unit/integration/mocked regression suite |
| `npm run check` | **PASS** | JS/API schema contract check |
| `npm run typecheck:sdk` | **PASS** | Existing SDK TS typecheck |
| `npm run rehearsal:r108` | **PASS** | Real queue/storage path + mock content |
| `npm run build:web` | **BLOCKED** `vite: not found` | Frontend production build unverified |
| `npm run test:live-http` | **BLOCKED** `ERR_MODULE_NOT_FOUND` (Fastify dependency) | Actual HTTP runtime unverified |
| Live Gemini/Groq/OpenRouter/Ollama | **NOT TESTED** | Requires provider availability, verified account quota and credentials |
| Windows / GPU / Browser | **DEFERRED** | Await target runtime, CI/hardware |

### Deterministic 35-minute mock rehearsal

Output evidence: `docs/evidence/R108_long_form_rehearsal.json`.
- 5 chapters × 3 independently scheduled **local mock model IDs** = **15 queue jobs**, **15 succeeded**, **0 failed at completion**.
- Injected one transient failure → **16 total attempts**, recovered automatically within the existing job budget.
- Observed concurrency = **3**; same idempotency key did not enqueue duplicates.
- Each synthetic model script = 5,075 whitespace-delimited words; at nominal 145 WPM **estimated** 35 minutes.
- Master Script candidate was not auto-published; **explicit approval** selected five chapters of one model and published 5,075 words.
- All external/paid requests **0**. No real AI output generated; duration comes from words/WPM, not audio timing.
- Separate 30-/40-minute fixtures produced 4,350/5,800 planned words; their content is deterministic filler, **not editorial-quality content**.
- File-backed queue recovery test reopens SQLite and fences stale lease tokens; **not** proof of real OS power-loss behavior.

## Unresolved R1 acceptance / R2 dependencies

1. Need real model QA for content continuity, accuracy, style, quality, repetition and appropriate source citations when applicable. Deterministic structural checks do not evaluate meaning.
2. Runtime duration must be measured from produced TTS with `ffprobe`; target minutes are not guaranteed by word count.
3. Paid cost ceilings, true account quota and free tier terms depend on verified provider documentation/account state; test policy with real provider only after authorization.
4. Fastify live HTTP, React/Vite browser, 30–40 minute real pipeline, Windows CI/installer and hardware benchmark remain unverified.
5. Next R2 must implement scene segmentation and reconcile Master Script edits without silently invalidating the approved revision.

**Release conclusion:** R1 software logic + offline regression suite completed, but R1 is **not end-to-end operationally accepted**. Development can continue to R2-01 with open QA gates tracked explicitly.
