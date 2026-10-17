# R4-01 — Preset diff & selective apply contract
Date: 2026-10-16 | Status: CODE_COMPLETE_TESTED_OFFLINE

## User story
Existing videos always inherit their *original frozen channel preset* plus explicit video overrides, NOT later channel changes. The user may explicitly compare current effective video settings to the channel's latest preset, select individual properties, preview downstream impacts, then apply only those selected changes.

## Endpoints (authenticated Bearer + CSRF via canonical SDK)
- `POST /api/videos/:id/config/diff` — `{rowVersion,channelPresetVersion,selectedPaths:string[]}`. Empty selection lists changes only. Response `{videoId,channelId,rowVersion,channelPresetVersion,configRevision,fields,selectedPaths,overrides,impact,changed,previewDigest}`. `fields:[{path,currentValue,channelValue,selectable}]`. No DB write, queue, provider call, or cost.
- `POST /api/videos/:id/config/apply` — `{rowVersion,channelPresetVersion,selectedPaths,expectedDigest,confirmImpact}`. Server recomputes and checks all versions, selected leaves and SHA-256 preview digest in a SINGLE SQLite IMMEDIATE transaction; selectively writes a new immutable `video_config_revisions` row and increments `row_version`. No-op yields unchanged revision. Does NOT change `videos.preset_snapshot_json` nor historical revisions.

## Rules and security
1. Only scalar paths within canonical groups (`content`, `voice`, `media`, `render`, `models`) are eligible; the server uses actual channel/current diffs as a whitelist. Duplicate, fabricated, or repeated paths fail closed. It never accepts arbitrary traversal keys.
2. Preview and apply compare the video's **effective** preset with the channel's **latest** preset; other video overrides are reconstructed from the video's original frozen source. Only selected fields change in the resulting effective preset.
3. Optional-field removals in a newer channel preset are shown `selectable:false`: the current scalar-only overrides format cannot represent deleting an optional field already in the video's original snapshot. This is deliberately not coerced to an empty string.
4. Canonical `validPreset` applies, including prohibition of enabling paid/remote provider routing. Cross-field constraints (e.g. aspect ratio vs render dimensions) require selecting a compatible group of fields; invalid combinations fail without partial writes.
5. Optimistic `rowVersion` and `channelPresetVersion` fencing, digest of selection+impact+config version+overrides, and runtime recheck of job activity protect against stale tabs, race conditions, and silent downstream edits.
6. `confirmImpact` ONLY acknowledges asset/script/render staleness. It never grants paid AI permission and never triggers automatic TTS, image, video, or render jobs. `videoConfigImpact()` persists precise changed paths and affected categories; existing assets are preserved as files and prior revisions remain read-only.
7. UI refuses preset compare while unsaved video overrides exist, requires explicit checkbox selection, then preview, then apply; selection changes invalidate an old preview.

## File map
- New pure diff engine: `packages/core/src/preset-diff-r401.mjs`.
- Domain transaction and versioned persistence: `packages/core/src/domain.mjs`.
- API: `apps/api/src/{controllers,routes}.mjs`.
- Contract catalog: `packages/contracts/src/catalog.mjs`, generated OpenAPI + SDK types by `npm run api:generate`.
- UI: `apps/web/src/VideoConfigWorkspace.jsx`, `apps/web/src/style.css`.
- Tests: `packages/core/test/preset-diff-r401.test.mjs`, `apps/api/test/preset-diff-r401.test.mjs`.

No SQLite migration, new queue, provider, external dependency, or engine change. HyperFrames remains primary; FFmpeg remains explicit fallback.
