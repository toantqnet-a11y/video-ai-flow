# Sprint 0 / SP-01 — Windows diagnostics & FFmpeg benchmark

**Scope:** EP09/EP08. Windows 11 is the PO-approved target. This package is a working, dependency-free Node 22 proof-of-concept, not the finished Fastify backend.

## Run on the actual Windows computer

1. Install **Node.js 22+** and an FFmpeg build containing **ffmpeg, ffprobe, libx264 and AAC**. Put tools on `PATH`.
2. Open PowerShell in this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\Run-Windows.ps1 -Mode diagnose
powershell -ExecutionPolicy Bypass -File .\Run-Windows.ps1 -Mode smoke
powershell -ExecutionPolicy Bypass -File .\Run-Windows.ps1 -Mode full
node --test
```

`full` writes two tiny **synthetic** H.264/AAC videos, each 5 minutes and 35 minutes of playback duration, and validates them with ffprobe. They are **320×180 at 2fps**, not representative of the production 1080p/30fps scene/multi-track pipeline. The output is intentionally small; do not use wall time to promise 35-minute final render speed. The report contains duration, codecs, file size, wall clock time, process RSS where measurable, GPU inventory, CPU, RAM, disk and encoder availability.

3. Send `reports/diagnostics.json` and `reports/benchmark.json` back for Windows-target review. Keep `output/` if the generated files need manual inspection.

### Diagnostic REST proof endpoint

```powershell
powershell -ExecutionPolicy Bypass -File .\Run-Windows.ps1 -Mode serve
# open http://127.0.0.1:4317/api/v1/system/diagnostics
```

The local-only endpoint is a **contract prototype**, not a production secure Fastify service. Host/Origin/CSRF controls and vault are covered under SP-06. **Do not expose port 4317 outside localhost.**

## Evidence / acceptance

- [x] Source and automated test for portable collector / FFmpeg fixture / ffprobe verification.
- [x] Runs in current build environment; resulting proof recorded in `reports/`.
- [ ] Execute same commands **on the PO's Windows 11 PC** (current environment is Linux and cannot certify Windows).
- [ ] Windows GPU/VRAM and real disk capacity validated; decide ComfyUI viability with SP-03 and SP-VID-01.
- [ ] Windows 5- and 35-minute fixture videos confirmed; collect native process memory counters if required.
- [ ] Production-like 1080p/30fps 35-minute render and effects/voice overlay stress test: defer to EP08 benchmark, not this tiny synthetic fixture.

## Privacy

No API keys or machine hostname are gathered. Windows graphics driver information might be included; review report before sharing outside your team. `reports/` and `output/` are gitignored.
