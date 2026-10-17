# FI-01 — Final Integration: HyperFrames runtime & release hardening
Date: 2026-10-16 · Status: CODE_COMPLETE_TESTED_OFFLINE / RELEASE_NOT_READY

## Scope and decision

1. User-selected renderer remains **HyperFrames PRIMARY**. FFmpeg remains an explicitly selected render fallback and a permitted post-processor for BGM / media preparation. No automatic renderer switch or paid provider calls.
2. Root `package.json` now pins local `hyperframes` at **0.8.159** (exact, not `latest` / caret); `findHyperframesCli()` refuses a missing/mismatched local package or unsafe CLI path. It never uses `npx` or global PATH for the production default. Injected custom binaries are for tests only.
3. Immutable HyperFrames render output fingerprint now includes the pinned renderer version. Upgrading the renderer invalidates previous render-cache identity.
4. Windows launcher explicitly checks `node_modules/hyperframes` in addition to Fastify/Vite/React before claiming local runtime dependencies are ready.
5. Release audit checks pinned CLI, dependency-lock consistency and optional genuine render evidence. `--verify-real-hyperframes` is opt-in, actually executes a 5-scene HyperFrames/SQLite queue render plus edited two-cue Vietnamese subtitle/BGM proof when the exact local CLI is installed. Lack of a CLI is **BLOCKED**, never PASS.
6. `tools/fi01-hyperframes-finishing.mjs` is an independent end-to-end **real-only** acceptance. It validates source assets and saved cue version, performs local audio import, queues a HyperFrames render and FFmpeg BGM postmix, verifies H.264/AAC/fps/frame count/SRT/music metadata/digests; returns nonzero on missing renderer or failure. It does not claim subjective on-screen quality or audio loudness approval.

## Bootstrap on an online Windows developer PC

**This delivered source archive has NO npm lockfile**: npm was unavailable (`EAI_AGAIN`). The existing Windows launcher supports first-time `npm install`, but such a first install cannot be considered dependency-reproducible until `package-lock.json` is generated and committed.

From the extracted workspace, use Node >=22.13, npm, FFmpeg, and an installed Chromium/Chrome runtime supported by HyperFrames:

```powershell
npm install --package-lock-only --ignore-scripts
# Inspect package-lock.json before committing it; ensure node_modules/hyperframes version is 0.8.159.
npm ci
npm run build:web
npm run test:live-http
npm run test:all
npm run audit:r408:verify
npm run acceptance:fi01:hyperframes
```

`npm ci` MUST have a checked-in lockfile; on offline machines it cannot succeed until dependencies are cached. To run the normal application: `./Run-Windows.ps1 -Mode start` after first installation. Do not make runtime success claims from a CLI `--help` exit code alone.

## Remaining release gates

- Real HyperFrames render with visually verified edited multi-cue subtitles, audible voice/music and FFprobe frame/codec QA.
- Windows/Vite/React/Fastify API and browser UX; validate user gesture, drag/resize, background upload, persistent revisions, exported SRT.
- At least one 35-minute project render through the application queue, resources/duration/frame checks, RAM/CPU/GPU/disk/time metrics and process-kill/restart evidence.
- Production security review, package vulnerability audit, browser permission and secret-store behavior; real provider smoke with explicit consent (zero automatic paid calls).

### Performance & truthfulness

The full offline Node suite passing does NOT imply Browser, Windows, live HyperFrames, actual GPU, production security, or 35-minute production render acceptance. `releaseStatus=NOT_READY` until all required gates have first-party evidence.
