# R2-EXT-01 — Engine-neutral Video/Scene Composition Contract v1

**Status:** `CODE_COMPLETE_TESTED_OFFLINE` on 2026-10-15. **Not** render/export/live acceptance.

## Purpose / boundary

Single deterministic JSON snapshot makes the existing R1 master content, R2 scene builder and immutable R2 asset registry consumable by *either* a future Remotion, HyperFrames or FFmpeg adapter. There is **no engine dependency, render invocation, or provider call** in this task.

Canonical module: `packages/core/src/composition-r2ext01.mjs`, exported by `@contentstudio/core`.
Portable schema: `docs/contracts/composition-v1.schema.json` (from `node tools/generate-composition-schema.mjs`).

### Payload (abbreviated)

```json
{
  "schemaVersion": 1,
  "videoId": "<uuid>",
  "source": {"videoRowVersion": 3, "configRevision": 1, "sceneRevision": 1,
    "timelineRowVersion": 2, "scriptSha256": "<64 lowercase hex>"},
  "profile": {"width": 1920, "height": 1080, "fps": 30, "aspectRatio": "16:9", "codec": "h264"},
  "scenes": [{
    "id": "<scene-uuid>", "index": 0, "sceneRowVersion": 3,
    "text": "Xin chào Việt Nam!", "textSha256": "<64 lowercase hex>",
    "mediaType": "image_motion", "startFrame": 0, "endFrame": 540,
    "durationMs": 18000, "durationFrames": 540,
    "durationBasis": "scene_estimate",
    "voice": {"asset": {"id": "<uuid>", "kind": "voice", "sha256": "<sha>",
      "bytes": 10000, "relativePath": "assets/..."}, "measuredDurationMs": 17300},
    "visual": {"kind": "image", "motion": "ken_burns", "asset": {"id": "<uuid>",
      "kind": "image", "sha256": "<sha>", "bytes": 100000, "relativePath": "assets/..."}},
    "captions": {"mode": "scene_estimate", "source": "scene_text",
      "cues": [{"text": "Xin chào Việt Nam!", "startFrame": 0, "endFrame": 540}]}
  }],
  "totalFrames": 540,
  "readiness": {"ready": true, "blockers": []},
  "digest": "<sha256 of canonical payload excluding digest>"
}
```

Values above are illustrative, **not a measured render or verified file**. `readiness.ready` means **current selected assets are healthy / intents match** for publishing a pin; **not** proof of audio sync, subtitles, GPU, or completed MP4. `durationBasis=scene_estimate` deliberately preserves original scene timing. Actual voice `measuredDurationMs` is advisory; EXT-02 will reconcile frame count, padding and subtitles without changing this v1 shape silently.

### Frame / source invariants

- Support 16:9 (1280×720, 1920×1080, 3840×2160), 9:16 (720×1280, 1080×1920) and 1:1 (1080×1080) with preset-matched aspect; 24/25/30/60 fps, H.264 profile metadata. Other sizes are rejected, never stretched silently.
- Scene duration frames `ceil(durationMs * fps / 1000)` with contiguous `startFrame/endFrame`, 1+ frame, no overlap or gaps; no guessed measured audio duration.
- Preserve original scene `text` and SHA-256 including Vietnamese diacritics, surrogate pairs, punctuation and line breaks. Never split or normalize text in serialization.
- Active voice + visual assets pin **immutable asset_revision ID, relative storage key, checksum and bytes**; no absolute path, secret, provider token or billable account detail. Manual image selection remains authoritative.
- Preview may include `null` assets + explicit blockers. Publish **fails closed** unless all required pins are healthy/current and preview digest matches. For AI video/import video, visual kind must be `video`.
- Store source `videoRowVersion`, `configRevision`, `sceneRevision`, `timelineRowVersion` with hash of master script. Changes to pointers, current intents, active config or timeline invalidate the pending preview.

### Endpoints, authenticated local API

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/videos/:id/composition/preview` | Body `{ "profile": {"width":1920,"height":1080,"fps":30} }` or `{}`. Read-only; validates live selected assets; no render/job/AI. |
| POST | `/api/videos/:id/composition/revisions` | Requires `{ "expectedDigest":"...", "expectedVideoRowVersion":N }`, optional same profile; immutable publish if current and ready. Same content is idempotent. |
| GET | `/api/videos/:id/composition/revisions` | History of revision/digest/createdAt (max 100). |
| GET | `/api/videos/:id/composition/revisions/:revision` | Read pinned historical snapshot; validates content digest. |

`composition_revisions` is append-only **SQLite v28**, earlier migration SQL/checksums unchanged. Triggers refuse updates/deletes. Existing SP-04 queue remains the only queue; no new worker.

### Validation / security model

`validateComposition` checks shape, allowed resolution/aspect/fps, byte/hash paths, scene uniqueness, text hashes, ordered cumulative frame offsets, caption placeholder boundaries, readiness flags and canonical digest. `stableCompositionJson` sorts object keys recursively and preserves array order, text and numeric values. API catalog, OpenAPI and TypeScript SDK are generated together; standalone JSON Schema uses matching fields.

**At render dispatch** (future EXT-04), engine adapter MUST separately re-validate current intent and every pinned file SHA-256; SQLite cannot guarantee filesystem immutability after snapshot publish. A published historical revision is an audit artifact, not a perpetual file health certificate. Use explicit user review if the active scene has changed. Provider verification and word-alignment are outside this contract.

### Upgrade path

R2-EXT-02 owns FFprobe timing → durationFrames, padding and caption boundaries. R2-EXT-03 benchmarks Remotion and HyperFrames on equal workloads/hardware, not using the FFmpeg baseline as either score. R2-EXT-04 chooses one production engine and reuses SP-04; R2-EXT-06 confirms MP4 via FFprobe. Do not claim live Windows/browser/GPU acceptance until evidence exists.
