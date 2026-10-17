# AI Agent handoff: R4-05 / R4-06 / R4-08 · 2026-10-16

Read in order: `docs/R405_R406_R408_COMPLETION.md` → `docs/R405_R406_R408_TEST_REPORT.md` → this document → tail `docs/WORKLOG.md` → `AGENTS.md`. Do not rescan all historical tasks.

## Where code changed

- `packages/core/src/render-finishing-r405-r406.mjs`: validates immutable cues, source digest, music pins/settings, derives SHA identities.
- `packages/core/src/music-import-r406.mjs`: capped base64 music import, FFprobe, local content-addressed file path, read-only library listing.
- `packages/core/src/r4-editor-music-style.mjs`: QA-strengthened postmix (frame count, input pin verified again; source MP4 not overwritten).
- `packages/core/src/render-ffmpeg-r2ext04.mjs`: optional frozen SRT burn-in and distinct output fingerprint.
- `packages/core/src/render-hyperframes.mjs`: optional time-locked HTML cue overlay and distinct output fingerprint. Real HyperFrames renderer **not installed** here.
- `apps/api/src/render-export-r2ext0406.mjs`: opt-in preflight, frozen enqueue snapshot, worker integration for both primary and fallback, QA and same-SRT export.
- `apps/api/src/controllers.mjs`, `apps/api/src/routes.mjs`: music import/list routes via existing authentication.
- `apps/web/src/RenderDrawerR312.jsx`: subtitle-draft revision selection and music file/library settings with rights acknowledgement.
- `packages/contracts/src/catalog.mjs`, generated OpenAPI/SDK types, `tools/r408-release-audit.mjs`.
- `packages/core/src/maintenance-r402-r403.mjs`: managed music included in portable verified backup.
- `apps/api/test/render-finishing-r405-r406.test.mjs`: real offline E2E and safety. Two legacy migration **test fixtures** updated to remove newer v32 tables when downgrading an artificial DB (no migration changes).

## Run commands

```
npm run test:r405-r406
npm run test:r312
npm run check
npm run typecheck:sdk
npm run test:negative-control
npm run audit:r408:verify
npm run audit:r408 -- --strict  # intentionally returns nonzero while NOT_READY
```

## Important invariants

- Render snapshot is immutable: copied subtitle cues and music pin must NOT be read again from live editor at worker time. All media SHA verification stays fail-closed.
- Keep HyperFrames primary and FFmpeg explicit user fallback. FFmpeg is used solely for a permitted local postmix even when primary engine selected; this is not a silent renderer fallback.
- Music must be explicitly selected; source input pinned locally; never call a paid provider or remote URL.
- Do not claim full suite, Windows browser, live HyperFrames, 35-minute performance or security production acceptance without fresh evidence. Release `NOT_READY`.

## Suggested next hardening

1. Install locked dependencies on Windows; run Vite/Fastify and web UI editor integration.
2. Render a real HyperFrames sample with altered multi-cue captions + music postmix and compare visible captions/audio against SRT frame clock.
3. Run >35-minute output and interruption/recovery test; measure wall time, peak RAM, disk headroom, GPU.
4. Add streamed music upload >640 KiB, explicit licensing metadata, optional ducking; optimize long audio second pass.
5. Address remaining R4-04 bulk Job Center and R4-07 actual visual consistency validation separately.
