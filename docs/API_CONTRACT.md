## R0-07 — Provider Registry API additions

Authenticated + CSRF-protected mutations; all public responses exclude credential plaintext. Source of truth is `packages/contracts/src/catalog.mjs`; generated `docs/api/openapi.json`.

- `GET /api/providers/templates` — built-in template list; **not availability**.
- `GET/POST /api/provider-accounts` — list/add accounts. Account DTO has safe `credentialId` *reference*, never key. `PATCH /api/provider-accounts/:id` optimistic `rowVersion`, toggle status.
- `GET/POST /api/provider-accounts/:id/models` — model records; `GET /api/provider-models` all models; `PATCH /api/provider-models/:id` enable/priority.
- `PUT /api/provider-models/:id/quota` — manual `unknown|estimated` only; `provider_verified` reserved for trusted providers. `rowVersion` mandatory.
- `GET /api/provider-accounts/:id/readiness?probe=true` — GET to known loopback Ollama/ComfyUI read-only endpoints only. No remote HTTP calls. A reachable service is not model-ready.
- `POST /api/providers/route-preview` — cost/quota/consent policy **dry run**; no provider invocation or paid approval recorded. `dryRun:true` in response.
- `POST /api/security/credentials` existing vault; `DELETE` now refuses `CREDENTIAL_IN_USE` (409) when referenced by account.

Errors include `INVALID_PROVIDER_ACCOUNT`, `PROVIDER_ACCOUNT_NOT_FOUND`, `INVALID_PROVIDER_MODEL`, `PROVIDER_MODEL_EXISTS`, `VERSION_CONFLICT`, `CREDENTIAL_PROVIDER_MISMATCH`, `PROVIDER_QUOTA_VERIFICATION_REQUIRED`, `INVALID_QUOTA`, `CREDENTIAL_IN_USE`.

---

# R0-05 — API Contract v0.5 (versioned OpenAPI + Typed SDK)


## Authoritative machine-readable API (R0-05)

- **Canonical operation catalog:** `packages/contracts/src/catalog.mjs` (35 HTTP operations including SSE; see `docs/api/openapi.json`).
- **Generated OpenAPI 3.1:** `docs/api/openapi.json` with per-route method, parameters, JSON request/response schemas, status codes, Bearer boundary and SSE media type.
- **Generated TypeScript declarations:** `packages/contracts/src/types.d.mts` (`OperationMap`, domain types) and `packages/sdk/src/client.d.mts`.
- **Runtime client:** `packages/sdk/src/client.mjs`, shared by `apps/web/src/api.js` compatibility facade. SDK does not store secrets in localStorage. Methods `pair()`, `request(operationId,args)`, `streamJobs(handler,{lastEventId,...})`, and temporary `requestPath()` for pre-R0-05 screens.
- Run `npm run api:generate` after editing `catalog.mjs`; run `npm run api:check`, `npm run typecheck:sdk`, `npm test` before handoff. `tsc` is a declared devDependency for environments with npm; this sandbox used an installed local/global TypeScript compiler.

**Contract boundary:** OpenAPI describes *public DTO shapes and expected status*. It is not a claim that Fastify runtime validates every body against the full JSON Schema; the existing domain/controller validations remain authoritative at R0-05. HTTP framework injection/browser E2E require npm packages and are pending. Never add a route without updating the catalog and regression tests.

### SDK example

```ts
import {createStudioClient} from '@contentstudio/sdk';
const studio = createStudioClient();
await studio.pair(codeShownInApiTerminal);
const {items} = await studio.request('listChannels', {query:{status:'active'}});
const created = await studio.request('createChannel', {body:{name:'Công nghệ'}});
// The SDK automatically includes Authorization: Bearer and mutation CSRF headers.
// Job SSE uses Last-Event-ID **header** on resume, never credentials in a URL.
```

**Errors:** Public JSON errors carry `{error: 'MACHINE_READABLE_CODE'}`. SDK raises `StudioApiError` with `code/status`, replacing unsafe free-form server response text with `HTTP_<status>` when needed. Semantic errors remain domain-specific (`VERSION_CONFLICT`, `REMOTE_CONSENT_REQUIRED`, `PAID_CONFIG_REQUIRES_APPROVAL`, `INVALID_CHANNEL`, `AUTH_REQUIRED`, `CSRF_REQUIRED`). Handler programming faults return sanitized `INTERNAL_ERROR` HTTP 500, never secret-bearing messages.

