# FI-04-06 through FI-04-10 — Integration and acceptance contract
**Date:** 2026-10-17. All new automated scripts are fail-closed. **Release: NOT_READY**.

## FI-04-06 real long render
`tools/fi0406-long-render.mjs` is an operator-triggered real render path on **Windows** using **existing project data** (`project.sqlite`, published immutable Composition v2). It does **not** create synthetic voice/scene data, install dependencies, invoke remote AI, or silently use FFmpeg. `--run --confirm-local-render` requires a previously reviewed/committed lock, project-local HyperFrames 0.8.159, at least five real scenes, 2100–2400 seconds and 1080p+ composition, a selected genuine subtitle draft and explicitly pinned local music. A fresh SP-04 queue job is the only accepted engine provenance. It checks output H.264/AAC frame count/geometry/duration with FFprobe, re-reads SHA256, checks separate SRT hash/cue count, and measures elapsed time plus *parent-process* RSS, host available RAM/disk. It does NOT measure renderer-process peak RSS/GPU/VRAM and does not approve glyphs/voice/music subjectively; those gates remain manual. Existing project database/media are modified by the queued render, so first use a copied/safe test project.

Run only on networked Windows after verified `package-lock.json`, `npm ci`, and FI-04-04 real short render:

```powershell
# Confirm in app: published revision and long composition; explicitly select
# music pin and subtitle draft; copy selection options into a LOCAL JSON file.
.\tools\FI04-06-10-Windows-Acceptance.ps1 -Stage Long -DataRoot 'D:\\TestProjectData' -VideoId '<video-id>' -SelectionFile 'D:\\TestProjectData\\approved-render-selection.json' -RequestKey 'manual-run-20261017-001'
```

Required selection JSON example (values must actually exist in the project's own DB/media):
`{"engine":"hyperframes","revision":1,"subtitleDraftRevision":1,"music":{"pin":{"relativePath":"...","sha256":"...","bytes":1234},"settings":{"volume":0.12,"fadeInSeconds":1,"fadeOutSeconds":1,"loop":true}}}`. Do not fabricate pins; use approved UI preflight data and correct workspace schema. Report contains jobId, digest and media hash but never source filesystem paths.

## FI-04-07 crash recovery
Automated `--simulate`: a **real Node child process** claims a disposable `render:hyperframes` job, the parent SIGKILLs that child, expired lease is recovered, stale-token result is rejected and another worker succeeds. **No MP4 is produced**, no real renderer crashed, and this must not count as actual production recovery. Witnessed production Windows scenario remains separate: intentionally stop worker *during* a real 35-minute render; restart, inspect SP-04 attempts and lease_recovered events, media SHA/FFprobe, partial-file publication, asset/cache integrity, and manual final review.

`node tools/fi0407-recovery.mjs --verify --data-root=<copied-test-project-root> --job-id=<job>` inspects SP-04 lease history but is **not** a human OS-kill attestation and deliberately does not promote the release gate.

## FI-04-08 live AI providers
`--inspect` is offline. `--probe-local` sends read-only GET requests to **fixed loopback endpoints** `127.0.0.1:11434/api/tags` (Ollama) and `127.0.0.1:8188/system_stats` (ComfyUI), with abort timeouts, bounded response sizes and no redirects. It never sends a prompt, creates video, infers TTS or invokes cloud/paid providers. Handshakes are not true LLM/TTS/GPU inference. Real E2E must be initiated with user consent, limited quota, native Vietnamese WAV and real ComfyUI output inspected for quality/VRAM/time, including provider 429 handling.

## FI-04-09 security and performance
`--verify` runs focused security/renderer policy tests with local Node. `--allow-network-audit` is an **additional explicit opt-in**, requires a reviewed npm lock and runs npm audit. Production manual review must inspect OS secrets, file permissions, IPC, safe paths, Windows process inheritance and actual 1080p long-run CPU/RAM/GPU/VRAM/disk. A passing unit test or npm audit is not a security signoff.

## FI-04-10 final release
`--inspect` produces an inventory and marks all unsupported live/human gates BLOCKED. Strict mode exits nonzero. No arbitrary user-written JSON/historical reports are imported as successful current acceptance. Signoff still requires full green suite, actual short/long HyperFrames, Windows browser, verified production process kill, authentic native providers, security audit and operator A/V review, each with current evidence.

**Invariants:** one SP-04 queue, HyperFrames primary, FFmpeg manual only, no automatic paid requests, no fabricated npm lock or dependency installation, no new migrations, redacted report contents, existing asset/media never deleted by these harnesses.
