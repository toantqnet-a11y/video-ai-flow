> **CURRENT — FI-02 (2026-10-16):** Strict reproducible Windows startup now requires a reviewed `package-lock.json` and uses only `npm ci`; never floating install. New release evidence runner + Windows script; 7/7 FI-02 focused PASS, release audit 8 PASS / 12 BLOCKED, **NOT_READY**. FI-02 full suite attempt timed out at #629 (FI-01 baseline 852/852 PASS). Read `docs/FI02_HANDOFF.md`, `docs/FI02_RELEASE_CONTRACT.md`, `docs/FI02_TEST_REPORT.md` FIRST. Do not claim Windows/HyperFrames/35-minute output is tested.

> **LATEST — FI-01, 2026-10-16:** Full offline regression **852/852 PASS**, but release audit **11 PASS / 13 BLOCKED / 0 FAIL** and `NOT_READY`. Exact local HyperFrames 0.8.159 pinned; no global/npx fallback; real HyperFrames subtitle/music acceptance runner added but CLI+lockfile+Vite/Fastify unavailable here. Read `docs/FI01_HANDOFF.md` first. No paid APIs or automatic FFmpeg fallback.

> **LATEST R4-05/06/08 (2026-10-16):** Start `docs/R405_R406_R408_HANDOFF.md` and `docs/R405_R406_R408_TEST_REPORT.md`. Explicit saved subtitle draft → immutable render snapshot → MP4/SRT (FFmpeg real E2E), local music import/list → snapshot → H.264-copy/AAC music postmix, also wired after HyperFrames primary. 12/12 focused PASS; release audit 10 PASS/11 BLOCKED; full global suite not established. **NOT_READY** until real HyperFrames/Windows/35-min/browser acceptance. Never auto-pay or silently switch engine.

> **LATEST 2026-10-16 R4-02..08 (PARTIAL):** Read `docs/R402_R408_HANDOFF.md`, `docs/R402_R408_IMPLEMENTATION.md`, `docs/R402_R408_TEST_REPORT.md` first. Verified backup/restore-to-empty, quarantine CLI, Job Center filter, subtitle draft editor/API (not burned into render), local FFmpeg soundtrack post-mix (not in queue), prompt-token style lint, release audit. Focus 10/10; R4-01 regression 12/12; contract 6/6; global timed out #621; Vite missing. Release **NOT_READY**. HyperFrames primary; FFmpeg manual fallback; never auto-pay.\n
# ContentStudio — current handoff (2026-10-16)

**Current:** R3-13 implementation + R3-14 acceptance harness. Read `docs/R313_R314_HANDOFF.md` → `docs/R313_RENDER_RECOVERY_CONTRACT.md` → `docs/R314_ACCEPTANCE_PLAN.md` → `docs/R313_R314_TEST_REPORT.md` → tail `docs/WORKLOG.md`.

R3-13 adds capacity check on *both* preflight and worker, OS process-tree kill on abort/timeout, orphan stage cleanup, and regression for SP-04 crash/lease fencing. Durable queue, immutable Composition, digest render/cache unchanged. No paid or automatic FFmpeg fallback.

R3-14 release **NOT_READY** until real HyperFrames + Windows/browser + 35-minute MP4 and long-job crash recovery are observed. The automated 300-scene plan and short FFmpeg control are not long render acceptance. Legacy R3-12 documentation in `docs/R312_HANDOFF.md`; older tasks preserved in worklog.

## Latest R4-01 checkpoint · 2026-10-16
- Complete full source includes latest selective channel preset diff/apply; read `docs/R401_HANDOFF.md` first and use `npm run test:r401` to validate.
- R4-01 12/12 focused and 20/20 backward regression PASS; full suite timed out near #613, Vite absent; release NOT_READY.
- Next R4-02 backup/restore. Keep HyperFrames primary and no implicit paid APIs.


> **LATEST FI-03 (2026-10-16):** Read `docs/FI03_HANDOFF.md` and `docs/FI03_TEST_REPORT.md` before continuing. Fixed launcher valid-lock rejection and renderer child environment credential leak; staged Windows install script; synthetic real 35-min FFmpeg smoke. FI-03 focused 6/6 PASS; full post-change suite inconclusive, npm EAI_AGAIN; HyperFrames/Windows long render BLOCKED; release NOT_READY.