**SSE contract:** `Content-Type: text/event-stream`, `id: <positive integer>`, `event: job`, `data: {"seq": <same integer>, ...}`. Last-Event-ID request **header** is optional. The SDK buffers split UTF-8/CRLF frames, discards incomplete events, de-duplicates replay, preserves last safely delivered cursor and supports bounded reconnect. Standard browser `EventSource` is intentionally not used because it cannot set the Bearer header. AbortController cancels long-poll subscriptions.

---

**Base:** `http://127.0.0.1:4311`; JSON request/response. Client uses `Authorization: Bearer <session>`; POST/PATCH/PUT/DELETE additionally use `x-contentstudio-csrf: <token>`; no CORS. `/health` is unauthenticated. `/api/session/pair` is the only unauthenticated API entry point.

### Auth

| Method | Route | Body/notes |
|---|---|---|
| GET | `/health` | `{status,service,version}`; no local private info |
| POST | `/api/session/pair` | `{code}` printed once in API terminal → `{bearer,csrf}` ephemeral; 5 tries maximum |
| GET | `/api/security/vault/status` | `{mode,state,count}` |
| POST | `/api/security/vault/init` | `{passphrase}` min 12 chars; initial setup only |
| POST | `/api/security/vault/unlock` | `{passphrase}`; 5 failures / restart |
| POST | `/api/security/vault/lock` | Locks in-memory vault |
| GET | `/api/security/credentials` | `{items:[{id,providerId,stored}]}`; never raw API key |
| POST | `/api/security/credentials` | `{id,providerId,apiKey}`; encrypted SP-06 vault |
| DELETE | `/api/security/credentials/:id` | Deletes credential |

### Channel/Video

| Method | Route | Body/notes |
|---|---|---|
| GET | `/api/channels?status=active\|archived\|deleted\|all\|any` | `all` excludes tombstones; `any` includes tombstones. Each channel includes `summary` with counts. Default `all`. |
| POST | `/api/channels` | `{name,description?,preset?,idempotencyKey?}`; idempotent if client key supplied; 201 channel |
| GET | `/api/channels/:id` | channel |
| PATCH | `/api/channels/:id` | `{rowVersion,name?,description?,status?,preset?}`; 409 on stale version or active jobs when archiving; preset revision increases only on actual change |
| GET | `/api/channels/:id/summary` | `{videoCount,activeJobs,runningJobs}` |
| POST | `/api/channels/:id/archive` | `{rowVersion}`; blocks while any active job associated with the channel |
| POST | `/api/channels/:id/restore` | `{rowVersion}`; restore archived or soft-deleted channel |
| DELETE | `/api/channels/:id` | `{rowVersion}`; **reversible soft delete**, never physically deletes videos/files; blocks active jobs |
| GET | `/api/channels/:id/presets` | Immutable history `{items}` |
| GET | `/api/channels/:id/videos` | `{items:[video...]}` |
| POST | `/api/channels/:id/videos` | `{title,brief?}`; immutable snapshot preset at video creation |
| GET | `/api/videos/:id` | video, including `rowVersion` |
| PUT | `/api/videos/:id/script` | `{rowVersion,masterScript}`; status content_ready |
| GET | `/api/videos/:id/scenes` | `{items:[scene...]}` |
| PUT | `/api/videos/:id/scenes` | `{rowVersion,scenes:[{text,durationMs,mediaType?,visualPrompt?}]}`; does not overwrite created assets |
| GET | `/api/videos/:id/timeline` | `{document,rowVersion}` |
| PUT | `/api/videos/:id/timeline` | `{rowVersion,document:{tracks,clips:[{sceneId,startMs,durationMs}]}}` |

### System diagnostics (R0-04)

| Method | Route | Notes |
|---|---|---|
| GET | `/api/system/diagnostics` | Authenticated sanitized readiness report, max 30s cached; no query parameters accepted. Read-only. |
| POST | `/api/system/diagnostics/refresh` | Bearer + CSRF required. JSON body must be `{}` or absent. Bypasses cache but shares an in-flight probe; never invokes AI generation or paid API. |

**Sample response (illustrative, not a Windows benchmark):**
```json
{"schemaVersion":1,"collectedAt":"2026-10-14T00:00:00.000Z","cacheTtlMs":30000,
 "environment":{"platform":"linux","arch":"x64","nodeMajor":22},
 "summary":{"state":"attention","ready":4,"warning":0,"missing":2,"unconfigured":3,"unknown":0},
 "readiness":{"editing":true,"render":false,"localAiVideo":false},
 "validation":{"windowsHardware":false,"providerInference":false,"fullLengthRender":false},
 "checks":[{"id":"ffmpeg","state":"missing","detail":"NOT_INSTALLED","metrics":{"h264":false,"aac":false}}],
 "note":"Diagnostics only; provider inference, native Windows security and 35-minute 1080p rendering remain unverified."}
```

