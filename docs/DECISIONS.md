
## ADR-R1EXT01 — Deterministic script recipes before inference (2026-10-16)
**Decision (implementation, not new PO signoff):** Add allowlisted, local Script Skills as a small extension to versioned R1 briefs. Keep existing R1 outline/chapter/evaluation/approval workflow, provider policy, SP-04 queue and JSON output unchanged. Planning and exporting approved text are read-only; segment stage assignment is a positional *suggestion*, not semantic classification; research citations must be user-supplied and verified, never fabricated.
**Why:** User asked to standardize script form while prioritizing cost and maintainability; no local runtime for an external Superpowers plugin or proof of web research was available. A deterministic contract and source-preserving JSON export unlock review without silently adding expenses or changing approved content.

## ADR-R007 — Provider account/model configuration and quota evidence (2026-10-14)

**Decision:** Introduce additive SQLite v8 tables for account/model metadata and idempotent usage records. Never store API key values in SQLite; associate via existing encrypted Vault credentialId. Provider model catalog is configurable metadata only; no undocumented live providers are activated by configuration.

**Why:** User manages many accounts/models and wants safe free/local-first switching. Cost and quota availability depend on provider, region, plan and current account; never assume static free limits. Quota states distinguish UNKNOWN, ESTIMATED, VERIFIED. Untrusted input cannot set VERIFIED. Seedance template is marked paid by default; remote data transfer needs explicit consent, any paid switch requires separately authorized job-specific spend.

**Consequence:** Router dry-run never spends money and does not count as execution. Actual account-aware adapter calls, billed usage audit, safe egress pinning and verified provider-specific quota fetch belong to future pipeline integration. Never rotate accounts to circumvent platform-wide rate caps or policies.

---

## 2026-10-13 — SP-VID-01: local AI-video protocol guardrails
- Treat video origin accurately: `ai_video` ≠ `image_motion` ≠ `imported_video`. FFmpeg demo is not proof of AI inference.
- Only loopback ComfyUI AI-video adapter in Sprint 0, no unauthorised remote or paid endpoints. Google Flow remains website/manual import.
- Workflow node bindings must be explicit, supplied from a real ComfyUI API export; no assumptions about Wan/LTX schema.
- MP4-only validated file revisions initially; reject WebM masquerading as MP4 (future explicit remux/conversion).
- SP-04 queue is reused without building a second scheduler. Queue DB commit uses fencing, but physical orphan files and provider at-least-once execution require later reconciliation.
- SP-04 test correction: compare claim ID, not enqueue order; job selection uses deterministic database order including UUID tie-break.

# ContentStudio — Decision Register

| ID | Date | Decision | Rationale / consequence | Owner |
|---|---|---|---|---|
| ADR-001 | 2026-10-13 | Windows is the target OS; run portable development/tests without target machine meanwhile. | Native Windows, GPU, driver and local service claims remain unverified until hardware testing. | PO |
| ADR-002 | 2026-10-13 | Free/local providers first; paid usage must require an explicit approval gate and visible notification. | No surprise charges; quota/fallback routing must preserve approval state and usage history. | PO |
| ADR-003 | 2026-10-13 | Drag-and-drop 4-track timeline is part of MVP. | Timeline drag, order, timing, preview synchronization are delivery requirements, not phase-two nice-to-haves. | PO |
| ADR-004 | 2026-10-13 | Both generative AI clips and FFmpeg image motion are supported via distinct media types. | Never label zoom/pan of still images as model-generated video. | PO |
| ADR-006 | 2026-10-13 | SP-02 uses a Python subprocess for unofficial Edge TTS (private stdin), a configurable loopback HTTP adapter, and optional eSpeak offline speech for testable fallback. | Portable, no Node external dependencies; protects script text, disallows unapproved remote/paid endpoints, distinguishes robotic voice proof from neural provider validation. This is a technical implementation choice, not a new PO requirement. | Tech Lead |
| ADR-007 | 2026-10-13 | SP-03 uses local ComfyUI exported workflow with explicit input bindings; manual image import always available; remote Cloudflare adapter opt-in with separate content consent and call-scoped cost approval. | Avoid assuming GPU/weights/free quota; preserve local-first UX while retaining an extensible image generator contract. Live AI generation and user-facing approval ledger still pending. | Tech Lead |
| ADR-005 | 2026-10-13 | Use intent-focused code comments and persistent work log / handoff. | Another coding agent can understand non-obvious decisions and resume without scanning all code. | PO |

| ADR-008 | 2026-10-13 | SP-04 queue PoC uses built-in Node 22 `node:sqlite`, SQLite WAL/FULL, durable DAG and attempts, leased/fenced commit, and transactional outbox; one SQLite writer serializes claims. | No external npm install and reliable local crash proof; module is experimental and binding must be reassessed during ARC-01. Fencing prevents duplicate DB commits, NOT duplicate provider execution/billing. Physical asset commit remains separate follow-up. | Tech Lead |

**Notes:** This is a short implementation-facing decision index, not a replacement for `Video_AI_Flow_PO_Signoff_v3.md` and other signed specifications. Add new ADR rows only after the associated decision is actually made; do not invent approvals.

## ADR-SP05-01 — Timeline spike browser UI (2026-10-13)
**Decision:** Keep SP-05's authoritative timing/ordering/PCM extraction functions in dependency-free ES module `SP-05/src/engine.mjs` using **integer milliseconds**. Prototype editor UI is native browser JavaScript with windowed DOM, rather than claiming React/Vite production code. The actual frontend stack remains the PO-approved **React + Vite + Zustand** at R3 integration.

**Reason:** npm registry/packages unavailable during this execution; a standalone browser demonstrator and pure tested engine can be reviewed without requiring PO's Windows PC. Future React adapter reuses `engine.mjs`, replacing only DOM/event layer. Browser profiling requires an unlocked browser; Chromium here has URLBlocklist enforced. Do not mark SP-05 production ready from Node unit tests alone.

**UI contract:** 4 lanes, click/select/scrub, drag reorder in visible region, duration trim in [1s,30s], zoom, undo/redo, local demo persistence and clear simulated preview/waveform labeling. All video/audio rendering and persistent snapshots remain owned by their actual Epics/ARC tasks.

## ADR-SP06-01 — Vault and localhost API security boundary (2026-10-13)
**Technical choice for PoC (not PO product approval):** Implement a portable scrypt (N=16384/r=8/p=1) + AES-256-GCM passphrase-encrypted vault with authenticated verifier, AAD-bound refs and explicit unlock/lock. Server binds only `127.0.0.1`, checks Host/Origin, enforces bearer and mutation CSRF, audits only codes. Add optional outbound SSRF-safe request helper with DNS IP pinning. Fail closed; do not save raw API keys in SQLite/config/logs.

**Reason:** No Windows PC is available and no insecure plaintext fallback is acceptable. Zero external Node dependencies permit repeatable Linux tests before Windows validation.

**Remaining non-negotiable integration:** Production Windows DPAPI/Credential Manager and ACL testing, secure frontend token/bootstrap channel, Fastify integration, and real provider adapter endpoint protection are pending ARC-01/R0-03. Do not claim this isolated PoC secures SP-02/03/04 until wired in. A compromised OS or malicious same-user process remains outside this PoC threat boundary.

## 2026-10-13 — ARC-01 architecture decisions

