> **CURRENT PRODUCT DECISION (2026-10-18):** Browser-first localhost web app, **not** Windows desktop application. The historic Windows-target acceptance notes below are superseded by [LOCALHOST_BACKLOG_HANDOFF.md](docs/LOCALHOST_BACKLOG_HANDOFF.md) for future release gates. Keep all 69 task IDs, preserve historical hosted Windows evidence, and regenerate with `npm run backlog:merge:fi04` then `npm run backlog:check:fi04`. Actual localhost authenticated browser UX, 35–40min real HyperFrames MP4/restart/performance and opted-in local AI inference remain **NOT_READY**. Append progress to `docs/WORKLOG.md`; do not mark these gates PASS from mock/CI pairing only.

# FI-04 – 17/10/2026 · Stability, dependency/bootstrap, runtime readiness

**Dự án:** Video AI Flow / ContentStudio | **Nguồn mã:** FI-03 archive snapshot | **Release:** `NOT_READY`.

**Tình trạng (phân biệt code/gate):**
- `FI-04-01`: ổn định runner với 2 concurrent tests mặc định, timeout theo bài, watchdog toàn suite, TAP full-plan verification, batch isolation và negative control. Lỗi treo FI-03 trước đây là **intermittent**, chưa xác định root cause cụ thể hay chứng minh sửa dứt điểm trên mọi máy.
- `FI-04-02`: công cụ kiểm tra lock/workspace và dependencies; trên host hiện tại `npm ping` = `EAI_AGAIN`, thiếu `package-lock.json`, nên **BLOCKED** về cài đặt thật. Chỉ operator Windows trusted network mới `-ResolveLock`, xem xét và commit rồi `-Install` bằng `npm ci`.
- `FI-04-03`: runtime checker yêu cầu Vite build và Fastify live HTTP thật; hiện **BLOCKED** do chưa có dependencies. `--strict` phải exit != 0 khi thiếu điều kiện.
- `BACKLOG`: merge **42** task lịch sử + **14** task AI Video v3 + **3** task FI-04 = **59** ID duy nhất; `SP-VID-01` đã có spike/test, `R0-VID-01` đã có code và offline tests. Các mục AI Video khác ghi trạng thái từng phần/chưa nghiệm thu, KHÔNG gọi tất cả là chưa code.

**Các câu lệnh:**
```bash
npm run test:fi04
npm run backlog:check:fi04
npm run test:all
npm run test:all:batched
npm run check
npm run typecheck:sdk
npm run test:negative-control
npm run acceptance:fi04:inspect
npm run acceptance:fi04:verify # expected non-zero until genuine dependencies, Vite and Fastify
```

Windows chuẩn: chạy `tools/FI04-Windows-Setup.ps1 -ResolveLock`, kiểm duyệt và commit lock, sau đó riêng `-Install`, `-Verify`. Các bước này **chưa được thực hiện trên Windows**.

**Chứng cứ cần thu thập trước khi đóng FI-04:** Windows npm/lock real; `npm ci`, Vite, Fastify live, renderer real; full-suite repeated soak; audit; browser. FI-04 không tự nhận hoàn thành HyperFrames, 35-minute output hoặc real AI provider.

**Backlog nguồn:** `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json` (được giữ nguyên cho lịch sử), `docs/reference/VIDEO_AI_FLOW_EXECUTION_PLAN_V3.md`. Backlog hợp nhất: `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json`; regenerate bằng `npm run backlog:merge:fi04`.

---

> **CURRENT — FI-02 (2026-10-16):** Strict reproducible Windows startup now requires a reviewed `package-lock.json` and uses only `npm ci`; never floating install. New release evidence runner + Windows script; 7/7 FI-02 focused PASS, release audit 8 PASS / 12 BLOCKED, **NOT_READY**. FI-02 full suite attempt timed out at #629 (FI-01 baseline 852/852 PASS). Read `docs/FI02_HANDOFF.md`, `docs/FI02_RELEASE_CONTRACT.md`, `docs/FI02_TEST_REPORT.md` FIRST. Do not claim Windows/HyperFrames/35-minute output is tested.

> **LATEST — FI-01, 2026-10-16:** Full offline regression **852/852 PASS**, but release audit **11 PASS / 13 BLOCKED / 0 FAIL** and `NOT_READY`. Exact local HyperFrames 0.8.159 pinned; no global/npx fallback; real HyperFrames subtitle/music acceptance runner added but CLI+lockfile+Vite/Fastify unavailable here. Read `docs/FI01_HANDOFF.md` first. No paid APIs or automatic FFmpeg fallback.

> **LATEST R4-05/06/08 (2026-10-16):** Start `docs/R405_R406_R408_HANDOFF.md` and `docs/R405_R406_R408_TEST_REPORT.md`. Explicit saved subtitle draft → immutable render snapshot → MP4/SRT (FFmpeg real E2E), local music import/list → snapshot → H.264-copy/AAC music postmix, also wired after HyperFrames primary. 12/12 focused PASS; release audit 10 PASS/11 BLOCKED; full global suite not established. **NOT_READY** until real HyperFrames/Windows/35-min/browser acceptance. Never auto-pay or silently switch engine.

