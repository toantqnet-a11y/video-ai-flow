# Localhost Web — Step 1: Content → Scene → Timeline → Render (2026-10-18)

## Scope (actual code, not just a UI mock)
A guided production strip above the local browser workspace now has **Content, Scenes & Media, Timeline, Export MP4**. It reads approved Master Script and saved Scene Builder revision from the existing authenticated local API and never reports an MP4 as complete without real render evidence. Clicking 'Export MP4' navigates to the existing Timeline screen and scrolls to the existing SP-04/HyperFrames Render Drawer; it **does not** enqueue a render or call paid AI.

**Critical fix:** After 'Duyệt Bản chuẩn', 'Mở Scene Builder' opens the *canonical* server-backed revisioned scene proposal. Before this change, the old button directly split sentences and called the legacy `/videos/:id/scenes` PUT, then skipped immediately to Timeline, bypassing the revisioned Scene Builder + voice/image generation UX. Master Script text is now left intact and unchanged until the user explicitly previews and saves Scene Builder. Scene Builder's next button leads to **Voice TTS**, not prematurely to a renderer with missing media.

**Unsaved edits:** Sidebar and production strip protect dirty Brief/Outline/Master drafts, Scene Builder drafts and Timeline/Inspector. Content and Scene subtabs now use the same guard. Render-section focus stays within mounted Timeline and does not override preflight or approval.

**Truthful status:** Content shows 'done' only after `master/revisions` reports `hasApprovedScript`. Scenes show 'done' only after a persisted `sceneRevision>0` **and** actual saved scene records are in local store. Timeline and Export remain 'review' rather than falsely announcing a completed render. Missing API evidence shows unknown status and a warning.

## Changed implementation
- `apps/web/src/production-flow.mjs`: four-step pure state/navigation and dirty-exit contract.
- `apps/web/src/ProductionFlowGuide.jsx`: local authenticated read-only master/builder fetch.
- `apps/web/src/main.jsx`: guided navigation, corrected Master → Builder handoff, subtab protections, removed dead mock LegacyTimeline, accurate localhost footer.
- `apps/web/src/MasterScriptWorkspace.jsx`: new opening action; Master draft guard.
- `apps/web/src/SceneBuilderWorkspace.jsx`: unsaved draft guard and Next: Voice TTS.
- `apps/web/src/TimelineRenderWorkspace.jsx`: existing renderer focus section and dirty guard. Does not affect rendering.
- `apps/web/src/store.js`: UI-only dirty/flow focus flags, never persisted media versions.
- `apps/web/src/style.css`: responsive step navigator.
- `apps/web/src/production-flow.test.mjs`: pure state, cross-stage flow invariants and static wiring regression.

## Verification and limitations
- Run `node --test apps/web/src/production-flow.test.mjs`, `npm run build:web`, `npm run check`, `npm run test:all:batched`, `npm run test:live-http` with reviewed dependencies. GitHub CI is the initial automated evidence.
- **Not yet accepted:** human authenticated browser clicking through every step, actual configured Ollama/TTS/ComfyUI invocation, true 35–40 minute HyperFrames export, manual subtitle/music A/V and resource/crash recovery. Keep `releaseStatus=NOT_READY`.
- Product stays web app on localhost. No Electron/EXE, auto GPU inference, auto paid service, schema migration or new API endpoint.

## Next agent
After CI, run a real authenticated browser E2E covering approved Master → Scene Builder preview/save → Voice/Image → Timeline → Composition Approval → HyperFrames Render and download, including unsaved draft cancel and fresh-page resume. Preserve consent and immutable media revisions. If browser/GPU hardware unavailable, mark live gates BLOCKED rather than fabricate passes.
