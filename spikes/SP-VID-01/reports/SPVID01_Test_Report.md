# SP-VID-01 test report — 2026-10-13

| Evidence | Result |
|---|---|
| Node 22 / Linux unit + mocked ComfyUI protocol tests | **21/21 PASS** |
| T2V POST /prompt, history polling, output MP4 retrieval | PASS via fake loopback HTTP server, **no GPU inference** |
| I2V image upload + explicit workflow binding | PASS via fake loopback HTTP server, **no GPU inference** |
| ffprobe verification of genuine playable MP4, immutable revision import | PASS (MP4 created by FFmpeg test generator, **not AI**)|
| SQLite SP-04 JobRunner integration with saved MP4 asset and idempotency | PASS (1 local video, 1 asset record) |
| SSRF restrictions / redirect rejection / output traversal / video byte limit | PASS |
| Pause/abort, timeouts, malformed outputs | PASS |
| Live ComfyUI Wan/LTX model inference | **NOT RUN — no running model/GPU** |
| Native Windows GPU/VRAM benchmark, 1080p/35-minute real render | **NOT RUN — device not available** |
| Remote paid Seedance/Google Veo smoke | **NOT RUN — deliberately disabled by policy** |

**Regression:** SP-01=4 PASS, SP-02=22 PASS, SP-03=35 PASS, SP-04=15 PASS, SP-05=16 PASS, SP-06=33 PASS = 125/125. Together with SP-VID-01: **146/146 PASS**. A flaky SP-04 test assertion improperly assumed that enqueue order always equals claim order when timestamps match and UUID breaks ties; changed assertions to compare the claimed job IDs. This is a test-only correction; no queue scheduler behavior changed.

See `test-results.txt` for direct test output. Status remains **PENDING_PROVIDER_AND_WINDOWS_VALIDATION**.
