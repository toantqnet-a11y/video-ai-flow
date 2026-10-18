# LOCALHOST-04 — OS-neutral HyperFrames 5-scene MP4 proof

**Goal:** Validate the **selected local HyperFrames renderer** `0.8.159` using the real existing SP-04 durable queue, on a supported host with FFmpeg/FFprobe. This is a **browser app's local rendering backend**, not Windows Desktop acceptance.

## Automated scope
- New GitHub Actions workflow: `.github/workflows/local-hyperframes-proof.yml`.
- Reviewed `package-lock.json`, reproducible `npm ci --ignore-scripts`, actual installed `hyperframes` CLI, FFmpeg and FFprobe.
- Directly execute existing `tools/fi04-hyperframes-acceptance.mjs --run --strict --save-review`, not `--inspect` alone, not a mock and not an FFmpeg substitute.
- Fixture uses **5 committed local PNGs + 5 committed local WAV voice assets**, 10 Vietnamese SRT cues, and selected music WAV; it does **not** call TTS, LLM, ComfyUI, cloud, or paid APIs.
- Confirm job kind `render:hyperframes`, succeeded SP-04 queue, exact frame count, H.264/AAC codecs, MP4 quality metadata, source SRT checksum/content and output SHA256.
- Upload `FI0404_localhost_hyperframes.json`, `FI0404_review.mp4` and `FI0404_review.srt` as a **3-day** GitHub artifact for **human** inspection. This is intentionally short retention / no ongoing charges.

## Release boundaries
**This short local test cannot prove** 35–40-minute output, render cache hit/miss for native HyperFrames, interactive browser Render submit, real AI-generated voice/image, human Vietnamese glyph legibility or music audibility, worker kill-and-resume, nor production CPU/RAM/GPU limits. None of those release gates should be marked PASS from this CI result; product remains `NOT_READY`.

## Follow-up
After CI real render: manually inspect downloadable MP4/SRT, then run authenticated browser Render preflight/queue/download on a properly configured local project. Next benchmark true 35–40-minute Full HD production mix and recovery/scene cache under controlled resources.