- **ADR-ARC01-01:** Use npm workspaces `apps/api`, `apps/web`, `packages/core`, `packages/providers`, `packages/security`, `spikes` to preserve verified Sprint0 modules. No reimplementation of queue.
- **ADR-ARC01-02:** Use Node22 built-in `node:sqlite` for spike-compatible canonical SQLite schema and migration checksums. This is a provisional technical choice until ORM maturity/Windows benchmarks; no PO action required.
- **ADR-ARC01-03:** Channel settings saved as immutable preset revisions; video creation copies preset snapshot; updates require optimistic `rowVersion`.
- **ADR-ARC01-04:** SP-04's queue asset fencing is authoritative. File cannot join SQLite transaction, so promote queue asset to domain revision in replayable, checksum-checked step; leave orphans for reconciliation (never blindly delete).
- **ADR-ARC01-05:** Explicit loopback-only pairing code + Bearer + CSRF + Host/Origin guards. Tokens in browser RAM, no localStorage. Vault SP-06 served via restricted routes with no plaintext getter. Windows DPAPI still pending.
- **ADR-ARC01-06:** Edge TTS considered remote even without key. Requires explicit privacy consent. ComfyUI providers registered only after API workflow binding configuration. No automatic paid provider fallback.
- **ADR-ARC01-07:** Block Master Script replacement after scenes exist, and reset timeline if scenes are replaced, until R2 provides safe per-scene diff/invalidation.
- **ADR-ARC01-08:** This source is CODE + OFFLINE_TEST verified only; npm install/build and actual browser/HTTP verification are deferred by registry unavailability, not labelled as PASS.

## 2026-10-13 — R0-01 Channel Management implementation

- **ADR-R001-01 (Tech Lead):** Soft deletion is a reversible `deleted_at` tombstone (migration v4), with `status='archived'` for legacy status CHECK. Both archived and deleted states preserve video/asset files. No permanent delete UI.
- **ADR-R001-02:** Channel creation supports SQLite-stored `idempotencyKey` + request hash to survive retries and restarts.
- **ADR-R001-03:** Block archive/delete while associated video jobs are pending/running/paused. Affected jobs use SP-04 `projectId`/`videoId`.
- **ADR-R001-04:** UI prompt preview is local string composition; it never sends prompts externally or incurs AI charges. Remote/paid toggles stay unavailable until EP02 approval flow.
- **ADR-R001-05:** Native file uploads and voice playback are not exposed in R0-01: streaming, format verification and provider consent still need their own stories. No fake audio previews.

## 2026-10-13 — ADR-R002-01 · Safe schema evolution (Tech Lead)

**Decision:** Keep SQLite schema checksum ledger and versioned append-only migrations; do not edit historical SQL. v5 adds cross-video asset integrity triggers and an index. Every existing *nonempty* DB receiving a schema change receives a verified SQLite `VACUUM INTO` snapshot in its own data directory before any DDL. SQLite transaction includes DDL+ledger; unknown/tampered/future schema fails closed.

**Reason:** SQLite WAL mode makes raw `.sqlite` file copies unreliable while another connection has committed transactions. A verified database snapshot plus transactional migrations prevents irreversible loss from failed upgrades; queue-only databases contain user data and must also be protected.

**Scope boundary:** Snapshots are not full media backups. No automatic restore while app/SQLite WAL may be active. R4 owns end-user backup/restore UX; R0-03 owns OS ACL/DPAPI. Concurrent separate app instances must be prevented at launcher level; not verified here on Windows. This is a technical implementation decision, **not a new PO sign-off request**.

## 2026-10-13 — ADR-R003-01: Global localhost HTTP security (Tech Lead)

- **Decision:** One global Fastify `onRequest` guard rejects non-loopback peers, noncanonical Host/Origin, forwarded/proxy rewrites, duplicate important headers, encoded/ambiguous API routes, CORS preflights and forbidden query parameters **before** API route handlers. Browser pairing requires a one-time terminal code; subsequent `/api/*` requests require bearer, all mutations additionally require CSRF.
- **Reason:** Adding new routes should not accidentally bypass security; localhost alone does not protect against browser-originated requests or DNS rebinding. Fastify request log serializer deliberately excludes raw URL/query to avoid leaking user-supplied secrets in rejected requests.
- **Trade-off:** Strict path/query policy requires API contract updates when adding accepted query parameters; only `GET /api/channels?status=...` is allowed now. Browser/HTTP Fastify validation pending registry access.

## 2026-10-13 — ADR-R003-02: Scoped vault credentials and unlock throttle (Tech Lead)

- **Decision:** Passphrase AES-256-GCM vault from SP-06 remains the cross-platform fallback; a private `createCredentialAccess(vault)` only releases a key to a trusted in-process callback after checking its providerId. Vault HTTP routes use exact field sets and 5 failures / rolling 60 seconds with serialized unlocking. No HTTP plaintext key route.
- **Reason:** Prevent accidental provider cross-use, credential reflection, guessing and concurrent bypass; keep real credential storage separate from channel presets and job metadata.
- **Open:** Windows DPAPI/Credential Manager, Windows ACL verification, hardened launcher and production audit remain blocked by missing Windows machine; not PO decisions.


## ADR-014 · 2026-10-14 · Diagnostics safety and freshness (R0-04, Tech Lead)

**Decision:** Return an allowlisted health model behind R0-03 authenticated APIs; cache 30 seconds with single-flight requests; make user-triggered refresh a CSRF-protected POST. Use timeouts and fixed arguments for subprocess checks. Never show private paths, host identifiers, raw shell responses, vault/provider secrets, prompts, or paid provider status guesses. Do not generate media or call cloud AI merely to check readiness. A configured *literal loopback* ComfyUI instance may receive a bounded local status request. Distinguish basic tool availability from Windows/GPU/full-duration/AI model acceptance.

**Reason:** The SP-01 CLI report has raw paths and executable metadata that should not be served over HTTP. Repeated unconditional probes would also degrade UI/queue performance. **Impact:** R0-04 uses a dedicated sanitized read model, no new data table or paid capability. No new PO scope decision required.

## 2026-10-14 — ADR-R005-01: Shared versioned API catalog and SDK (Tech Lead)

- **Decision:** Single lightweight `operations` catalog generates OpenAPI 3.1 JSON and TypeScript operation/result types; registration tests enforce route inventory and security query policy. Browser RPC goes through a shared SDK, with a compatibility facade for existing JSX screens. Do not create a second HTTP stack, DB or job scheduler.
- **Reason:** Prevent backend/frontend contract drift when AI agents work independently and guard secret-bearing routes behind the existing localhost auth boundary. No runtime npm schema generator is needed to test changes offline.
- **Trade-off:** Published OpenAPI is not yet bound to live Fastify schema validators; TypeScript declarations are compile-time only. Actual HTTP/browser integration remains pending npm/Windows validation, not a PO signoff blocker.

## 2026-10-14 — ADR-R005-02: Replayable authenticated SSE and structured errors (Tech Lead)

- **Decision:** Fetch-stream authenticated SSE with durable numeric cursor and `Last-Event-ID` **header**, cursor advances only after valid payload and callback. Safe parsing handles UTF-8/CRLF split frames and drops duplicates. SDK uses stable `StudioApiError` codes; unexpected backend handler faults map to sanitized HTTP 500 `INTERNAL_ERROR`.
- **Reason:** Native EventSource cannot include the Bearer header; resuming after stream disruption must not double-process or miss queue UI notifications. Message strings and secrets from unexpected exceptions must not be reflected to browser clients.

## 2026-10-14 — R0-08 canonical channel preset revisions

