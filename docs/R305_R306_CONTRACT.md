# R3-05 / R3-06 — Timeline Visual Window & Verified Voice Waveform

**Date:** 2026-10-16. **Release:** NOT_READY. **HyperFrames:** primary render engine by PO choice. No npm engine integration or paid call here.

## R3-05 — non-destructive visual window (editor MVP, renderer pending)
- `PATCH /api/videos/:id/timeline/visual-window` strict JSON `{expectedRowVersion,sceneId,inMs,outMs}`; returns the latest `TimelineManifest` + `changed`.
- The visual interval is stored under `timeline_documents.data_json.visualEdits[]`; no new migration. Validation: video scope, current timeline row lock, `0 <= inMs < outMs <= scene.durationMs`, minimum 200ms.
- A 409 conflict prevents two tabs from overwriting each other. No provider, narration, captions, source text, original scene index, scene duration or existing asset bytes are changed. Scene-duration mutations atomically remove obsolete visual window metadata. Reorder preserves per-scene windows.
- `GET /api/videos/:id/timeline/manifest` returns effective `visualInMs` / `visualOutMs` and actual project `fps`; UI snaps to frames/scene edges/caption boundaries, displays a gold visual range on the Media lane and can reset/save explicitly.
- **Important limitation:** These boundaries are timeline editor metadata only. The current composition v1/v2 schemas and HyperFrames/FFmpeg render adapters **do not consume the visual-window range**, so saved visual trims **do not modify exported MP4 yet**. Integrate source window/hold into immutable Composition and both render implementations with independent QA before declaring visual trim end-to-end complete. Never cut voice to implement image trim.

## R3-06 — real waveform preview
- `GET /api/scenes/:id/voice/waveform?bins=N`, default 160, supported 24–512; private, session-authenticated JSON response `{sceneId,sha256,durationMs,bins,peaks,sampleRate,cached}`. The ingress query allowlist permits only `bins` for the exact route. No raw file paths.
- Service calls existing `SceneVoiceRepository.audio`: the selected revision is checksum-verified and intent/revision rechecked after I/O; missing/unhealthy voice gives an error, never fabricated waveforms.
- Decodes PCM16 mono/stereo WAV directly. MP3 is locally decoded with FFmpeg (`-nostdin`, argument array, 20s wall timeout, ≤130 seconds at 8kHz, ≤16MB PCM). Unsupported WAV formats fail rather than inventing peaks. Uses max amplitude, normalized [0,1], deterministic 3-decimal rounding and exact audio sample duration.
- In-memory bounded 64-entry LRU keyed by verified audio SHA256 + bins. **Cache does not persist across restart**. UI requests only currently visible clips (maximum 16 per viewport batch, at most 3 concurrent) and renders one SVG path per voice clip, scaled by actual source duration relative to scene duration.
- No word-level phoneme alignment, sound level standardization, GPU requirement or network request. Visual correctness and wave/audio seek alignment still require browser/real-voice validation.

## Security / release gates
- Fail closed for unsafe body keys, absent scene, stale version, out-of-range cuts, invalid bins, missing or corrupt audio, decoder failure. No credential/asset path leak and no automatic fallback to paid providers.
- Changing visual metadata increments `timelineRowVersion`, forcing new Composition approval; previous approved composition and prior renders remain immutable.
- Release needs Vite/Fastify installation, browser preview and drag/save UX test, Windows tests, **real HyperFrames video**, real 30–40min H264/AAC MP4, true render-time visual cut/hold behavior, MP3/WAV output from real TTS.
