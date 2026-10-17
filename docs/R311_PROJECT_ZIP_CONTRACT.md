# R3-11 — Portable Project ZIP64 Export Contract · 2026-10-16

**Scope:** Download an approved immutable **Composition v2** revision as a portable local archive. It contains the media actually selected for scenes, text, UTF-8 SRT and a scene timeline. It is not a SQLite backup, a CapCut native project, or a re-import feature.

## API and UX
- `GET /api/videos/:id/exports/project.zip?revision=<positive integer>` requires an authenticated local session. The security ingress allows `revision` only for this exact route. Content type: `application/zip`; `Cache-Control: no-store, private`. Path and ZIP filename are server generated, never provided by the client.
- Browser uses `saveProjectZip(videoId,revision,fileHandle)` to stream to File System Access API (recommended for large archives) or `downloadProjectZip(videoId,revision)` capped at **100 MiB in browser RAM** when File System Access API is absent.
- Project ZIP creation **does not require a completed MP4** and does not enqueue GPU, render or provider jobs. Only a published ready v2 Composition may be exported; failed/stale/unsaved preview cannot be exported.
- The export is generated into a private random-name staging file. It is never sent until the ZIP finishes successfully; cleanup runs after normal download/connection close or generation failure. A server crash may leave a temp file in dataRoot `/exports` to be cleaned by future maintenance.

## ZIP contents

```
manifest.json                     Checksums, byte sizes, scene associations; no secrets
README.txt                        Portable bundle usage and limitations
script.txt                        Ordered scene dialogue (UTF-8)
subtitles.srt                     Frame-accurate scene subtitle cues (UTF-8)
timeline.json                     Immutable Composition reference, ordered scenes and media references
assets/scene-0001/voice.wav       Selected voice bytes (format extension varies)
assets/scene-0001/visual.png      Selected image/video bytes (format extension varies)
assets/scene-0002/...
```

- `timeline.json` has `schemaVersion`, `compositionDigest`, `compositionRevision`, `profile`, `totalFrames`, scene `text`, frame bounds, `visualWindow`, motion and per-scene caption cues; media paths reference **archive-relative names only**.
- `manifest.json` includes `{name,bytes,sha256,sceneId,role,kind}` for media and `(name,bytes,sha256)` for text. `manifest.json` is not self-checksummed. No vault content, AI account/provider config, API keys, absolute media paths, original raw database or prompt history are included.
- All file names are controlled by the exporter, safe against ZIP-slip (`../`, absolute paths, backslashes, duplicates), and UTF-8 flag is enabled.
- ZIP64 `STORE` format, streaming input and output via Node standard library: does not hold full archive bytes in RAM. Media is intentionally not recompressed to minimize CPU use; unlike a compressed ZIP, the archive may be larger than source files by archive metadata.
- `maxScenes=3000`, `maxMediaTotal=150 GiB`, `maxEntries=7000`. Actual >4 GiB export not yet acceptance-tested, though ZIP64 records are implemented.

## Safety/integrity
- Each asset is validated before writing: hash, size, confinement to dataRoot, no final symlink, no symlinked parent (via resolved target). Each file is reopened with `O_NOFOLLOW` where supported and rehashed **while writing**. Any changed/corrupt asset aborts output; client never receives a partial-success response.
- HTTP layer deletes finished staging ZIP after delivery or disconnect. Any other viewer of the local machine still has the ordinary filesystem permissions risk; this is not an encrypted backup.
- No separate SP-04 queue, no migration, no paid API, no forced FFmpeg fallback. HyperFrames remains primary and irrelevant to exporting already approved source media.

## Known limits
- Project bundle is portable raw media + metadata, **not one-click import** into other editors, and does not bundle FFmpeg/HyperFrames, AI model weights or credentials.
- Does not include MP4: download the render separately from its authenticated endpoint.
- `script.txt` concatenates ordered scene dialogue, not the original untouched approved Master Script document.
- Background music assets are not exported until a real selected music asset is in the approved Composition; Music lane currently acts as a placeholder.
- Browser/Windows, real large ZIP (>4 GiB), mid-download interruption/disk-full cleanup, and end-to-end Fastify remain unaccepted.