- **ADR-R008-01 (Tech Lead):** A single JSON Schema in `packages/core/src/preset-schema.mjs` defines the public, secret-free channel preset. OpenAPI imports that same schema; server keeps semantic rules (render ratio, free/remote approval) beyond shape validation. No API tokens or endpoint credentials may be stored in a preset.
- **ADR-R008-02:** Revisions are append-only at the database boundary via additive SQLite migration **v6** (UPDATE/DELETE triggers). Existing migration SQL and SHA-256 ledgers **v1–v5 are unchanged**. Soft-deleted channels keep revision history.
- **ADR-R008-03:** Revision number increases for a *changed* preset, not a no-op save or reordering of JSON keys. Stable canonical serialization prevents duplicate revisions; `rowVersion` remains the optimistic write lock. `POST /channels/:id/presets/revisions` is a preset-only alternative to existing `PATCH /channels/:id`.
- **ADR-R008-04:** Old revision comparison is read-only. Applying one to an existing video or reverting a channel is a separate EP10 feature requiring an impact plan; R0-08 never mutates video snapshots or regenerates assets.
- **ADR-R008-05:** Preset capability options are **static interface metadata**, not claims of provider availability, free API credit, quota or model compatibility. R0-07/EP02 will validate account/provider availability and paid/remote approval at execution.

## ADR-R011 — Frozen per-video configuration + explicit impact review (2026-10-14)
- **Source of truth:** `videos.preset_snapshot_json` + `preset_source_version` are immutable and reflect the channel at video creation, never its current preset. `video_config_revisions` (SQLite v7) stores user overrides/resolved preset as new immutable revisions, with a `videos.config_revision` pointer. Initial v1 revision is backfilled from existing video snapshots.
- **Override semantics:** `PUT /api/videos/:id/config` replaces the *whole* override object; removing a field resets it to its video's source snapshot, not today's channel settings. `rowVersion` locks the video row across script/config edits. A semantically identical resolved preset is a no-op; no new revision/audit/event.
- **Impact:** preview is read-only. When existing content/assets/scenes might be affected, `confirmImpact:true` is mandatory. Successful saves persist impact metadata only; do NOT start jobs, change files or update script/scene/timeline. Block saves while video's queue jobs are active. R2/R3 owns selective asset invalidation and render-stale blocking.
- **Cost/privacy:** Paid and remote preset flags remain blocked pending the separately approved per-provider cost/consent workflow. Users must never incur charges just by editing settings.
- **Tradeoff:** Saving an override after media generation does not immediately reconcile asset files. UI explicitly reports the risk; full dependency-hash invalidation, stale-asset enforcement and regeneration orchestration remain a follow-up delivery gate. This is a code+offline-test milestone, not finished media pipeline acceptance.

## R0-12 — Video library defaults (2026-10-14)
- Video create is MVP P0, default 35 minutes from channel preset; explicit target duration 1–120 minutes. Rendering duration remains unknown until measured.
- Video creation and clone requests accept persistent idempotency keys. A retry with changed input returns `IDEMPOTENCY_CONFLICT`.
- Video deletion is reversible soft-delete. Media and previous renders are not garbage-collected automatically; active jobs block deletion.
- Duplicate is intentionally lightweight: script and effective preset settings are copied, but media files, scenes, historical revisions and jobs are not copied. The new status is `draft` or `content_ready`, never `rendered`.
- Resume step is advisory and validated against real prerequisites. Unknown or unmeasured progress must remain null.


## ADR-R006-01 — Single durable queue with safe HTTP projection (Tech Lead)

- **Decision:** Reuse `spikes/SP-04/src/{store,runner}.js` in the shared SQLite file. Do not create a second queue for the Job Center. All HTTP and SSE output must pass through `apps/api/src/job-center.mjs`, which exposes an explicit metadata allowlist. A valid error identifier is not by itself safe; unknown provider error strings are withheld.
- **Why:** Internal queue rows contain prompts, asset requests, worker leases and potentially provider secrets. Returning raw rows via existing `/api/jobs` or queue-create responses violates the local-first privacy boundary even after authentication.
- **Consistency:** SQLite job state and its outbox event are written in the same transaction. SSE resumes from durable sequence IDs, with `Last-Event-ID` passed only as an authenticated HTTP header. Backpressure pauses the stream until drain without losing a queued event.
- **Cancellation:** Pause/cancel fences the database commit but does **not** guarantee a remote provider call stops; paid-use approval belongs to R0-13 and must be checked before outbound execution.
- **Validation:** Live Fastify and browser tests still required. None of these decisions change scope approved by PO.

## ADR-R013 – Fail-closed paid provider execution (2026-10-14)

**PO baseline:** local/free first; when remote provider cost may be charged, show notice and require explicit user consent before using it.

**Tech Lead choice:** reserve estimated integer micro-USD in SQLite v10 against a time-limited approval scoped to the *stored* job/account/model target, only at provider dispatch. A UI `approved:true` flag or preview result is not spend authority. Network unknown outcomes remain charged against the estimated allowance until reconciled; same invocation key cannot be sent twice. Revocation blocks new dispatch but cannot cancel a provider invoice for an already-sent call.

**Price assumptions:** a trusted adapter must provide a conservative cost estimate; unknown price fails closed. Billing cap is a guard against *estimated* usage and is not equivalent to a provider-enforced card/billing cap. `free_unverified` remote models cannot execute just because the user labeled them free: only audited built-in no-API-billing adapters may opt into that behavior; Edge TTS is not an official guaranteed-free API.

**Deferred:** UI live browser and HTTP verification, actual paid adapter integration/usage reconciliation and job wait/resume, target Windows. No new PO decision needed.

## ADR-R014 — Test-only deterministic adapters + cross-OS quality gate (2026-10-14)

**Decision:** Use explicit, testkit-only mock providers for LLM/TTS/Image/Video; they are never auto-registered into the live provider registry. Mock audio is a deterministic PCM tone, mock image and MP4 are fixed fixtures; their output must always be labeled as non-generative. Inject provider ID mapping only through the existing Job Handler's optional factory argument, retaining production defaults. Continue to gate paid provider invocation at `ProviderRegistry.invoke`.

**Why:** Developers need repeatable CI scenarios for a large AI queue without keys, real model dependencies, hardware or billing exposure. Reusing the actual JobStore/JobRunner + manifest tests real orchestration without confusing mock output with working AI inference.

**Cross-platform contract:** Explicit Node file inventory replaces platform-dependent shell glob expansion. GitHub Actions matrix runs Windows and Ubuntu with Node 22, checks API/SDK/build and enforces negative control. Do not treat an unexecuted workflow or hosted runner as acceptance on the user's machine.

**Open:** No verified npm lockfile yet; CI uses `npm install`, must transition to pinned `npm ci` once lockfile can be generated with registry access. Browser/Fastify HTTP tests not run in current offline runtime, Windows/GPU and actual AI inference remain deferred.

## ADR-R0VID01 — Declared AI-video capability limits are NOT trusted runtime evidence (2026-10-14)

- **Decision:** Add independent model-specific capability declarations in additive SQLite v11 with optimistic revision. Supported T2V/I2V modes, maximum clip duration/resolution/FPS and optional GPU/VRAM hints are **user-entered metadata**, not proof of an official capability list, free API billing, working Comfy workflow or current GPU health.
- **Preflight:** Validate against those declarations on the server without remote calls. Report actionable blockers and unverified evidence separately. `canPlan` is explicitly metadata-only, not permission to spend or proof of inference.
- **Before enqueue:** AI-video asset queue must reference a configured model and recheck declared limits. Only local ComfyUI is currently wired to the actual job handler; no silent remote/paid routing, even if the caller forges an approval flag. Server-side I2V reference loading is deferred to R2 to avoid accepting raw image bytes/paths from HTTP JSON.
- **Fallback:** Offer Image Motion as a visible alternative. It is never called AI-generated video and is not auto-run until orchestration uses a separately approved policy.
- **Reason:** Prevent false free-API claims, accidental billing, unsuitable clip dimensions and a UI preview bypassing execution controls. Real availability requires adapter/GPU/Windows acceptance, which the PO has deferred.

