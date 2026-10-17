# R2-01 — Scene Segmentation & Builder · Test Report

**Date:** 2026-10-15  
**State:** CODE_COMPLETE_TESTED_OFFLINE, NOT end-to-end/browser or Windows accepted.

## Scope
- New pure `segmentApprovedScript()` with word-based target, configurable min/target/max seconds, Vietnamese punctuation paragraph splitting, long-run-on fallback. Scene text offsets use **UTF-16 code units**. Concatenating generated scene texts exactly reproduces the approved Master Script. Input text is never normalized or silently trimmed by the splitter.
- `SceneBuilderRepository` denies requests without explicit Master Script approval. Scene plans must cover every source offset exactly once; reorder and human modifications need explicit acknowledgement. Uses optimistic locks for both video and scene revisions.
- SQLite migration **v19**: scene build state + immutable revision snapshots. Atomic scene replacement only while video has **no generated assets**, and timeline clips reset to avoid dangling scene IDs. The legacy `PUT /scenes` API no longer bypasses validation once the video has an approved Master Script.
- Five protected API endpoints with generated OpenAPI and SDK declarations. React SC01 Scene Builder screen with settings, preview, editable segments, drag-to-reorder, split/merge, 50-scene pagination, history and explicit Save. **Browser interactions unverified**.

## Verified
- `npm run test:all`: **496 / 496 PASS** (479 original tests + 17 newly added checks; also adjusted 1 old master-script test to use the now-required scene-builder path).
- `npm run check`: PASS (includes OpenAPI artifact consistency).
- `npm run typecheck:sdk`: PASS.
- Global TypeScript JSX parser: `SceneBuilderWorkspace.jsx` and `main.jsx` have **zero syntax diagnostics**, not equivalent to building React.
- Focused tests: Unicode/emoji/CRLF/no dropped characters, long text split, split/merge offsets, no unapproved source, transactional commit, conflict, assets guard, immutable version audit, SQLite restart, HTTP-like route mapping/error redaction, and 5k-word stress sample.

## Deferred and limitations
- `npm run build:web` not executable in this environment because Vite/npm dependencies are missing. Full Fastify HTTP interaction not run. Windows checks deferred by PO.
- Unit suite does **not** prove semantic segmentation quality, Web UI drag performance, 35-minute playback or actual TTS duration.
- R2-01 already includes a basic Scene Builder frontend as a convenience; **R2-02** still owns AI visual prompt generation, prompt validation and more polished workflow.
- Raw preview can generate up to 1,200 scenes; backend requires review before replacing any plan with generated assets. Selective regeneration of existing assets is left for R2-06/R3.

## Evidence
- Full Node test output: `docs/evidence/R201_ALL_TESTS.log`.
- API/SDK: `docs/evidence/R201_CONTRACT.log`.
- All calls in tests use SQLite and mock transport. No real remote provider, API key, billing or GPU utilized.