`checks[]` uses fixed `id`, `state` (`ready|warning|missing|unconfigured|unknown`), `detail` code and *allowlisted* metrics. Do not add full executable paths, CPU model names, private disk roots, raw errors, headers, API tokens, provider endpoints, prompts, or ffmpeg stdout to this payload. `readiness.render` means *basic tooling seems present*, **not** a successful 1080p 35-minute video render. Local ComfyUI is probed only if a workflow was configured; remote providers are **never called** by diagnostics. Both endpoints use global R0-03 auth/host/origin guard.

### Jobs/assets

| Method | Route | Body/notes |
|---|---|---|
| GET | `/api/providers` | Registered providers with `kind/location/costTier` metadata |
| GET | `/api/jobs` | `{items,counts}` from durable SP-04 |
| POST | `/api/jobs/diagnostic` | `{idempotencyKey}` queues real FFmpeg check |
| POST | `/api/scenes/:id/assets/jobs` | `{kind:'voice'\|'image'\|'video',idempotencyKey,remoteConsent?,voice?,...}`; Edge requires explicit `remoteConsent=true`, ComfyUI requires registered workflow |
| GET | `/api/scenes/:id/assets` | `{items:[{id,state,kind,source,checksum,...}]}` |
| GET | `/api/jobs/events` | SSE with `event: job`, `id: seq`, `data: JSON`, `Last-Event-ID` header supported; Fetch streaming with bearer |
| GET | `/api/activity` | Domain event history (no raw script/API key) |

### Example

```http
POST /api/channels
Authorization: Bearer <session>
x-contentstudio-csrf: <csrf>
Content-Type: application/json

{"name":"Công nghệ AI","description":"Tin tức"}
```

Error shape: `{error:'MACHINE_READABLE_CODE'}`; errors: `VERSION_CONFLICT` (409), `INVALID_CHANNEL` (400), `REMOTE_CONSENT_REQUIRED` (403), `AUTH_REQUIRED` (401), `CSRF_REQUIRED` (403), `ASSET_CHECKSUM_MISMATCH` (409). No stack traces, prompts or credentials in responses.

### Current boundaries

The API schema above is implemented in code but **not** HTTP-verified against Fastify in the offline environment. R1 adds content generation/AI judge endpoints; R2 adds semantic scene splitting and queue scheduling; R3 adds render. Large media upload via HTTP is deliberately not exposed yet (would need bounded streaming/magic-byte validation and provenance).

### R0-01 scope and limitations

- `deletedAt` is a nullable Unix timestamp. Default lists hide soft-deleted channels; use `status=any` for management UI (restoration).
- The summary checks SP-04 jobs whose `projectId` or `videoId` belongs to a channel, including pending/running/paused. The schema is local and private; client must not compute job counts by guessing.
- Channel create request idempotency uses persistent request key + canonical payload hash; sending a different body with the same key yields `IDEMPOTENCY_CONFLICT` (409).
- `status=any` should be used only by local authenticated management UI; do not share channel data externally.
- Channel `models.paidEnabled` and `models.remoteEnabled` cannot be turned on through channel edits; a dedicated consent/billing approval workflow is required. No secret fields may be embedded in a preset.
- Errors: `INVALID_CHANNEL_FILTER`, `CHANNEL_HAS_ACTIVE_JOBS`, `IDEMPOTENCY_CONFLICT`, `UNKNOWN_PRESET_FIELD`.
- This contract is covered by framework-independent route tests. Fastify HTTP and React/Vite browser tests are pending package availability (`EAI_AGAIN` in the current runtime).


## R0-03 Security implementation notes

