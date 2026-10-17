# R2-EXT-02 — Measured voice & subtitle sync

**2026-10-15 · `CODE_COMPLETE_TESTED_OFFLINE` · RELEASE `NOT_READY`**

- Added opt-in engine-neutral **Composition v2**: FFprobe measurements from current healthy voice asset → frame-quantized scene duration + tail padding, scene-level caption end at measured voice end.
- Preserves explicit manual timeline locks; guards source/revision changes, corrupt media, unavailable FFprobe and cutoff risks. No fabricated word timestamps.
- SQLite schema unchanged at **v28**; v1 history/preview intact; shared append-only composition revisions support v1 and v2.
- Added authenticated v2 preview/publish endpoints, OpenAPI + SDK + portable `composition-v2.schema.json` and focused real WAV test suite.
- **14/14 focused, 12/12 v1 regression, 714/714 full suite PASS;** API drift check, TS SDK check and negative-control PASS.
- Blocked build (`vite: not found`) and HTTP smoke (`ERR_MODULE_NOT_FOUND`); Windows, actual TTS, browser, renderer and 30–40m media not accepted.
- **Next:** R2-EXT-03 real Remotion/HyperFrames benchmark gate (do not confuse FFmpeg baseline with engine benchmark). Downstream R2-EXT-04/06 will render and QA actual MP4.