> **LATEST 2026-10-16 R4-02..08 (PARTIAL):** Read `docs/R402_R408_HANDOFF.md`, `docs/R402_R408_IMPLEMENTATION.md`, `docs/R402_R408_TEST_REPORT.md` first. Verified backup/restore-to-empty, quarantine CLI, Job Center filter, subtitle draft editor/API (not burned into render), local FFmpeg soundtrack post-mix (not in queue), prompt-token style lint, release audit. Focus 10/10; R4-01 regression 12/12; contract 6/6; global timed out #621; Vite missing. Release **NOT_READY**. HyperFrames primary; FFmpeg manual fallback; never auto-pay.\n
> **LATEST 2026-10-16 R3-13/14:** Disk guard, cancel process tree, expired SP-04 lease fence, old render staging cleanup; acceptance gate script reports `NOT_READY` with real short FFmpeg + 300-scene plan only. Read `docs/R313_R314_HANDOFF.md` before editing. No real HyperFrames/Windows/35-min QA yet.

> **CURRENT checkpoint (2026-10-16): R3-07..10.** Immutable SQLite v30 timeline Undo/Redo, v31 frozen render snapshots and FFmpeg SHA segment cache, final MP4 QA and authenticated separate Vietnamese SRT. New focus 7/7, export/API suite 15/15; **full test suite timed out**, not new full PASS. HyperFrames primary but real CLI and segment cache remain pending. Start `docs/R307_R310_HANDOFF.md`. Release NOT_READY.

> **Current checkpoint (2026-10-16) — R3-05 VISUAL WINDOW NOW APPLIED AT RENDER TIME (code/tests):** Composition v2 carries digest-pinned `visualWindow`; FFmpeg edited image/video exports verified real 90-frame MP4; HyperFrames HTML/staged video has **mock-only** CLI evidence, not a real HyperFrames MP4. 8 focused + full offline regression PASS; browser/Windows/real HF/35min remain NOT_READY. Read `docs/R305_RENDER_HANDOFF.md` and `docs/R305_RENDER_INTEGRATION_CONTRACT.md` first. Next R3-07.

> **CURRENT checkpoint (2026-10-16): R3-02/03/04 Timeline & Preview CODE_COMPLETE_TESTED_OFFLINE.** Read `docs/R302_R304_HANDOFF.md` first; next R3-05. IA-02 release NOT_READY, HyperFrames primary, FFmpeg explicit manual only.

> **CURRENT checkpoint (2026-10-16): R3-01 Scene Inspector CODE_COMPLETE_TESTED_OFFLINE.** Read `docs/R301_HANDOFF.md` first. HyperFrames selected as primary, FFmpeg explicit manual only. IA-02 release NOT_READY. Do not claim Windows/browser/live HyperFrames acceptance.

> **IA-02 CURRENT (2026-10-16):** HyperFrames primary. IA-02 gate harness code tested 751/751 offline; 5 PASS / 11 BLOCKED, release NOT_READY. Read `docs/IA02_HANDOFF.md` then `docs/IA02_ACCEPTANCE_PLAN.md`. FFmpeg five-scene MP4 is NOT a HyperFrames result. No automatic paid/cloud or FFmpeg fallback.

> **CURRENT renderer decision (2026-10-16): HyperFrames PRIMARY, FFmpeg manual fallback.** 747/747 offline tests PASS, real HyperFrames CLI/browser/Windows NOT YET TESTED. Read `docs/HYPERFRAMES_SELECTION_HANDOFF.md` before renderer changes.


## Latest checkpoint — R1-EXT-01 / 2026-10-16
- Built-in Script Skills five-stage workflow implemented; 10 focused and 744 total offline tests PASS. See `docs/R1EXT01_HANDOFF.md`. Read-only planning and lossless approved-master JSON export; no external Superpowers plugin, automatic research, paid calls, or new DB migration. Web/Fastify/Windows remain unverified; release NOT_READY.

## Latest checkpoint — R2-13 / 2026-10-15

- Original R2-01..13 = **13/13 CODE_COMPLETE_TESTED_OFFLINE**, latest 15/15 focused and 688/688 all. **NOT production release accepted.** Read `docs/HANDOFF.md`, `docs/R213_INTEGRATION_ACCEPTANCE.md`, `docs/TEST_REPORT_R213.md` for current verified scope; older status headings below are historical.
- No new queue/migration/routes in R2-13. `npm run test:r213` covers 53 scenes / 106 assets, recovery and policy faults with local mocks; no live GPU, Windows, browser, FFmpeg MP4, 30–40 min or provider billing certification.
- Next task R2-EXT-01 (engine-neutral composition contract). Protect immutable versions/manual selections, paid consent, local-first execution, G6 gate evidence.

## R2-11 checkpoint — 2026-10-15

- Latest verified: `CODE_COMPLETE_TESTED_OFFLINE` R2-11 (16/16 focused; 658/658 full). Read `docs/HANDOFF.md`, `docs/R211_SELECTIVE_REGEN_CONTRACT.md`, `docs/TEST_REPORT_R211.md` before edits.
- `SelectiveRegenerationR211` preserves normal voice/image input hash and adds stable per-click `regenerationKey` only on explicit regenerate. Never reroute unrelated scenes/asset kinds; original job persists via SP-04; no new queue.
- Voice restore is manual, same-scene, checksum-verified, text/config-pinned and intent+rowVersion-fenced. Old queued jobs MUST NOT overwrite. Image restore remains manual pin.
- No silent remote consent or paid fallback; Vite/browser/Windows/GPU/long-form remain unverified. Next R2-12 original scope quota/fallback monitoring UI; R2-13 integration regression.

# ContentStudio — Agent Instructions

> **Current checkpoint (2026-10-16):** R3-05 visual trim **editor-only MVP**, R3-06 verified WAV/MP3 waveform; 10/10 focused. See `docs/R305_R306_HANDOFF.md`. Real renderer has NOT applied trim; full-suite timeout on legacy FFmpeg test; Web build/Windows/HyperFrames unverified, release NOT_READY.