- All `/api/*` endpoints are secured by one Fastify `onRequest` hook; only **POST** `/api/session/pair` bypasses bearer/CSRF. `/health` is read-only and unauthenticated. Cross-site and OPTIONS requests to APIs are denied. No CORS response headers.
- Requests require exactly one `Host: 127.0.0.1:4311` (configured port), loopback peer, no forwarded/proxy/rewrite headers, correct Origin if supplied. Only local dev `Origin: http://127.0.0.1:5173` is allowed in dev mode.
- Bearer token only in `Authorization` header. Mutations require `x-contentstudio-csrf`. Never pass token/passphrase/apiKey/credential through URL query. Only GET `/api/channels?status=...` has an allowed query string in this release; future parameters require security policy review.
- API key setup: `POST /api/security/vault/init` accepts **exactly** `{passphrase}`, unlock accepts exactly `{passphrase}`, storing a credential accepts exactly `{id,providerId,apiKey}`. Plaintext secrets never leave encrypted vault via HTTP.
- Unlock throttle: 5 incorrect passphrases per 60-second rolling window **per local server instance**. Concurrent attempts serialized; after expiry a correct passphrase can unlock. Server restart resets this memory-only throttle (local physical-user threat model; no remote bind).
- Authentication tokens are ephemeral RAM-only and lost on server restart; browser must pair again. Raw URLs, bodies and security headers are omitted from Fastify request log serializer.
- **Validation limits:** Hook registration and routing semantics covered by dependency-free tests, but no live Fastify HTTP/inject exercise could run because npm registry DNS was unavailable. Windows credential manager and browser tests pending.

## R0-08 additions — Preset revisions (OpenAPI 0.6.0)

- `GET /api/preset-capabilities` → static allowlisted option values; **not live free-tier/provider health**.
- `POST /api/channels/:id/presets/revisions` → `{rowVersion:number,preset:Preset}`; on change returns `{channelId,version,preset,createdAt,rowVersion,changed:true}`. Equivalent/no-op preset returns current revision with `changed:false`. Requires Bearer + mutation CSRF; stale rowVersion gives HTTP 409 `VERSION_CONFLICT`.
- `GET /api/channels/:id/presets/:version` → `{version,preset,createdAt}`. Version missing returns 404. Channel missing returns 404.
- Existing `GET /api/channels/:id/presets` and `PATCH /api/channels/:id` are retained for backward compatibility; both save paths share the same immutable revision logic.
- The `Preset` DTO is generated directly from `packages/core/src/preset-schema.mjs`. Backend adds semantic constraints (ratio/resolution, paid/remote policy). `POST` never includes keys or secrets; those belong to the separate backend vault.
- OpenAPI describes DTO shape but HTTP runtime JSON Schema enforcement is **not yet verified**; domain validation is tested independently.


