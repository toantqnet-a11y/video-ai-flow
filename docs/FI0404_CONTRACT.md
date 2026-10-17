# FI-04-04 — Pinned HyperFrames real renderer acceptance contract
Date: 2026-10-17. **Code/harness implemented; real HyperFrames acceptance BLOCKED**.

## Product contract
- Primary engine: project-local HyperFrames version **0.8.159**, exact pin and complete reviewed workspace npm lock; only `npm ci` installs packages. No global CLI, `npx` download, remote/cloud provider, paid API, or silent FFmpeg fallback.
- Existing *single* SP-04 durable render queue / immutable snapshots / separate R4 subtitle-draft revision / user-pinned local music. No new queue/migration, no user assets deleted.
- Five distinct local PNG scenes + local WAVs, **10 Vietnamese subtitle cues**, 1 user-selected local looping music input; actual queued render must be `render:hyperframes`. A final *real HyperFrames* H.264/AAC MP4 must have exact Composition frame count, profile geometry, passed FFprobe QA, SHA and matching UTF-8 SRT. Postmix through existing FFmpeg is allowed only **after** genuine HyperFrames produces MP4; it does not count as engine replacement.
- Core production handler no longer permits `CONTENTSTUDIO_HYPERFRAMES_BIN` to override the version-pinned local renderer. Test-only injection remains supported in direct helper tests; cannot issue live proof through fixture/mocks.
- CLI failure, absent lock, missing package, failed queue/QA => BLOCKED/FAIL; no auto install or fallback and no false release PASS. Output/report exclude machine paths, secrets, child stdout/stderr and provider payloads.

## Commands
On trusted, network-connected Windows 11 with Node >=22.13, FFmpeg and FFprobe:

```powershell
.\tools\FI04-Windows-Setup.ps1 -ResolveLock
# Review package-lock.json, source/integrity/license, commit lockfile manually.
.\tools\FI04-Windows-Setup.ps1 -Install
.\tools\FI04-Windows-Setup.ps1 -Verify
.\tools\FI04-Hyperframes-Acceptance.ps1 -Inspect
.\tools\FI04-Hyperframes-Acceptance.ps1 -Run
```

The explicit `-Run` invokes `node tools/fi04-hyperframes-acceptance.mjs --run --save-review --strict` and writes the machine-readable report at `docs/evidence/FI0404_hyperframes_real.json`. Only on an actual automated PASS does it preserve `FI0404_review.mp4` and `FI0404_review.srt` for manual inspection. Keep any user projects or secret credentials out of this fixture.

## Evidence semantics
- `--inspect`: offline prerequisites only, no MP4, always `releaseGateSatisfied=false`.
- `--run`: attempts real pinned CLI and SP-04 queue. `PASS` means *this short local renderer test* passed programmatic checks, **not** Windows UI acceptance, verified audible loudness, legible Vietnamese glyphs, authentic Vietnamese TTS, actual 35-minute production render, crash recovery or production release.
- Full release keeps `NOT_READY` until FI-02/R3-14 security, Windows usability, dependency, live providers, long render and recovery gates all pass independently.
