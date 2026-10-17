# R3-14 — End-to-end acceptance matrix (release gate)

**Implementation:** `tools/r314-acceptance.mjs`; **release remains `NOT_READY` unless all required gates pass**.

## Run locally or on Windows
- `npm run test:r313-r314`
- `npm run acceptance:r314` (5-scene 429-frame actual FFmpeg control; 300-scene / 36.33-min **planning-only**; disk headroom; core dependencies). Writes `docs/evidence/R314_release_gates.json`.
- `npm run acceptance:r314:strict` returns non-zero until all gates satisfied.
- On supported Windows hardware install locked project dependencies, run `npm run build:web`, `npm run test:live-http`, enable a real HyperFrames CLI and run HyperFrames five-scene acceptance. Then manually/automatically verify pointer drag, seek/audio/subtitle, waveform and video in a real browser.
- Render an **actual** 30–40-minute project through the approved Composition v2 + SP-04 queue on Windows. Compare complete MP4 frame count, H.264/AAC, audio drift, Vietnamese glyphs, segment regeneration after modifying 1 scene, snapshot revision/stale labeling, progress and disk usage; explicitly abort OS mid-render, restart API and verify safe resume/recovery, idempotency, stale lease fencing and absence of duplicate export.

## Interpretation
- `PASS` means *that single gate* has observed evidence. An offline 300-scene Composition plan and a full FFmpeg five-scene MP4 **do not validate** a 35-min HyperFrames output.
- `BLOCKED` means missing dependency/platform/observed evidence, not a success.
- `FAIL` means an attempted test produced a noncompliant result; do not release.
- An optionally provided `--long-mp4=/path/file.mp4` is inspected with FFprobe for 30–40-minute H.264/AAC technical metadata. It **does not prove** app-job provenance.
- Never use fake percentages/ETAs, dummy clips presented as real AI, or mock HyperFrames as real render evidence.

## Non-negotiable product safeguards
No auto-pay, no hidden provider/account switching, no automatic FFmpeg fallback, immutable master/source and output history. UI and backend use one shared SQLite and SP-04 job store. Keep review logs and agent handoff updated. Target Windows, offline Linux evidence is only partial.
