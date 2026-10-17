# R2-EXT-07/08 — Latest Status (2026-10-15)

| Task | Scope delivered | Status | Still outstanding |
|---|---|---|---|
| EXT-07 — Cost Guard & Smart Visual Router | Read-only authenticated per-video planner; three modes; verified-pinned reuse first; configured local ComfyUI suggestion; paid-clip candidate **blocked**; no fake billing figures | `CODE_COMPLETE_TESTED_OFFLINE_PREVIEW_ONLY` | Automatic provider execution decisions, estimated future provider prices and verified billing/energy figures are explicitly out of scope |
| EXT-08 — Motion Templates & Brand Kit | Four frozen allowlisted presets, per-scene overrides, colors/title/caption controls, SQLite v29 immutable revisions, FFmpeg real pan/zoom/black-fade/lower-third/burned captions and JPEG thumbnail, private SDK download | `CODE_COMPLETE_TESTED_LOCAL_FFMPEG_UI_UNBUILT` | Browser/Vite, Windows, larger video, advanced xfade/logo assets/animated stickers, real AI imagery |

**Verification:** EXT-07/08 **8/8** focused tests; full Node suite **730/730 PASS**; `npm run check`, SDK typecheck and negative control all PASS. FFmpeg 1920×1080/30fps H264/AAC **real local short MP4** PASS; JPEG thumbnail PASS. UI JSX syntax parsed via global TypeScript. **Web build blocked** (`vite: not found`, exit 127). No real provider inference or billable dispatch.

**Data safety:** No migration SQL modified before v29. New `motion_brand_revisions` append-only table scoped to video. No second scheduler, no automatic payment, no claim about Remotion/HyperFrames benchmark outcome. R2-EXT-03 real fair comparison remains NOT_RUN.
