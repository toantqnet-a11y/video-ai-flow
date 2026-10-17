# R2-EXT-02 — FFprobe voice timing + scene-level caption sync (Composition v2)

**Status:** `CODE_COMPLETE_TESTED_OFFLINE` (2026-10-15). Does **not** export MP4, render subtitles, recognize word times, or certify live Windows/GPU/provider quality.

## Integration / version boundaries

- Backward compatibility: original `CompositionRepository.preview/publish` produce unchanged **v1** (`durationBasis: scene_estimate`), and existing immutable v1 historical revisions still deserialize and validate.
- Opt-in v2 service: `packages/core/src/composition-timing-r2ext02.mjs` (`TimedCompositionRepository`); schema `docs/contracts/composition-v2.schema.json`, generated from API catalog. R2-EXT-02 adds **no SQLite migration**; immutable v1/v2 documents share the existing append-only v28 table. Do not edit old migration checksums.
- Preview calls base v1 source/asset health verification, then `ffprobe` on **committed, healthy, current selected voice files**. File path is constrained to the asset root, passed via safe argv (`execFile` without shell), checked via SHA-256 again after probing. It does **not** read claimed duration from `metadata.durationMs` or estimate WPM to claim successful voice measurement.
- Scene duration = `max(500ms, ceil(ffprobe_seconds*1000) + tailPaddingMs)` rounded **up** to whole frames (`ceil(ms*fps/1000)`); default tail padding 250ms (allowed 0..5000ms). Audio end frame = `ceil(measuredVoiceMs*fps/1000)`. `paddingFrames = durationFrames-min(audioFrames,durationFrames)`. `startFrame/endFrame` remain contiguous across scenes. Per-scene caption cue ends at voice end, not after tail padding. No guessed per-word timestamps.
- Manual timeline clips: a clip must be explicitly marked `timingLocked: true` to preserve `durationMs` and optional `captionStartMs/captionEndMs` (the timeline is never modified). More than one lock, invalid lock or a position mismatch >1 frame yields `TIMING_LOCK_CONFLICT`. If locked duration would cut off measured audio, `VOICE_DURATION_OVERRUN` blocks publication. Ordinary timeline clips are never interpreted as a manual timing override.
- Absent/corrupt/outdated/unprobeable audio has an explicit blocker (`VOICE_MISSING`, `VOICE_UNHEALTHY`, `VOICE_STALE` or `VOICE_DURATION_UNAVAILABLE`). The optional estimate-only preview remains inspectable but **cannot** be published as measured-ready. `readiness.ready` still checks selected media health and source intents only + measured timing feasibility, not renderer results.
- No audio synthesis/AI/remote HTTP, scene modification, new job queue, cost or paid fallback. SP-04 remains sole queue. Render adapter in EXT-04 must recheck active intent & pinned files before dispatch.

## v2 fields

Every v2 scene keeps the v1 asset, text, profile and SHA references with added:

```json
{
  "durationBasis": "voice_measured",
  "timing": {"mode":"voice_measured","audioMs":1234,"audioFrames":38,"paddingFrames":7,"tailPaddingMs":250},
  "durationMs":1484,"durationFrames":45,
  "captions":{"mode":"measured_scene","source":"scene_text",
    "cues":[{"text":"Xin chào Việt Nam!","startFrame":0,"endFrame":38}]}
}
```

Other explicit sources: `durationBasis:manual_locked` / `captions.mode:manual_locked` with `source:timeline_locked`, or `estimate_only` + blocker. The runtime validator (`validateTimedComposition`) rejects unknown modes, malformed values, frame discontinuity, changed approved text, invented word alignment, wrong digest, corrupt pin syntax or extra properties. No SRT/VTT export/word-level alignment is asserted.

## API (authenticated, same local CSRF policy)

| Method | Path | Input | Result |
|---|---|---|---|
| POST | `/api/videos/:id/composition/timing/preview` | `{ "profile"?: {...}, "tailPaddingMs"?: 250 }` | Read-only v2 manifest with blockers + digest |
| POST | `/api/videos/:id/composition/timing/revisions` | `{ "expectedDigest": "<hex64>", "expectedVideoRowVersion":N, "tailPaddingMs"?:250, "profile"?: {...} }` | Same immutable revision registry v28; refuses stale source or blockers |
| GET | `/api/videos/:id/composition/revisions/:revision` | — | Historical v1 or v2 validated (union response type) |

No database migration. Schema v1 remains explicit; the generator includes transitive v2 defs only so the common historical revision endpoint can report v2 without invalid refs. OpenAPI + TS SDK are catalog-generated.

## Runtime/release boundaries

- `ffprobe` binary must be installed on PATH, with supported audio stream. Bounded 10s process timeout per scene; command failure yields `VOICE_DURATION_UNAVAILABLE` and no publication.
- Passing offline FFprobe on synthetic valid WAV does not prove VietNeu/Piper real speech quality, word-level timing, browser playback, Windows start scripts, latency for 1200 scenes or 30–40-minute synchronized output.
- R2-EXT-03 requires fair **real** Remotion and HyperFrames benchmark. R2-EXT-04 is responsible for render and actual A/V file checks; R2-EXT-06 owns MP4 quality gates. Don't claim either engine selected or MP4 shipped.
