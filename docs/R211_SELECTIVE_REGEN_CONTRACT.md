# R2-11 — Single Scene Regeneration & Undo Contract

## Endpoints (authenticated loopback server)

`POST /api/scenes/:id/assets/regenerate` (202)

```json
{"kind":"voice","requestKey":"click-unique-01","expectedRowVersion":3,"options":{"provider":"piper","speed":1}}
```

For image: `{"kind":"image","requestKey":"click-unique-02","expectedRowVersion":3,"options":{"seed":8,"width":1024,"height":576}}`. Both accept *only* the existing respective provider options and are normalized in server core. `requestKey` is user-generated and stable across retry of the same click; choose a fresh key for another requested variation. `expectedRowVersion` fences the current scene. `voice` and `image` are mutually exclusive; the API never schedules both.

Response: `{sceneId,kind,requestKey,state,cached,reused,jobId}`. Repeated key with unchanged source/options returns the original job; same key with different options/source/config/kind gives `409 REGENERATION_KEY_CONFLICT`. A stale scene row gives `409 SCENE_ROW_VERSION_CONFLICT` for new requests. The system does **not** infer payment entitlement from this endpoint.

`POST /api/scenes/:id/voice/select`:

```json
{"assetId":"previous-revision-uuid","expectedRowVersion":4}
```

Selection re-hashes disk bytes (and verifies size and file safety), validates original succeeded queue job, current scene text SHA-256, config revision, source inputHash and job provenance. Old or corrupted revisions return 409/404; no change to active selection or queue. A new voice intent arriving during file verification rejects atomically. Previously queued provider jobs cannot overwrite a restored voice because intent pointer changes. **No TTS call** occurs during undo. Legacy assets without reliable job metadata are not eligible for voice restore.

`POST /api/scenes/:id/image/select` remains unchanged and pins that image manually. It is deliberately possible to reuse a visual from older prompts by explicit operator choice.

## Data / retries / safety

- Uses pre-existing SQLite `jobs`, `scene_voice_intents`, `scene_image_intents`, `asset_revisions`, `scenes` and the R2-03/R2-05/07 workers. **No extra queue or migration**.
- The original regular snapshot hash remains backward-compatible when there is no `regenerationKey`; explicit re-generation incorporates `regenerationKey` into the input hash.
- Extra stable `regenerationOptionsHash` stored in immutable queue payload guards against requestKey reuse with changed settings, including remote consent.
- The strict signed provider dispatch controls (Edge consent, local ComfyUI only, R0-13 approvals and R2-08 quotas) are not weakened. No auto-paid fallback, no silent retry.
- Old revisions kept, no destructive GC. Other media/scenes are never queued by a selective request.

## Verification

`npm run test:r211 && npm run test:all && npm run check && npm run typecheck:sdk && npm run test:negative-control`

Runtime dependencies for UI build must be installed separately. No Windows/browser/GPU/full-length execution claimed.
