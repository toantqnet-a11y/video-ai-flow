# WI-03 — Windows-hosted integration evidence (2026-10-17)

## Observed GitHub Actions
Successful hosted runner: **39014629188**, job **117344045599** at commit `0cd0f1c`. This is GitHub **Windows Server 2022**, not the owner's Windows 11 desktop.

| Gate | Actual observation |
| --- | --- |
| Node 22, verified 7-workspace lock | PASS |
| `npm ci --ignore-scripts` (165 packages on hosted Windows) | PASS |
| Generated OpenAPI/SDK artefacts | PASS after enforced LF via `.gitattributes` |
| SDK typecheck and Vite production build | PASS |
| Real Fastify HTTP smoke (auth, channel/avatar, version conflict) | PASS |
| WI-01/WI-02 focused Node tests | 19/19 PASS |
| Real ephemeral Fastify TCP on loopback, graceful shutdown, port release | PASS |
| **Real headless Chrome/Edge DOM** | PASS: compiled React pairing card observed, not just static HTML |
| Windows prerequisites | 10 PASS / 2 BLOCKED: FFmpeg and FFprobe absent |
| Local HyperFrames `0.8.159` package/CLI path | Prerequisite presence PASS, **no MP4 rendered** |
| Windows interactive Timeline / drag & trim / A/V | NOT TESTED |
| Genuine HyperFrames 5-scene MP4 and 1080p 35+ min | NOT TESTED |
| User Windows 11 workstation, GPU/ComfyUI, provider inference | NOT TESTED |

The Windows runner did not have FFmpeg/FFprobe. Installing via Chocolatey failed due **upstream HTTP 504** (run 39014421247); it is intentionally treated as a separate media prerequisite, not hidden or replaced by a mock. No successful Windows media render has been demonstrated.

## Boundaries / operational controls
- Disposable temp SQLite, isolated Chrome/Edge profile, real loopback only.
- API worker suppresses one-time pairing secret; browser verifies unauthenticated pairing form, not authenticated editing.
- No cloud model call, paid provider, Windows GUI human check, production data or renderer fallback.
- Neither hosted Windows runtime PASS nor existing Linux CI PASS means product release READY. **Release NOT_READY**.

## Follow-ups
1. Provision trusted FFmpeg/FFprobe in Windows acceptance environment (avoid assuming unreliable Chocolatey feed).
2. Run installed HyperFrames real 5-scene MP4 with Vietnamese subtitles/music and inspect it.
3. Verify Chrome/Edge authenticated Timeline drag/trim/waveform at 120–500 scenes on Windows 11.
4. Run 35+ minute Full HD job, forced restart/resume, AI providers and production security acceptance.