> **Read this file first.** Then read `docs/HANDOFF.md` (current snapshot), `docs/WORKLOG.md` (recent changes), and only the files listed under **Relevant files** for your assigned task. Do **not** scan the entire repository by default.

## Product guardrails (PO approved)
- Target: Windows; development/tests may run elsewhere until actual Windows hardware is available.
- Local-first: React/Vite frontend, Fastify/Node backend, SQLite and local media storage; HyperFrames primary render, FFmpeg explicit manual fallback.
- Default AI providers: prioritize free/local; **never incur paid charges or silently switch to paid providers**. Paid fallback requires an explicit user approval mechanism and visible notice/history.
- Video workflow: Channel → Video → content/scoring → scenes/assets (including real AI video) → drag-and-drop 4-track timeline → MP4 export.
- Long-form target: 30–40 minutes, hybrid image-motion and AI clips; don't equate FFmpeg image motion with generative AI video.
- All hardware-dependent results remain `PENDING_HARDWARE_VALIDATION` until tested on target Windows hardware.

## Implementation rules
1. Work in the task's existing Epic/US/Task ID; preserve user-approved scope and existing contracts.
2. **Comment intent, not syntax.** Write a short module header explaining responsibility and boundaries. Explain *why* non-obvious decisions exist: queue idempotency, checkpointing, hashes, rate-limit protection, paid-model gates, sync/timing, security. Avoid comments such as `// increment i`.
3. Public interfaces: use JSDoc/TSDoc for contract, inputs/outputs, side effects, errors, and units (ms vs s). Keep API/database contracts synchronized with implementation.
4. Do not log secrets, prompt content containing personal data, access tokens, or full provider responses. Prefer structured logs with job/task ID.
5. Ship focused automated tests for normal operation, failures, retry/restart, and regressions. Record what actually ran; never claim mocked tests equal real provider/hardware tests.
6. After **every completed task**, update `docs/WORKLOG.md`, `docs/HANDOFF.md`, and `Sprint_0_Status.md` / `R0_Status.md` for release tasks. If architecture/product decisions changed, update `docs/DECISIONS.md`. Update README / affected docs where applicable.
7. Minimize agent restart time: name changed files, commands, evidence, limitations, and exact next task. Keep `HANDOFF.md` short (target <150 lines). Archive historical information in `WORKLOG.md`.
8. Do not silently delete or overwrite existing user data. Changes to external costs or destructive operations require an explicit gate.

## Task workflow / Definition of Done
- Find task ID in tracker and relevant spec; confirm prerequisites.
- Implement smallest independently testable change with useful intent comments.
- Run appropriate tests; preserve evidence and record known failures.
- Update docs using `templates/TASK_LOG_TEMPLATE.md`.
- Assign status accurately: `TODO`, `IN_PROGRESS`, `CODE_COMPLETE`, `TESTED`, `PENDING_HARDWARE_VALIDATION`, `BLOCKED`, `DONE`.
- End your response with delivered files, test command/result, remaining limitations, and next task.

## Navigational map
- Sprint status: `Sprint_0_Status.md`
- Current agent handoff: `docs/HANDOFF.md`
- Append-only work history: `docs/WORKLOG.md`
- Decision log: `docs/DECISIONS.md`
- Task entry template: `templates/TASK_LOG_TEMPLATE.md`
- First spike source: `spikes/SP-01/src/`
- First spike tests: `spikes/SP-01/test/`
- First spike run commands: `spikes/SP-01/README.md`
- Approved specifications/backlog: parent artifact bundle (PRD, EP01–EP13 refinement, execution plan v3, task CSV v3). If not mounted in a new agent environment, request or attach the exact files; do not invent their contents.

## R0-04 diagnostics navigation
- `apps/api/src/diagnostics.mjs` = safe local health read-model with isolated timeout probes; `apps/api/test/diagnostics-r004.test.mjs` = route/probe/cache/privacy tests.
- `apps/web/src/{DiagnosticsDashboard.jsx,diagnostics-view.mjs}` = health UI and allowlisted labels. Never render raw stdout, paths, URLs, API keys, full machine IDs or private data. Health checks must not call paid/remote AI providers.
- `docs/TEST_REPORT_R004.md` contains the actual environment evidence; R0-05 API contracts & SDK is next.

## ARC-01 current architecture navigation
- Canonical DB/domain: `packages/core/src/{db,domain,manifest}.mjs`. Fastify API: `apps/api/src/`. React UI: `apps/web/src/`.
- Reuse `spikes/SP-04/` queue, `spikes/SP-06/` vault and the provider spikes; do not add a second scheduler.
- Check `docs/TEST_REPORT_ARC01.md` before claiming runtime/browser or GPU success.

## SP-06 security implementation rule (for all upcoming tasks)
- **Never call a configured remote URL directly** without outbound endpoint protection, provider approval and explicit cost gate. Before shipping integration, route SP-02/SP-03 outbound adapters through an equivalent of `SP-06/src/endpoint.mjs`.
- **Secrets live only in the backend vault**. Do not put API keys in front-end state, localStorage, prompts, job event payloads, exports, logs or database account rows. Do not expose `getSecret()` via REST.
- **No unauthenticated localhost write routes**. Integrate authentication, Host/Origin/CSRF and secure launcher token handoff before exposing queue/provider writes. `SP-06` is a proof, not yet globally installed.
- Windows OS Credential Manager / DPAPI and ACL validation remain mandatory prior to production API keys.

