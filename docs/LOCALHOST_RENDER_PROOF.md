# LOCALHOST-04 — OS-neutral HyperFrames 5-scene MP4 proof

## Verified GitHub-hosted Linux result — 2026-10-18

**Real FI-04-04 HyperFrames acceptance PASS**, run `39119979455`, job `117653421909`.
- Exact `hyperframes@0.8.159` project-local CLI, real SP-04 `render:hyperframes` queue.
- `5` scenes, `10` Vietnamese SRT cues, music selected, **429/429** frames.
- **14.3 seconds**, **861,481 bytes**, **H.264 + AAC**, SHA-256 `ae269cb7bdd91c0b62cf20df92422e1c4d81253863419847a7a020c68a06a5ff`.
- Strict acceptance elapsed **47,810 ms** on hosted Ubuntu; this is not representative of a 35–40-minute production video.
- Output JSON + review MP4/SRT in GitHub artifact `local-hyperframes-5scene-proof`, ID `12133842453`: https://github.com/toantqnet-a11y/video-ai-flow/actions/runs/39119979455/artifacts/12133842453. Retention 3 days, expected expiry around **2026-10-21**.
- Initial run `39119936830` was blocked by the hosted image not supplying FFmpeg/FFprobe; fixed by conditional OS-package install. No fallback renderer was used.
- Manual visual review and sound check are **still open**. This is real local rendering using local *test* PNG/WAV media, not real neural TTS or ComfyUI, and not an authenticated browser render operation.


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
