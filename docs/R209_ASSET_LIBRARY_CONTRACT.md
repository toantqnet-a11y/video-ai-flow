# R2-09 — Asset Library UI & Selective Recompute Inspection

**Date:** 2026-10-15  |  **Status:** CODE_COMPLETE_TESTED_OFFLINE

## Scope

Read-only, video-scoped asset browser and recompute report, connected to the existing R2-06 registry and R2-07 DAG. No second queue, automatic model invocation, cost estimation or deletion/GC. Manual image revision selection reuses the existing R2-05 endpoint and its optimistic lock/intent fencing. R2-08 quota policy is unchanged.

### GET /api/videos/:id/assets/library?kind=all&limit=20&cursor=...

- Requires existing in-memory bearer session, local-only ingress protections and the standard SDK; no bearer/query credential.
- `kind ∈ all,voice,image,video` (default all); `limit ∈ 1..50` (default 20); `cursor` opaque `base64url` bookmark, strictly checked and pinned to `videoId + kind`; unknown query keys denied.
- Response `{videoId, items, nextCursor}`. Each item contains `id,sceneId,sceneIndex,kind,source,bytes,sha256,createdAt,state,selected,health`. Physical file path, raw metadata, prompt text, provider credentials and absolute URLs are excluded.
- `health`: `healthy`, `missing`, `corrupt`, `unsafe`, `unknown` from real filesystem SHA-256, not provider inference. Page is hashed in groups of at most four concurrent streams, limiting IO amplification. The endpoint NEVER mutates missing/recovered database flags or user-selected pointers.
- Stable keyset order: `(created_at DESC,id DESC)`. Bookmark is a cursor, **not** a security token. Consumer must maintain the same kind filter; newly inserted revisions may appear on a fresh first page. No global cross-scene physical dedupe or thumbnail creation.

### GET /api/videos/:id/assets/recompute-plan

- Reuses `manifest.planRecompute(videoId)` from R2-06. No side effects on jobs, provider billing or file selection.
- Returns per-scene decisions `reuse`, `regenerate`, `not_generated`, `manual_preserved` with counts in `summary`, plus `queued:false` and `requiresExplicitSubmit:true`.
- `manual_preserved` applies to user-pinned image selection even after a text/prompt edit. R2-07 DAG preview/submit remains the ONLY explicit controlled batch-generation entry point.

### UI

`Scenes → ④ Assets` shows paginated media history, file health, selected state, per-video selective recompute summary and explicit **Sử dụng lại ảnh** for a healthy older image revision. Selection reads the latest scene rowVersion and sends it through R2-05's authenticated `POST /api/scenes/:id/image/select`; an overlap with newer intent is rejected, not overwritten. Voice/video restore and automatic cache garbage collection are not part of R2-09.

### Persistence / compatibility

**No schema migration.** Uses existing SQLite v26 tables/immutable asset revisions. Historical migrations/checksums v1–v26 are untouched. Generated OpenAPI + TypeScript declarations were refreshed. No raw user-selected disk path is accepted from a request.

### Non-goals and gates

Real browser/Vite bundle, Windows filesystem and crash testing, native ComfyUI/Piper/VieNeu/Edge, FFmpeg long-form and 30–40-minute performance: **NOT TESTED**. No current provider model is invoked by R2-09. Asset library uses a bounded page but long-form asset count/index profiling is pending. Detailed quota dashboard/UX remains future roadmap work; do not treat R2-09 as R2-EXT-07.
