# POC gate — Remotion vs HyperFrames — 2026-10-15

**Gate:** `POC_PREPARED; RENDER_ENGINE_COMPARISON_UNVERIFIED`. **Post-R2-05 check:** no additional real engine runs evidenced; cannot select production engine. R2-05 image adapter completion does not alter this gate.

- Shared fixture (separate companion POC ZIP): 5 scenes, 1080×1920, 30fps, 459 frames / ~15.3 s; sample English flite WAV, PNGs, non-aligned word-highlighting slots.
- Verified: generated fixture, ffprobe, baseline FFmpeg image+audio MP4 10.73 seconds rendering/15.343 seconds output. This is NOT a motion rendering comparison.
- Not verified: either engine actual MP4 render, engine runtime RAM/CPU/time, karaoke word timings on Vietnamese, editor integration, full 30–40 min workload.
- Blocker: npm registry unavailable in preceding environment; **do not** label as HyperFrames faster/cheaper in performance than Remotion.

## Exact gate procedure

1. On same machine, document CPU/GPU/RAM, Windows/OS version, Node/NPM, FFmpeg/FFprobe, Chromium version.
2. Pin exact versions and check license. Install both POC engines via npm on a network-enabled machine. Capture npm error logs if fail.
3. Validate fixtures; execute each engine render 3+ times, alternating order, separate cold/warm runs. Test preview and seek after install.
4. FFprobe both MP4s, inspect 5 scene representative frames; validate voice/captions/word highlight/transitions; check Vietnamese font with new fixture.
5. Report times, peak RAM, CPU, final size, visible defects, setup effort and licensing basis. Do not over-generalize baseline from 15-second sample.
6. Decision: prefer HyperFrames **conditionally** for low-license-cost product; if adapters/quality/performance fail, select Remotion if compliant. Keep FFmpeg as media utility in either case.

**No product code change or engine dependency is authorized solely by this POC document.** See `VIDEO_AI_FLOW_EXTENSION_PLAN_20261015.md`.

> **R2-EXT-03 update 2026-10-15:** 3-workload×3-repeat CLI benchmark harness is now in `spikes/EXT-03/`. POC generator 7/7 tests PASS but npm registry `EAI_AGAIN`: both real engine results `NOT_RUN`, no selection. See `docs/R2EXT03_POC_GATE.md` before proceeding.
