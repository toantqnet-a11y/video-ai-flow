# R4-02 → R4-08 — implementation contract (2026-10-16)

## Actual delivered scope

| Task | Implemented | Incomplete / acceptance blocker |
|---|---|---|
| R4-02 Verified backup/restore | `packages/core/src/maintenance-r402-r403.mjs`, `tools/r4-maintenance.mjs`: hot-WAL-safe SQLite `VACUUM INTO`, `quick_check`/FK check, SHA256 and byte-count per referenced media and render/avatar media, atomic directory publish, secret files excluded; manifest/path/symlink traversal guard; dry-run by default; explicit restore to brand-new DB/data directory with portable relative paths. | No scheduled backups, in-app restore dialog, encrypted archives, test of 100 GB archive, off-machine Windows restore, external music imports if not app-managed. **Stop the app before restore**. |
| R4-03 Storage/cleanup | Inventory all files, count referenced bytes, flag only known staging leftovers >24h old, optimistic plan digest, explicit quarantine move OUTSIDE dataRoot; preserves orphan user files/cache. | No general garbage collection, UI cleaning wizard, size quotas, disk exhaustion/recovery QA. |
| R4-04 Advanced Job Center | UI search by ID/type/scene, group counts/status and stale-pending flag; existing authenticated durable SSE and explicit per-job actions preserved. No secrets in filter model. | No bulk job mutations, priority reorder or large historical pagination UI. |
| R4-05 Subtitle Editor | SQLite **migration v32**, optimistic independently persisted draft, multi-cue per-scene frame validation, UTF-8 SRT preview/scene editor and authenticated API GET/POST/PUT. Frozen approved Composition and rendered output remain unchanged. | Draft SRT is **NOT burned into MP4**. No real word-alignment or native multi-speaker editing; must pin approved revision to render in future change. |
| R4-06 Background Music | Local FFmpeg isolated second-pass `mixMusicIntoMp4`, checksum-verified input pin, hard volume cap, loop and fades, H264 video-copy + AAC QA. Actual 1-second MP4 mux test PASS. | Does **not** run in HyperFrames primary render worker / queued export path. No in-app music upload/track management, ducking, licensing metadata, waveform editing. This is **service primitive only**, not end-to-end feature. |
| R4-07 Character/style consistency | Deterministic read-only prompt-token inspection, warnings for absent style tokens/assets, authenticated preview endpoint and Timeline panel. | Prompt lint does **not** prove same face/character art across frames. No reference image identity embeddings/control-net integration. |
| R4-08 Release/security/performance | `tools/r408-release-audit.mjs` fail-closed evidence report; 10 R4 focused tests, API schema/SDK, negative-control, 1s real music MP4. | Not a production security penetration test, not 35-min profiling, no actual Windows/Vite/Fastify/browser/HyperFrames acceptance. Release **NOT_READY**. |

## Operator commands (local project stopped for restore)

```bash
# DB is the shared WAL-backed SQLite database; DATA is the configured media root.
node tools/r4-maintenance.mjs backup /path/studio.sqlite /path/data /external/backup-2026-10-16
node tools/r4-maintenance.mjs verify /external/backup-2026-10-16
node tools/r4-maintenance.mjs restore-dry-run /external/backup-2026-10-16 /new/studio.sqlite /new/data
node tools/r4-maintenance.mjs restore-to-empty /external/backup-2026-10-16 /new/studio.sqlite /new/data --confirm-new-target
node tools/r4-maintenance.mjs inspect /path/studio.sqlite /path/data
# Only after inspecting the returned paths and confirming the digest:
node tools/r4-maintenance.mjs quarantine /path/studio.sqlite /path/data /external/quarantine <PLAN_DIGEST>

npm run test:r402-r408
npm run test:r401
npm run check
npm run typecheck:sdk
npm run test:negative-control
npm run audit:r408
```

## Critical invariants

- The secret vault, credentials, `.env`, keys, unreferenced root files are excluded. Never mistake this for a full credential backup.
- Do **not** copy hot SQLite main file alone: `VACUUM INTO` reads WAL-consistent committed pages.
- Restore rejects any pre-existing destination and validates ALL included assets before writing. It restores to a *new location only*, without rewriting immutable relative paths. A backup doesn't overwrite the source app.
- No recursive cleanup: quarantine only old, named staging files after verifying plan digest; orphan user media remains.
- SQLite subtitle draft v32 does not edit the approved Composition digest, source script, media or existing render. Browser must label it as independent SRT draft.
- Music second pass must only use an explicitly pinned local path and new output filename. The normal render queue still uses original output; never claim it is music-enabled.
- HyperFrames remains primary. FFmpeg remains a consciously selected fallback for original render jobs, plus controlled tooling for media processing. No auto-switch or paid provider call.
- Never mark Windows, 35-minute HyperFrames, local TTS/ComfyUI, disk-full recovery, ZIP >4GiB or production Vite acceptance PASS without observed evidence.