## R0-05 API Contract Change Procedure
- **Catalog first:** update `packages/contracts/src/catalog.mjs` whenever adding/changing a route; it generates OpenAPI 3.1 and TypeScript OperationMap declarations via `npm run api:generate`. Do not hand-edit generated output.
- **Typed SDK:** prefer `packages/sdk/src/client.mjs` `request(operationId,args)`; existing `apps/web/src/api.js` delegates to SDK during gradual migration. No bare `fetch('/api/*')` for authenticated features outside SDK.
- **SSE & safety:** use Authorization + Last-Event-ID headers; no tokens in URL or localStorage. Keep route, schema and ingress policy tests synchronized.
- **Verification:** `npm test && npm run check && npm run typecheck:sdk`; separately record browser/Fastify HTTP tests as unverified until dependencies and hardware allow.

## R0-08 preset/version maintenance rules
- Canonical preset defaults/schema are in `packages/core/src/preset-schema.mjs`, imported by React and API contracts. Do not fork a UI/DB copy of defaults, and do not place provider credentials or payment approvals in presets.
- `preset_revisions` is immutable (migration v6 triggers); new changes INSERT a revision. No-op/reordered JSON saves do not create duplicate revisions. The `rowVersion` lock is required on updates.
- Read `docs/HANDOFF.md` for R0-08 file map. Future migrations must append v7+, never change prior migration SQL or checksums. Do not claim static `presetCapabilities` equals real provider availability.


## R0-11 Video configuration invariants
- Use `packages/core/src/video-config.mjs` to resolve field overrides against **the video's frozen origin**, not the channel's newest preset. Never update `videos.preset_snapshot_json` or an immutable video config revision.
- API/React must preview impact before saving changes that affect existing content, scenes or media. `confirmImpact` approves only a config revision, **not** billable provider calls or re-generation.
- R2/R3 must explicitly consume saved impact and block stale renders until assets are rebuilt/reconciled. Never claim an asset was regenerated from a config-only save.
- See `docs/HANDOFF.md`, `docs/TEST_REPORT_R011.md`, `docs/DECISIONS.md` and `R0_Status.md` before the next task.


## R0-07: AI Provider Registry guardrails
- `packages/core/src/provider-accounts.mjs`: safe metadata + SQLite v8; `packages/providers/src/readiness.mjs`: known-local reachability only.
- API secrets MUST remain in SP-06 Vault; account rows carry only scoped credential references. Never return secrets via GET/SDK/queue/SSE and never print them in log/worklog.
- Quota manual input is ESTIMATED or UNKNOWN; never label as VERIFIED without genuine provider evidence.
- `POST /api/providers/route-preview` is **DRY RUN ONLY**. Do NOT reuse preview permission as a spend authorization for provider execution; require job-specific explicit paid approval and separate audit record at execution.
- Only known literal localhost origins may receive a health GET; custom/remote endpoints must use future safe outbound adapter; never GET an arbitrary user-configured endpoint directly.
- Agent starting R0-12: use latest `docs/HANDOFF.md`, `docs/TEST_REPORT_R007.md`, `R0_Status.md` to avoid touching registry core accidentally.


## R0-06 queue HTTP safety (2026-10-14)

- Never expose SP-04 `JobStore.get()/list()/enqueue()` raw result over HTTP/SSE: payload can include user script, prompts and credentials. Use `apps/api/src/job-center.mjs` `publicJob` / `publicJobEvent` or safer new projections.
- Queue control is job-scoped and goes through the existing Bearer + CSRF + localhost guard. Treat remote cancel as best-effort only; it does not imply a refund.
- R0-13 MUST enforce consent and paid-cost threshold at outbound invocation, not just at registry preview. Never silently switch to paid model.
- After every task, update `docs/HANDOFF.md`, `docs/WORKLOG.md`, `R0_Status.md`, test results and, if required, `docs/R0_BACKLOG_AUDIT.md`.

## R0-13 Paid Model Invocation Invariants
- New paid/unknown-priced providers must not bypass `ProviderRegistry.invoke` server-side policy; provide trusted `estimateCostMicroUsd` or remain disabled. For remote providers marked `free_unverified`, dispatch is denied unless an audited builtin adapter declares `noChargeConfirmed`; arbitrary user labels do not override this.
- `paidApproval: {approved:true}` in any request or route preview is **not** permission. Use `PaidPolicyRepository` with a scoped existing targeted job, human typed confirmation, authorization deadline, per-request and total budget. Reserve before dispatch, mark ambiguous failures `uncertain` without retry/refund.
- Do not put secrets, prompts, billing instruments or full provider outputs in paid approval/audit tables, logs, SSE or HTTP responses. Preserve historical migration checksums v1–v9.
- See `docs/HANDOFF.md` and `docs/TEST_REPORT_R013.md` for next task and evidence.

## R0-14 CI and offline providers
- Use `npm run test:all` for a portable Windows/Linux suite (app + seven Spike suites). `npm run check` verifies generated API contracts; `npm run typecheck:sdk` checks typed clients.
- Mock implementations live ONLY in `packages/providers/testkit/`; never import them into production `setupProviders` or expose as real AI. Mock WAV is a tone; mock MP4 is a prebuilt FFmpeg fixture, not generative video.
- `apps/api/src/handlers.mjs` accepts optional `providerIds` for tests. Do not modify production defaults or bypass the paid guard.
- `.github/workflows/ci.yml` is authored but not yet run; report GitHub CI green only after its actual workflow execution. The current Linux offline build is blocked by missing Vite installation, and Windows/GPU remain unverified.
- New agent should read `docs/TEST_REPORT_R014.md` and `docs/HANDOFF.md`; next product item is R0-VID-01.

