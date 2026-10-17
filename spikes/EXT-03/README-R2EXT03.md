# R2-EXT-03 — Remotion × HyperFrames fair render POC (not production)

This directory is a self-contained benchmark harness based on the earlier 5-scene POC. It is **NOT** the production render implementation. R2-EXT-02 remains the source of truth for production composition timing; this POC re-measures each bundled WAV with FFprobe for isolated reproducibility. No user media or paid APIs are accessed.

## Current gate

**HARNESS_COMPLETE / ACTUAL_ENGINE_RUNS_BLOCKED.** This runner cannot reach `registry.npmjs.org` (`EAI_AGAIN`), so Remotion and HyperFrames are not installed, and **zero actual render-engine trials** have been performed. `outputs/baseline-ffmpeg.mp4` comes from the old independent FFmpeg POC, not either engine.

## Test protocol (one same machine)

3 workloads: `short` 1 scene (~2.9s), `standard` 5 scenes (~15.3s) and `medium` 15 scenes (~45.9s). Resolution 1080x1920; 30fps; H.264 CRF20; each fixture shares identical PNG/WAV SHA-256, duration frames, caption text and gentle 2.5% pan/zoom. Scene-level caption ends at measured narration end, with ~0.45s padding. Repeated media is intentional synthetic stress data, not evidence of 15 independently synthesized videos. Some **Vietnamese text** checks Unicode display but source **audio is synthetic English**; no proof of Vietnamese forced word alignment or native voice quality.

The runner attempts ≥3 sequential alternating trials per engine per workload (AB, BA, AB); CPU and memory measurement when `psutil` exists. Each result requires an actual engine MP4, FFprobe H.264/audio/duration/FPS/resolution checks and then **manual** visual+audio review before choosing a primary engine. No API fee or cloud worker is required.

## Preparation (does not render, no network access)

From repository root:

```bash
npm run test:ext03
npm run poc:ext03:prepare
```

Then open `spikes/EXT-03/BENCHMARK_SUMMARY.md` and `spikes/EXT-03/benchmark-results.json`. Missing engine versions show `NOT_RUN`, not a performance number. `prepared/` manifests document input hashes for every workload.

## Real POC gate on network-enabled workstation

Have Node >=22, Python >=3.10, FFmpeg/FFprobe, Chromium/Chrome, and at least 8GB RAM. Use the **same machine** for both engines, ideally use a clean boot, disable background encoding, keep encoding settings and font availability consistent.

```bash
cd spikes/EXT-03/remotion
npm install
cd ../hyperframes
npm install
cd ..
python scripts/benchmark-r2ext03.py --run --repeats 3
```

On Windows use `py -3 scripts/benchmark-r2ext03.py --run --repeats 3` if Python is registered as `py`. **The harness does not install packages automatically.** Capture `package-lock.json` after npm install; record actual versions and licenses before commercial integration. A fresh installation with the currently pinned POC versions may require adapting to later CLI changes, and a failed invocation remains a FAIL, never a guessed result.

Output examples: `outputs/r2ext03/standard_remotion_01.mp4`, `outputs/r2ext03/medium_hyperframes_03.mp4`, per-run `.log`, `benchmark-results.json`, `BENCHMARK_SUMMARY.md`.

Check on-screen Vietnamese glyphs, caption disappear/cutoff timing, image zoom, scene boundaries, WAV audio gaps and A/V at 3 representative timestamps. The automated QA verifies **container metadata only**, not picture equality or human-perceived synchronization.

## Fairness caveats and selection rule

Neither renderer is intrinsically guaranteed to produce identical pixels; text layout, scale and timing must be inspected side by side. `--no-browser-gpu` is passed to HyperFrames in this POC; verify GPU parity against Remotion's Chromium settings before interpreting CPU timings. Always disclose installation/build time separately from warmed render times.

- If both PASS and there is sufficient headroom: compare median times, peak sampled RSS/CPU, robustness, license and React/HTML editing needs.
- If one fails, fix configuration or document limitations, and rerun. Do not treat an install error as a losing benchmark.
- Remotion uses a custom license with organization/use-case restrictions: https://www.remotion.dev/docs/license/pricing
- HyperFrames repository documents Apache-2.0: https://github.com/heygen-com/hyperframes (verify dependency licenses independently).
- **Do not select or wire the production renderer until both engines' real MP4 gates and usage license review are done.** R2-EXT-04 uses one selected render adapter, not two parallel production systems.

## Maintainability

Read `docs/HANDOFF_R2EXT03.md` before any extension. `scripts/benchmark-r2ext03.py` is instrumented; `scripts/test-r2ext03.py` verifies the harness without model/engine installs. Existing `manifest.json` and `outputs/baseline-ffmpeg.mp4` are retained solely as earlier fixture provenance.
