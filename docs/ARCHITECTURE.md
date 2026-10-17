## R0-07 — AI Provider Metadata Registry

`provider_accounts` → `provider_models` → `provider_usage_events` in canonical SQLite v8. `credential_id` references SP-06 passphrase Vault by opaque ID, and binding is validated via vault metadata. No separate database or queue. Provider templates and account-local settings live in `packages/core/src/provider-accounts.mjs`, known local GET readiness in `packages/providers/src/readiness.mjs`. The asset generation adapter registry remains independent until safe live execution routing is implemented. UI calls Typed SDK via `ProviderWorkspace.jsx`; ingress security guards apply to all endpoints.

Migrations v1–v7 remain byte-for-byte unchanged. Cost/availability are not implied by configured metadata; R0-07 only previews eligibility/fallback, not live execution.

---

# ARC-01 + R0-01 — Architecture & Integration Baseline

## Flow

```text
Browser React/Vite/Zustand (127.0.0.1:5173, Vite proxy)
  ├─ Pairing / Bearer+CSRF / local-only
  ↓
Fastify API (127.0.0.1:4311)
  ├── controllers → StudioRepository → SQLite studio.sqlite
  ├── Vault REST → SP-06 PassphraseVault (encrypted file in /data/secure)
  ├── JobStore SP-04 ───► JobRunner SP-04
  │                        ├─ system:diagnostic (actual ffmpeg probe)
  │                        ├─ asset:voice (SP-02 Edge, remote opt-in)
  │                        ├─ asset:image (SP-03 ComfyUI, explicit workflow)
  │                        └─ asset:video (SP-VID-01 ComfyUI, explicit workflow)
  ├── Queue jobs/assets/outbox in same SQLite file
  ├── AssetManifest (promote fenced result + reconcile physical asset)
  └── SSE durable outbox events → browser Job Center
```

### Storage

- `/data/studio.sqlite` WAL + FULL synchronous mode. Migration checksums prevent silent migration rewriting.
- SQLite migration 1: `channels`, `videos`, `scenes`, `timeline_documents`, `asset_revisions`, `domain_events`.
- Migration 2: immutable `preset_revisions`, `config_keys`.
- Migration 3: `asset_revisions.job_id UNIQUE` for replay-safe queue promotion.
- **Migration 4 (R0-01):** `channels.deleted_at` reversible tombstone + `channel_create_keys` for restart-safe idempotent creation.
- SP-04 initializes `jobs`, `dependencies`, `attempts`, `assets`, `outbox` **in that same DB file**; no new queue implementation.
- `/data/assets/{videoId}/{sceneId}/{kind}/uuid.ext` stores manual imports. SPIKE generated files are written under local data root and promoted via job_id.
- `/data/secure/secrets.vault.json` contains AES-GCM encrypted credentials, never plaintext.

### Queue ↔ Asset two-phase reconciliation

1. Job handler executes provider and atomically saves a file under the controlled `/data` root (provider SPIKE implementation).
2. SP-04 JobStore validates the currently held worker lease and atomically inserts queue asset + `succeeded` status + outbox event.
3. Asset promotion validates file SHA-256 and membership in `/data`, inserts domain `asset_revisions` and sets active scene pointer in one transaction.
4. On restart, pending successful queue assets without a domain revision are promoted idempotently using `job_id UNIQUE`.
5. Corrupted/missing file remains visible as an error and is never automatically used. A provider call **may have been billed twice** if a crash occurred before job fencing; provider-level idempotency is separate scope.

### Schema ownership and invalidation

- Channel preset immutable revisions; video copies preset snapshot. No background resync to old videos.
- `row_version` optimistic locking for channel/video/timeline.
- Scene regeneration only after version-specific source hash; current queue key fingerprint includes scene content and media config.
- Replacing scenes is currently forbidden after assets exist. R2 will introduce scene-level editing with precise invalidation and a richer revision graph.
- `asset_revisions` intentionally immutable; active pointers exist in scenes.

### Security invariants

- Only 127.0.0.1 listeners. Exact Host, trusted Origin, no CORS. Vite origin allowed only in dev.
- One-time printed pairing code; bearer+CSRF in memory only. Do not put credentials in URLs or localStorage.
- After 5 failed pairs, restart is required. Missing/unapproved cost/privacy approval fails closed.
- No HTTP plaintext secret retrieval. Server-only use of `vault.getSecret` by future provider adapters.
- Vault passphrase remains in memory only while unlocked; Windows DPAPI postponed until Windows environment available.

### Operating constraints

- Node 22.13+, npm install required for Fastify/Vite/React/Zustand. Npm registry unavailable in build sandbox.
- No GPU inference verified; ComfyUI binding requires a real exported API workflow + model checkpoint before provider is registered.
- FFmpeg availability is checked via real `spawn('ffmpeg',['-version'])` diagnostic job.
- Full 1080p 30–40 minute rendering is an R3 acceptance milestone, not validated here.

### R0-01 Channel lifecycle

- `channels.status` remains `active|archived` for backwards compatibility. `deleted_at IS NOT NULL` represents soft deletion.
- Active queue jobs belonging to videos in a channel block archive and soft delete to avoid orphaning running work.
- Preset changes are validated by server against a nested field whitelist (credentials rejected) and persisted to immutable preset revisions only when changed.
- Video `preset_snapshot_json` is never changed when a channel's default preset is updated.
- Frontend channel settings use optimistic `rowVersion`; server returns 409 to prevent blind overwrite.

### R0-02: Schema upgrade & crash safety

