# Video AI Flow — Remotion vs HyperFrames (fair POC fixture)

## Status (2026-10-15)

This is a **prepared, static-validated side-by-side POC**. It has NOT been performance-tested with the two frameworks in the current sandbox because registry.npmjs.org is unreachable. `outputs/baseline-ffmpeg.mp4` (when present) is a genuine FFmpeg-only smoke test, **NOT** a proxy benchmark for either rendering engine.

## Unified test

- Five consecutive scenes, 1080×1920, 30 fps, about 15 seconds total.
- Identical PNG assets, WAV test narration, text, word highlight slots and audio-driven scene durations.
- Synthetic English audio generated offline using FFmpeg's `flite`; no chargeable AI provider, no claim of Vietnamese TTS quality or true forced alignment.
- Motion: 1.000→1.025 image zoom; caption text and a highlighted word. Compression target H.264 MP4, CRF 20.
- Shared `manifest.json` is **the source of truth**. Scene length is `ceil((actual audio duration + 0.45s) * 30)` frames.

## How to run on a Windows machine or an internet-enabled development machine

Prerequisites: Node.js 22+, npm, FFmpeg + FFprobe in PATH, Python 3.10+, Google Chrome/Chromium or allow the renderer to install its supported headless browser. Python `psutil` is optional for memory measurement (`pip install psutil`). Recommended: >=8GB RAM.

```bash
# in POC folder
python scripts/validate-fixture.py
cd remotion && npm install && cd ..
cd hyperframes && npm install && cd ..
node scripts/setup-hyperframes.mjs

# Optional HyperFrames lint and browser audits
cd hyperframes && npm run lint && npm run check && cd ..

# Real engine render and instrumentation — must run both on the SAME machine
python scripts/benchmark.py --engine both
```

Outputs: `outputs/remotion.mp4`, `outputs/hyperframes.mp4`, `outputs/*.log` and `benchmark-results.json` (pass/fail, duration, size, elapsed time, process-tree peak RAM when psutil available).

Separate commands (useful if one engine fails):

```
python scripts/benchmark.py --engine remotion
python scripts/benchmark.py --engine hyperframes
```

`npm run studio` inside `remotion`; `npm run preview` inside `hyperframes`.

### Important QA notes

1. The test fixture is **not** a scientifically identical picture-perfect animation implementation, because the engines have different DOM/render lifecycle semantics; run visual diff before relying on fps/time comparisons.
2. Word timing uses approximate equally divided slots, **not** force-aligned subtitle timestamps. Real VieNeu-TTS audio with forced alignment is a separate POC.
3. Never compare one engine with hardware GPU and the other in software mode. Run both in comparable CPU-only settings first, ideally >=3 repeats, alternating run order.
4. The HyperFrames index references `assets/gsap.min.js` copied locally; run the setup script after `npm install`.
5. The exact released HyperFrames/Remotion version and license must be recorded from `npm ls` before production decisions. An installation error is NOT proof of poor framework performance.
6. On Windows, first verify FFmpeg PATH, Chrome/Chromium launch, GPU settings, fonts and permissions.

### License

HyperFrames: project advertises Apache-2.0; check all bundled dependencies before deployment. Remotion: custom license; eligibility and pricing differ for individuals/small organizations and commercial automators. No claim here that either project is universally free.

## Suggested decision rule

Cost-first: prefer HyperFrames if render correctness, editor integration, and speed are satisfactory. Prefer Remotion if React-native authoring/editor productivity measurably outweighs licensing implications. Delay final lock-in until both videos pass QA and measured render times are collected on deployment hardware.

## Handoff

- `manifest.json`: canonical timing/media contract.
- `remotion/src/video.tsx`: deterministic React composition; no frame-dependent side effects.
- `hyperframes/index.html`: timed clips + paused GSAP seekable timeline.
- `scripts/benchmark.py`: genuine CLI runner, does not fabricate successful renders.
- `scripts/ffmpeg-baseline.py`: independent FFmpeg pipeline smoke test.
- `outputs/baseline-results.json`: actual output evidence, if generated.
- Pending: install npm dependencies in an internet-enabled environment, lint HyperFrames, render both engines, inspect caption/highlight, compare times and peak RAM, decide production integration.

## Sources

- Remotion docs: https://www.remotion.dev/docs/render
- HyperFrames CLI: https://github.com/heygen-com/hyperframes/blob/main/docs/packages/cli.mdx
- HyperFrames core: https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-core/references/data-attributes.md
