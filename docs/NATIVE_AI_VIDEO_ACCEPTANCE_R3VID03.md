# R3-VID-03 / R3-08 / R2-VID-02 — offline → native acceptance handoff

The operator called the task **R3-VID-0**; implemented here as **R3-VID-03** (35–40 minute hybrid E2E).

## Evidence layering

1. **Code & offline fixtures:** verify local API binding and typed workflow without sending `POST /prompt`; check on-disk immutable inputs and read-only FFprobe MP4 QA. Neither test is a witnessed AI inference or a native HyperFrames run.
2. **Native GPU (R2-VID-02):** start ComfyUI/Wan on the Windows machine. Set `CONTENTSTUDIO_VIDEO_WORKFLOW`, `CONTENTSTUDIO_VIDEO_BINDINGS_JSON`, `CONTENTSTUDIO_COMFY_URL=http://127.0.0.1:8188`. Run `node tools/native-video-gates.mjs --inspect --probe` locally. This only validates local workflow and reads `/system_stats`; it does NOT dispatch generation. Next run an explicit, operator-initiated T2V and I2V job through the real SP-04 app, then verify ComfyUI output, model license/checkpoint and VRAM. No auto-downloads or paid APIs.
3. **HyperFrames scene cache (R3-08):** verify same scene before/after approved narration edit: miss→encode, subsequent unchanged scene→hit, changed timing→miss. Check the native HyperFrames 0.8.159 CLI, subtitles, transitions and music manually; Linux FFmpeg tests cannot validate actual HyperFrames composition quality.
4. **35–40-minute hybrid (R3-VID-03):** use actual image, native-AI-video and manual import scenes in approved Composition v2. Save the real output (SHA-256 independently computed) under `renders/<video-id>/<64hex>.mp4`. Run read-only `node tools/native-video-gates.mjs --verify --root <dataRoot> --composition <composition.json> --render <output.mp4> --sha256 <sha256>`. It independently rechecks pinned media, output SHA and FFprobe. It defaults to `NOT_READY` without operator attestations. Review 35min quality, sync, real GPU provenance, restart recovery and paid-call ledger on Windows.
5. **Reports:** Command stdout is sanitized JSON only; the tool does not persist credentials, source prompts or absolute paths and never marks a short fixture as accepted.

No claims of native Windows/GPU or 35min completion until an actual artifact plus operator review exists. Release remains `NOT_READY`.
