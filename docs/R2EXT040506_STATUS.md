# ContentStudio R2-EXT-04/05/06 Status · 2026-10-15

| Task | Evidence | Status | Missing acceptance |
| --- | --- | --- | --- |
| EXT-04 FFmpeg render fast path + existing SP-04 queue | Real FFmpeg segment concatenation + libass burn, SHA256, fencing; 4 core + 4 API tests | `CODE_COMPLETE_TESTED_LOCAL_FFMPEG`; **renderer choice pending EXT-03** | Remotion/HyperFrames live fair gate; render throttling, 30–40min |
| EXT-05 Timeline/Preview UX | React scene list & image/voice Blob preview, 4-track-like timeline ruler, manual lock, explicit approve | `MVP_CODE_COMPLETE_UI_NOT_BROWSER_TESTED` | Vite/browser, full video clip playback, drag reorder/transitions |
| EXT-06 MP4 export/QA | H.264/AAC file, scene-level Vietnamese burned subtitles, duration/fps/profile/codec checks, auth private streaming, 3-scene demo MP4 QA PASS | `CODE_COMPLETE_LOCAL_SHORT_FIXTURE_PASS` | Windows/long-form/perceptual QA, real provider audio |

**Regression:** 722/722 `npm run test:all` PASS; 14/14 focused+contract tests PASS; `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control` PASS. `npm run build:web` BLOCKED (Vite missing). This is **not** production release signoff.

Demo: `docs/evidence/EXT040506_demo.mp4`; QA: `docs/evidence/EXT040506_demo_mp4_qa.json`.

No change to old SQLite migrations v1..28; no paid/provider calls; no new background job store.