## ADR-R001-LAUNCH — One-command Windows local bootstrap (2026-10-14)

**Decision (Tech Lead):** Keep `Run-Windows.ps1` as the user's canonical entry point with `-Mode start` by default; implement portable orchestration in dependency-free `tools/launch.mjs` and pure/tested `launcher-core.mjs`. Production mode builds React and lets **one Fastify process** serve both API and UI on `127.0.0.1`, avoiding two independently managed dev terminals and avoiding cross-origin pairing exposure. Preserve `test/diagnose/api/web` modes for developers.

**Guardrails:** No bypass of R0-13 paid policy; no secret/pairing code in URL or log; checked port and exclusive PID/token data lock before potentially destructive SQLite migration; only own spawned child is stopped; no deletion of local data/SQLite/media. UI opens only after validated service-specific `/health`, not merely after a socket becomes reachable. FFmpeg absence is a visible warning, not a fake render success.

**Trade-off:** npm install needs internet on first run and a deterministic lockfile is not available yet. Windows PowerShell and real browser/Fastify runtime remain unverified; CI smoke and hardware acceptance are explicit release gates. This is an implementation decision, not a PO policy change.

## ADR-R010 — Short-lived TTS previews vs. scene voice assets (2026-10-14)

- **Decision (Tech Lead):** Preview is an authenticated POST returning bounded binary WAV/MP3. It is not an audio asset, queue job or channel preset write. The SDK fetches as a Blob using the existing in-memory bearer/CSRF session; no token in audio URL. The UI revokes Blob URLs when configuration or text changes.
- Edge TTS is an unofficial **online** dependency. Preview requires fresh, explicit user consent to transmit the entered sample text; never silently falls back or charges a paid provider.
- Local Piper/VieNeu bridge uses operator-configured `http://127.0.0.1` URLs only, refuses browser-supplied arbitrary URLs and does not assume every third-party TTS endpoint uses an identical protocol. eSpeak remains for diagnostics, not a substitute for Neural voice.
- Audio signature/size checks are defensive minimums, not a guarantee of playback quality. Live provider/browser tests remain release gates.

## 2026-10-14 — ADR-R0GATE-01: Private channel avatar & additive migration
**Decision (Tech Lead):** Channel artwork stays in private `/data/channel-avatars/<channelUUID>/<assetUUID>.png|jpg`, not public static assets. Upload via authenticated JSON base64 route (256 KiB), file structure/dimension checks, immutable SQLite v12 revisions, channel row-version locking; read via Bearer-only binary API/Blob URL. No automatic permanent cleanup of earlier revisions; EP09 must handle orphans/retention later. This design avoids adding unverified multipart/parsing dependencies before npm availability.
**Reason:** Close EP01 avatar gap while preserving existing vault, auth, snapshot and migration invariants. No external AI or paid provider invocation required.
**Limit:** Not equivalent to a full PNG/JPEG decoder or actual browser validation; verify output with an enabled frontend/FFmpeg later.

## 2026-10-14 — ADR-R0GATE-02: No release sign-off from offline tests
**Decision:** Separate “Code + Node tests pass” from “R0 production/Windows accepted”. A real Fastify smoke was added to CI and must run on npm-enabled Linux and Windows workers. Local npm install blocked by registry DNS EAI_AGAIN; Vite build and HTTP validation remain OPEN. Continue R1 implementation using mocks without requiring PO machine now.

## R1-01 — Brief as independent immutable video input (2026-10-14)
- Use `content_briefs` for current draft and append-only `content_brief_revisions` for historical immutable inputs (migration v13). This isolates inputs from manually approved `videos.master_script` and prevents retroactive modification of queued jobs.
- PUT replacement with `expectedRevision` instead of PATCH (EP04 draft outline described GET/PATCH): full validated payload and optimistic lock avoid silent merge conflicts. Approved function and expected semantics unchanged.
- Word and duration estimator is deterministic with editable WPM and ~1,100 words/chapter. Actual final duration is based on generated audio later; UI labels estimates.
- Provider model picker stores safe model IDs only; generation readiness is a dry run; paid policy is **always** rechecked at outbound invocation in later tasks. Saving a draft does not authorize any AI call.

### 2026-10-14 · R1-02: Outline proposal is not master script
- CT02 has a **manual editable canonical outline** and **queued AI proposals**. The app does not silently replace master script, scenes or assets.
- Proposals live as **SP-04 fenced job results**; user accept creates a new immutable outline revision. This avoids a stale worker committing side effects before its lease is validated.
- Model dispatch remains **local Ollama only** for R1-02. Provider-wide remote/free/paid support with explicit paid authorization is deferred to R1-03/07, not inferred from model configuration.
- Each run pins Brief revision and resolved content style. UI editing may proceed concurrently; a stale generation result is marked `needs_review` instead of overwriting changes.

## 2026-10-14 — ADR-R103: Parallel model chains with bounded continuity, no automatic paid dispatch

- Use **one existing SP-04 JobStore/Runner**; one job per (batch, model, chapter), previous chapter job as dependency in the *same model*; chains for separate models can run concurrently. This avoids incoherent chapter order while allowing comparisons.
- Pin immutable saved Brief/Outline snapshots at batch creation; generated drafts only materialize after fenced job success. Batch histories preserve multiple versions. **Never overwrite master script** (R1-06 explicit approval).
- Pass only previous chapter SUMMARY into next prompt to keep context bounded; keep model chains independent. Output format is strictly JSON `{text,summary}`, with response size bounds.
- R1-03 executes **local Ollama models only** even if free/paid cloud accounts exist in Registry; safe remote calls with credential isolation, quota, throttling and human-approved billing require R1-07, not a frontend boolean. This is an engineering safety constraint; not a new PO product choice.
- Retry only failed or blocked descendants. Paid/remote outcome ambiguity must be handled separately when cloud adapters are introduced.

## ADR-R104 — Immutable AI judging and server-owned weighted score (2026-10-14)

- **Decision:** Score each immutable chapter/model draft (`variantId`) with a fixed rubric version. Store queue job metadata separately from immutable results; only a successful lease-fenced SP-04 job may materialize a score. Allow unlimited explicit re-evaluations as separate records instead of overwriting a prior result.
- **Rubric v1:** Mạch lạc 25%, Chính xác 25%, Phong cách 20%, Thu hút 15%, Đầy đủ 15%; model returns 0–10 per criterion, per-criterion feedback, global feedback, suggestions. **Backend computes total** out of 100. Missing/out-of-range fields fail validation; malformed output gets exactly one schema-repair attempt (not on HTTP 429/network error).
- **Integration boundary:** Active Ollama local only for R1-04. No API keys, paid fallback or remote calls before R1-07. Eval result is not a master approval or a guarantee of truth. Preview and saved revision history can be displayed without changing content or assets.
- **Migration choice:** v16 adds stable variant IDs, immutable results, and backfills v15 drafts; historical migration checksums unchanged. SDK type generator now emits `anyOf`/`oneOf` unions for nullable result types, fixing previously collapsed result types.
- **Trade-offs:** Local model may not fit a long chapter; this will require live quality and context-budget validation. Model prompting reduces injection risk but is not a security guarantee against model instruction following.

## 2026-10-14 — DEC-R105: Retry with Feedback stores one private chapter batch per attempt

