# R3-07→R3-10 — Technical contract (2026-10-16)

**Status:** local implementation delivered; release `NOT_READY`. **Render decision:** HyperFrames primary, FFmpeg explicitly selected fallback; never change automatically.

## R3-07 — timeline history
- SQLite **v30** adds immutable `timeline_revisions(video_id,row_version,document_json,action,created_at)` and `timeline_action_stacks(video_id,head_version,undo_json,redo_json)`.
- Normal changes create a **new** timeline row_version and append a revision in the same SQLite transaction; historical revisions cannot be UPDATE/DELETE.
- Supported atomic actions: presentation reorder, visual in/out, and manual timing-lock `PUT`. Undo/redo are themselves new immutable revisions, NOT historical mutations.
- `GET /api/videos/:id/timeline/history` exposes `canUndo/canRedo/revisions`; `POST` `{expectedRowVersion,direction:"undo"|"redo"}` returns updated history and manifest. Stale tabs receive 409; unsaved UI changes disable history actions; Ctrl/Cmd+Z, Ctrl+Y/Ctrl+Shift+Z are ignored inside form controls.
- Stack bounded to 40 documents; a scene rebuild retires old history and rejects stale undo. Master Script, selected asset revisions and provider jobs remain unchanged. Changes to the timeline force re-approval of Composition v2.

## R3-08 — immutable job snapshots and cache
- SQLite **v31** adds append-only `render_snapshots` tied to SP-04 `job_id` and verified SHA-addressed `render_segment_cache` records.
- Enqueue requires an approved current Composition v2 and immutable style revision. Exact composition and style contents are frozen under `job_id` (idempotent key is checked). Worker renders **frozen** data, so later changes never modify a running snapshot or its SRT; a new render requires fresh approval.
- FFmpeg per-scene key includes stable scene identity, selected voice/image/video SHA, visual trim/effect, geometry/fps, immutable style digest and render-implementation version. **Absolute start frames and caption text intentionally excluded**: SRT is applied during final mux, so a reordered unchanged scene reuses its own segment.
- Cache entries are immutable, verified by SHA-256 and FFprobe before reuse. Corrupted or symlinked cache fails closed. A validated segment is published only after complete encoding; staging and final output use separate paths. Cache is restricted to **FFmpeg**; no HyperFrames segment-cache acceptance claimed.

## R3-09 — FFmpeg segmented render and QA
- Existing FFmpeg per-scene encoding + concat + final H.264/AAC/SRT burn-in remains, now using cache where valid. Frame-count and codec QA is required on every newly cache-published segment and final MP4. MP4 publishes only after final QA and pinned asset recheck; interruption keeps partial files in staging, never marked successful.
- **Real tests:** two scenes ×30 frames, rerender one changed scene => `{encoded:1,reused:1}` and QA-verified final 60-frame MP4. Long-plan fixture: 300 scenes, 65,400 frames, 36m20s source timeline; **not rendered**.
- FFmpeg is manual fallback; no auto fallback from HyperFrames, no paid inference.

## R3-10 — external SRT
- After successfully rendering the exact frozen job snapshot, generate a separate UTF-8 SRT from `makeSrt(composition)` at a digest-addressed private path; reject conflicting existing path, 5 MB cap, attach SHA-256/byte count/cue count to completed job output.
- `GET /api/videos/:id/renders/:jobId/srt` requires existing authenticated video scope and succeeded job; recheck physical file path/symlink, checksum and size on each download. SDK `downloadLocalVideoSubtitle`, UI download button. Vietnamese Unicode and frame-clock scene voice cues preserved; no fake word-level alignment.
- Existing FFmpeg MP4 **still burns captions in**. External SRT is additional output; turning burn-in off remains a future UI choice.

## Known limits
- HyperFrames real CLI render and HyperFrames per-scene incremental cache **not exercised**; no Windows/browser/Vite/Fastify end-to-end test.
- Long-form 30–40 minute MP4, crash mid-render/CPU/RAM benchmarking remain pending.
- No AI inference, cloud API or billed provider calls were used by these changes.
