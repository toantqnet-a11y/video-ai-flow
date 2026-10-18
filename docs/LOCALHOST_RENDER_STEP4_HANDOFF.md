# LOCALHOST-05 — Render history resume + real browser HyperFrames/cache acceptance

**Decision:** Video AI Flow is a localhost Web App: React/Vite browser + Fastify loopback + SQLite/SP-04. It is NOT Windows Desktop or Electron.

## Implemented production behavior
- `GET /api/videos/:id/renders?limit=1..20`: authenticated read-only *video-scoped* SQLite join of immutable `render_snapshots` and durable `jobs`. Returns only sanitized public `RenderExportStatus` fields, never raw prompt, tokens, paths, queue leases, or foreign-video jobs.
- The Timeline on mount/re-pair restores the latest 10 render records without enqueueing a job. A dropdown selects earlier exports, even if the source has since changed. The existing protected MP4/SRT/thumbnail routes remain the only download mechanism. A refresh button rereads SQLite.
- Successful SP-04 jobs show actual `segmentCache.{reused,encoded,total}` counts in the drawer, **not guessed speedups**; neither selecting history nor refreshing consumes media/AI quota.
- Contract and route security policies: strict `limit` query; OpenAPI 3.1, generated SDK declarations, request-policy allowlist and real Fastify tests kept in sync. OpenAPI describes localhost Web App, not Windows Desktop.

## Automated acceptance
- `apps/api/test/render-history.test.mjs`: independent real SQLite videos/jobs/snapshots, per-video isolation, read bound, idempotency/no dispatch, and private payload fields excluded.
- `tools/live-http-smoke.mjs`: actual Fastify 401 unauthenticated, 200 own empty history, 400 invalid limit, 403 forbidden query.
- `tools/localhost-browser-e2e.mjs` standard mode: authenticated real Chrome UI, new video renders history as empty, hard refresh/operator re-pair keeps SQLite and shows no phantom MP4.
- Opt-in `--render-fixture` in Linux HyperFrames CI: test the **same browser-approved Master and saved scene revisions**, attach committed local WAV/PNG media only, click Refresh → approve timing → click genuine Render, await SP-04 HyperFrames MP4, click authenticated MP4 download; then explicitly render same immutable composition again and assert genuine HyperFrames **scene-cache warm hits**.
- The five-scene direct renderer fixture in the same workflow remains a separate golden media proof. None of the tests uses paid/cloud AI inference.

**Acceptance honesty:** CI reports must show each stage and MP4 QA; a green production build alone is NOT real browser rendering. Until the opt-in browser render job passes, mark it BLOCKED, not PASS. Human legibility/music listening and long 35–40-minute rendering, interruption recovery, native ComfyUI/Wan remain outstanding. Release `NOT_READY`.

## Important technical limitations
- History exposes only 10 most recent jobs in the Timeline; bounded backend supports up to 20 per call. Older jobs remain durable in SQLite and may be accessed from API/Job Center with appropriate authorization.
- A re-pair still requires the explicit operator `pair` command in interactive terminal; tokens aren't persisted.
- A successfully rendered old MP4 can be downloaded after source edits, but is marked stale via `sourceCurrent`. It is **not** silently replaced or re-rendered.
- Real media fixture WAVs are pre-recorded test assets; their correctness **does not** prove native TTS or AI-video inference.

## Handoff
Run `npm run check`, `npm run build:web`, `npm run test:live-http`, `node --test apps/api/test/render-history.test.mjs`, then real browser CI and HyperFrames proof. Inspect CI logs/artifact URLs in this PR. Next: measure real multi-scene cache hit/miss with edited scene and compare human-visible transitions; 35–40-minute 1080p with strict resource budgets, crash/restart test and human QA.