## R0-VID-01 video capabilities and queue safety
- `packages/core/src/video-capabilities.mjs` is the canonical capability validator and preflight engine; `video_model_capabilities` migration v11 is additive. Do not edit migrations v1–v10 in-place.
- Capability metadata is `user_declared` with `verified:false`. Never claim it proves actual AI video inference, quota, model limits or free pricing.
- `POST /api/video-providers/preflight` is a NO-COST dry run and **not** permission to enqueue, call remote API or bill. `queueAsset` rechecks selected local ComfyUI model/capability limits before enqueue; remote/paid requires a separately wired R2 adapter and dispatch guard.
- For image-to-video, accept image references only from trusted stored scene assets resolved by the worker, never arbitrary filesystem paths or HTTP-JSON binary inputs.
- See `docs/HANDOFF.md`, `docs/TEST_REPORT_R0VID01.md`, and task-specific tests before changes.

## R0-01 canonical Windows launcher (2026-10-14)
- User-facing entry point: `Run-Windows.ps1 -Mode start` or double-click `Start-ContentStudio.cmd`; JS orchestration: `tools/launch.mjs`, testable checks in `tools/launcher-core.mjs`.
- Do not display API session pairing code, env file values, credentials or project paths in logs; health/readiness requests must target only validated local URL.
- Startup lock must be acquired **before** SQLite DB migration, must not kill unrelated processes and must preserve `data/` across relaunches. Always serve API+UI from loopback.
- Launcher tests automatically run from `npm run test:all` (`tools/launcher-core.test.mjs`). Details in `docs/TEST_REPORT_R001_LAUNCH.md`; do not claim Windows validation from Linux tests.
- Next: R0-10 real TTS preview while completing hosted Windows CI and app runtime gates.

## R0-10 Channel voice preview rules
- `apps/api/src/voice-preview.mjs` owns request-scoped audio preview. **Never** persist preview text/audio, auto-fallback to an unapproved provider, or bypass Edge online consent. Bound input/output and strip adapter errors from API responses.
- `packages/sdk/src/client.mjs` transports binary audio with the same memory-only bearer+CSRF session. Never put a token in `<audio src>` remote URL; use revocable Blob URLs in `apps/web/src/VoicePreview.jsx`.
- For local Piper/VieNeu, use trusted operator loopback env endpoints only. Do not expose arbitrary user supplied URLs to backend fetch without outbound SSRF review.
- New test files: `apps/api/test/voice-preview-r010.test.mjs`, `packages/sdk/test/voice-preview-r010.test.mjs`, `apps/web/src/voice-preview-form.test.mjs`; see `docs/TEST_REPORT_R010.md`.

## R0 release readiness (latest, read before R1)
- Read `docs/R0_RELEASE_READINESS.md` and `docs/TEST_REPORT_R0_GATE.md` before calling R0 done. R0-GATE-01 implements private channel-avatar files and migration **v12**; previous migrations v1–v11 must never be altered.
- Runtime smoke `npm run test:live-http` is a mandatory CI gate after npm install; `npm run build:web` and a Windows test remain required. Local npm currently fails DNS `EAI_AGAIN`, so offline 378/378 tests do not mean production acceptance.
- Avatar image bytes are private and only available via authenticated SDK Blob URL. Never expose `/data` as static or append Bearer to image query strings.
- Next engineering task: R1-01 brief form/validation. Keep open QA gates separately.

## R1-01 Content Brief handoff (2026-10-14)
- Read `docs/HANDOFF.md` for the current 6-route R1-01 content contract and migration v13. `packages/core/src/content-brief.mjs` is canonical validation; React helpers in `apps/web/src/content-brief-form.mjs` are for display only.
- Brief revision != video rowVersion != master-script approval. Do not overwrite `videos.master_script` during draft save. Never store AI credentials in a brief or log its prompts.
- Generation/paid authorization is NOT implied by storing model IDs. Route `POST .../validate` is a read-only dry run. Append migrations only, keep all historic SQL unchanged.

## R1-02 Outline module — ongoing handoff invariants
- Chapter plans are **not** final script: read `packages/core/src/content-outline.mjs` and `docs/HANDOFF.md` before R1-03. Append-only migrations only, now v14.
- The `content:outline` worker must ONLY return a proposal to fenced SP-04 JobStore. Never write a generated outline before queue lease commits; explicit user acceptance performs canonical save.
- External/paid LLM calls must not be introduced without the existing R0-13 job-scoped approval at dispatch. R1-02 runs local Ollama exclusively; mocked generation is TEST-ONLY.
- All edits must keep catalog/OpenAPI/Typed SDK aligned; test previous 405 cases plus new ones. Update Worklog/Handoff/Status every task.

## R1-03 immutable model/chapter generation rules
- Before editing CT03, read `docs/HANDOFF.md` and `packages/core/src/chapter-generation.mjs`; see `docs/TEST_REPORT_R103.md`.
- Reuse SP-04 queued work with `kind=content:chapter`, dependency links and result fencing; no DB draft write inside a model worker before `store.complete`.
- Never append a paid/remote model execution to CT03 without server-side approval, safe credential access and confirmed quota/cost checks. No silent cloud fallback.
- Do not treat generated chapter drafts as Master Script, or modify a user's approved script, scenes or assets.
- Update `docs/WORKLOG.md`, `docs/HANDOFF.md`, `R1_Status.md` after every task; run 414+ tests.