- **Decision:** A retry is a new `content_retry_runs` row linked to one successful AI Judge evaluation and source `variantId`. Each attempt gets a private `content_generation_batches` entry (`request_key` starts with `retry:`), one ordinary `content_generation_jobs` row, and on fenced success one immutable `content_chapter_drafts` + `content_draft_variants` revision. No changes to historical migrations v1–v16.
- **Why:** Existing AI Judge `variantId` foreign keys and immutable draft triggers can be reused safely; rebuilding FK tables or creating a second evaluator pipeline risks lost evaluation history. Private retry batches are excluded from the main generation list to avoid misrepresenting a single regenerated chapter as an entire video generation.
- **Model policy:** Local Ollama active model included in the pinned original Brief; no remote/paid auto-switch until R1-07 has production enforcement. The edited feedback is part of the persisted, idempotent job; no background iteration and no auto-approval.
- **Consequences:** Retry history is a lineage graph; each newly evaluated variant may itself be retried. A new version has its own immutable evaluation results. Previously finalized `master_script` remains unchanged until explicit R1-06 approval.
- **Deferred:** Interactive diff highlighting, deeper automatic quality thresholds and remote LLM routing are not in R1-05. SQLite, queue and mock local model were exercised; actual Ollama/React/Windows remain pending.


## ADR-R106 — Explicit master review boundary and immutable author provenance (2026-10-14)
- **Owner:** Tech Lead; implements PO-signed US-4.7.
- **Decision:** Save candidate versions separately from canonical `videos.master_script`; only explicit approval writes to canonical video. No approval from AI score or queued job state. The approval and video-row update share a SQLite transaction. Store immutable chapter lineage and SHA-256 digests. Keep approved historical versions readable.
- **Manual import:** Reuse this same review/approval boundary with `outlineRevision=0`; do not delete prior manual workflow or create a bypass to the new approval screen.
- **Conflict/media safety:** Require current candidate revision + current video row version + current outline revision (when AI-sourced). If existing scenes depend on an older script, changed reapproval fails until EP05/R2 implements safe rebuild/impact planning.
- **Warnings:** Target word count ±20% and exact normalized repeated paragraphs >=90 chars trigger warnings; PO must acknowledge on approval. These checks are advisory, not claims of factual accuracy.
- **Tradeoff:** No auto-assembly of a 5,000-word video as background job here. Live model, quality and browser validations remain pending; no new API provider or queue introduced.

**Enforcement:** A database-level `content_master_publish_guard` rejects SQL-level bypasses after candidate review starts; domain checks are not the sole protection.

---
## ADR-R107 — Remote LLM fail-closed routing (2026-10-14)

**Decision:** Only first-party, allowlisted official HTTPS Gemini, Groq and OpenRouter endpoints are supported for R1-07. Ignore any arbitrary model endpoint for credentialed outbound LLM calls; do not trust `free_unverified` alone as proof of no billing. Require local operator opt-in + independently confirmed no-billing list. Billable invocations require independently verified per-call cost ceiling AND R0-13 job-scoped approval; reserve cost before the request, retain reservation for uncertain outcomes and do not automatically retry a possibly billable call.

**Why:** The prior local-only model-selection rule cannot safely be relaxed without real dispatcher enforcement. UI previews, quota guesses and account labels are not a billing authorization. Job-scoped IDs and one SQLite queue avoid duplicate paid dispatch after recovery. Provider-owned rate limits/plan contracts must be respected.

**Tradeoff:** Some legitimately free provider accounts require extra operator configuration. Automatic fallback is limited to the same provider and exact underlying model on separately confirmed free accounts, to avoid changing user-selected content characteristics. Live provider validation is deferred because there is no user API account/Windows runner in this environment.

---
## ADR-R108 — Long-form audit is advisory and must never infer voice duration (2026-10-14)

**Decision:** Add a read-only deterministic QA report for coverage, word-count drift and exact repeated passages. Synthetic 30/35/40min multi-model rehearsals verify job orchestration only. These reports do **not** score factual accuracy, narrative coherence, provider quotas, native playback or final MP4 minutes. Master Script remains published solely via explicit R1-06 approval. No new database migration, public endpoint or paid provider call is introduced.

**Why:** A large, successful mock pipeline cannot substantiate real 30–40 minute narration quality or production release readiness. Separate architectural regression evidence from editorial and TTS measurement gates.

## ADR-R201 — Approved script source offsets and scene revision ownership (2026-10-15)
- **Decision:** Scene authoring begins only from an R1 explicitly approved immutable Master Script revision; raw unaudited overwrite is rejected. Source spans use UTF-16 offsets and reconstruct the approved script exactly; manually edited wording/reorder must be explicitly acknowledged and recorded as an immutable scene revision.
- **Why:** Vietnamese punctuation, emoji, paragraph spacing and future media caches must not be silently damaged. Fingerprints and source provenance allow later selective regeneration.
- **Safety boundary:** No editing/replacing existing scenes once any assets are present until R2-06/R3 defines safe invalidation and reuse. Reset old clip IDs when replacing bare scenes. No additional queue, no provider calls, no implicit spending.
- **Further work:** R2-02 visual prompts and R2-06 asset dependency hashes; measure real voice durations after TTS.

## R2-02 — Immutable AI visual prompt proposals (2026-10-15)
- Continue to use the SINGLE SP-04 SQLite job queue and v19 Scene Builder history; v20 only appends `scene_visual_runs` snapshots.
- Prompt generation is local Ollama only in this task; the existing R0-13 paid gate is not relaxed. No remote fallback.
- Split prompt batches into 8 scenes/job; output read only after fenced queue `succeeded`. UI never auto-commits AI text.
- Fixed visual style, character, aspect ratio and stable seed at request time; stale results remain readable but cannot be applied.
- Never replace non-empty manual prompts, change media from unverified AI advice or erase existing assets. Imported videos do not need image prompts.
- Do not treat scene media selection as provider readiness. Actual image/video capability validation belongs to R2-05/R2-VID.

## 2026-10-15 — ADR-R203-01 · Voice requests, timing and remote consent

**Decision:** Production Edge TTS is queued only after request-scoped online consent. The current scene voice pointer may be updated only by the latest immutable scene/config/voice/rate input hash/job ID. Provider success is NOT file activation: FFprobe verification and a second input/config/latest-intent check inside SQLite promotion is mandatory. Old jobs without immutable v21 voice provenance fail closed.

**Why:** A slow old voice cannot overwrite a new script/voice, and crashed/resumed workers must not activate mismatched audio. A valid committed asset can be reused without network. Audio timing is stored as measured metadata, not a silent update to a user's estimated scene/timeline edits; R2-07 will own explicit timing reconciliation.

**Trade-off:** Edge is an online, unofficial adapter whose availability and pricing conditions are not assured. Explicit consent is required for each queue/batch, even though the adapter presently needs no API key. Legacy pre-v21 queued voice outputs need explicit regeneration. Assets rejected after provider success may remain as on-disk orphans, to be reconciled in R2-06.


## 2026-10-15 — ADR-R204-01 · Explicit local voice routing and fallback

**Decision:** Piper and VieNeu are independent custom HTTP loopback adapters, registered only when an operator provides a literal `127.0.0.1` synthesis endpoint. Request JSON may choose a local primary and may explicitly pin exactly one Edge→local fallback, including its own voice; no automatic fallback from local to Edge/remote or to paid providers. Append SQLite v22 rather than mutating v21's checked migration checksum. Remote consent remains required for Edge, while local-only does not require Internet consent.

**Reason:** Every Scene voice must be attributable to an immutable model/provider input and explicit policy. An unconfigured local engine must fail closed; endpoint URLs from an API request are unacceptable SSRF vectors. Jobs retain latest-intent/hash/scene-config fencing and verified audio before activation. The configured voice is intentionally static until a more comprehensive multi-voice discovery workflow is designed.

