# R4-02..08 agent handoff — 2026-10-16

**Start here (no full repository scan):** `AGENTS.md` → this file → `docs/R402_R408_IMPLEMENTATION.md` → `docs/R402_R408_TEST_REPORT.md` → `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json`.

**Base:** R4-01 zipped source. Current DB schema **v32** (one new `r4_subtitle_drafts` table); no changes to HyperFrames selection, SQLite queue, frozen renders or paid consent policy. Release `NOT_READY`.

**Key code:**
- `packages/core/src/maintenance-r402-r403.mjs`: verified backup/restore to NEW empty location, storage inventory and reversible quarantine (not REST endpoints).
- `tools/r4-maintenance.mjs`: backup/verify/restore-dry-run/restore-to-empty/inspect/quarantine CLI.
- `apps/web/src/job-insights-r404.mjs` + `JobCenter.jsx`: public DTO-only search/grouping.
- `packages/core/src/r4-editor-music-style.mjs`: subtitle preview/versioned drafts, local second-pass music mixer, prompt consistency lint.
- `apps/api/src/controllers.mjs`, `routes.mjs`, `packages/contracts/src/catalog.mjs`: new R4-05 and R4-07 authenticated preview/draft endpoints; generated SDK/OpenAPI.
- `apps/web/src/SubtitleAndStyleR4.jsx` in `TimelineRenderWorkspace.jsx`: scene subtitle editor and visual-style heuristic panel.
- `tools/r408-release-audit.mjs`, `docs/evidence/R408_release_audit.json`: negative proof of release gates.
- Tests: `packages/core/test/r4-stabilization-402-408.test.mjs`, `apps/api/test/r4-api-r405-r407.test.mjs`.

**Tests:** `npm run test:r402-r408` **10/10**, `npm run test:r401` **12/12**, contracts **6/6**, check/typecheck/negative control pass. Global test:all timed out after #621, no PASS. Vite missing, browser untested.

**Known limitations and next steps:**
1. **Complete R4-05:** explicitly publish the subtitle draft into a new immutable Composition and render snapshot, with correct caption contract evolution (current v2 validates exactly one original scene-text cue). Until then SRT DRAFT ONLY.
2. **Complete R4-06:** imported/licensed music asset registry, bound audio-policy revision, queue-snapshot pin, HyperFrames post-mux path and long-duration/seek tests. Current mixer is callable utility only.
3. **R4-02/03:** add operator UX and secret-vault backup as an explicitly separate encrypted artifact; do not make backup or cleanup REST-mutating with online writers. Test large media, Windows/NTFS, recovery from half-finished copy.
4. **R4-07:** add character image/reference pinning and real visual identity checks; current prompt scanner only hints.
5. **R4-08:** install dependencies on test machine, perform `ci:verify`, actual HyperFrames Windows E2E and 35-minute MP4, interrupted render resume and release checklist. Do not change `NOT_READY` without proof.

Maintain short intent comments, update `AGENTS.md`/`WORKLOG.md`/`DECISIONS.md` and handoff every task. No automatic paid or silent render-engine fallback.
