# ContentStudio — Sprint 0 Status (after ARC-01)

**Updated:** 2026-10-13. No Windows machine available. Windows/GPU and provider live tests are deferred as requested by PO; not silently marked Done.

| Task | Status | Evidence / unresolved condition |
|---|---|---|
| SP-01 FFmpeg | TESTED_LINUX / PENDING_WINDOWS | 4/4 PASS; synthetic 5/35-minute fixture, 1080p benchmark pending |
| SP-02 Voice/TTS | TESTED_OFFLINE / PENDING_LIVE_PROVIDER | 22/22 PASS; Edge service not called live |
| SP-03 Image | TESTED_PROTOCOL / PENDING_GPU | 35/35 PASS; real import, mock ComfyUI protocol |
| SP-04 Job Queue | TESTED_LINUX | 15/15 PASS; 100-job crash recovery prior; queue used by ARC-01 |
| SP-05 Timeline | TESTED_ENGINE / PENDING_BROWSER | 16/16 PASS; 500-scene browser profiling pending |
| SP-06 Security | TESTED_MODULE / PENDING_WINDOWS | 33/33 PASS; passphrase vault integrated in ARC-01 API code, Windows DPAPI pending |
| SP-VID-01 AI Video | TESTED_PROTOCOL / PENDING_AI_GPU | 21/21 PASS; mock protocol, real MP4 import not live AI |
| **ARC-01 Architecture** | **CODE_COMPLETE + TESTED_OFFLINE** | **22/22 PASS**. Unified monorepo, schema/migrations, REST/SSE route code, one queue, providers, vault, asset promotion, React UI; Fastify/Vite runtime blocked by offline npm |

**Sprint 0 test total:** 168/168 PASS in available Linux automated suites (22 new + 146 regressions). **Not production acceptance**: Windows/hardware/browser/live AI validation pending. R0-01 has now begun as Release R0; see `R0_Status.md` for current state.

**PO blockers:** none. Paid API OFF, remote consent required. No actual video generation from AI model yet.

### Release R0 continuity (2026-10-13)
R0-01 CODE_COMPLETE / TESTED_OFFLINE (35 Node tests). **R0-02 CODE_COMPLETE / TESTED_OFFLINE** (51 Node tests including 16 migration hardening tests; seven SPIKE suites 146 regressions). Next R0-03 security integration. Original S0 Windows/GPU/network/provider/browser acceptance stays deferred; see `R0_Status.md` and `docs/HANDOFF.md`.


### Release R0 continuity (2026-10-14)
R0-04 Diagnostics **CODE_COMPLETE / TESTED_OFFLINE** (79/79 app tests and 146/146 SPIKE regressions), local sanitized FFmpeg/SQLite probe successful. R0-05 OpenAPI/typed SDK next. Original Sprint 0 hardware, Windows, real ComfyUI, Fastify HTTP and browser tests remain pending. See `R0_Status.md` / `docs/HANDOFF.md`.

## R0-05 continuity note — 2026-10-14

Sprint 0 remains CODE_COMPLETE / TESTED_OFFLINE with known Windows/browser/provider gaps. Release R0 has advanced through R0-05, which added 35-op OpenAPI 3.1, TypeScript SDK and 16 new passing contract/client tests. Canonical current status: `R0_Status.md`, `docs/HANDOFF.md`. Do not mistake R0-05 generated spec for verified Fastify runtime schema validation.

> 2026-10-14 R0-08 follow-up: canonical preset schema and immutable revisions pass 108 app + 146 spike tests. Sprint0 Windows/GPU/browser validations remain deferred; see R0_Status.md.