**Tradeoff:** Generic JSON/text HTTP bridge is not a native Piper/VieNeu model server. An operator may need to supply a compatible bridge; local readiness ≠ synthesis quality. Audio orphan cleanup and timeline sync remain R2-06/R2-07. No implicit provider activation.


## ADR-PLAN-20261015-02 — Preserve R2-05 and integrate render roadmap as task extensions

**Decision (plan only):** Keep the newest R2-05 source and v23 migration as source of truth. Merge previously approved R2-EXT-01..08 tasks into docs/backlog without applying older R2-04 source. R2-06 continues next. Composition contract must be engine-neutral; primary render engine selection is gated on real Remotion/HyperFrames POC on a suitable machine, not FFmpeg baseline.

**Why:** Avoid regressing image versioning and 560/560 offline evidence, duplicate queues, vendor lock-in, hidden paid dispatch or overclaiming runtime verification. All future DB changes append after v23.

**Tradeoff:** This plan update ships no new functionality. Renderer engine and long-form readiness remain intentionally undecided pending real acceptance gates.


## 2026-10-15 — R2-06: Hash registry, immutable provenance and safe import

**Decision:** Add SQLite v24 `asset_content_index` (SHA-256 + size) and immutable revision field trigger without touching past migrations; reuse identical manual uploads only inside the same scene/source/metadata, keep generated jobs as independent immutable revisions even with identical bytes. Cross-scene physical hardlink dedup is postponed because unexpected external modification would corrupt multiple scenes. Reconciliation is non-destructive; the planner exposes affected scene kinds but cannot enqueue jobs or spend money.

**Why:** Separates bytes identity from human selection/provenance, preserves restore and audit, and avoids stale asynchronous image imports cancelling a newer generation intent. Atomically promote manual selections only under row-version AND image-intent check. No silently deleting media, no second queue, no implied permission for paid/freemium provider calls.


## 2026-10-15 — ADR-R207: Atomic durable DAG on SP-04; no implicit provider retries

**Decision:** Reuse SP-04 job store. Enqueue dependency graph, frozen image/voice intents and run ledger atomically in the SAME SQLite file. Respect media SHA/intents at scene gate, never replace manually chosen media. Key requests explicitly and re-arm failed jobs only via user retry; remote Edge retry must receive renewed consent. Per-scene timed asset handoff aggregates FFprobe audio duration without overwriting editor duration. Do not add new background scheduler, renderer, auto-paid fallback or physical asset dedupe.

**Why:** Crash recovery must preserve complete jobs and avoid half-approved provider calls, protect user selections, and avoid paying/processing valid assets twice. SP-04 lease fencing handles stale worker commits; external provider side effects remain at-least-once. True multi-resource (disk + SQLite) atomicity is impossible; rely on immutable revisions and non-destructive R2-06 reconciliation.

**Tradeoff:** More persistent DAG metadata (SQLite v25); manual explicit consent/retry overhead; web UI and frame/caption alignment are separate tasks; no guarantee of exactly-once external requests.


## ADR-R208-01 — Conservative local quota reservations (2026-10-15, Tech Lead)

Use append-only v26 SQLite ledger for token capacity reservations before verified-free remote LLM calls with user-entered quota ceiling; reserve within `BEGIN IMMEDIATE`, settle only on provider-reported usage and retain unknown calls as uncertain. Never auto-release after a timeout or restart. No request-level HTTP write API for ledger. Required conservative token estimate is operator configuration, not inferred token count. This mitigates multi-worker oversubscription and replay but is NOT provider-verified billing data. Existing job-scoped R0-13 approvals remain authoritative for paid use; any paid-provider quota reconciliation requires its own trusted evidence and future explicit design.

## 2026-10-15 — R2-09 read-only asset inspection and manual restore
- Reuse the v26 R2-06 registry and R2-07 DAG, not another asset database or queue. No physical dedupe/GC and no automatic video regeneration on view.
- Do not add a v27 migration just for asset browsing while historical migration suites expect current v26; profile 30–40min file count before shipping a new index in a separately tested migration.
- Paginate strictly (50 max) and hash at most 4 files concurrently; never surface filesystem paths or prompt metadata. Manual restore goes through the already-fenced R2-05 image selection API.
- R2-09 does not implement quota UX or claim R2-EXT-07 complete; free/paid policy remains as in R2-08 and R0-13.

## 2026-10-15 — R2-10 local quota UX remains read-only

- Implement a narrowly scoped quota view, since the approved remaining R2 task definitions only state `quota UX / regression` at group level. Do not invent new provider billing/reconciliation scope.
- Reuse existing R2-08 authenticated GET; no new API, no schema migration, no external provider request, no write buttons.
- Show reserved and uncertain holds as unavailable against the local operator-declared ceiling; never label an internal estimate as free provider quota. Do not elevate `provider_verified` configuration to billing verification.
- On inconsistent data or network error, show no positive balance; stale model fetches are aborted. User explicitly chooses a model or refreshes, avoiding background traffic.
- R2-11..13 require original roadmap task clarity before any financially sensitive changes. See `docs/R210_QUOTA_UX_CONTRACT.md`.


### ADR R2-11 — Single-asset forced revision and verified voice undo (2026-10-15)
- Reuse existing SP-04 and R2-03/05 immutable provider snapshots. Distinguish *deliberate* same-input regen by a stable per-click request key; original cache hashes stay byte-for-byte identical absent key. Prevent reusing the same key with changed options/source.
- Voice undo is a guarded provenance-preserving intent + pointer update, rather than raw `voice_asset_id` rewrite. Refuse mismatched script/config and corrupt/untrusted file. Image undo retains existing manual pin.
- No new migration, automatic paid calls, inferred provider quota or alternate worker. R2-12 provider monitoring must retain existing financial gates.


## ADR-R212 — Observe locally, persist only verified runtime switches (2026-10-15)
- Keep dashboard local/read-only; quota source/remaining is never an external billing claim.
- Use existing SP-04, R2-08 quota ledger, R0-13 paid approval. No free/paid inference from editable labels.
- Introduce immutable v27 switch history only for completed equivalent free LLM fallback in actual dispatcher; UI labels partial coverage and ignores dry-runs.
- Do not fail a successfully billed upstream request merely due to local telemetry write failure. Longer-term outbox instrumentation is deferred.


## ADR-R213 — Explicit R2 offline/release boundary (2026-10-15)
- Retain original G3–G6 R2-13 as a **QA-only** task. Real SQLite + SP-04 106-asset synthetic-media workload provides deterministic regression, not Windows GPU/browser/MP4 certification. No schema/API migration for QA.
- Successful **durably committed** provider jobs are not re-dispatched; crash before commit can result in upstream duplicate/billing, so avoid exactly-once financial claims. Failed jobs require explicit retry, preserving completed stages and user-pinned versions.
- Release readiness is `NOT_READY` until independent hardware/browser/provider/long-form acceptance; `readiness:r213` never promotes itself to a pass based on binary availability.


## ADR-R2EXT01 — One composition contract before choosing renderer (2026-10-15)
- Create v1 portable contract with deterministic SHA-256 digest and frame offsets, where current `scene.durationMs` owns timing; preserve measured voice duration as metadata only until EXT-02.
- Pin selected immutable asset UUID/sha256/size/path and current scene/config/timeline revision; fail closed on missing/corrupt/stale media or changed editor state. Publish only on explicit expected hash + row version.
- Store approved snapshots immutably (SQLite v28), but check file hash again at actual future render: SQLite does not lock filesystem.
- `readiness.ready` means only selected media valid for **pinning**, never synchronized video or Windows-ready. No renderer preference, no new DAG, no automatic paid fallback.

