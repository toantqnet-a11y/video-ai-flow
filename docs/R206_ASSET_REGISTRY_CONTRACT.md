# R2-06 — Asset Hash, Revision Registry & Reconciliation (2026-10-15)

## Implementation boundary

- SQLite **v24**, append-only; v1–v23 SQL and checksum ledger unchanged. Upgrade via `openProjectDb` with verified WAL-safe backup. `asset_content_index` maps SHA-256 to byte length / first-seen time; triggers register new immutable revisions and fail on digest+byte-size inconsistency.
- Revision rows (`asset_revisions`) remain per-scene, per-job immutable, each preserving source/path/metadata. Only `state` may transition `committed ↔ missing` during safe reconciliation. Existing `scene_image_manual_selections` and voice/image intent fences remain authoritative.
- **Logical deduplication only:** content identity + same-scene same-source same-metadata manual import reuse. This avoids duplicate manual file writes within a scene. Two different scenes and generated jobs NEVER hardlink or re-use revision IDs merely because bytes match. Global physical disk dedupe was deliberately not attempted: hardlinks could make external mutation corrupt many revisions at once. R2-07 may consume hashes to avoid unnecessary compute; R2-09 controls larger uploads.
- Manual image import uses `expectedRowVersion` **and** the starting image-job intent (id/hash). FFmpeg validation, disk rename and transaction race safely: only the exact still-current scene + intent can accept a new manual asset. Image selection similarly fences intent changes. `onCommitted` runs in same SQLite transaction as revision insertion + active pointer switch + cancellation of old image intent. Failure preserves DB state; any disk orphan is listed, not auto-deleted.
- Queue promotion keeps R2-03/R2-05 pre/post intent check and SQLite `BEGIN IMMEDIATE` lock, job-id idempotency, checksum validation and immutable asset ID semantics. No second queue and no extra provider invocation.

## Read API inside Node core (no new HTTP route)

- `manifest.contentInfo(sha256)` → `{sha256,bytes,revisions,committed}` or null; counts metadata records, not physical disk saving.
- `await manifest.verifyRevision(assetId)` → `healthy | missing | corrupt | unsafe | unknown`. Performs stat / realpath boundary / streamed SHA-256 check; intentionally read-only.
- `await manifest.reconcile({scanOrphans:true})` → `{missing,corrupt,restored,orphans,unsafe}`. Missing includes corrupted/unsafe for compatibility with old diagnostics. Updates only state. Does **not** clear pointers, delete media or follow symlinked folders. Restore file bytes and rerun to return `state='committed'`.
- `await manifest.planRecompute(videoId)` → scene-level `voice` and `visual`: `reuse | regenerate | not_generated`; visual can be `manual_preserved`. Compares saved source/config/intent/job provenance + file checks. No jobs enqueued, no provider run, no silently generated assets; downstream R2-07 may use the plan to requeue affected scene kinds after explicit policy gates.

## Guarantees / non-goals

- Every accepted row contains an immutable checksum. Uploaded file bytes are never overwritten in-place by this code. Existing user-selected manual media stays pinned when text/prompt changes until explicitly replaced. Failed manual promotion leaves a nonactive disk orphan only; it cannot clobber a selected asset or a later job intent.
- Full crash recovery, queue DAG, live FFmpeg duration-to-frame synchronization and physical GC are future R2-07/R2-09 work. This sprint does **not** unlock historical scene replacement rules (R2-01 still blocks replacing scenes once revisions exist).
- API responses must never expose absolute paths or original prompt content; this implementation adds no new HTTP routes. `reconcile` path diagnostics are internal operator-only.
- No real Windows, GPU, ComfyUI, local TTS, long-form render or browser runtime is proven by these tests.

## Verification

```sh
npm run test:r206
npm run test:r205
npm run test:all
npm run check
npm run typecheck:sdk
npm run build:web  # pending: Vite not installed in offline workspace
```

## R2-07 handoff

Use `planRecompute` as a **read-only** input to existing SP-04 queue recovery, never as spend authorization; implement robust job dependency/retry/resume and the explicit user approval for real AI invocations. Do not alter v24 migration SQL once released.
