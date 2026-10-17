# SP-01 — Evidence & benchmark report

**Execution date:** 2026-10-13 (UTC)  
**Target:** Windows 11 (PO-approved)  
**Actual test environment:** Linux x64 container — **NOT** the target Windows hardware.

## Verified locally

| Check | Result |
|---|---|
| Node.js runtime | v22.16.0 |
| FFmpeg / FFprobe | FFmpeg 7.1.5, tools detected |
| Encoder availability | `libx264`: yes; `aac`: yes |
| 5-minute synthetic fixture | **PASS**; 300s, H.264/AAC; 0.29s encoding; 57,830 bytes |
| 35-minute synthetic fixture | **PASS**; 2100s, H.264/AAC; 1.69s encoding; 388,834 bytes |
| Peak FFmpeg process RSS | 5-minute ~38.2MB; 35-minute ~40.5MB (Linux sampling) |
| Automated tests | **4/4 passed** |
| Local REST proof endpoint | `GET /api/v1/system/diagnostics` smoke tested |
| GPU AI-video viability | **NOT VERIFIED** (no detected NVIDIA GPU in current environment) |
| Windows 11 execution | **PENDING — needs execution on target PC** |

**Measurement limitation:** The fixture is a solid-color video + silent audio at **320×180, 2fps**. The apparent rendering speed only proves format/muxing/probe operation and cannot predict performance of a 35-minute 1080p/30fps video with hundreds of AI assets, transitions and subtitles. `h264_nvenc` being *listed* in FFmpeg does not prove an NVIDIA encoder is usable.

**Next verification gate:** Execute `Run-Windows.ps1 -Mode full` on target Windows PC, attach the 2 JSON reports. Then SP-03 evaluates GPU/ComfyUI, SP-VID-01 verifies a genuinely AI-generated clip, and EP08 benchmarks a production-like timeline.

## Evidence files

- `reports/diagnostics.json` — hardware & software inventory (see privacy warning in README).
- `reports/benchmark.json` — actual measured fixture runs.
- `output/fixture-5min-300s.mp4` and `output/fixture-35min-2100s.mp4` — actual small videos validated using ffprobe.
