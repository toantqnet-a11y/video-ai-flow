# FI-04-06 → FI-04-10 Agent handoff
Read `docs/FI0406_FI0410_CONTRACT.md`, `docs/FI0406_FI0410_TEST_REPORT.md`, `docs/FI0406_FI0410_STATUS.md`, then tail `docs/WORKLOG.md` and `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json`. No repository-wide scan needed.

## Changed
- `tools/fi0406-long-render.mjs`: actual Windows HyperFrames enqueue on existing 35–40min published project with multi-gate QA. Real host blocked.
- `tools/fi0407-recovery-worker.mjs` / `fi0407-recovery.mjs`: disposable OS-process SIGKILL + persistent SQLite lease + fencing proof; not production render.
- `tools/fi0408-provider-e2e.mjs`: safe, read-only fixed loopback health checks, never inference.
- `tools/fi0409-security-performance.mjs`: focused local security regression, separately consented npm audit.
- `tools/fi0410-final-release.mjs`: fail-closed inventory, no historical-media promotion.
- Common report-path/safety logic `tools/fi04-final-gate-core.mjs`, 19 focused tests, Windows staged runbook, package scripts, generated 66-task roadmap; no schema migrations/provider charges.

## Pending blockers
Real verified package-lock + `npm ci`, Vite/Fastify, real HyperFrames short FI0404, Windows timeline FI0405, Windows long FI0406, real long process kill FI0407, actual LLM/TTS/ComfyUI inference FI0408, npm/security operator audit FI0409, release approval FI0410. Security/long/AI cannot be certified by static unit tests. Do not silently choose FFmpeg.

## Next on Windows
1. `FI04-Windows-Setup.ps1 -ResolveLock` (review & commit); `-Install`; `-Verify` on a secure machine.
2. `FI04-Hyperframes-Acceptance.ps1 -Run` and UI Windows Timeline acceptance. Record real short proof + manual A/V.
3. Use a duplicated, *non-sensitive* test project with approved 35–40min published Composition v2, music and cues; run `FI04-06-10-Windows-Acceptance.ps1 -Stage Long ...`. This modifies test DB/media, never run on only copy.
4. Run real OS restart during a distinct long job and review JobStore attempts/recovery plus output hash; test disk-full. Separately test native LLM/TTS/ComfyUI with explicit approval. Observe security/GPU/VRAM in OS tooling.
5. Complete security audit, all-suite repeat and human browser/audio approval; production stays `NOT_READY` until then.