## R1-05 / Retry with Feedback invariants
- Never edit content_draft_variants, content_chapter_drafts or an approved master script in place. R1-05 retries use a private single-chapter batch with `retry:` request key and a pinned evaluation; future scoring uses its standard new variantId.
- Do not display private retry batches in the original multi-model generation list. No automatic quality loop or asset regeneration: every content retry and scoring action is explicit.
- Keep request idempotency and checksum pinning across restarts. The only model allowed in R1-05 is an active Ollama local model in the pinned Brief; remote/paid execution awaits R1-07.
- Read `docs/HANDOFF.md` and `docs/TEST_REPORT_R105.md` before R1-06.


## R1-06 Master Script handling
- **Only** `MasterScriptRepository.approve()` may publish a generated/reviewed script into `videos.master_script`. Preview, AI scoring, retries, editing and candidate saves are NOT approvals.
- All source variants must come from the same video, chapter and outline revision. Keep immutable source hashes and append-only approval history.
- Do not bypass the approval boundary through the legacy `/script` API after a candidate exists.
- After each task, update `docs/WORKLOG.md`, `docs/HANDOFF.md`, `docs/DECISIONS.md`, `R1_Status.md`, API contracts and test evidence. State clearly which environments/providers were not tested.

## R1-07 (2026-10-14) Remote LLM integration
- Read `docs/HANDOFF.md` and `docs/TEST_REPORT_R107.md` first, then only `apps/api/src/llm-dispatch.mjs` and relevant worker.
- Do **not** route API-key requests through arbitrary `provider_models.endpoint`; remote origin is fixed in the trusted adapter.
- Never treat `free_unverified` as verified no-charge and never auto-switch to paid. Require Vault and R0-13 job-scoped approval at dispatch. Never reuse paid invocation keys after ambiguous failures.
- When adding providers, update official adapter protocols and tests; document vendor terms and evidence, never fabricate live call status.

## R1-08 long content QA (2026-10-14)
- The deterministic `packages/core/src/long-content-audit.mjs` outputs warning/length metrics ONLY. Never treat `METRIC_CHECKS_PASS` as editorial correctness, measured TTS duration or production acceptance.
- `npm run rehearsal:r108` runs mocked 5×3 chapter generation through the **existing** SP-04 queue and R1-06 explicit approval. No remote provider/API key/fee use. Its evidence is `docs/evidence/R108_long_form_rehearsal.json`.
- `npm run test:r108` tests 30/35/40min targets, content coverage, free quota fail-closed, paid approval, retry, lease recovery and idempotency. Run `npm run test:all` for all 479 checks.
- R1 may advance to R2-01 for coding only; `docs/R1_RELEASE_READINESS.md` lists mandatory live/browser/Windows gates not yet accepted.

## R2-01 scene builder source contract (2026-10-15)
- Read `docs/HANDOFF.md`, `R2_Status.md`, `docs/TEST_REPORT_R201.md` before changing Scene Builder.
- Canonical preview+commit are in `packages/core/src/scene-builder.mjs`. All spans reference the **approved immutable master text** by UTF-16 code-unit offsets. Never `.trim()`, normalize or discard characters while splitting.
- Legacy raw scene replace is blocked after Master Script approval; never remove this source-coverage guard to pass an old test.
- `scene_build_revisions` v19 are immutable. Never destroy existing media without explicit selective invalidation; backend blocks destructive edits once assets exist.
- UI draft and AI prompt generation are separate concerns; R2-02 must build on existing source-pinned revisions. Tests and logs required.

## R2-02 Visual Prompt worker / scene safety
- Read `docs/HANDOFF.md` and `docs/TEST_REPORT_R202.md` before editing the Scene Builder or AI prompt jobs.
- `scene_visual_runs` are immutable review-only input snapshots. AI output is stored in the fenced SP-04 queue results; NO scene edits at job completion.
- Only allow provider execution for active **local Ollama**; paid/free cloud routing needs separate validated consent and approval logic, not editable account metadata.
- Keep manual visual prompts intact and require explicit Save using canonical approved-scene offsets/version guard.
- Generation suggestions do not prove media provider readiness. Import video requires a real file; AI video requires verified preflight.

## R2-03 Voice production safeguards (latest)
- Use `docs/HANDOFF.md` and `docs/TEST_REPORT_R203.md` for scope, file map and test evidence. Scene voice intent is a **mutable pointer to the latest immutable queued job** in SQLite v21; do not rewrite historical migrations.
- Edge TTS **requires explicit remote consent per generation request/batch**; do not infer permission from channel preset. Remote Edge availability and lifetime cost status remain unverified.
- Never promote voice from an old job without rechecking `voiceIntentMatches` under the DB write transaction. FFprobe duration is authoritative voice metadata; the timeline is not silently rewritten.
- Voice playback is authenticated via SDK Blob download, not unguarded static `/assets/` URLs. Keep 12 MB cap and strict codec/signature checks.
- R2-04 local fallback reuses this queue, manifest and staleness fence. Do not create another queue or silently enable paid providers.

## R2-05 Scene Image Job fence (latest)
- `docs/HANDOFF.md`, `docs/TEST_REPORT_R205.md`, `docs/R205_COMFYUI_IMAGE_CONTRACT.md` are the quick-start trio; see `packages/core/src/scene-image.mjs`.
- A scene image job requires stored scene `visualPrompt`, `mediaType=image_motion`, operator-owned local ComfyUI API JSON workflow and bindings. The user explicitly clicks **Generate**. No client-supplied path/prompt/remote provider, no automatic paid fallback.
- v23 appends `scene_image_intents` and explicit manual selections; it backfills committed/manual_import active images but never makes legacy generated media current without user review.
- `inputHash` includes scene source/video config/ComfyUI workflow, style, seed and size. Check current job before provider invocation, after actual bytes, and under SQLite write transaction at manifest promotion. Distinct per-hash SP-04 logical keys are mandatory to avoid clobbering multiple generations.
- Private image preview must require bearer; stream ≤25MiB with MIME+signature verification. Local upload ≤512KiB, FFmpeg-verified and manually selected. Historical revisions remain after regeneration.
- R2-06 must harden file/revision registry, reconciliation and cancellation/crash paths. No Windows/GPU/browser evidence yet.


