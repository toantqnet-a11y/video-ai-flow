# Localhost Web Backlog — Canonical Scope & Agent Handoff (2026-10-18)

**Product:** ContentStudio / Video AI Flow is a **local web application**. React + Vite runs in the browser; Fastify serves the loopback API; SQLite and user media stay on local disk. It is **not** a Windows native desktop/EXE/Electron app. A Windows host may run it, but Windows 11 is not an unconditional product requirement.

## Authority & backward compatibility
- Canonical machine-readable backlog: `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json` (**exactly 69 IDs**: 42 legacy FI-02, 14 AI-video, 10 FI-04, 3 historical WI).
- Deterministic source chain: `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json` + `docs/reference/VIDEO_AI_FLOW_EXECUTION_PLAN_V3.md` → `tools/fi04-backlog.mjs` → `normalizeLocalhostBacklog()` via `docs/LOCALHOST_BACKLOG_POLICY.json`.
- Never hand-edit the generated master: `npm run backlog:merge:fi04` then `npm run backlog:check:fi04`. `npm run test:fi04` verifies preservation and platform-neutral gates.
- The original extension backlog and original v3 plan retain historical PO-02 (Windows-first) **for provenance**; the newer explicit localhost-web PO decision supersedes that assumption **for release criteria only**. Keep IDs and real Windows Server 2022 CI test records unchanged. `WI-01/02/03` are *legacy IDs*; their new goals concern local host readiness, loopback web runtime, and browser integration — not a Windows installer.
- Preserve `releaseStatus=NOT_READY`; completion of code, offline tests or hosted CI alone is **not** an acceptance signoff.

## Two separate release profiles

| Profile | Requirement | Not a requirement |
| --- | --- | --- |
| `MVP_localhost` | At least one declared and actually supported host with reproducible npm lock, secure 127.0.0.1 Fastify, Vite UI, authenticated browser workflow, real 5-scene HyperFrames MP4 + human subtitle/music checks, genuine 35–40-minute 1080p MP4/SRT, worker crash/recovery, CPU/RAM/disk profiling, security/audit and operator signoff | Windows 11 specifically; Electron/EXE/installer; GPU if manually imported media is used |
| `AI_video_local` | Above capabilities plus genuine locally configured ComfyUI/Wan T2V/I2V inference, pinned native AI clip provenance, VRAM/runtime/license measurements, mixed import/still/AI 35-minute quality and proper queue/lock recovery | Paid/cloud inference without affirmative consent; mock workflow standing in for a real GPU clip |
| `Optional_extensions` | Only if separately approved: official paid providers or alternative local models | Not a blocker for the local-first MVP |

Do not advertise any OS as supported solely because platform-neutral source code exists; the declared host must have its real FFmpeg/FFprobe, pinned HyperFrames, Node, browser and (when relevant) model dependencies working. Linux/macOS/Windows compatibility is a claim requiring evidence, not guaranteed by this backlog change.

## Product acceptance and test evidence

1. **Browser / API:** a real authenticated localhost browser tab (Chrome/Edge or equivalent supported browser), actual React Timeline and media editor user gestures: creation, reorder/drag, trims, undo/redo, waveform, video seek/sync and 120/500-scene viewport profile; Fastify real TCP/SQLite and private media access. A pairing-page DOM screenshot is **not** editor acceptance.
2. **AI / consent:** actual local LLM and TTS for enabled providers; if AI image/video enabled, genuinely generated media and model/VRAM/license evidence; no silent remote transfer or paid fallback; quota/429/timeout must fail closed. Unavailable GPU **does not block** unrelated import/editor features.
3. **Media:** local HyperFrames **0.8.159** exact dependency, real SP-04 queued MP4 H.264/AAC, FFprobe/SHA/frame count + human Vietnamese subtitle/music/voice quality. Benchmark optional FFmpeg/manual path separately. 14.3s five-scene fixture is useful proof but not 35+ minute proof.
4. **Reliability / security / performance:** real 2100–2400s 1080p output with walltime/CPU/RAM/disk and conditional GPU metrics; worker OS kill/restart, no stale published partial media, safe path/secret controls and dependency audit.

## Evidence before this change (historical and still valid)
- 2026-10-17 Windows Server 2022 hosted CI run `39022682686`: genuine 14.3s 5-scene HyperFrames MP4 with 10 Vietnamese subtitle cues, music, H.264/AAC and 429/429 frames; manual A/V review not done.
- Hosted CI run `39024552073`: Vite/Fastify/browser *pairing page*, security/audit and **synthetic** SQLite OS-child kill checks passed. No actual 35min renderer crash recovery or Windows 11 editor acceptance.
- Latest Linux CI on `main` before this branch `39089211894`: offline and real build/HTTP jobs PASS. No native ComfyUI/Wan GPU or 35–40min mixed video was verified.
- R2-VID-02, R3-08, R3-VID-03 guards/read-only probes improved on Oct 18. Genuine native GPU/35min HyperFrames remain outstanding.

## Changes in this branch
- `docs/LOCALHOST_BACKLOG_POLICY.json`: explicit scope, platform-neutral gate replacements, 14 targeted overrides for critical acceptance, independent milestone profiles and optional paid policies.
- `tools/localhost-backlog.mjs`: deterministic transform. Changes **remainingGate**, future pending status labels, critical task titles/priority and milestone requirements; preserves `verifiedTests`, `statusEvidence` and historical acceptance summaries.
- `tools/fi04-merge-backlog.mjs`: regenerate and compare normalized canonical JSON with no external calls.
- `tools/fi04-backlog.test.mjs`: assert all 69 IDs, no mandatory Windows gates, release NOT_READY, hosted evidence still present, and unknown overrides fail closed.
- `README.md`, `AGENTS.md`, `docs/FI04_BACKLOG_REVIEW.md`, `docs/WORKLOG.md`: navigation and agent continuation.

## Next agent checklist
1. Run `npm run backlog:check:fi04`, `npm run test:fi04`, `npm run check`, `npm run test:all:batched`, `npm run build:web` and real `npm run test:live-http` with reviewed `npm ci`. CI results should be attached to the PR; never infer pass from task metadata.
2. Record browser usability and A/V manual signoff, using actual localhost authenticated UI. Browser/headless automated tests are incremental evidence only.
3. If local hardware is not available, continue non-hardware browser/API robustness and document specific blockers; do not mark native GPU or 35min acceptance PASS.
4. Keep code intent comments and append completed edits, test observations, blockers and next decisions to `docs/WORKLOG.md`.

**No application runtime, stored data, selected renderer or paid-provider behavior is changed by this backlog-scoping update.**
