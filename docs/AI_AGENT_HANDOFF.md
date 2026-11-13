# AI Agent Handoff — Video AI Flow

**Updated:** 2026-11-13  
**Repository:** `toantqnet-a11y/video-ai-flow` (private)  
**Canonical branch:** `main`  
**Baseline SHA inspected:** `a714f0354693a46112356050a63d43768d064e56`  
**Product:** ContentStudio / Video AI Flow — localhost browser web application.

> This file is the current handoff entry point for any AI coding agent. Read it before changing code. Then read the linked task-specific handoffs and update this file plus `docs/WORKLOG.md` when work changes.

## 1. Non-negotiable product decisions

- This is a **browser-based web app served locally**, not a Windows desktop app.
- Do not add Windows-only product requirements or make Windows the runtime target. Historical Windows scripts/workflows/evidence may remain for reference, but are not the acceptance definition for current work.
- Keep tests focused on browser behavior, AI/provider boundaries, real rendering, persistence, security, and performance.
- No paid AI/model API calls unless the user explicitly authorizes them. Prefer local/mock/offline tests for routine CI.
- HyperFrames is the primary renderer. FFmpeg is an explicit/manual fallback only; never silently switch renderer.
- Preserve explicit user approval before irreversible scene/content/render operations and preserve fail-closed behavior.
- Code should include concise intent comments around non-obvious logic.
- Maintain a durable handoff/work log: status, decisions, files changed, commands/tests and exact outcomes, blockers, next steps.

## 2. Repository map and commands

The repository is an npm workspaces monorepo (Node >=22.13, ESM):
- `apps/web` — browser UI (Vite/React).
- `apps/api` — local Fastify API, persistence and workflow orchestration.
- `packages/core` — domain and rendering logic.
- `packages/contracts`, `packages/sdk`, `packages/providers`, `packages/security` — contracts, client SDK, provider adapters and security boundaries.
- `spikes/` — isolated experiments; do not confuse spike evidence with production readiness.
- `tools/` — test, diagnostics, browser E2E and acceptance runners.
- `docs/` — task handoffs, status, backlog and evidence.

Useful commands from repository root:
```bash
npm ci
npm run dev:web
npm run dev:api
npm run build:web
npm test
npm run test:all
npm run check
npm run typecheck:sdk
npm run ci:verify
npm run start:local
```
Check `package.json` before assuming any command or script exists on a later commit. Run focused tests first, then the smallest relevant integration/browser/render checks. Record skipped tests and environmental blockers; never report them as PASS.

## 3. Current Git baseline (verified 2026-11-13)