## R0-11 — Video-level configuration API (EP10)

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/videos/:id/config` | Current resolved video config and original channel source snapshot. |
| GET | `/api/videos/:id/config/revisions` | Read-only immutable history (newest first). |
| GET | `/api/videos/:id/config/revisions/:version` | Inspect a specific historical revision. |
| POST | `/api/videos/:id/config/preview` | Dry-run merge and impact analysis; **no mutation/job**. |
| PUT | `/api/videos/:id/config` | Replace override object; optimistic lock and explicit impact approval when necessary. |

**Request shape (preview/save)**
```json
{"rowVersion": 3, "overrides": {"voice": {"voice": "vi-VN-NamMinhNeural"}}, "confirmImpact": true}
```

`confirmImpact` should be supplied on save only after the user sees the preview; it does **not** approve paid API usage. `overrides` is a full replacement; omitted groups/fields revert to the originally copied channel preset. Response includes `sourcePresetVersion`, `sourcePreset`, `effectivePreset`, `overrides`, `version`, `rowVersion`, and persisted `impact` for saves/historical revisions.

**Errors:** `INVALID_VIDEO_OVERRIDES` (400); `VIDEO_NOT_FOUND` (404); `CONFIG_REVISION_NOT_FOUND` (404); `VERSION_CONFLICT`, `CONFIG_CHANGE_REVIEW_REQUIRED`, `VIDEO_HAS_ACTIVE_JOBS` (409); `PAID_CONFIG_REQUIRES_APPROVAL`, `REMOTE_CONFIG_REQUIRES_APPROVAL` (403). No credential or provider secret can appear in the response schema.

**Generated artifacts:** `npm run api:generate` after catalog updates; OpenAPI at `docs/api/openapi.json`. `npm run api:check` confirms generation is current. No full runtime Fastify JSON-schema validation is claimed.


## R0-12 Video Management Operations (schema v9)

- `GET /api/channels/:id/videos?search=&status=all&limit=20&cursor=&deleted=false` returns a paged **light summary** `{items,nextCursor}` with null numeric progress until measured.
- `POST /api/channels/:id/videos` creates a video snapshot with optional `targetMinutes`, `idempotencyKey` (8–100 chars). No AI job is started.
- `GET /api/channels/:id/videos/:videoId` validates channel ownership; `GET .../resume` returns `{video,step,hasScript,sceneCount}`.
- `PATCH /api/videos/:id` optimistic rename/brief; `PUT /api/videos/:id/step` validates step prerequisites.
- `POST /api/videos/:id/clone` creates script-only copy with required `idempotencyKey`, no asset duplication.
- `DELETE /api/videos/:id` with `{rowVersion}` soft-deletes and blocks active jobs; `POST /api/videos/:id/restore` with `{rowVersion}` restores.
- Public DTOs are in `packages/contracts/src/catalog.mjs`; regenerate `docs/api/openapi.json` and SDK types after editing.

### R0-13 – Paid usage control APIs (2026-10-14)

All require same localhost bearer + CSRF rules for mutations as other `/api` endpoints. API declarations live in `packages/contracts/src/catalog.mjs` (generated docs are *not* hand-edited).

- `POST /api/paid/approvals` – explicitly approve **existing target-planned job+account+model** after typing `AUTHORIZE_PAID_USAGE`. Request: `{jobId, accountId, modelId, maxUsd, perCallMaxUsd, expiresMinutes, confirmation}`. Returned grant has only safe amounts/IDs/timestamps. User is not billed just by granting.
- `GET /api/jobs/:id/paid-approvals` – budget metadata scoped by job.
- `GET /api/jobs/:id/paid-audit` – append-only estimated charges (metadata only).
- `POST /api/paid/approvals/:id/revoke` – revoke future dispatch; an in-flight request can still be billed.

**Critical:** route preview is a non-spending simulation, never a grant. Only server-side `ProviderRegistry.invoke()` with `PaidPolicyRepository` can authorize a paid network dispatch. Without a known trustworthy adapter price estimate or matching authorized job, paid dispatch is blocked.

## R0-VID-01 — AI Video metadata and preflight (no inference)

- `GET /api/video-providers/capabilities` → `{items:[...]}` configured **video-kind** model metadata (account/provider, location, cost tier, quota source, `capability` or null). No secrets, workflow JSON or raw provider URL.
- `PUT /api/provider-models/:id/video-capabilities` → `{revision,capabilities:{modes,maxDurationSec,maxWidth,maxHeight,maxFps,minVramGb,requiresGpu}}` where first revision is `0`. Returns `VideoModelCapability` with `source:'user_declared',verified:false`. Optimistic conflict HTTP 409.
- `POST /api/video-providers/preflight` → `{modelId,mode,durationSec,width,height,fps,allowRemote,fallbackImageMotion}`. Returns `{canPlan,blockers,warnings,proposedFallback,dryRun:true,willQueue:false,willBill:false,...}`. No remote request or quota spending.
- Existing `POST /api/scenes/:id/assets/jobs` with `kind:'video'` now requires `providerModelId` plus valid `request` (mode, prompt, durationSeconds, width, height, fps); only a configured LOCAL ComfyUI model can be queued at this stage, no raw I2V reference upload and no paid/remote generation.
- Generated OpenAPI is authoritative; see `docs/api/openapi.json`, shared SDK types. Exposed preflight reasons are stable machine codes documented in `video-capabilities.mjs`.


### R0-10 Voice Preview (binary output)

`POST /api/channels/:id/voice-preview` — authenticated Bearer + CSRF. JSON body: `{provider:"edge"|"piper"|"vieneu",voice:string,text:string(max 350),speed:number(0.5..2),remoteConsent:boolean}`. Edge requires `remoteConsent:true` per request. Result `audio/mpeg` or `audio/wav` binary (max 2 MB), `Cache-Control:no-store`; errors `{error:CODE}` (400/403/404/409/429/502/503/504). SDK: `previewVoice(channelId,body,{signal}) → Blob`. No queue, DB, or persistent audio.

## R1-02 CT02 outline endpoints (OpenAPI is authoritative)
- `GET /api/videos/:id/content/outline` — editable current outline/revision, empty on new video.
- `PUT /api/videos/:id/content/outline` — `{expectedRevision,outline:{chapters:[{id?,title,objective,keyPoints,targetWords}]}}`; 409 stale revision; creates immutable history.
- `GET /api/videos/:id/content/outline/revisions` / `.../:version` — metadata and exact immutable revision.
- `POST /api/videos/:id/content/outline/generate` — `{briefRevision,expectedOutlineRevision,modelId,requestKey}`; returns HTTP 202 with runId/status/jobId; only enabled local Ollama model in saved brief.
- `GET /api/videos/:id/content/outline/runs` / `.../:runId` — safe status, proposed result after SP-04 job success; no prompt or credentials.
- `POST /api/videos/:id/content/outline/runs/:runId/accept` — `{expectedRevision}`; explicit adoption of proposal as a fresh outline version.

Generation is local-only (no paid API), pinned to immutable brief, with auditable queued run state. `content:outline` JobStore payload contains only runId; the full prompt snapshot stays in domain SQLite. Live Fastify not yet E2E tested.


## R1-03 — Chapter generation (requires Bearer + CSRF on POST)

- `POST /api/videos/:id/content/chapters/generate`: `{briefRevision,outlineRevision,modelIds:[1..3],requestKey}`. 202 returns `ChapterBatch`. Only active local Ollama IDs selected in saved Brief; rejects remote/paid. Idempotent per video/requestKey.
- `GET /api/videos/:id/content/chapters/batches`: immutable generation-batch list, safe counts and job statuses, no full text.
- `GET /api/videos/:id/content/chapters/batches/:batchId`: chapter outputs for each model and chapter; available only after queue-fenced success.
- `POST /api/videos/:id/content/chapters/batches/:batchId/retry`: `{}` retries failed/blocked jobs; does not regenerate successes.

Backend worker is `content:chapter` and uses existing SP-04 queue; no public endpoint accepts raw prompts or credentials for a queued worker. No operation auto-approves master script.


## R1-04 Content Evaluation · v16

- `GET /api/content/evaluation-rubric` — returns immutable rubric v1 definitions and percentages.
- `POST /api/videos/:id/content/variants/:variantId/evaluations` — body `{evaluatorModelId,requestKey}`; authenticated; returns 202 with queued `ContentEvaluation`; local Ollama only.
- `GET /api/videos/:id/content/variants/:variantId/evaluations` — list historical runs + scoring results, scoped to video and variant.
- `GET /api/videos/:id/content/variants/:variantId/evaluations/:evaluationId` — one queued/running/succeeded/failed result.
- `POST /api/videos/:id/content/variants/:variantId/evaluations/:evaluationId/retry` — retry failed job, no body or billing/AI side effects until worker runs.

`ChapterDraftResult.variantId` is available when the immutable draft is ready (null while pending). `result` is null until successful job commit. All five criterion scores are 0–10; `total` (0–100) is derived on server; AI feedback is a subjective suggestion, not verified factual evidence. Status errors are stable machine codes and never leak prompt/source text. OpenAPI source: `packages/contracts/src/catalog.mjs`.


## R1-06 — Master review (all protected by existing Bearer/CSRF)
- `GET /api/videos/:id/content/master`: current revision, approved revision and video row version.
- `POST /api/videos/:id/content/master/preview`: validate 1 immutable variant per chapter or manual body (`outlineRevision=0`); no DB changes.
- `PUT /api/videos/:id/content/master`: immutable saved candidate (requires `expectedRevision`; no approval).
- `POST /api/videos/:id/content/master/approve`: explicit `revision`, `expectedRevision`, `videoRowVersion`, `acknowledgeWarnings`; atomic approval.
- `GET /api/videos/:id/content/master/revisions`: compact history metadata (no full text).
- `GET /api/videos/:id/content/master/revisions/:revision`: full immutable candidate text for authorized local editor.
- Source-of-truth schemas: `packages/contracts/src/catalog.mjs`; regenerated `docs/api/openapi.json` and TypeScript SDK declarations.

## R2-03 · Scene voice (2026-10-15)

- `POST /api/scenes/:id/voice/jobs`: `{provider?:'edge',voice?:'vi-VN-HoaiMyNeural'|'vi-VN-NamMinhNeural',speed?:0.5..2,remoteConsent:true}` → queued or cache hit; explicit consent mandatory.
- `POST /api/videos/:id/voice/jobs`: same options plus `sceneIds` (1..50 unique IDs scoped to video); validates all items first. No cross-video enqueues.
- `GET /api/scenes/:id/voice/status`: `state`, sanitized job metadata, current committed voice and **FFprobe-measured `durationMs`** (or null); `estimatedDurationMs` remains separate.
- `GET /api/scenes/:id/voice/audio`: binary private MP3 or WAV with bearer auth, content disposition inline and no-store. SDK `getSceneVoiceAudio(sceneId)` retrieves Blob; never use unprotected static audio URL.
- All API mutation routes use existing bearer+CSRF/Host/Origin gate. Python Bridge Edge is remote/unofficial; request-scoped online consent is not paid approval.