## ADR-R2EXT02 — Measured audio sync without invented word boundaries (2026-10-15)
- Implement opt-in **Composition v2**, preserving v1 exact semantics. No migration: shared immutable v28 revisions persist and validate both versions. Historical composition GET has a union response type.
- Re-FFprobe healthy current asset bytes rather than trusting producer metadata; frame-ceil voice end and configurable bounded tail padding, subtitles stop at voice end. Never claim word-level sync from text/WPM ratios; forced alignment needs future genuine timestamp evidence.
- Explicit `timingLocked` clips own manual timing; inconsistent locked position or audio cutoff blocks publish rather than mutating user edits. Preview is not render proof; actual renderer must rehash and verify current scene intent at execution.
- No new queue, paid fallback, or renderer chosen. Next real POC gate is EXT-03 on equal fixtures; Windows/real providers/MP4 remain unverified.

## ADR-R2EXT03 — Measured renderer gate or no renderer selection (2026-10-15)
- Reuse independent benchmark POC and translate scene-level measured narration timing into both engines. Three workloads × ≥3 alternating trials, FFprobe and visual/manual QA must pass before choosing primary. FFmpeg-only baseline cannot rank engines.
- HyperFrames Apache-2.0 is attractive for low-cost/self-host; Remotion has React integration and a custom license. Neither performance nor total commercial cost is determined without real installs, latest terms, and trial evidence.
- Current container cannot reach npm registry (`EAI_AGAIN`): `POC_HARNESS_COMPLETE_GATE_BLOCKED`; both render engines NOT_RUN. No production engine locked; leave original SP-04 scheduler, R2-EXT-02 timing, immutable assets and approved-cost guardrails unchanged.

## ADR-R2EXT040506 — Provisional local FFmpeg renderer, no unverified engine winner (2026-10-15)
- User requested implementing EXT-04, EXT-05, EXT-06 before external npm/GPU setup. Deliver *explicit FFmpeg-only fast path* and full MP4 output using already approved Composition v2, without falsely concluding Remotion/HyperFrames benchmark or updating primary engine selection. Production engine gate remains blocked.
- Use the one SP-04 durable queue for background encoding and digest-addressed private output. Preserve paid-approval boundaries, current source/scene intent fencing, SHA256 inputs, and file integrity before and after render. Reject missing or unmeasured narration instead of WPM approximation.
- Caption output is **one cue per scene**, bounded by real voice; do not claim word-level alignment. Burn SRT via libass as simple reliable output; validate duration, codecs, resolution and fps through FFprobe, do not assume visual/audio perceptual quality from metadata alone.
- Timeline UI limits edit scope to lock/caption offsets; canonical scene order stays owned by Scene Builder. Preview displays currently selected image and authenticated voice, not a fake rendered composite. Advanced transitions/full preview and 30–40min workload are separate release gates.
- Native streaming save via File System Access on supporting browsers avoids buffering >100MB videos. Other browsers have bounded Blob fallback; further long-form export UX remains an acceptance item.


## ADR-R2EXT0708 — Deterministic no-cost routing preview and safe versioned motion brands (2026-10-15)
- EXT-07 is **read-only** until a provider execution/billing policy is integrated. Mode `saving` prioritizes verified reuse then manual import; `balanced/quality` can recommend configured local ComfyUI but never enqueue automatically; quality may show paid video candidates only as blocked informational items. API preview does not infer real provider remaining balance, cost or explicit approval from user-submitted flags.
- EXT-08 is template-first with strict bounded props; user-defined FFmpeg filters, URLs and JS are prohibited. Each style publish is immutable v29 revision + canonical SHA256, scene-specific overrides are owned by video and checked against Composition scene IDs.
- Existing FFmpeg path is reused; no Remotion/HyperFrames engine declared winner, no new worker scheduler. Branded render output cache is keyed by composition + style digest; style revisions do not mutate approved Composition source. `drawtext` uses private textfile and `expansion=none`; subtitle colors/size are validated; black fade does not change audio timing (not true overlapping xfade). JPEG thumbnail comes from actual encoded styled MP4, downloaded through authenticated endpoint.
- No cross-run remote call, paid fallback or external estimate source. Real browser, typography and Windows long-form acceptance remains open.


## ADR-IA01-01 — Reject nominal-duration MP4 when frame count disagrees (2026-10-16)
An FFmpeg output may have the correct container duration while losing the first H.264 frame because of concat/AAC priming. The final filter now starts the output frame clock at zero, allows a bounded two-frame tail pad, and `checkMp4Quality` rejects a mismatch between container `nb_frames` and authoritative Composition `totalFrames`. This is a fail-closed technical QA fix, not a render-engine decision. Real long-form export and perceptual A/V inspection remain release blockers.

## 2026-10-16 — HyperFrames primary (PO selected)
- Use HyperFrames HTML/CSS/seekable clips as production-oriented default local renderer. Remotion unselected; prior comparative benchmark still pending, so no speed claims.
- Preserve FFmpeg as explicit user-selected local fallback and as ffprobe/thumbnail utility, never switch silently. No cloud render or paid calls.
- Keep immutable Composition v2, SHA checks, one SP-04 queue; engine is pinned per queued job and idempotency key. No migration needed; old FFmpeg jobs resume.
- Acceptance remains blocked on real CLI/Windows/browser/long video.

## 2026-10-16 — IA-02 release criteria
- Preserve PO choice: **HyperFrames primary**, FFmpeg explicit manual fallback only. An FFmpeg QA success is **not** evidence of a HyperFrames render.
- Release gate must report BLOCKED for missing dependencies and real Windows/provider/long-MP4 evidence; offline tests never auto-sign off a release.
- Generated timeline-free HyperFrames HTML root uses `data-start=0` and `data-no-timeline`; user data/scene composition remain immutable and SHA-pinned.

## 2026-10-16 — R3-01 Selective scene edit (ADR-R301)
Accepted one-scene optimistic PATCH and side-effect-free impact preview, rather than destructive `replaceScenes` with assets. Do not rewrite immutable approved Master Script; text changes require deliberate acknowledgement. Retire intent and active pointer only for affected source dependencies; manual image selection survives text/prompt changes when media mode remains image. No automatic regeneration or provider cost; HyperFrames primary and IA-02 pending.

## 2026-10-16 — ADR-R302/R304 Presentation order ≠ immutable source order
R3 editor stores `sceneOrder` only in versioned `timeline_documents` JSON. `scenes.idx` and master-script source offsets remain canonical and untouched, while Composition uses persisted presentation order for rendering. Only `PATCH .../timeline/order` may reorder; PUT for timing rejects any order changes. Selected manual assets and prior immutable outputs remain unchanged. Render requires fresh Composition approval; never fake voice/caption timing or silently pay/fallback.

## 2026-10-16 — ADR-R305/R306: visual trim cannot edit narration; waveform from actual selected bytes
- Persist only per-scene visual in/out as row-versioned timeline metadata, preserving audio/captions/duration/script and old immutable renders. Source duration changes clear obsolete visual edits atomically. Block raw legacy PUT bypass, version conflicts and foreign scenes.
- Do not claim metadata-only trim changes exported MP4 until Composition/HyperFrames/FFmpeg explicitly implement it and QA can prove it. Snap follows project FPS and caption boundaries, not arbitrary seconds.
- Waveform derives from authenticated SHA-verified selected voice (WAV native/MP3 FFmpeg), not placeholder bars; bounded local LRU SHA cache, no provider invocation and no public media filesystem paths. Keep missing/corrupt audio explicit.