## Latest roadmap sync — 2026-10-15, after R2-05
- **Do not revert to R2-04 code from a planning archive.** Latest implementation is R2-05 (`docs/TEST_REPORT_R205.md`, `R2_Status.md`); 560/560 offline only, v23 is highest existing schema migration.
- Read `docs/VIDEO_AI_FLOW_EXTENSION_PLAN_20261015.md` + `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json` for EXT-01..08; these are **PLANNED**, not shipped. Real renderer evaluation gate: `docs/RENDER_ENGINE_POC_GATE.md`.
- Next code task **R2-06**; preserve SP-04 single queue, v23 migrations, image revision pinning and explicit paid policy. Keep updating WORKLOG/HANDOFF as instructed above.

## R2-06 agent fast path (2026-10-15)
- Read `docs/R206_ASSET_REGISTRY_CONTRACT.md`, `docs/TEST_REPORT_R206.md`, `docs/HANDOFF.md` first. SQLite v24 is frozen; never modify old migration text/checksums.
- Source: `packages/core/src/{db,manifest,scene-image}.mjs`; tests: `packages/core/test/asset-registry-r206.test.mjs`, and regression R2-05 image tests. **Do not add a second queue**.
- Use `manifest.planRecompute(videoId)` read-only for the R2-07 dependency planner; it is not authorization for free or paid provider calls. On manual import, the new asset + pointer + intent clearing must be transactionally atomic.
- Never auto-delete orphan/media files, expose filesystem paths over HTTP, or treat content-hash matches from different scenes as permission to reuse provenance or revision IDs.

## R2-07 queue DAG invariants (latest task)
- Start with `docs/HANDOFF.md`, then `docs/R207_ASSET_DAG_CONTRACT.md`. The DAG reuses SP-04 jobs and requires an explicit requestKey; no preview-driven provider calls or second worker.
- Stage jobs, dependencies, current intents and run ledger are one SQLite transaction; reused stage jobs require resolved IDs. Never bypass `promoteQueueAsset`, job lease token, or manually pinned image guard.
- No Edge dispatch without user consent; each manual remote retry needs fresh consent. No auto paid fallback.
- FFprobe voice timing is advisory to R2-EXT-02; do not mutate scene duration or captions without explicit approved contract.
- SQLite v25 is **append-only** after v24. Tests: `npm run test:r207`, `npm run test:all`, `npm run check`, `npm run typecheck:sdk`.


### 2026-10-15 — R2-08 coding guardrails

- Use the single SP-04 queue and canonical SQLite v26. Never modify old migration SQL/checksums. `QuotaLedgerRepository` only accepts opaque keys and integer token units.
- Prioritize fail-closed behavior on missing free-model token estimate, ambiguous upstream outcome, exhausted quota and duplicate job attempt. Never infer verified provider quota or free billing from user-supplied metadata.
- Remote free with known ceiling requires `CONTENTSTUDIO_LLM_QUOTA_RESERVATIONS_JSON` mapping internal model IDs to conservative token estimate. Paid jobs still require independent R0-13 approval. No silent fallback to paid.
- `docs/R208_STATUS.md`, `docs/R208_QUOTA_LEDGER_CONTRACT.md` and `docs/TEST_REPORT_R208.md` contain tests, limitations and next task. No Windows/browser/live inference accepted yet.


### R2-10 checkpoint
- Read `docs/HANDOFF.md`, `docs/R210_STATUS.md`, `docs/R210_QUOTA_UX_CONTRACT.md` first. 18/18 R2-10 and 642/642 offline suite PASS; Vite missing.
- Quota inspector uses ONLY existing authenticated R2-08 GET. No reconciliation, provider quota fetch or auto-paid action. `uncertain` reserves stay held. Do not imply free entitlement from operator-entered limits.
- Continue comment-for-intent + WORKLOG/HANDOFF/DECISIONS practice.


## Current checkpoint: R2-12 (2026-10-15)
- 15 focused, 673 full offline tests passing; new v27 `provider_switch_events` only records real successfully completed equivalent free LLM switches, not previews. `ProviderMonitorR212` read-only status; authenticated `/api/providers/monitor`.
- Read `docs/HANDOFF.md` and `docs/R212_PROVIDER_MONITOR_CONTRACT.md` before edits. Keep all SQL migrations v1..v27 immutable, and never show local quota/budget as provider-verified.
- Next R2-13 integration regression. Vite/browser, Windows, GPU/native TTS/real providers/30–40-minute test remain open. Prior R2-EXT tasks are PLANNED only.


## Active task checkpoint — R2-EXT-01 (2026-10-15)
- 13 original R2 tasks and EXT-01 are CODE_COMPLETE_TESTED_OFFLINE, NOT released. Next **R2-EXT-02**, not new queue/render implementation.
- Agent fast path: `docs/HANDOFF_R2EXT01.md` → `docs/R2EXT01_COMPOSITION_CONTRACT.md` → `docs/TEST_REPORT_R2EXT01.md` → tail `docs/WORKLOG.md`.
- Core snapshot code `packages/core/src/composition-r2ext01.mjs`; migration v28 appended only, previous migration hashes frozen. Replay tests with `npm run test:ext01` + `npm run test:all`.
- Do not represent composition asset-readiness as audio sync or rendered MP4; scene time/caption mode are intentionally estimates until EXT-02. Do not claim Remotion or HyperFrames chosen until real hardware gate.

