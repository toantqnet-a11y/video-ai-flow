# FI-04-04 — Hosted Windows real HyperFrames MP4 verification (2026-10-17)

## Result
**Automated real media acceptance: PASS**. **Release: NOT_READY**.
Successful GitHub Actions run: `39022682686`, Windows Server 2022 job `117367459767`.
Commit: `200cf95142d44848e3ef971c8e73623c22f959b0`.
[Actions run](https://github.com/toantqnet-a11y/video-ai-flow/actions/runs/39022682686).

| Evidence | Observed |
| --- | --- |
| Exact npm workspace lock and `npm ci` | PASS |
| Gyan FFmpeg + FFprobe 8.1.2 x64, pinned ZIP SHA256 | PASS |
| Windows FI0404 fixture/bootstrap tests | PASS |
| HyperFrames 0.8.159 local CLI, no mock/FFmpeg fallback | PASS |
| Existing SP-04 durable `render:hyperframes` queue | PASS |
| Scenes | 5 |
| Vietnamese subtitle source cues | 10 |
| Background music selected | YES |
| Output codec | H.264 / AAC |
| Frame count | 429 / 429 |
| Duration | 14.3 seconds |
| Output size | 678,467 bytes |
| Output SHA256 | `110e290b3898fe9bf1d0fc05c064dcc431eea181f3a3e0b38c85026681c3ebb7` |
| Acceptance runner elapsed | 52,867 ms |
| Automated invariant checks | 8 / 8 PASS |
| Paid/cloud provider calls | 0 |
| Operator audiovisual approval | **NOT DONE** |
| Windows 11 GUI / 35-minute 1080p / GPU | **NOT DONE** |

`fi0404-windows-render-evidence` GitHub Actions artifact holds JSON, review MP4
and SRT. It expires on **2026-10-24** (7-day retention). Download and review
before expiry: https://github.com/toantqnet-a11y/video-ai-flow/actions/runs/39022682686

The voice in this fixture is a committed test WAV, not an actual native
Vietnamese voice provider. Selecting background music, SRT contents and H.264
/AAC metadata does not prove glyph legibility or music audibility to a human.

## Fixes required to reach PASS
- Hosted Chocolatey FFmpeg HTTP 504 was bypassed with a reviewed, immutable
  third-party Windows ZIP and strict SHA-256 verification in an opt-in CI step.
- Windows canonical drive/path differences caused imported voice, image and
  music to be flagged unsafe. Updated asset/music path checks to use canonical
  base and `path.relative` (symlink/traversal boundaries still enforced).
- SP-04 default lease and heartbeat were both one second. Real render fixture
  now uses a 60-second lease and 5-second heartbeat.
- Sanitized Windows render errors now report a source frame and class without
  printing environment variables, user file paths or secrets.

## Follow-up release gates
1. Download/visually inspect MP4 and audibly review background music, Vietnamese
   subtitles (manual FI-04-04 completion).
2. FI-04-05: Windows 11 authenticated Timeline drag/trim, undo/redo, waveform,
   zoom, 120/500-scene viewport in Chrome/Edge.
3. FI-04-06/07: genuine 35+ minute Full HD render and OS crash/restart recovery.
4. FI-04-08/09/10: local LLM/TTS/ComfyUI, cost/consent, security and signoff.

Do not approve the release based on this 14.3-second synthetic-media fixture.