- Canonical `packages/core/src/db.mjs`: applied migrations `v1..v5`; **v1..v4 SQL preserved unchanged** so stored checksums remain valid.
- v5 enforces `asset_revisions.scene_id` belonging to `asset_revisions.video_id` via insert/update triggers, adds `idx_videos_status_updated`, sets `user_version=5`.
- On every startup with existing schema, validate migration ledger (checksum, consecutive versions, no newer unknown schema), required tables/columns, SQLite `PRAGMA quick_check`, FK relationships, cross-video asset reference. Detect change before writing.
- When any migration is pending on an existing nonempty database, take a **WAL-aware `VACUUM INTO`** snapshot in the same directory. Verify snapshot opens cleanly and restrict backup to owner permissions on POSIX. Snapshot name `studio.sqlite.pre-v5-<timestamp>-<suffix>.sqlite`.
- Each migration runs in `BEGIN IMMEDIATE` + `COMMIT` with matching checksum record. Failure rolls back DDL; existing data and snapshot remain untouched; no automatic restore.
- New DB initialization uses no redundant backup; existing queue-only SP-04 DB is also backed up before adding domain schema; SQLite in-memory tests are migration-equivalent without filesystem snapshot.
- Operational offline commands: `node tools/db-maintenance.mjs inspect <path>` (metadata only) and `backup <path>` (verified manual snapshot). Safe full restore requires a stopped application and separate validation; R4 will introduce controlled UI/CLI recovery.


### R0-04 — Diagnostics read model (no remote side effects)

- `apps/api/src/diagnostics.mjs` evaluates CPU/RAM/disk, SQLite connection/WAL, FFmpeg/FFprobe H.264/AAC encoder presence and NVIDIA via `nvidia-smi` (if present). Uses isolated subprocess calls, fixed commands/args, timeouts, bounded stdout; displays none of raw output or local file paths.
- `GET /api/system/diagnostics` returns a 30s cached/sanitized snapshot. `POST /api/system/diagnostics/refresh` forces a new sample with existing Bearer+CSRF security. Concurrent requests share one in-flight probe.
- Registered remote AI providers are only listed as "not probed"; no remote network requests, model generation, credentials or paid escalation. If an explicit ComfyUI local workflow exists, the service may check *literal 127.0.0.1* `/system_stats` status without following redirects, and still marks `inferenceVerified:false`.
- `apps/web/src/DiagnosticsDashboard.jsx` renders four readiness indicators, machine/media/provider cards, guidance, warnings and a refresh button. Presentation codes are mapped in `diagnostics-view.mjs` to prevent leaking raw error strings to UI.
- No database schema change. This screen is operational telemetry, **not** a performance acceptance or hardware certification. Heavy SQLite integrity checks remain in R0-02 maintenance.

## R0-05 — Contract / SDK layer

`packages/contracts/src/catalog.mjs` is the authoritative operation inventory. `tools/generate-api.mjs` deterministically creates `docs/api/openapi.json` and TypeScript declarations. Contract drift tests compare method/path entries with actual route registrations. Frontend `apps/web/src/api.js` delegates to `packages/sdk/src/client.mjs` (ephemeral pairing, Bearer/CSRF, typed operations, event-stream cursor replay). This adds **no** new queue/database and does not permit paid AI escalation. HTTP runtime request validation and real Vite/Fastify tests remain integration work when npm is reachable.

## R0-08 preset persistence contract

`preset-schema.mjs` is authoritative for initial defaults and JSON shape in frontend, backend and OpenAPI. Each successful semantic preset change is saved under `(channel_id, version)` in SQLite `preset_revisions`; an additive v6 migration enforces history immutability at SQL level. The current channel row stores the latest preset, with separate `row_version` for optimistic mutation locking. Existing videos retain their `preset_snapshot_json` captured when the video was created. Neither the revision API nor the history UI rewrites prior video snapshots or requeues media. Provider account capabilities and explicit paid consent remain EP02/R0-07/R0-13 responsibilities.

## R0-11 — Video Config Snapshot Resolver

```text
channels.preset_json / immutable preset_revisions (EP01/EP10)
    │ createVideo copies origin vN; never auto-resolve from channel again
    ▼
videos.preset_snapshot_json (immutable original) ──────────────────────────┐
    │                                                                     │
    └── videos.config_revision ──► video_config_revisions (v1, v2, ...)   │
                 overrides_json → normalized field overrides ←────────────┘
                 resolved_json  → channel origin + overrides
                 impact_json    → affected voice/image/video/render/content
    │
    ├── POST /api/videos/:id/config/preview (read-only)
    └── PUT /api/videos/:id/config (rowVersion + review confirmation)
              └── transaction creates revision + audit; does NOT queue any jobs
```

- v7 migrates existing videos to version 1 and leaves migration checksums v1–v6 untouched; source snapshot and historical revisions are protected by triggers.
- Future regeneration must use the video's **effectivePreset** and read the persisted revision-impact metadata. Editing settings alone does not make assets fresh or overwrite file revisions.
- Queue tasks that use optional voice/image defaults now resolve video effectivePreset instead of the mutable channel preset.
- API authentication remains global paired localhost Bearer+CSRF; static capability metadata is **not** real provider quota or model availability.

### R0-13 – Paid provider execution boundary

````text
Authenticated React consent UI -> paid approval API -> SQLite v10
                                                    |
SP-04 JobRunner -> ProviderRegistry.invoke() -> Trusted cost estimate
                                                    |
                  PaidPolicyRepository.reserve() --+--> budget and job scope gate
                                                    |
                                      (only if approved) provider network call
                                                    |
                        settle (success) / uncertain (network failure) in SQLite
````

Only price-aware trusted adapters can register as paid. Unverified remote free providers default to denied unless explicitly vetted as no-API-billing (Edge TTS). The v10 cost ceiling is on estimates; actual provider invoicing/price drift must be addressed by provider-specific reconciliation and optional external provider billing caps.