- `main` points to `a714f0354693a46112356050a63d43768d064e56` (the merge commit for PR #24).
- PR #24 was merged on 2026-10-22. It integrated the P0 waveform/audio-sync fix batch.
- PR #23 is closed and was not merged; it overlaps the newer PR #24. Do not reopen or merge it blindly. Inspect its diff for unique changes only if a task requires it.
- PR #22 and PRs #1–#21 are closed; the recorded PR listing shows them merged except #17 and #23.
- Issue #25 remains open: **Codex handoff — finish P0 Browser E2E QA-B06/QA-B05 and UAT R1**.
- Branch inventory and PR status were audited on 2026-11-13; see [docs/BRANCH_CONSOLIDATION_2026-11-13.md](BRANCH_CONSOLIDATION_2026-11-13.md). All feature PRs #1–#16, #18–#22 and #24 are merged. PR #17 and PR #23 are closed and explicitly superseded by #18 and #24 respectively. Their remaining branches must not be merged blindly.
- GitHub compare reports historical branches as diverged because the project used squash merges; ahead counts are not evidence that changes are missing from main. No unmerged feature-code branch requiring speculative integration was identified. This pass is documentation-only; the next code work is Issue #25.

## 4. CI and QA — do not overstate readiness

Last verified workflow evidence available in GitHub (2026-10-22):
- On main SHA `a714f0354693a46112356050a63d43768d064e56`: **ContentStudio CI PASS** (run 39805855328).
- On PR #24 head `42c29654e3b6d0935938a2d72f49df43163ce9da`:
  - ContentStudio CI: PASS (39734815211).
  - Local HyperFrames MP4 Proof: PASS (39734815357).
  - R2VID focused integration diagnostics: PASS (39734815190).
  - Localhost Browser E2E: **FAIL** (39734815189).
- These are historical results, not a claim about current CI on a new SHA. Re-run checks on the exact candidate commit before declaring it green.
- **UAT R1 is NOT READY** until the browser E2E blocker and all required real acceptance checks are resolved and evidenced.

### Priority P0 — continue from Issue #25

1. Inspect run 39734815189 and job logs. Failure occurred after `qa_b04_browser_redo_sqlite`, reported as `E2E_ASSERTION_OR_INTEGRATION_FAILED`.
2. Inspect `tools/localhost-browser-e2e.mjs`, especially QA-B06 clock/seek, audio paused assertion, and `QA_B06_*` error labeling. Improve failure diagnostics and fix the actual behavior/test integration; do not suppress assertions.
3. QA-B05 real WAV path: import fixture `spikes/EXT-03/assets/voice-01.wav` for the browser-selected scene; verify persisted `voiceAssetId`, visible `.timeline-r302-clip.lane-voice` label and SVG `svg.timeline-r306-wave path`. Check React refresh/virtualization and authenticated voice fetch. Ensure this step runs in Browser E2E and passes.
4. Verify Audio Sync at actual seek/pause/scene boundaries; confirm no overlap and correct timing.
5. Run the four required workflows on the **same final SHA**: ContentStudio CI, Local HyperFrames MP4 Proof, R2VID focused integration diagnostics, Localhost Browser E2E.
6. Verify actual localhost end-to-end MP4 generation and inspect output evidence; prepare UAT R1 package with exact SHA, test evidence and known issues.
7. Only mark UAT READY after every required gate passes. After merge, verify CI on `main` too.

## 5. Product architecture and UX constraints

- User journey: Channel/project setup → content/script generation → scene breakdown → voice/TTS → image/video assets → timeline/editor → render/export MP4.
- A project represents a **channel**. Channel configuration stores content style and media configuration.
- Content view lists videos for the channel with status; open an item to edit or create a new one.
- Timeline should remain a visible editing surface: visual assets above, text/voice lanes below, with preview/seek and editing controls.
- AI/provider configuration must support multiple configured models/accounts and safe switching when quotas are exhausted. Do not trigger paid fallback automatically.
- Preserve version history, explicit approval of the canonical script/scenes, and judge/retry workflow semantics where implemented.
- Keep local-first security boundaries. Do not persist pairing secrets/bearer/CSRF credentials in localStorage as a shortcut.

## 6. Required reading before editing

Start here, then follow the most relevant task-specific docs:
1. `AGENTS.md` — repository-wide agent constraints. This handoff supersedes its historical Windows-specific sections where they conflict with the current browser-first product decision.
2. `docs/LOCALHOST_BACKLOG_HANDOFF.md` — current 69-task localhost backlog policy and OS-neutral acceptance.
3. `docs/LOCALHOST_BROWSER_E2E_REPORT.md` — prior browser E2E evidence and explicit non-tested areas.
4. `docs/GITHUB_CI_HANDOFF.md` — workflow/CI procedures.
5. `docs/HANDOFF.md` — historical task handoff index; some entries are older than this document.
6. `docs/WORKLOG.md` — chronological decisions and implementation log (if present).
7. `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json` and `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json` — task source of truth; inspect task status before changing scope.

For a specific area, read its matching `docs/*_HANDOFF.md`, status/report, tests and implementation before modifying it.

## 7. Branch consolidation and safe Git procedure

There are multiple historical feature branches, including R2-VID, R3-VID, HyperFrames cache, Job Center/storage, FI-04 and QA-B05/B06 work. Their names alone are not evidence of merge status.

For each candidate branch:
1. Fetch/compare against `main`; inspect changed files and commit ancestry.
2. Identify commits already represented in `main` and exclude them.
3. Review unique changes for relevance to the current localhost scope; exclude obsolete Windows-only acceptance changes unless preserving historical documentation.
4. Apply one coherent feature/fix batch at a time. Resolve conflicts intentionally, never overwrite newer main behavior.
5. Run targeted tests and relevant browser/render/CI checks.
6. Open a focused PR with evidence; do not push an unreviewed branch pile directly into `main`.

Never commit secrets, local databases, generated MP4s, credentials, machine-specific paths or bulky artifacts. Check `.gitignore` and `.env.example`; keep real `.env` files out of Git.

## 8. Handoff log format

Append to `docs/WORKLOG.md` after meaningful work, and update this handoff's current checkpoint:
- Date / agent / branch / base SHA.
- Goal and task IDs.
- Decisions and rationale.
- Files changed and behavior added/fixed.
- Exact commands run and PASS/FAIL/BLOCKED outcomes.
- Browser/AI/render/performance evidence, including artifact paths and commit SHA.
- Known issues and what was not tested.
- Next agent's first three concrete actions.

## 9. Immediate next actions

1. Checkout latest `main`; read Issue #25 and this handoff.
2. Reproduce and fix the Browser E2E QA-B06 failure with diagnostic output.
3. Complete QA-B05 real WAV waveform verification and Audio Sync assertions.
4. Run all four required workflows on one SHA; document results and keep UAT NOT_READY until green.
5. Update `docs/WORKLOG.md`, task status and this handoff; open a focused implementation PR.

**Do not claim that the entire backlog is complete, all branches are merged, UAT is ready, or all CI is green without fresh evidence.**


## 10. Branch audit checkpoint — 2026-11-13

The complete 25-ref inventory, PR mapping, squash-merge caveat and supersession decisions are recorded in docs/BRANCH_CONSOLIDATION_2026-11-13.md. All intended feature code from merged PRs is already on main; PR #17/#23 are superseded, not pending merge candidates. No app code was changed in this consolidation pass. Continue with Issue #25 P0 Browser E2E repair; keep UAT NOT_READY.