## Current checkpoint R2-EXT-02 — 2026-10-15
- **14/14 focused, 714/714 full offline PASS.** First read `docs/HANDOFF_R2EXT02.md`, then `docs/R2EXT02_TIMING_CONTRACT.md` and `docs/TEST_REPORT_R2EXT02.md`. v2 FFprobe + scene captions implemented but **NOT live approved**.
- V1 composition remains unchanged and v1/v2 history coexist in immutable SQLite v28, source/cost guardrails unchanged. No true word-level alignment: scene-level cue ends at measured audio end before pad; manual timeline locks preserved.
- Next `R2-EXT-03` fair Remotion-vs-HyperFrames real benchmark; not measured yet. Never claim complete MP4, Windows/browser, 30–40m or real TTS until tested.

## Latest checkpoint R2-EXT-03 — 2026-10-15
- R2-EXT-02 14/14 and full 714/714 offline regression PASS. R2-EXT-03 is **POC_HARNESS_COMPLETE_GATE_BLOCKED**, not benchmark complete. Npm unreachable (`EAI_AGAIN`): **0 actual Remotion, 0 actual HyperFrames** MP4.
- First read `docs/HANDOFF_R2EXT03.md`, `docs/R2EXT03_POC_GATE.md`. Run `npm run test:ext03` and `npm run poc:ext03:prepare`. Do not select renderer until the real 3-workload×3-repeat each gate and license/visual QA. Keep R2-EXT-02 v2 audio ownership unchanged.

## Current active task pointer: R2-EXT-04/05/06
- Latest offline source: FFmpeg export fast path, timeline timing-lock UI, private MP4 download. Real output evidence `docs/evidence/EXT040506_demo.mp4` and QA JSON.
- Fast read `docs/HANDOFF_R2EXT040506.md` + `docs/R2EXT040506_STATUS.md` + last `docs/WORKLOG.md` entry; do not rescan whole repository first.
- `npm run test:all`: 722/722 PASS, `npm run check` and `npm run typecheck:sdk` PASS; Vite/browser/Windows/30-40min and actual Remotion vs HyperFrames gate are NOT complete.


## Current checkpoint 2026-10-16 — IA-01 Integration & Acceptance
Read `docs/IA01_STATUS.md`, `docs/IA01_HANDOFF.md`, `docs/IA01_TEST_REPORT.md` FIRST. Actual Linux FFmpeg 5-scene 1080x1920 MP4 has 429/429 frames and persisted SP-04 job; IA-02 36.33-minute **plan only**. New QA rejects any missing frame even with matching duration. Full suite 734/734, release NOT_READY; Vite/Fastify cannot install (npm DNS EAI_AGAIN), Windows/browser/live provider/long form MP4/EXT03 POC unverified. Do not edit prior v1..v29 DB migrations or create a second queue; no paid auto fallback.


## Active R3-11 handoff
Start with `docs/R311_HANDOFF.md`, `docs/R311_PROJECT_ZIP_CONTRACT.md`, `docs/R311_TEST_REPORT.md`. Latest source includes ZIP64 project export with private safe pins, approved v2 immutable revision, per-scene voice/visual, UTF-8 script/SRT/timeline JSON, manifest SHA, authenticated ZIP endpoint, SDK and browser file picker.
`npm run test:r311` 7/7, contract 6/6, check/typecheck/negative PASS; whole suite rerun incomplete. NO Windows/browser/4GB/HyperFrames/35min acceptance; release NOT_READY. No provider costs.

## CURRENT R3-12 · 2026-10-16
Begin `docs/R312_HANDOFF.md` (then `docs/R312_RENDER_DRAWER_CONTRACT.md`). HyperFrames is primary, FFmpeg manual. 720p/1080p profile derivative, protected preflight, honest durable SSE progress and revision badges. See `docs/R312_TEST_REPORT.md`. Next R3-13. Release NOT_READY.

## R4-01 preset selective sync (2026-10-16)
- Never auto-propagate channel preset edits into existing videos. Use `packages/core/src/preset-diff-r401.mjs` and `StudioRepository.previewChannelPresetDiff` / `applyChannelPresetDiff`. Only explicitly selected paths, impact preview, channel/video versions and digest; no paid/job side effects. Original video preset and revisions immutable.
- Next R4-02: verified DB/media backup/restore. Start at `docs/R401_HANDOFF.md`. Global test timed out (#613), Vite/browser blocked; release NOT_READY.


## FI-03 agent handoff — 2026-10-16
Read `docs/FI03_HANDOFF.md`, `docs/FI03_IMPLEMENTATION_AND_LIMITS.md`, `docs/FI03_TEST_REPORT.md`. Do not repeat prior incomplete global-suite claims. Primary HyperFrames, FFmpeg explicit fallback, no automatic paid API. Keep `docs/WORKLOG.md`, `docs/DECISIONS.md`, `docs/HANDOFF.md` current. New opt-in Windows flow: `tools/FI03-Windows-Setup.ps1`. Release still NOT_READY.

## FI-04-04 agent handoff (2026-10-17)
Read `docs/FI0404_HANDOFF.md` before touching the render path. The full project-local HyperFrames 0.8.159 five-scene test is opt-in (`npm run acceptance:fi0404:real`); offline assertions are not genuine renderer evidence. Do not restore `CONTENTSTUDIO_HYPERFRAMES_BIN`, auto-download npx packages, make paid calls, or count FFmpeg as primary HyperFrames. Master backlog regenerated at 60 tasks.
