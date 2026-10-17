# R3-02 → R3-04 — Timeline 4-track, preview, reorder

**Checkpoint:** 2026-10-16. HyperFrames primary by explicit PO selection; FFmpeg remains a manual-only fallback. No third render queue. R3 tasks implemented and tested offline; real browser/Windows/HyperFrames acceptance remains open.

## R3-02 — Timeline manifest / viewport

- `GET /api/videos/:id/timeline/manifest`: authenticated, read-only; returns `{videoId,rowVersion,tracks,scenes,totalDurationMs,timingWarning}`. Tracks in fixed order `media,text,voice,music`. Each scene has **presentation** `index`, immutable `sourceIndex`, millisecond time range, media type, original Vietnamese caption, image/voice asset pointers and `timingSource` (`manual_locked` or `scene_estimate`).
- `apps/web/src/TimelineEditorR302.jsx` and `timeline-model-r302.mjs`: horizontal timeline ruler, playhead, four aligned lanes, zoom, scene selector and inspector/preview layout. Browser mounts only clips intersecting viewport (+ overscan); 500-scene Node stress test avoids whole-track DOM lists. Scene selector still contains scene titles; React browser latency **unmeasured**.
- Track `music` is intentionally labelled **placeholder**, not a fake playable or exportable audio track. No word-level alignment; `scene_estimate` is explicitly an estimate.

## R3-03 — One playback clock / real audio

- `playback-controller-r303.mjs` owns exactly one HTMLAudioElement. Authenticated voice download is bound to the active scene. Async fetch and metadata seek have a monotonically increasing sequence guard; old responses never play and Blob URLs are revoked.
- For seeks within a loaded voice, reuse the element and URL instead of fetching again. Seeking across scenes pauses old audio before loading the target scene. `onended` observes the remaining padding before auto-advance. Missing audio causes visible warning, never synthetic or unearned "playback succeeded".
- Image preview uses an authenticated URL per active image and revokes it on selection change. Captions show scene-level text over picture. Actual video-clip preview (T2V/I2V/imported clips), background music and waveforms are **not yet implemented**; see R2-VID and R3-06.
- Browser autoplay policies, rapid-seek wall time, A/V alignment with real provider output and exact final MP4 timing **need real-browser tests**. Preview is source assets, not the HyperFrames output.

## R3-04 — Reorder, revision and render invalidation

- `PATCH /api/videos/:id/timeline/order`: `{expectedRowVersion,sceneOrder:[sceneUuid,...]}`. Allowlist-only request; order must contain every scene exactly once. All validation and persistence occur inside one SQLite transaction; stale version gives HTTP 409.
- **Important:** Reorder means change **presentation order only**, persisted as `timeline_documents.data_json.sceneOrder`. The scene UUIDs, `scenes.idx` source offsets, approved Master Script, voice/image pointers, hashes, selected manual assets and generated files remain unchanged. Locked clip start offsets move along with scenes.
- `CompositionRepository.liveState()` applies `sceneOrder` before making a Composition. Changed timeline rowVersion and scene sequence produce a new digest; an older published Composition cannot silently replace the updated order. Re-approve Composition before rendering the new order.
- Legacy `PUT /api/videos/:id/timeline` may update timing data but **cannot** change `sceneOrder`, enforcing the audited reorder endpoint. No migration (timeline document JSON is additive).
- UI supports HTML drag/drop between Media clip buttons and keyboard-accessible `Dời trái` / `Dời phải`, with undo-before-save, explicit save confirmation, 409 conflict warning and unsaved-draft protection. It cannot reorder by mutating Master Script source mapping.

## Guardrails / limitations

No AI provider call, paid fallback or cloud request from timeline operations. No live npm/React/Fastify test in this environment (`vite: not found`); HyperFrames CLI, Windows OS, real long-form preview/render and GPU remain not accepted. A manual timing lock can conflict with measured FFprobe voice; composition preflight must continue to block unsafe output. WAV test files are fixtures, not real user speech.
