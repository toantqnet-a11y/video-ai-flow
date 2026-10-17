# R2-07 — Queue DAG, selective recovery & timing handoff

**Status:** `CODE_COMPLETE_TESTED_OFFLINE` (2026-10-15). Core and API contracts are implemented; live Fastify/browser, native TTS, ComfyUI GPU, Windows and 30–40 minute workload validation remain open.

## Purpose and boundaries

A user explicitly approves preparation of only selected scene assets. R2-07 creates a durable directed acyclic graph (DAG) on the **existing SP-04 SQLite job queue**; no new process scheduler, no paid/implicit provider fallback and no video rendering. A scene image is generated only for `image_motion` scenes with a healthy local ComfyUI provider. Voice uses existing R2-03/R2-04 voice adapters and the configured voice. The run ledger does **not** store credentials or source prompt text.

### Graph and execution

```text
[scene A voice] ─┐
                 ├─> [scene A gate / promote & verify] ─┐
[scene A image] ─┘                                      │
                                                        ├──> [final video assets gate]
[scene B voice] ─┐                                      │    (prepared; not rendered)
                 ├─> [scene B gate / promote & verify] ─┘
[scene B image] ─┘
```

A provider stage is omitted if its asset is healthy and its content/config hash matches. A manually pinned image is **never** replaced. `sceneIds` may restrict execution to up to 200 scenes; `planRecompute()` remains side-effect free. A preview is **never permission** to queue AI.

Submit writes queued jobs + dependencies + current scene intent hashes + `asset_dag_runs` and `asset_dag_nodes` in **one BEGIN IMMEDIATE transaction**, committed or rolled back together. Jobs retain their independent dedup keys; reused jobs are remapped to their real IDs before gate dependencies and intent records are committed. Request idempotency uses unique `(video_id,request_key)` + a digest of the request and rejects conflicts. `asset_dag_runs` does not FK to the SP-04 `jobs` table because core-only migration clients open without the queue schema; API/runner always share the same SQLite file.

**Restart / crash semantics:** SP-04 persists jobs and outputs. On restart the queue recovers expired leases with new fencing tokens; old workers cannot commit. Scene gates re-read the durable worker output and call `promoteQueueAsset`, which verifies hashes, current intent and file state. File rename and SQLite commit cannot be atomic together; R2-06 filesystem reconciliation identifies orphans and invalid assets non-destructively. External API effects are only at-least-once; **remote calls could be repeated after a crash**. Do not promise exactly-once remote billing.

**Retries:** Failed nodes are re-armed only by the explicit retry route, and failed dependencies/gates are reset atomically. Successfully completed/charged nodes are not retried. Revalidate scene/input/selected manual asset and current video config under the writer lock. For failed Edge stages every retry requires renewed `confirmRemote:true`. No automatic paid fallback exists. Operator cancellations are not automatically reversed.

**Timing handoff:** Each scene gate reports measured voice duration from its FFprobe-verified revision metadata and separately reports editor-estimated scene duration. The final gate aggregates these into `{estimatedSceneDurationMs, measuredVoiceDurationMs, estimatedScenes, measuredVoiceScenes, syncPending:true, timebase:'ms'}`. The editor timeline and subtitle timestamps are **not** silently rewritten; alignment is R2-EXT-02 (planned).

## Public API contract

Each endpoint uses the existing same-origin Bearer/CSRF/localhost protection and typed SDK, matching `packages/contracts/src/catalog.mjs` and generated `docs/api/openapi.json`:

| Method | Endpoint | Behavior |
|---|---|---|
| POST | `/api/videos/:id/assets/dag/preview` | Read-only per-scene `generate/reuse/manual_preserved` plan |
| POST | `/api/videos/:id/assets/dag` | Explicit request keyed by `requestKey`; HTTP 202 |
| GET | `/api/videos/:id/assets/dag?limit=25` | Safe run listing, max 100 |
| GET | `/api/videos/:id/assets/dag/:runId` | Stage status and coarse error code, no prompt or secrets |
| POST | `/api/videos/:id/assets/dag/:runId/retry` | Explicit failed-stage retry with new Edge consent |

Example preview or submit request (submit must include a unique `requestKey`):

```json
{
  "requestKey": "video-asset-batch-0001",
  "sceneIds": ["<scene-uuid>"],
  "voice": {"provider":"piper", "speed":1},
  "image": {"seed":5,"width":512,"height":512}
}
```

For image-only requests use `"voice":null`. For voice-only requests use `"image":null`. With remote Edge, specify the supported voice, `remoteConsent:true` on submit and renew consent on retry. Unknown scene IDs, invalid provider configuration and unhealthy pinned media are rejected **before** enqueuing. The typed client calls `request('previewAssetDag' | 'submitAssetDag' | 'listAssetDagRuns' | 'getAssetDagRun' | 'retryAssetDag', args)`.

## Source map and operational notes

- `packages/core/src/asset-dag-r207.mjs`: prepare/submit/read/retry and scene/final gates.
- `spikes/SP-04/src/store.js`: dependency-aware `enqueueManyAtomic` and `retryFailedBatch`.
- `packages/core/src/db.mjs`: additive migration **v25**; do not edit earlier migrations.
- `apps/api/src/{controllers,routes,server,request-policy}.mjs`: route/worker wiring and safe query allowlist.
- `packages/contracts/src/catalog.mjs`, `packages/sdk/src/client.d.mts`: typed endpoint definitions.
- `packages/core/test/asset-dag-r207.test.mjs`: 19 deterministic sqlite/runner/provider-fake cases.

**Limitations:** Actual Fastify HTTP + browser UI, Windows and GPU/local-model checks are not completed. No DAG-specific React page. The final gate marks `assetsPrepared:true, rendered:false`; it is **not** an MP4 export. Worker concurrency is currently 2 and queue dispatch capacity must be tuned for long-form workloads. Physical cross-scene dedupe, GC, on-screen bulk controls, exact caption timing and completed render remain later tasks. A new requestKey submitted after a failed batch does not implicitly retry its failed provider job: use the explicit retry endpoint.
