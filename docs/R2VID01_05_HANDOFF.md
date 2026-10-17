# R2-VID-01 to R2-VID-05 — Agent Handoff
Date 2026-10-17 · feature PR #5 · production release NOT_READY.

## Scope and design decisions
- SQLite v33 media policies in channel/video/scene scopes, immutable history, version check; per-scene effective policy precedence scene > video > channel > original scene media. Saves never invoke AI or change narration.
- Only a trusted configured local ComfyUI API workflow can register the production video adapter (`CONTENTSTUDIO_VIDEO_WORKFLOW`, `CONTENTSTUDIO_VIDEO_BINDINGS_JSON`, `CONTENTSTUDIO_COMFY_URL`). User must explicitly click generate. Real GPU/Wan inference remains unverified; no remote API fallback.
- Existing SP-04 queue shared with all media. Explicit atomic <=40-scene batch, ordered DAG, stable idempotency key, maxAttempts=1 (prevent ambiguous duplicate GPU work), stale input fencing, process-local mutex. Multi-process GPU lock unverified.
- Local MP4 import: up to 8 MiB JSON base64 through one bounded authenticated route, real FFprobe MP4 check + SHA256, immutable revision and selected visual asset. Selection/healthy still-image fallback keep voice untouched. Large-file streaming/multipart remains future scope.
- Authenticated private GET `/api/scenes/:id/video/file` returns selected MP4, SDK fetches Blob with in-memory bearer (never media token in URL). Scene Inspector UI exposes policy/preflight/import/playback/revision/fallback. Saved Scene Builder exposes bulk generate.
- Added production `scene:ai-video` queue promotion path that doesn't affect historical `asset:video` mock-based regression.

## Next agent source map
`packages/core/src/db.mjs`, `packages/core/src/scene-video-r2vid.mjs`, `packages/core/src/manifest.mjs`, `apps/api/src/{server,providers,controllers,routes,scene-video-file}.mjs`, `packages/contracts/src/catalog.mjs`, `packages/sdk/src/client.mjs`, `apps/web/src/{SceneInspectorR301,SceneVideoPanelR2VID,SceneBuilderWorkspace,BatchVideoClipsR2VID}.jsx`, `packages/core/test/scene-video-r2vid.test.mjs`.
`docs/WORKLOG.md` and `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json` are authoritative context. Regenerate API with `node tools/generate-api.mjs` after catalog changes.

## Mandatory tests and remaining gates
`node --test packages/core/test/scene-video-r2vid.test.mjs` requires genuine local FFmpeg. `npm run test:all:batched`, `npm run check`, `npm run typecheck:sdk`, `npm run build:web`, and `npm audit --audit-level=high` must all pass before merge.
Auth browser Windows 11, actual local ComfyUI/Wan T2V/I2V, GPU resource/licensing review, 35min hybrid renderer, multi-instance mutex, >8MiB import and manual quality gates still BLOCKED.
No paid/cloud model calls were performed. Keep releaseStatus NOT_READY.

## Latest integration additions
- Channel settings Media tab and Video Config page now expose `VideoMediaScopePolicyR2VID.jsx`, saving inherited channel/video settings with revision and no model calls. Scenes can override in Inspector.
- The private GET `/api/scenes/:id/video/assets/:assetId/file` and SDK `getSceneClipRevisionFile(id,assetId)` preview past healthy MP4 assets without changing active selection. Cross-scene asset IDs are denied. Render uses only explicitly selected clips.
- The temporary API code generation workflow was deleted once deterministic OpenAPI and SDK types were updated; `.github/workflows/r2vid-focused.yml` is retained as a normal PR regression workflow.
- True GPU Wan inference, Windows 11 GUI acceptance, streamed >8MiB clip import, multi-process GPU lock, and long hybrid MP4 are still pending. Do not mark release READY.