## 2026-10-16 — ADR-R305-RENDER: frame-space visual hold is separate from narration time
- A saved in/out pair sets **when visual media is active within a scene**, not a destructive trim of voice and not a seek into the visual file. Before interval video holds its first frame; inside it runs from source zero; after interval last active frame holds. Still-image motion progresses only inside interval. Scene duration, caption boundaries and voice are immutable.
- Preserve optional v2 field compatibility; snap ms→frames at composition approval and include in SHA-256 digest; reject out-of-range after FFprobe voice measurement.
- HyperFrames remains primary. FFmpeg is used internally to prepare only trimmed video clips, and separately as explicit user-chosen standalone renderer. Never silently fallback or pay. QA requires real CLI/Windows/browser to claim HyperFrames production readiness.

## ADR — 2026-10-16 R3-07..10
- Undo/redo produce **new** row_version and immutable journal entry. Do not UPDATE/DELETE historic revisions; 40 action bound prevents unbounded JSON growth; external scene rebuild invalidates undo stack.
- Render jobs are frozen at enqueue: edited live scenes cannot change queued revision. SHA checking on pinned media still fails closed if original bytes are changed. No paid reroute or automatic FFmpeg fallback.
- FFmpeg content-addressed segment cache includes SHA of source + render params and excludes absolute scene offset; SRT is burned at final mux. Validate cached bytes/hash and frames before reuse. HyperFrames cache not yet implemented.
- Emit UTF-8 SRT independent of MP4 using same immutable composition; authenticated checksum guarded download.


## ADR — 2026-10-16 R3-11 portable ZIP64 without external zip library
- Export **approved immutable Composition v2**, not the unsaved editor or a DB backup; no secrets, provider account config, absolute paths or paid-provider requests. Preserve voice/subtitle timing, media and ordering.
- Use dependency-free ZIP64 STORE streaming with UTF-8 paths and content hash checking rather than recompressing MP4/WAV/PNG. Build fully in private staging before returning HTTP data; clean on disconnect. ZIP64 >4 GiB remains unaccepted.
- Browser large files use File System Access; browsers without picker capped at 100 MiB. ZIP is an editable-resource bundle with metadata, not a one-click native CapCut project.

## ADR — 2026-10-16 R3-12 Render Drawer
- Render output size is an immutable *derivative* from approved Composition v2; changing export resolution never alters scene/voice/caption timing or approved digest. Rendition is included in durable job payload, staged snapshot and content-addressed output hash/cache identity. No DB migration.
- Stage progress is only a measured count of finished scenes. HyperFrames is coarse-grained (0/total) until CLI exits, so never show fake percent/ETA; completion requires mux + QA + worker success.
- Preflight is read-only, no implicit provider/engine fallback. Old QA-passed export remains downloadable with `sourceCurrent=false` after timeline changes. Square aspect ratio 720p rejected until schema supports that resolution.

## ADR — 2026-10-16 R3-13/14: durable renders without inventing acceptance evidence
- Keep single SP-04 queue and immutable Composition; fail closed when disk capacity is insufficient/unknown at both enqueue preflight and actual worker start. Headroom is conservative, *not* a guarantee; third-party disk usage can still race. Never auto-switch from HyperFrames to FFmpeg.
- Kill entire local render process tree on abort/timeout to avoid orphan encoders; retain existing lease-token DB fencing and immutable SHA scene-cache. Cleanup only old UUID staging; never delete user media or good cache on startup.
- A 300-scene 36-minute PLAN, real 5-scene FFmpeg output and 8/22 partial gates do not prove a 36-minute HyperFrames export. Mark R3-14 BLOCKED and overall release NOT_READY until target OS/engine/browser E2E evidence exists.

## ADR — 2026-10-16 R4-01: Frozen origin + explicit field-level channel preset migration
- Existing videos never inherit new channel presets implicitly. Compare effective video config to latest channel snapshot, but transform selected changes into **overrides against original immutable video source**. Unselected fields retain their effective value.
- Every apply checks expected channel preset version, video rowVersion, explicit selected paths and preview SHA digest including impact within SQLite IMMEDIATE transaction. Reuse R0-11 `videoConfigImpact` and immutable revisions; no new migration or queue. Optional field removal is disabled rather than silently clobbered. Paid/remote flags continue to fail closed.

## 2026-10-16 · R4-02..08 decisions
- Restore is offline **new-destination-only** with operator opt-in; never overwrite live WAL data. Store portable relative asset paths and verify every manifest hash. Backup excludes vault and unknown root secrets; vault must use separate encrypted export in future.
- Storage cleanup is **reversible quarantine**, only for aged temporary files; no automatic deletion of orphan media or real caches.
- Subtitle edits remain **independent versioned drafts**. Until composition schema/publish and render snapshot adopt them explicitly, exported MP4 keeps its prior frozen subtitle track. UI labels this fact.
- Music post-process is local FFmpeg H264-copy/AAC mux helper, NOT wired into HyperFrames queue. No surprise paid calls, provider/fallback reroutes, or mutation of original MP4.
- Style lint is a prompt heuristic and no claim of consistent visual identity; R408 release remains NOT_READY until observed Windows/HyperFrames 35-minute E2E evidence.

## ADR · 2026-10-16 R4-05/06/08 immutable finishing
- Keep approved Composition v2 digest unchanged: its strict validator binds one canonical narration caption; user-edited multi-cue captions are separate opt-in **render overlays** pinned in SQLite snapshot. This avoids breaking v1/v2 history. Different caption digest yields distinct final MP4, but underlying FFmpeg media segments remain reusable.
- Music is an explicit SHA-verified user import. Postmix occurs after either HyperFrames-primary or manually selected FFmpeg. It creates a separate H264-copy/AAC output; the base MP4 is never changed. UI asks user to confirm music rights; no licensed catalog/paid calls are implied. Keep current ≤640KiB JSON upload cap to respect 1MiB API ingress; streaming imports are a later task.
- Import app-managed music into verified backups by SHA filename, not by wild-card inclusion of arbitrary files. Audit requires actual observed evidence: `NOT_READY` remains mandatory while real Windows/HyperFrames/long-video acceptance is blocked.

## ADR FI-01 · 2026-10-16 — Strict local HyperFrames version policy
HyperFrames remains **primary**. Production jobs must use the exact locally declared version `0.8.159`, never the global `hyperframes` binary or `npx` (which may download/change code without provenance). Project-render identity includes the pinned version to avoid stale cache reuse across upgrades. Missing/mismatched local CLI fails closed. FFmpeg is only an explicitly chosen fallback plus approved media post-processor. Actual runtime, GUI, 35min and security readiness remain gated; no lockfile generated until dependencies are accessible.

## ADR FI-02 — 2026-10-16: refuse unverified production dependency graphs
- Production launch must verify the exact committed npm lock against the renderer pin **and all workspaces**, even when node_modules exists. New installations use only `npm ci` under this policy. Missing/stale lock is operator-action BLOCKED/FAIL, never auto-fixed via `npm install` during user startup.
- Release state depends on **fresh first-party execution** plus independent manual Windows/browser/long-render/security evidence. Legacy offline successes, mocks, FFmpeg short renders and preexisting JSON cannot mark release READY. Strict release audit returns nonzero for missing evidence.
- Runner never logs child stdout/secret contents, contacts paid models, implicitly downloads packages, or auto-switches HyperFrames/FFmpeg.


## 2026-10-16 · FI-03 accept only observed release evidence
- Never manufacture a package lock (integrity checks require actual registry), never auto-fetch floating dependencies, and never treat a synthetic long FFmpeg control as real HyperFrames acceptance.
- HyperFrames child process inherits only explicit OS keys, not provider credentials. Windows setup stages are manually selected and separated.
- Full-suite timeouts are BLOCKED until a clean complete run; targeted tests do not override them.
