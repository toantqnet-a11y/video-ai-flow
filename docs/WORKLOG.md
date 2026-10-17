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

## 2026-10-17 — FI-04-01/02/03 + unified AI Video backlog

**Implemented:** bounded/complete TAP suite runner + diagnostic batches; dependency-lock-only readiness checker; explicit Windows staged operator script and strict real Vite/Fastify runtime gates; deterministic 42 + 14 + 3 task backlog merger (59 unique tasks). No schema, queue or provider changes. Existing `SP-VID-01` Spike and `R0-VID-01` code were verified in source and preserved as partial/offline status, not incorrectly reset.

**Verified Linux:** original FI-03 865/865 PASS (fresh), new FI-04 focused 10/10 PASS, post-FI04 full suite **875/875 PASS**; 19/19 deterministic batches **875/875 PASS**; code/API/SDK check PASS, negative control PASS. `npm ping` EAI_AGAIN, Vite exit 127, HTTP missing module. Strict runtime inventory `NOT_READY`: no dependency lock/installed HyperFrames/Vite/Fastify, no Windows browser. Historical intermittent FFmpeg hang remains unproven resolved across repeated hosts, no false release status. Detailed evidence `docs/FI04_TEST_REPORT.md`, handoff `docs/FI04_HANDOFF.md`.

**Next:** networked Windows reviewed package-lock commit → `npm ci` → real build/HTTP → HyperFrames 1080p subtitles/music → 35-min/restart/provider/security acceptance. No auto-paid calls.

---

# 2026-10-16 — R3-02 + R3-03 + R3-04 (EP11)
**Code complete / tested offline; release NOT_READY.** Added ordered 4-lane read model, clip viewport virtualization, one authenticated voice preview controller with async seek fencing, scene-caption/image preview, deliberate drag/keyboard reorder and optimistic SQLite versioning. Preserved immutable Master Script scene indices; Composition now follows presentation order. Blocked legacy timeline PUT order bypass. No new migration or provider/queue calls. Generated API+SDK; focused and full regression tested. See `docs/R302_R304_TEST_REPORT.md` and `docs/R302_R304_HANDOFF.md`. Vite/browser/Windows/HyperFrames real render remain open. Next R3-05.

---

## 2026-10-15 — R2-03 · Edge TTS production adapter (CODE_COMPLETE_TESTED_OFFLINE)

- Connected SP-02 real Edge synthesizer through R0 provider registry and SP-04 queue to per-scene production voice jobs, independent from short-lived channel preview. Added latest-intent immutable input hash, text/config version guard and v21 SQLite migration.
- Added bounded 50-scene batch queue, per-scene cache/status, authenticated private WAV/MP3 playback, duration provenance from FFprobe. Scene voice panel supports Hoài My / Nam Minh, speed and explicit online consent.
- Staleness checked prior to invoke, after invoke and atomically at manifest promotion. Old success cannot activate over a newer voice. No auto paid use, no raw text in public job/sse.
- Updated contracts/types/sdk, compatibility test harness and previous R2-02 migration test to accept append-only v21. Added 11 focused offline tests; **524/524 total PASS**. `npm run check`, `npm run typecheck:sdk`, and JSX syntax parse PASS.
- **Open:** live Edge/Python, Fastify HTTP, browser build/playback, real Windows, full-length voice and timeline reconciliation, local TTS fallback, orphan cleanup. Next R2-04. See `docs/TEST_REPORT_R203.md`.


## 2026-10-14 — R1-08 — Long Content & Policy Regression
**Status:** CODE_COMPLETE_TESTED_OFFLINE; **479/479 PASS**; operational acceptance remains open.
**Changed:** `packages/core/src/long-content-audit.mjs`, `packages/core/test/long-content-audit-r108.test.mjs`, `apps/api/test/long-content-r108.test.mjs`, `tools/r108-long-form-rehearsal.mjs`, root `package.json`, `docs/evidence/R108_long_form_rehearsal.json`, `docs/{TEST_REPORT_R108,R1_RELEASE_READINESS,HANDOFF,WORKLOG,DECISIONS}.md`, `AGENTS.md`, `README.md`, `R1_Status.md`, `R2_Status.md`.
**WHY:** Validate 5 chapters × 3 models, 30–40 minute word-length load, retry/queue durability, missing/duplicate content and no unauthorized paid calls before handing to EP05 scene builder. Audit reports warnings only; never infer factual correctness or measured TTS timing.
**Actual tests:** 11 focused PASS, 479/479 all regression PASS, OpenAPI check PASS, SDK typecheck PASS. Offline rehearsal: 15 successes, 16 attempts (1 injected transient), 5,075 words estimated 35min, 3 concurrent mock calls, explicit approval, 0 paid/external calls. Additional 30/40min rehearsals PASS. `npm run build:web` blocked Vite missing; `npm run test:live-http` blocked Fastify missing; Windows/real model/MP4 TTS timing deferred.
**Next:** R2-01 segmentation from approved Master Script with lossless text offsets and edit impact handling. No PO-blocking decision.

## 2026-10-14 – R0-13: Paid Policy, human approval and runtime spending gate

**Task:** EP02/EP12 · R0-13. **Result:** CODE_COMPLETE, TESTED_OFFLINE, NOT production signed off.

- Appended SQLite v10 migration (`packages/core/src/db.mjs`) without altering v1–v9 migration checksums; approval/reservation/audit schema.
- New `packages/core/src/paid-policy.mjs`: per-job/account/model authorization; strict estimated micro-USD total/per-call limits; transactional reserve, revoke, expiry, append-only audit, no blind retries on unknown network outcome.
- `packages/providers/src/index.mjs`: reject user-supplied unsigned paidApproval; require guarded paid provider dispatch and trusted model cost estimator. Unverified remote free tier denied unless trusted no-charge adapter declared. `apps/api/src/providers.mjs`: Edge TTS adapter marked vetted for no API billing, but remote consent still required.
- `apps/api/src/{controllers,routes,server}.mjs`: protected approvals, revoke, safe spending history, and server-owned policy wiring.
- `apps/web/src/PaidApprovalPanel.jsx` + `ProviderWorkspace.jsx`: visible permission UX, typed confirmation, budget/expiry and revoke; no auto API call.
- `packages/contracts/src/catalog.mjs`: OpenAPI + Typed SDK generated by `npm run api:generate`.
- `packages/core/test/paid-policy-r013.test.mjs`, `apps/api/test/paid-r013-routes.test.mjs`: safety, restart, budget, spoofing, audit and migration tests. Existing `apps/api/test/integration.test.mjs` assertion updated to reject older unsafe behavior; R0-12 upgrade expectation now uses latest migration.
- Tests: **181/181 app PASS**, **146/146 spike PASS**; `npm run check`, `npm run typecheck:sdk` PASS; JSX parsed via TypeScript PASS. Evidence `docs/evidence/R013_*`.
- Known limits: no real Fastify/browser/Windows, no paid provider adapter or validated provider invoices. Paid execution integration with actual target-scoped jobs and user wait/resume flow belongs to R2.
- **Next:** R0-14 Mock Providers & CI. **PO decision required:** none.

---

## 2026-10-14 — R0-07 — AI Provider & Account Registry (EP02)
**Status:** CODE_COMPLETE + TESTED_OFFLINE; live provider/browser/Windows validations pending. Recovered skipped dependency before R0-12.

**Changed:** `packages/core/src/{provider-accounts,db,index}.mjs` (append v8), `packages/providers/src/readiness.mjs`, `apps/api/src/{controllers,routes,server,request-policy,vault-routes}.mjs`, `apps/web/src/{ProviderWorkspace,main,style.css}`, `packages/contracts/src/catalog.mjs` + generated OpenAPI/types; new core/API tests; `R0_Status.md`, `AGENTS.md`, `docs/{HANDOFF,WORKLOG,DECISIONS,API_CONTRACT,ARCHITECTURE,TEST_REPORT_R007}.md`.

**WHY/design:** Metadata-only registry with separate account/model records and encrypted vault references; quota is unknown/estimated unless trusted provider adapter authenticates evidence. SQLite v8 migration is additive and backup-safe; earlier schemas untouched. Free/local routing dry-run, per-account/model paid consent policy and no automatic billable calls; safe loopback-only reachability probe, no arbitrary endpoint URL fetch. Encrypted credentials may not be deleted while referenced. Important policy: do not use multiple accounts to bypass provider-wide limits or ToS.

**Actually tested:** 143/143 Node app + 146/146 spike tests PASS; `npm run check`, OpenAPI generation consistency, `npm run typecheck:sdk` and JSX parser PASS. Live HTTP/browser/Windows/GPU/free-tier quotas NOT verified. See `docs/TEST_REPORT_R007.md`.

**Next:** R0-12 Video Management; later integrate a real account-aware job executor with vault resolution, billing consent ledger and provider safe egress. **Do not claim dry-run planning is live fallback.**

---

## 2026-10-14 — R0-11 — Video Configuration Snapshot Resolver (EP10 US-10.1/10.2)
**Status:** CODE_COMPLETE / TESTED_OFFLINE; runtime browser / real Fastify / Windows still PENDING.

**Purpose:** Let an individual video override frozen channel settings without changing previous videos or triggering unexpected, costly asset regeneration.

**Changed:** `packages/core/src/{video-config,domain,db,index}.mjs`, `packages/core/test/{video-config-r011,channel-r001,domain,migrations-r002,preset-r008}.test.mjs` (older version expectations updated to current v7 while preserving historical migration test fixtures); `apps/api/src/{controllers,routes}.mjs`, `apps/api/test/video-config-r011.test.mjs`; `packages/contracts/src/catalog.mjs` + autogenerated declarations/OpenAPI; `apps/web/src/{VideoConfigWorkspace.jsx,video-config-form.mjs,video-config-form.test.mjs,main.jsx,store.js,style.css}`; `docs/{HANDOFF,WORKLOG,DECISIONS,ARCHITECTURE,API_CONTRACT,TEST_REPORT_R011}.md`, `R0_Status.md`, `AGENTS.md`, root README.

**Design:** Additive SQLite migration **v7** creates immutable video config revision history and backfills all legacy videos from their original `preset_snapshot_json`. Original source snapshot is protected by UPDATE trigger. Strict per-field override resolver merges only into the video's original snapshot and runs the canonical full-preset validator, including paid/remote denial. Preview is read-only; save locks `rowVersion`, requires explicit review when existing script/assets/scenes may be impacted, rejects active video jobs, and appends a revision plus an audit event in one transaction. Existing scenes/assets/timeline remain unchanged and flagged by impact (actual rebuild deferred). `queueAsset()` now resolves defaults using video effective config.

**Validation run:** `npm test` 123/123 PASS (16 new); seven historical Spike suites 146/146 PASS; `npm run check`, `npm run api:check`, `npm run typecheck:sdk` PASS; JSX syntax parsed (4 files). `npm run build:web` failed because `vite: not found` (dependencies not installed); no actual Fastify live HTTP/browser/Windows/GPU tests. See test report for exact scope.

**Risk/next:** Config preview/save does not regenerate output; future asset/render pipeline must inspect persisted change impact and ensure stale assets are not silently reused. R0-12 Video Management next. R0-07 Provider Registry remains separate.

---

# Latest R0 task

## 2026-10-14 — R0-04 — System diagnostics (backend/API/React)
**Status:** CODE_COMPLETE / TESTED_OFFLINE / PENDING_WINDOWS_FASTIFY_BROWSER.

**Files changed:** `apps/api/src/{diagnostics,server,routes}.mjs`, `apps/api/test/diagnostics-r004.test.mjs`, `apps/web/src/{DiagnosticsDashboard.jsx,diagnostics-view.mjs,diagnostics-view.test.mjs,store.js,main.jsx,style.css}`, `tools/diagnostics-r004.mjs`, `package.json`, `README.md`, `AGENTS.md`, `R0_Status.md`, `Sprint_0_Status.md`, `docs/{API_CONTRACT,ARCHITECTURE,DECISIONS,HANDOFF,TEST_REPORT_R004,WORKLOG}.md`, `docs/evidence/R004_*`.

**WHY / approach:** Converted SP-01's CLI-only readiness into safe authenticated web diagnostics. Dedicated allowlisted DTO is necessary because SP-01 output includes machine paths; bounded, concurrent, cached probes protect the local API from process storms. Readiness distinguishes basic tooling from real Windows/AI/full video certification. No changes to SQLite schema, provider routing or paid AI guard. Local ComfyUI ping only when workflow configured, with literal-loopback validation and no redirects.

**Evidence:** `npm test` **79/79 PASS** (21 new); seven SPIKE regressions **146/146 PASS**; **225/225 overall**. `npm run check` and `npm run diagnose:r004` PASS. Synthetic mocks test error/cache/auth; real smoke found FFmpeg, FFprobe, H.264/AAC, SQLite WAL on Linux (no GPU/model verification). See `docs/TEST_REPORT_R004.md`.

**Not yet proven:** Fastify HTTP with npm dependencies, React/Vite browser, Windows machine, GPU and provider inference, 35-minute render. No Windows available per PO; no silent DONE status or claims of model generation. **Next:** R0-05 API schema/SDK and drift tests.

---
## 2026-10-13 — R0-03 — Localhost security + encrypted API vault Fastify integration
**Status:** CODE_COMPLETE / TESTED_OFFLINE / PENDING_FASTIFY_WINDOWS_SECURITY_E2E. **Priority:** P0. **Owner:** Tech Lead.

**Changed:** `apps/api/src/{request-policy,security,vault-routes,unlock-limiter,server}.mjs`, `packages/security/src/{index,credential-access}.mjs`, `apps/api/test/security-r003.test.mjs`, ComfyUI local URL validators in SP-03 + SP-VID-01, SP-03 expected URL test, SP-04 crash test (test-only flake fix), root `package.json`, `docs/{API_CONTRACT,TEST_REPORT_R003,WORKLOG,HANDOFF,DECISIONS}.md`, `R0_Status.md`, README.

**WHY:** Bind-to-loopback is insufficient against local web requests and DNS rebinding. Introduced global raw-request guards (host/origin/peer/header ambiguity/proxy/path/query), strict one-time pairing and mutation CSRF, vault input schema checks, time-windowed serialized unlock throttling, safe request log serializer, provider-ID-scoped trusted access and forced literal-loopback ComfyUI URLs. No plaintext secret HTTP route; no new paid or remote provider access.

**Actual evidence:** `npm test` **58/58 PASS** (7 added); SPIKE regressions **146/146 PASS**; **204/204 overall**; `npm run check` PASS. npm package install **BLOCKED (`EAI_AGAIN`)**; therefore Fastify HTTP E2E, frontend browser, Windows/DPAPI and provider hardware checks **NOT VERIFIED**. See `docs/TEST_REPORT_R003.md` and `docs/evidence/R003_*`.

**Follow-up:** R0-04 diagnostics. Separately retry Fastify HTTP/inject tests once dependencies available; verify native Windows vault/ACL/launcher before production real API keys. Remote cloud adapters must use controlled egress + confirmed paid/remote permission.

---

# Latest changes (append-only historical work below)

## 2026-10-13 — SP-VID-01 — Local AI Video adapter protocol + real MP4 import + queue bridge
**Status:** TESTED_PROTOCOL_AND_IMPORT / PENDING_LIVE_INFERENCE_WINDOWS_GPU.  
**Scope:** EP13 US-13.1/13.2/13.3 (technical spike), import fallback and strict paid guard.

**Files added:** `SP-VID-01/{src/{contracts,comfy-video,media,service,cli}.mjs,test/*.mjs,README.md,Run-Windows.ps1,package.json,reports/*}`. **Files updated:** `SP-04/test/store.test.js` (deterministic claim-order assertion), `Sprint_0_Status.md`, `docs/{HANDOFF,WORKLOG,DECISIONS}.md`.

**Design:** No working model workflow is falsely provided. ComfyUI adapter requires user's API-exported model workflow and explicit node bindings; protocols for text-to-video and image-to-video are tested with mock loopback server. Validated playable MP4 **real file bytes** with ffprobe, streamed download limit, checksum, immutable revision, metadata, atomic rename. Manual mp4 import works and Google Flow may be used only by manually importing downloaded clips. SP-04 queue handler reuses durable SQLite queue and fencing; no second scheduler. Remote API, credentials and paid usage **blocked** by policy. Security: local loopback only, no redirects, safe output reference, bounded responses, no prompt/secret metadata logging.

**Actual execution:** `cd SP-VID-01 && npm test` -> **21/21 PASS**. `node src/cli.mjs diagnose` -> ComfyUI unreachable (expected: no GPU/server). All previous regression tests -> **125/125 PASS**; combined **146/146 PASS**. One SP-04 flaky *test assumption* (asserting input enqueue order equals claim order even when IDs tie) was corrected; no runtime queue code changed. **The video used in tests was generated by FFmpeg solely as a fixture — NOT generative AI footage.**

**Unverified/next:** No local real Wan/LTX GPU inference, output benchmark, model weights or license check; no Windows device; no live Seedance/Veo. Database+file crash reconciliation, video codec normalization, WebM remux, production Fastify routes and React integration not done. Next `ARC-01`.

---

# ContentStudio — Development Work Log

> **Append an entry for every task.** Keep entries factual, concise, and newest first. Use task IDs so another AI agent can resume without a full scan.

## 2026-10-14 — R0-GATE-01 — Release Readiness + Avatar Closure
**Status:** CODE_COMPLETE / 378 NODE TESTS PASS / PRODUCT RELEASE GATE OPEN.
**Goal:** Close EP01 avatar P0 and conduct a truthful R0 runtime readiness audit without Windows hardware.
**Code:** New `packages/core/src/channel-avatar.mjs` + SQLite migration v12, `apps/api/src/channel-avatar.mjs`, `apps/web/src/ChannelAvatar.jsx`, authenticated binary SDK + contracts, 6 automated tests, `tools/live-http-smoke.mjs` and Windows/Linux CI gate; updated registration, route tests, UI and CSS. Kept previous schema migration SQL immutable.
**Test evidence:** Baseline 372/372 PASS; now 378/378 PASS, `npm run check`, `npm run typecheck:sdk` and CI negative-control PASS. `npm install` EAI_AGAIN, `vite build` not runnable, real Fastify HTTP unavailable: marked BLOCKED. Windows/GPU/Edge live TTS unverified. Separate matrix `docs/R0_RELEASE_READINESS.md`.
**Decision:** Only code+offline tests accepted; no R0 operational/product sign-off. Continue R1 without hardware, retain pending gates.
**Next:** R1-01 Brief Form + Validation; execute authored HTTP/browser build gates in a network-enabled CI runner when available.


## 2026-10-13 — SP-06 — Localhost security, encrypted credential vault & endpoint SSRF protection
**Status:** CODE_COMPLETE / AUTOMATED_SECURITY_TESTS_PASS / PENDING_WINDOWS_OS_VAULT_AND_INTEGRATION  
**Goal:** Threat-model localhost abuse and protect credentials at rest/in transit without PO Windows hardware or live provider keys.

**Changed:** `SP-06/{src/{vault,http,endpoint,demo}.mjs,test/{vault,http,endpoint}.test.mjs,README.md,THREAT_MODEL.md,Run-Windows.ps1,.gitignore,reports/*}`; `AGENTS.md`, `Sprint_0_Status.md`, `docs/{HANDOFF,WORKLOG,DECISIONS}.md`.

**Implementation:** Node 22 dependency-free encrypted passphrase vault (scrypt AES-256-GCM, AAD, verifier, atomic encrypted writes, metadata-only HTTP list); loopback HTTP proof with exact Host/Origin, bearer + CSRF, no CORS, unlock throttling, safe audit events. Outbound endpoint helper supports loopback-only local endpoints or exact allowlisted remote HTTPS with public DNS, IP-pinned lookup, no redirects, timeout and byte caps. No paid or real provider calls.

**Validation:** `cd SP-06 && npm test` **33/33 PASS** on Linux Node 22; `npm run demo` confirmed loopback 127.0.0.1 health 200. Prior SP-01..05 regression **92/92 PASS**. Total **125/125 PASS**. Raw logs and threat-model coverage in `SP-06/reports/` and `THREAT_MODEL.md`. All secret values in tests are fabricated fixtures.

**Limits:** No Windows DPAPI/Credential Manager and ACL validation, secure UI launcher session bootstrap, Fastify/other adapter integration or backup/export integration. SP-02/SP-03 still use prior transport and do not automatically inherit new policy. Local same-user malware/reparse-point/TOCTOU risks and real Windows/browser E2E are not resolved.

**Next:** SP-VID-01 adapter spike, then ARC-01 wiring; Windows native vault and launcher need implementation/review before accepting production credentials.

## 2026-10-13 — SP-05 — Virtual timeline 500-scene UI spike
**Status:** CODE_COMPLETE / UNIT_TESTED / BROWSER_VALIDATION_BLOCKED / PENDING_WINDOWS_VALIDATION  
**Goal:** Implement a functional, offline-first four-track editor spike to exercise video timeline ordering/time scale, trim, zoom, seek, preview and waveform without relying on a Windows GPU machine.

**Changed:** `SP-05/index.html`, `src/{engine,app,server}.mjs`, `src/style.css`, `test/{engine.test.mjs,browser_sp05.py}`, `package.json`, `Run-Windows.ps1`, `README.md`, `reports/{unit-results.txt,browser-blocker.md,bundle-meta.json}`; root `ContentStudio_SP05_Timeline_Prototype.html`; `Sprint_0_Status.md`, `docs/{WORKLOG,HANDOFF,DECISIONS}.md`.

**Implementation:** 500 scenes × 4,200 ms = 2,100,000 ms/35min; 4 editor tracks. Pure testable engine stores integer-ms cumulative starts and binary searches visible intersection. UI window-renders only nearby clips on media/text/voice lanes, ruler ticks, one soundtrack placeholder, deterministic demo waveform or true PCM peaks from user-uploaded audio. Supports native browser drag reorder, right-edge trim (1–30s), zoom, seek, preview clock, undo/redo and localStorage autosave. Scenes edit text/media prompt and selectively mark corresponding generated assets stale. Standalone HTML generated for opening offline. No React dependencies (offline environment): React/Vite/Zustand port deferred to R3/ARC-01.

**Validation:** `cd SP-05 && npm test`: **16/16 PASS** (Node 22, Linux); regressions SP-01:4 SP-02:22 SP-03:35 SP-04:15 = **92/92 PASS** combined. Browser suite written and attempted, but **NOT EXECUTED** because managed Chromium returns `ERR_BLOCKED_BY_ADMINISTRATOR` for all URLs (URLBlocklist `*`). No screenshot, browser drag/pause/PCM UX benchmark or Windows data is claimed. Reports: `SP-05/reports/`.

**Limits:** Real timeline playback vs media tracks not proven; standalone uses simulated images, text, placeholder music and synthetic waveforms until real audio chosen; uploaded audio is session-only. Production video render, queue/API integration and React port not implemented. Browser tests MUST run on unlocked browser and Windows later.

**Next:** SP-06 security, API key vault, localhost binding; return to SP-05 browser integration/profiling when policy/hardware allows.

## 2026-10-13 — SP-04 — Durable DAG queue, fencing, crash recovery and transactional outbox
**Status:** TESTED (Linux PoC) / PENDING_WINDOWS_AND_ASSET_STAGING  
**Goal:** Prove 100 jobs survive a real child-process kill/restart without duplicate successful commits and that event replay can catch up after disconnection.

**Changed:** `SP-04/{src/{db,store,runner,api,cli}.js,test/*,README.md,Run-Windows.ps1,reports/*}`, `Sprint_0_Status.md`, `docs/{WORKLOG,HANDOFF,DECISIONS}.md`.

**Implementation:** Node 22 built-in SQLite with WAL/FULL, jobs/dependency DAG/attempts/assets/outbox, atomic enqueue/claim/commit, idempotency key + strict spec check, time-bound lease + heartbeat + fencing token, retry/backoff, pause/resume/cancel, dependency failure propagation, events replay via cursor and read-only SSE/GET. In-process runner supports bounded concurrency and AbortSignal. Test asset paths represent **synthetic DB-only commitments**, not actual media files.

**Validation:** `cd SP-04 && npm test` → **16/16 PASS** Linux. Includes **real child process SIGKILL** after >=12 of 100 jobs succeeded, restart after lease expiry; checks 100/100 succeeded, 100 distinct logical asset records, no repeat of completed jobs, SSE cursor replay and stale fencing. CLI 100-job demo → **100/100 succeeded**. SP-01 4/4, SP-02 22/22 and SP-03 35/35 regression pass; combined 76/76.

**Limits:** Windows process-kill test and GPU/provider I/O untested. SQLite built-in Node module is experimental; production choices pending ARC-01. Physical files staged/validated/atomic-renamed and orphan cleanup NOT built; remote paid side effects can execute more than once across crash even if DB commit is fenced; SP-06 auth/localhost security not built. No UI wiring or production Fastify handler yet.

**Next:** SP-05 — timeline for 500 scenes; retain SP-04 physical asset commit and Windows checks as deferred gates before claiming production readiness.

## 2026-10-13 — SP-03 — GPU detection, image adapters and safe manual import
**Status:** TESTED (local import/protocol) / PENDING_GPU_REMOTE_WINDOWS_VALIDATION  
**Goal:** Provide a real file-import route and generation adapters without requiring PO to have Windows/GPU now; ensure remote/paid calls are opt-in.

**Changed:** `SP-03/{src,test,fixtures,reports}`, `SP-03/{README.md,package.json,Run-Windows.ps1}`, `Sprint_0_Status.md`, `docs/{WORKLOG,HANDOFF,DECISIONS}.md`. Standalone demo PNG is a local fixture, **not AI generated**.

**Implementation:** Node 22 zero-dependency `ComfyUiImageAdapter` (API workflow bindings, `/prompt`, `/history`, `/view`), optional `CloudflareImageAdapter` (metered remote), GPU diagnostic (`nvidia-smi`, WMI name-only fallback), guarded path recommendation, `ImageService` manual PNG/JPEG/WebP import, FFmpeg full-image validation, immutable per-scene asset/JSON metadata with SHA-256 and atomic commit/rollback. No plaintext prompts, credentials, or remote responses stored in asset metadata/log.

**Validation:** `cd SP-03 && npm test` → **35/35 PASS**; `node src/cli.js diagnose` → no GPU confirmed; ComfyUI unavailable; default manual import. `node src/cli.js import fixtures/sp03-demo.png` → **PASS** with 640×360 real PNG, 64,844 bytes and SHA-256 proof (`SP-03/reports/import-result.json`). Fake localhost HTTP ComfyUI protocol and stub Cloudflare transport pass integration tests **but do not constitute real model inference**. Regression SP-02 **22/22**, SP-01 **4/4** PASS.

**Limits:** Real GPU model inference, Windows WMI/Powershell tests, ComfyUI server/weights, provider latency/quota/cost, remote API credentials all unavailable; **no AI-generated image has been demonstrated**. No UI/queue/SQLite yet. Provider cancelling mid-run may leave queued Comfy job on the external server.

**Next:** SP-04 durable job queue/fencing spike. Keep SP-03 pending real provider/Windows validation; include handoff instructions in SP-03 README.

## 2026-10-13 — SP-02 — TTS provider adapters, offline speech, fallback and evidence
**Status:** TESTED (offline) / PENDING_PROVIDER_AND_WINDOWS_VALIDATION  
**Goal:** Create actual Vietnamese speech file from a local TTS engine; build pluggable Edge/HTTP adapters with atomic file output and safe fallback.

**Changed:** `SP-02/package.json`, `requirements-edge.txt`, `Run-Windows.ps1`, `.gitignore`, `README.md`, `src/{errors,validation,audio,edge,local,espeak,service,cli}.js`, `src/python/edge_bridge.py`, `test/*`, `reports/*`; `Sprint_0_Status.md`, `docs/{WORKLOG,HANDOFF,DECISIONS}.md`.

**Implementation:** Edge Python worker via stdin (Hoài My, Nam Minh); configurable loopback JSON/text HTTP TTS endpoint; optional offline eSpeak Vietnamese voice; scene-versioned, atomic WAV/MP3 output with ffprobe, cancellation and retryable-only fallback, cost/SSRF guard and sanitized error logs. No implicit paid or remote fallback.

**Validation:** `cd SP-02 && npm test` -> 22 pass/0 fail; `node src/cli.js diagnose`; `printf 'Xin chào…' | node src/cli.js synth --provider offline` -> real eSpeak WAV / PCM 2.935147 sec. Synthetic tone fixtures only used in unit/integration tests. SP-01 regression `npm test` -> 4 pass/0 fail. Evidence in `SP-02/reports/` and standalone WAV.

**Limits:** Edge Python package unavailable, pip network/DNS failure; actual Edge neural speech not verified. Piper/VieNeu compatible server not available. eSpeak quality is robotic. No Windows device. No production queue/SQLite/UI integration in this spike.

**Next:** SP-03; return to provider/Windows validation when available.

## 2026-10-13 — DOC-01 — Agent continuation conventions
**Status:** DONE (documentation only)  
**Goal:** Make future implementation maintainable and restartable across AI agents.

**Changed:** `AGENTS.md`, `docs/HANDOFF.md`, `docs/WORKLOG.md`, `docs/DECISIONS.md`, `templates/TASK_LOG_TEMPLATE.md`, `Sprint_0_Status.md`.

**Decisions:** Intention-revealing code comments; per-task log updates; concise handoff; accurate distinction between simulated tests and real hardware/provider validation.

**Validation:** Checked files exist and contain required sections (no runtime behavior changed).  
**Outstanding:** All SP-02 implementation work.  
**Next:** SP-02 — TTS.

## 2026-10-13 — SP-01 — Windows diagnostics and FFmpeg prototype
**Status:** PENDING_HARDWARE_VALIDATION  
**Goal:** Probe environment and validate a basic video generation pipeline.

**Files:** `SP-01/src/`, `SP-01/test/`, `SP-01/Run-Windows.ps1`, `SP-01/README.md`, `SP-01/reports/`.

**Reported evidence:** Existing Node 22 implementation, automated tests, diagnostic endpoint, FFmpeg-generated synthetic 5-min and 35-min MP4 examples verified in Linux. See `SP-01/README.md` for limitations.

**Not verified:** Windows runtime, production 1080p render, GPU/ComfyUI or AI video model generation. These samples are NOT generative AI video.

**Next:** SP-02. Windows machine verification stays deferred by PO direction.

---

## 2026-10-13 — ARC-01: Unified Architecture & Integration

**Intent:** Consolidate the existing independent Sprint0 spikes into ONE local-first application foundation without reimplementing their proven queue/providers/security primitives.

**Changed / added files:**
- `package.json`, `apps/api/package.json`, `apps/web/package.json`, `packages/{core,providers,security}/package.json`: Node22 npm monorepo.
- `packages/core/src/{db,domain,manifest,index}.mjs`: canonical SQLite migrations v1–v3; Channel/Video/Scene/Timeline; immutable preset revisions; real file/queue manifest reconciliation.
- `apps/api/src/{server,controllers,routes,security,vault-routes,providers,handlers}.mjs`: Fastify HTTP routing, pairing, authenticated guarded endpoints, reuses SP-04 JobStore/Runner, SP-06 vault, SP-02 TTS, SP-03 Image, SP-VID-01 ComfyUI video adapters.
- `apps/web/src/{main.jsx,store.js,api.js,style.css,presets.js}`, `apps/web/vite.config.js`: React/Vite/Zustand channel/video/script/scene/timeline/diagnostic job UI; browser tokens in memory only.
- `packages/core/test/{domain,assets}.test.mjs`, `apps/api/test/{integration,routes}.test.mjs`: integration and security coverage without live third-party providers.
- `README.md`, `docs/{ARCHITECTURE,API_CONTRACT,TEST_REPORT_ARC01,HANDOFF,DECISIONS}.md`, `Run-Windows.ps1`, `.env.example`.
- `spikes/SP-01..SP-06,SP-VID-01` are included from the previous verified bundle (bulk benchmark outputs removed to keep deliverable compact).

**Code boundary choices:** Single SQLite file with SP-04's own queue tables; queue-committed file promotion replay-safe by `job_id`; no fake AI provider wired to live routes; preset snapshot copied to video; Master Script edits blocked after scene creation until true invalidation is available; timeline reset on replace scenes.

**Executed checks:**
- `npm test`: **22/22 PASS** (Linux Node 22.16.0). Cross-module DB, queue/worker, fake local fixture provider→fenced job→real file promotion, vault persistence, contracts, optimistic locking.
- `npm test` for each historical spike: SP-01 4/4, SP-02 22/22, SP-03 35/35, SP-04 16/16, SP-05 16/16, SP-06 33/33, SP-VID-01 21/21 = **146/146 regression PASS**.
- `npm run check`: API syntax PASS.
- `npm run diagnose`: Linux Node22/FFmpeg/FFprobe found; Windows/GPU/Edge network not verified.

**Unverified / intentionally not claimed:** npm registry blocked (`EAI_AGAIN`), therefore Fastify/Vite/React deps not installed in sandbox; production API/browser build has **not** run. No live ComfyUI/Wan inference, provider billing, or Edge service test; no Windows/GPU. No full AI content scoring/render pipeline yet.

**Next task:** R0-01—harden Channel CRUD + Preset Settings UI, and verify Fastify/Vite browser/HTTP once npm dependencies become installable. Continue R0 without waiting for Windows hardware, but keep runtime/browser certification open.


## 2026-10-13 — R0-01 — Channel Management & Preset Settings

**Scope:** EP01 US-1.1/1.2/1.3 (partial), R0-09 and R0-10; UI plus core/backend validation, not fake AI inference.

**Files changed:**
- `packages/core/src/db.mjs`: migration v4; tombstones, idempotency keys.
- `packages/core/src/domain.mjs`: field validation; idempotent create, summary, archive/restore/soft-delete, durable preset changes, active-job gating, portrait/square render presets.
- `apps/api/src/{controllers,routes}.mjs`: GET filtered channels & summary, archive, restore and reversible DELETE.
- `apps/web/src/{ChannelWorkspace.jsx,channel-form.mjs,main.jsx,store.js,style.css}`: channel cards/search/status filters, create modal, six settings tabs, prompt preview, optimistic save/conflict handling, lifecycle confirmation.
- `packages/core/test/channel-r001.test.mjs`, `apps/api/test/channel-r001-routes.test.mjs`, `apps/web/src/channel-form.test.mjs`: added tests; plus updated baseline migration test.
- `docs/{API_CONTRACT,ARCHITECTURE,DECISIONS,TEST_REPORT_R001,HANDOFF}.md`, `R0_Status.md`, `Sprint_0_Status.md`, `README.md`, `package.json`.

**Executed tests:** `npm test` **35/35 PASS** (22 ARC tests + 13 new R0 tests). Seven historical spike suites **146/146 PASS**. API Node syntax pass. JSX parsed using global TypeScript parser (no parse diagnostics).

**Unverified:** `npm install` failed `EAI_AGAIN registry.npmjs.org`; no Fastify HTTP or Vite/React bundling/browser E2E. No Windows, GPU, provider or media inference acceptance.

**Known gaps:** Branding/avatar upload requires bounded file API (not allowed to store unvalidated media). Actual TTS preview needs live consent and playback. This milestone implements settings UI but is NOT a complete EP01 production acceptance.

**Next:** R0-02 canonical database/migrations & versioned migrations hardening, then R0-03 security work / follow backlog dependency order.

## 2026-10-13 — R0-02 — SQLite Migration & Backup Hardening

**Purpose / EP:** EP09 US-9.1, Task R0-02. Preserve local-first channel/video/job data during upgrades and reject tampered/unknown/corrupt schemas before changes. No new PO decision.

**Changed files:**
- `packages/core/src/db.mjs`: unchanged SQL/checksums v1–v4; additive migration **v5** (scene/video asset consistency triggers, video status index, user_version=5); startup preflight (integrity, FK, schema history, required table/column checks, relation mismatch); snapshot via WAL-aware `VACUUM INTO` with checksum-independent SQLite verification and restrictive backup file permissions; migration transaction rollback on failure.
- `packages/core/src/index.mjs`: exported `assertHealthy`, `backupProjectDb` for controlled maintenance use.
- `tools/db-maintenance.mjs`, root `package.json`: offline inspect / manual backup commands (never auto-restore a live WAL DB).
- `packages/core/test/migrations-r002.test.mjs`: **16 new automated tests**: v3/v4 preservation, queue-only DB, WAL-aware snapshot, safe repeat opens, corrupt/unknown history, schema tampering, FK/mismatched assets, partial DDL rollback and read-only backup restore proof.
- `packages/core/test/{domain,channel-r001}.test.mjs`: updated expected schema version to v5; no historical migration SQL altered.
- `docs/{WORKLOG,HANDOFF,ARCHITECTURE,DECISIONS,TEST_REPORT_R002}.md`, `R0_Status.md`, `README.md`, `Sprint_0_Status.md`: record verified results and safe restore policy.

**Evidence actually executed (Linux Node v22.16.0):** `npm test` **51/51 PASS** (35 previous + 16 new); seven spike suites **146/146 PASS**; combined **197/197** automated tests across independently executed suites. `npm run check` PASS. `npm run diagnose` verified local Linux FFmpeg and FFprobe; NOT Windows/hardware evidence. Confirmed old migration v1–v4 SQL unchanged using literal equality comparison.

**Safety boundaries / limits:** Automatic backup before upgrading an existing versioned DB **or queue-only SQLite**; no backup for new empty database; use SQLite VACUUM INTO (not file copy while WAL active). Existing user data remains untouched if backup validation fails, or DDL fails in transaction. Failure leaves verified `.pre-v5-*.sqlite` snapshot; no automatic overwrite restore. Windows SQLite filesystem/ACL behavior, migration contention under running application, UI/HTTP/browser, live AI/GPU remain unverified. Node22 `node:sqlite` is experimental.

**Next:** R0-03 — connect/validate local security against actual Fastify routes, strict endpoint policies, credentials and privacy; Windows DPAPI/hardware pending per PO deferral.


## 2026-10-14 — R0-05 — API Contracts & Typed SDK

**Scope:** R0-05 (shared API contracts/SSE/client). No PO decision needed. No new paid provider or data migration.

**Code delivered:**
- `packages/contracts/src/catalog.mjs`: 35 canonical operations (pair/vault/channels/videos/assets/jobs/diagnostics/health/SSE) and explicit public DTO schemas.
- `packages/contracts/src/{openapi,typegen}.mjs`, `tools/generate-api.mjs`: reproducible OpenAPI 3.1 and TS declarations; generated `docs/api/openapi.json`, `packages/contracts/src/types.d.mts` and `packages/sdk/src/client.d.mts`.
- `packages/sdk/src/client.mjs`: typed-operation client; private in-memory session, Bearer + mutation CSRF, only same-origin/127.0.0.1, server error normalization, strict allowlisted routes and SSE resume with Last-Event-ID header.
- `apps/web/src/api.js`: uses shared SDK without changing UI state or existing screen call signatures.
- `apps/api/src/routes.mjs`: unexpected controller error sanitized as HTTP 500 INTERNAL_ERROR; domain errors unchanged.
- `packages/{contracts,sdk}/test/*.test.mjs`, `packages/sdk/types/typecheck-r005.mts`: catalog/route drift, security query policy, SDK auth, legacy compatibility, error handling, split UTF-8 and SSE replay tests plus compile-time contract assertions.
- Docs: `docs/{API_CONTRACT,DECISIONS,HANDOFF,TEST_REPORT_R005}.md`, `R0_Status.md`, `AGENTS.md`, `README.md`, root scripts.

**Executed tests:** `npm test` **95/95 PASS** (16 new); seven Spike suites **146/146 PASS**, total **241/241**; `npm run check` PASS; `npm run typecheck:sdk` PASS. Evidence: `docs/evidence/R005_*`.

**Not verified:** `npm install` fails `EAI_AGAIN` for registry; no real Fastify HTTP, Vite browser, Windows/GPU/AI. OpenAPI published DTOs are not runtime request/response validation middleware.

**Next:** R0-08/R0-11 (preset and video snapshot resolver) according to backlog dependency; retain API catalog and typed-sdk integration in new features.

## 2026-10-14 — R0-08 / EP10 US-10.3 — Preset schema & immutable revision

**Outcome:** CODE_COMPLETE + TESTED_OFFLINE. **No new PO decision**.

**What changed:**
- `packages/core/src/preset-schema.mjs` (NEW) now owns typed JSON Schema, shared default preset, strict no-coercion shape validation, stable serializer and static editor capability options. `packages/core/src/domain.mjs` reuses it. Field-level business constraints and explicit cost/remote guards remain authoritative on the backend.
- `packages/core/src/db.mjs` adds migration v6 with SQLite immutable revision triggers; prior SQL v1–v5 remain byte-for-byte unchanged. `StudioRepository` adds `savePresetRevision` and `getPresetRevision`, retaining old revision API and immutable snapshots for existing videos.
- `packages/contracts/src/catalog.mjs` and `apps/api/src/{controllers,routes}.mjs`: three new operations, canonical schemas and read-only metadata. Regenerated `docs/api/openapi.json`, TypeScript contracts, SDK declarations; OpenAPI version 0.6.0.
- `apps/web/src/{presets.js,ChannelWorkspace.jsx,preset-history.mjs,style.css}`: shared preset defaults; tab **Lịch sử preset**, read-only comparison of selected revisions. No provider calls or restoration action in this view.
- Tests: `packages/core/test/preset-r008.test.mjs`, `apps/api/test/preset-r008-routes.test.mjs`, `apps/web/src/preset-history.test.mjs`, `packages/sdk/types/typecheck-r005.mts`; updated old schema-version expectations to 6.

**Verified:** Linux Node v22.16.0: `npm test` **108/108 PASS**, `npm run check` and `npm run typecheck:sdk` PASS; seven Sprint 0 spike suites **146/146 PASS** (total 254 independently executed automated tests). SQL for v1–v5 compared against R0-05 archive: unchanged. Raw evidence in `docs/evidence/R008_*`.

**Limitations:** No real Fastify HTTP, React browser/vite build, Windows test, GPU or provider/quota verification in this environment. Static capability catalog is NOT live adapter readiness. Full runtime OpenAPI schema validation/EP02 cost approval remains out of scope. Database triggers are enforced on migration v6; avoid physical channel deletion.

**Next:** R0-11 — video preset snapshot resolver and explicit per-video overrides, or R0-07 account registry according to dependency plan. Follow `docs/HANDOFF.md`.

## 2026-10-14 — R0-12 / EP03 US-3.1–US-3.4 — Video Management

**Outcome:** `CODE_COMPLETE / TESTED_OFFLINE`; no PO decisions required. Per PO, Windows/browser verification deferred.

**Changed components and purpose:**
- `packages/core/src/db.mjs`: append migration v9 (video soft-delete, last editor step, target/actual duration, immutable retry keys and library index). Preserve v1–v8 migration SQL and checksums.
- `packages/core/src/domain.mjs`: idempotent video create with immutable preset source; keyset library/search; safe resume based on script/scene prerequisites; optimistic rename, script-only clone, soft-delete/restore; active-job guard; lightweight library DTO.
- `apps/api/src/{controllers,routes,request-policy}.mjs`: scoped video read/resume and video lifecycle endpoints; authenticated query allowlist without accepting secrets in URL.
- `packages/contracts/src/catalog.mjs` and generated OpenAPI/TS SDK: single contract for video list, create, clone, restore, rename, soft-delete and persisted editor step.
- `apps/web/src/{VideoWorkspace.jsx,video-library.mjs,store.js,main.jsx,style.css}`: status/target duration view, search/filter/pagination, new video, resume, rename/clone/delete/restore; protection from cross-channel list flashing and stale async responses.
- `packages/core/test/video-r012.test.mjs`, `apps/api/test/video-r012-routes.test.mjs`, `apps/web/src/video-library.test.mjs`: 16 new checks. Existing tests adapted only for latest schema v9, new paged controller response and dynamic backup suffix. No old migrations rewritten.

**Verified:** 158/158 app tests, 146/146 independent Sprint 0 spike tests, OpenAPI/SDK checks, JSX syntax parse all pass. Full specifics: `docs/TEST_REPORT_R012.md`.

**Pending:** Vite/browser and real Fastify HTTP integration because npm dependencies missing. Device/GPU/Windows verification deferred by PO. The video-level progress remains unknown until EP12 exposes measured progress. No new paid service was invoked.

**Next:** reconcile R0 backlog and explicitly identify unbuilt mandatory tasks before marking release complete; then move to R1.


## 2026-10-14 — R0-06 / EP12 US-12.1 — Durable Queue Integration & Safe Job Center

**Result:** Code Complete + Offline Tests Passed. 167/167 app + 146/146 independent Spike tests passed. No production/Windows/browser pass claimed.

**Why now:** R0 backlog audit identified R0-06 had been skipped in reporting even though SP-04 queue existed. No second scheduler was created; new code is the final secure HTTP/React integration layer for that one existing queue.

**Changed:** `apps/api/src/job-center.mjs` (NEW), `apps/api/src/{routes,controllers,request-policy}.mjs`, `apps/api/test/jobs-r006.test.mjs` (NEW), `apps/web/src/JobCenter.jsx` (NEW), `apps/web/src/{main.jsx,style.css}`, `packages/contracts/src/catalog.mjs` and generated OpenAPI/TS SDK, docs `TEST_REPORT_R006.md`, `R0_BACKLOG_AUDIT.md`, `HANDOFF.md`, `DECISIONS.md`, `WORKLOG.md`, `R0_Status.md`, `AGENTS.md`, `README.md`.

**Behavior:** Job list/detail/history are redacted. Queue action endpoints use the established authenticated Fastify guard; SSE uses a safe projection, bounded replay/cursor, respects backpressure. UI offers filter/status/action controls. Queue creation responses no longer return the raw worker payload.

**Known limitations:** Fastify npm unavailable; no HTTP/browser/live provider tests. Cancelling a running external request only fences its database commit; it does not necessarily prevent provider-side billing.

**Next:** R0-13 paid-cost approval guard at actual execution, then R0-14 mock providers + CI. See `docs/R0_BACKLOG_AUDIT.md`. No new PO decision required.

## 2026-10-14 — R0-14 / EP02 + EP12 — Mock AI Providers & CI

**Result:** `CODE_COMPLETE + TESTED_OFFLINE`. Six new Node tests, 187/187 app PASS, 146/146 Spike regressions PASS, combined 333/333. No new PO decision.

**Code changed and why:**
- `packages/providers/testkit/{mock-providers.mjs,mock-providers.test.mjs,fixtures/mock-video.mp4}`: deterministic test-only implementations of LLM/TTS/Image/Video. No GPU/API/key/fee required. WAV is synthesized test tone, image is copied existing fixture, MP4 is fixed video fixture; not AI generation. Negative scenarios simulate retry/abort/error; no paid permission bypass.
- `apps/api/src/handlers.mjs`: additive `providerIds` injection for real queue/handler integration tests; defaults remain production provider IDs.
- `apps/api/test/mock-pipeline-r014.test.mjs`: use actual SQLite/JobStore/JobRunner/asset promotion with mock providers, verify dependency/retry/idempotency/checksum and terminal failure.
- `tools/run-tests.mjs`: cross-platform explicit Node test inventory for Windows CI; avoids shell glob differences.
- `tools/{ci-negative-control.mjs,fixtures/intentional-failure.test.mjs}`: prove broken assertion creates red result; deliberately failing fixture is excluded from normal suite.
- `.github/workflows/ci.yml`: Linux/Windows GitHub runner matrix Node 22; tests, OpenAPI check, TypeScript SDK, web build, Windows diagnostics. No CI runs yet.
- Root `package.json`: add portable testing and CI commands; bump to `0.9.3-r014`.
- `docs/{TEST_REPORT_R014,HANDOFF,WORKLOG,DECISIONS}.md`, `AGENTS.md`, `R0_Status.md`, `docs/R0_BACKLOG_AUDIT.md`, `README.md`: update agent navigation, evidence, and honest acceptance flags.

**Commands/evidence:** `npm run test:all`: **333 PASS**; `npm run check`: PASS; `npm run typecheck:sdk`: PASS; `npm run test:negative-control`: PASS. Evidence in `docs/evidence/R014_*`. `npm run build:web`: **BLOCKED** (`vite: not found`; dependencies not installed). No attempt to present hosted CI/Windows/GPU/provider checks as successful.

**Next:** R0-VID-01 (AI Video capabilities/preflight), plus deferred launcher/voice preview and package-lock/hosted CI/hardware verification.

## 2026-10-14 — R0-VID-01 / EP13 US-13.1,13.2 — Video Provider Capabilities

**Result:** `CODE_COMPLETE / TESTED_OFFLINE`. Added 17 tests: 350/350 full Node suite PASS (204 app + 146 SPIKE). No new PO decision.

**Changed files:**
- `packages/core/src/{video-capabilities.mjs,index.mjs,db.mjs}`: additive SQLite migration v11; validate capabilities; metadata-only registry, optimistic revision and dry-run preflight with provider/account status, quota, local/remote/paid safety; user-declared evidence never marked as verified.
- `apps/api/src/{controllers.mjs,routes.mjs}`: 3 safe API operations; enqueue now validates configured local ComfyUI video model before queuing, rejects unimplemented remote/paid and unsafe I2V raw references; never silently falls back to Image Motion.
- `packages/contracts/src/catalog.mjs`, generated `docs/api/openapi.json`, `packages/contracts/src/types.d.mts`: typed shapes for video capabilities, preflight and selected model ID.
- `apps/web/src/{VideoProviderCapabilities.jsx,ProviderWorkspace.jsx,style.css}`: model limits configuration and no-charge preflight in AI Models & Quota.
- `packages/core/test/video-capabilities-r0vid01.test.mjs` and `apps/api/test/video-capabilities-r0vid01.test.mjs`: new persistence/policy/queue protection tests. Historical R0-13 schema-version test changed from ==10 to >=10 (prior migration SQL untouched).
- `docs/{TEST_REPORT_R0VID01,API_CONTRACT,HANDOFF,WORKLOG,DECISIONS}.md`, `docs/R0_BACKLOG_AUDIT.md`, `R0_Status.md`, `AGENTS.md`; saved evidence under `docs/evidence/R0VID01_*`.

**Commands:** `npm run test:all` PASS 350; `npm run check` PASS; `npm run typecheck:sdk` PASS; TS JSX parse PASS. `npm run build:web` BLOCKED `vite: not found` (not a source compile failure proven). Real provider, Windows, CI and browser not verified.

**Deferred:** Secure I2V image-reference loading and true Wan/ComfyUI inference in R2; real model hardware/performance validation; paid provider execution & per-scene time/cost approval; Hybrid image-motion fallback execution; Windows launcher, TTS preview. **Next:** canonical R0-01 one-command bootstrap. See current `docs/HANDOFF.md`.

## 2026-10-14 — R0-01 (canonical) / EP09 US-9.1 — Windows One-Command Launcher

**Status:** CODE_COMPLETE + TESTED_OFFLINE. Windows acceptance NOT performed. No new PO decision.

**Changed files:**
- `Run-Windows.ps1`: actual one-command `start` as default, backward compatible `test/diagnose/api/web`, safe argument forwarding; no machine-wide execution policy changes.
- `Start-ContentStudio.cmd`: Windows double-click convenience wrapper.
- `tools/launcher-core.mjs`: pure Node version/port/data checks, exclusive PID/token data lock, stale-lock handling, service-specific localhost health readiness.
- `tools/launch.mjs`: self-contained environment/dependency detection, npm install-or-ci, UI build, single same-origin API process, optional browser launch, shut down own subprocess, redact sensitive config.
- `tools/launcher-core.test.mjs`: 10 new tests for parsing, Node gate, port, concurrent lock/recovery, service health and process failure.
- `tools/run-tests.mjs`, `package.json`, `.github/workflows/ci.yml`: add launcher tests to cross-platform inventory, start/diagnose commands and smoke probe.
- `README.md`, `docs/{HANDOFF,TEST_REPORT_R001_LAUNCH,DECISIONS,WORKLOG,R0_BACKLOG_AUDIT}.md`, `R0_Status.md`, `AGENTS.md`: update launcher documentation and agent instructions.

**Verified:** Linux Node 22.16, `npm run test:all` **360/360 PASS**, `npm run check` PASS, `npm run typecheck:sdk` PASS; `node tools/launch.mjs diagnose` PASS; `start --skip-install --skip-build --no-browser` intentionally fails with `DEPENDENCIES_MISSING_SKIP_INSTALL`. Evidence `docs/evidence/R001_LAUNCH_*`. `npm run build:web` BLOCKED `vite: not found` (npm dependencies not installed), not a valid React runtime validation.

**Open:** Windows PowerShell 5.1/7, installed npm Fastify/Vite, browser/API HTTP, CI hosted Windows, Ctrl+C lifecycle and full media/FFmpeg validation. R0-10 channel TTS preview next.

## 2026-10-14 — R0-10 / EP01: Channel Voice Preview

**Status:** CODE_COMPLETE / TESTED_OFFLINE; live TTS + HTTP/browser/Windows validation pending.

**Changes (intent):**
- `apps/api/src/voice-preview.mjs`: ephemeral, authenticated short audio synthesis; strict per-call Edge consent; whitelist known adapters, local-only endpoint env config, bounds on request/response, sanitized error codes; no job/DB/media changes.
- `apps/api/src/server.mjs`: register preview under the canonical Fastify security hook.
- `packages/contracts/src/{catalog,openapi}.mjs` + generated `types.d.mts`, `docs/api/openapi.json`: binary audio response contract and CSRF requirement.
- `packages/sdk/src/client.mjs` + generated SDK declarations + `apps/web/src/api.js`: authenticated Blob transport via in-memory session (no bearer in audio URL).
- `apps/web/src/{VoicePreview.jsx,voice-preview-form.mjs,ChannelWorkspace.jsx,style.css}`: sample text, provider/voice/speed, explicit consent, cancel, audio player, resource cleanup and helpful errors.
- `apps/api/test/voice-preview-r010.test.mjs`, `packages/sdk/test/voice-preview-r010.test.mjs`, `apps/web/src/voice-preview-form.test.mjs`: 12 new tests. Existing contract registry test now includes binary endpoint and MIME checks.

**Evidence:** Node 22 Linux `npm run test:all`: 372/372 PASS (12 new); `npm run check`: PASS; `npm run typecheck:sdk`: PASS; `npm run build:web`: BLOCKED `vite: not found`. Python `edge_tts` missing; NO real upstream Edge synthesis performed. Fastify/browser and Windows not verified.

**Remaining:** Install dependencies, run real Edge and configured local TTS, Fastify HTTP+browser E2E. Channel avatar upload from EP01 remains separate unfinished UI requirement. Do not mark R0 signed off yet.

## 2026-10-14 — R1-01 Content Brief (EP04 US-4.1 + US-4.2)

**Result:** CODE_COMPLETE + TESTED_OFFLINE. Added SQLite migration 13 for `content_briefs` and immutable `content_brief_revisions`; canonical domain validation and 35min/145WPM estimator. Six new API operations, generated OpenAPI / TypeScript contracts, React CT01 form with model picker, snapshot-based style overrides, autosave, dry-run validation and brief history. Preserved manual master-script editor in separate tab; no AI invocation or paid API.

**Changed code:** `packages/core/src/{content-brief,db,index}.mjs`; `apps/api/src/{controllers,routes}.mjs`; `packages/contracts/src/catalog.mjs`; `docs/api/openapi.json`, generated types; `apps/web/src/{ContentBriefWorkspace.jsx,content-brief-form.mjs,main.jsx,style.css}`.

**Tests:** `content-brief-r101.test.mjs` in core and API, `content-brief-form.test.mjs` in web. Linux Node v22.16: full suite 389/389 PASS, OpenAPI/check + TypeScript typecheck PASS, JSX transpile parse PASS. React production build blocked by missing Vite (`vite: not found`). No HTTP/browser/Windows/provider runs.

**Known:** in-app sidebar/tab navigation now prompts when changes are unsaved, but forced power loss can interrupt writes. No generator/judge/retry code in R1-01. Next: **R1-02** outline/chapter versioning. No new PO decision.

## 2026-10-14 — R1-02 / EP04 US-4.4: Outline Generator & Chapter Versions

**State:** CODE_COMPLETE + TESTED_OFFLINE (live integration unverified). Source builds on R1-01 workspace, NOT a new unrelated project.

**Reason/design:** Videos 30–40 min require an editable semantic outline before chapter writing. Users must review AI's proposed chapter plan, and a background job must never overwrite an outline edited after scheduling. SP-04's fenced result is the only safe commit point for AI work; a direct domain write inside handler would violate lease fencing after crashes.

**Changes:** append SQLite migration 14; `packages/core/src/content-outline.mjs` and export; `apps/api/src/outline-generation.mjs`, new controller/routes and server SP-04 handler; eight contract operations and generated OpenAPI/SDK types; `apps/web/src/ContentOutlineWorkspace.jsx`, `outline-form.mjs`, main CT02 tab and styles. Existing migration v13 test fixture now expects latest schema 14, without changing historical SQL.

**Verification:** 405/405 Node tests PASS (`npm run test:all`), contract check PASS, TypeScript SDK PASS, JSX parser PASS. A mock LLM and fake loopback response verified protocol; no live Ollama/Windows/browser/inference validation. Vite absent, React production build blocked.

**Privacy & cost:** No prompt or API key in outbox/SSE. Only explicitly selected active local Ollama model may generate; no paid or remote model auto-use. Master script/scenes/assets untouched. Immutable accepted outline revisions created with explicit action.

**Next:** R1-03 parallel model/chapter generation and comparison. Check R1 tracker and this handoff; do not implement paid provider routing without job-specific approval.

---
## 2026-10-14 — R1-03 Parallel Chapter Generation (EP04 US-4.3/4.4)

**Result:** LOCAL-ONLY CODE COMPLETE; 414/414 Node automated tests PASS (405 prior + 9 new); not live-provider/browser/Windows accepted.

- New `packages/core/src/chapter-generation.mjs`: immutable batch snapshots, idempotent DAG planning with 1–3 model chains, fenced result materialization, immutable generated drafts, targeted retry, strict local-only model recheck.
- New migration v15 in `packages/core/src/db.mjs`: `content_generation_batches`, `content_generation_jobs`, `content_chapter_drafts`, immutable draft triggers; previous v1–v14 unchanged. Export from core index.
- New `apps/api/src/chapter-generation.mjs`: bounded Ollama local JSON client, per-model previous chapter summary continuity, limited response size and timeout, loopback-only URL. Registered `content:chapter` worker on the existing SP-04 runner.
- Updated `apps/api/src/{controllers,routes,server}.mjs`: four protected endpoints for generation, list, detail, retry.
- Updated `packages/contracts/src/catalog.mjs`; regenerated OpenAPI/Typed SDK declarations. Updated `apps/web/src/{ChapterGenerationWorkspace.jsx,main.jsx,style.css}`: CT03 side-by-side model comparison, chapter status and retry.
- Added 9 focused tests `apps/api/test/chapter-generation-r103.test.mjs`: concurrency, independent continuity, immutability, idempotency, local/cost guards, partial failure/retry, restart, invalid output, contract checks.
- Fixed two older migration-version tests to reference the canonical migration ledger instead of fixed v14. No historical migration SQL was edited.
- Verification: `npm run test:all` **414/414 PASS**, `npm run check` PASS, `npm run typecheck:sdk` PASS; frontend build BLOCKED because Vite not installed. Report: `docs/TEST_REPORT_R103.md`.
- Pending: real model integration, paid/remote provider routing (R1-07), browser Fastify/Windows acceptance. **Next:** R1-04 Scoring.

---
## 2026-10-14 — R1-04 / EP04 US-4.5 AI Judge & Scoring

**Result:** LOCAL_ONLY_CODE_COMPLETE_TESTED_OFFLINE. Added an immutable, versioned 5-criterion rubric scoring workflow. Evaluator outputs are never trusted for total calculation; invalid JSON gets one bounded repair request. Queued evaluator jobs run through existing SP-04 JobStore with local Ollama rechecked at execution; no paid or remote model calls. Results materialize only from fenced job success, and do not overwrite chapter drafts/master scripts.

**Changed:** `packages/core/src/{content-evaluation,chapter-generation,db,index}.mjs` (v16 + stable draft ID backfill); `apps/api/src/{content-evaluation,controllers,routes,server}.mjs`; `packages/contracts/src/{catalog,typegen}.mjs`, generated OpenAPI and SDK; `apps/web/src/{EvaluationWorkspace,main,style.css}`; SDK typecheck case. New test `apps/api/test/content-evaluation-r104.test.mjs` (13 cases, including v15 migration upgrade). `R1_Status.md`, `docs/{HANDOFF,DECISIONS,TEST_REPORT_R104}.md` updated.

**Test evidence:** 427/427 PASS (`npm run test:all`), `npm run check` and `npm run typecheck:sdk` PASS. `npm run build:web` BLOCKED: missing Vite. Not tested with live Ollama, Fastify, browser or Windows. **Next:** R1-05 Retry with Feedback.

---
## 2026-10-14 — R1-05 / EP04 US-4.6 Retry with Feedback

**Scope:** Generate a new chapter revision from one completed AI Judge score. Author can edit feedback, choose an eligible local model, enqueue a single regeneration, compare versions side-by-side, re-score and iterate. Preserve all sources, scores and master script.

**Code changes:**
- `packages/core/src/content-retry.mjs` NEW: scoped domain repository, source/evaluation validation, idempotent retry request, private batch materialization, version lineage, targeted failure retry and comparison; `packages/core/src/db.mjs` NEW migration v17; `packages/core/src/{chapter-generation,index}.mjs` new internal filtering/export.
- `apps/api/src/content-retry.mjs` NEW: bounded local-only Ollama regeneration worker, untrusted source delimiters, strict output validation; `apps/api/src/{controllers,routes,server}.mjs` integrated with existing SP-04 queue and protected HTTP routes.
- `packages/contracts/src/catalog.mjs`: five new operations and schemas; regenerated `docs/api/openapi.json`, `packages/{contracts, sdk}/src/*d.mts`.
- `apps/web/src/RetryWithFeedback.jsx` NEW: edit feedback, select model, submit/poll, compare and re-score new variant; `EvaluationWorkspace.jsx` adds entry action; `style.css` responsive pane styling.
- `apps/api/test/content-retry-r105.test.mjs` NEW: 10 tests; `content-evaluation-r104.test.mjs` migration expectation now references current ledger version rather than hardcoded previous latest.

**Results:** `npm run test:all` 437/437 PASS (after final rerun); `npm run check` PASS; `npm run typecheck:sdk` PASS; JSX TypeScript 5.8 parser no diagnostics; OpenAPI generated and checked. `npm run build:web` blocked (`vite: not found`). Targeted tests exercise SQLite, queue, scores and a simulated process restart, **not** live Ollama or browser drag/click interactions.

**Limitations:** No remote/provider costing or quota routing (R1-07), no user approval of master script (R1-06). Full Fastify HTTP/browser Windows/Ollama acceptance deferred. Avoid logging payload and raw feedback in queue events.

**Next:** R1-06 Master Script Approval. The reviewed per-chapter versions must be explicitly selected and assembled into an approved master script; check all chapters and re-evaluations, do not approve automatically.


## 2026-10-14 — R1-06 / EP04 US-4.7 · Master Script Approval

**Implemented:** v18 SQLite immutable master revisions/approvals; `packages/core/src/master-script.mjs` for source-pinned chapter selection, reviewable previews, manual editing, warnings, immutable candidate versions and explicit transactional approval. Added secure/scope-checked API/controller/OpenAPI/SDK routes and CT05 React workflow (`MasterScriptWorkspace.jsx`). Kept legacy manual input via a reviewable manual mode; locked legacy direct update after R1-06 review begins. Added preliminary scene handoff without introducing a second renderer.

**Files changed:** `packages/core/src/{db,domain,index,master-script}.mjs`, `apps/api/src/{controllers,routes}.mjs`, `packages/contracts/src/{catalog,types.d}.mts` (catalog actually `.mjs`), `packages/sdk/src/client.d.mts`, `docs/api/openapi.json`, `apps/web/src/{MasterScriptWorkspace,main,style.css}`, `apps/api/test/{master-script-r106,content-retry-r105}.test.mjs`, `package.json`, and documentation files. `content-retry-r105` now validates v17 is included instead of claiming it remains newest migration.

**Evidence:** 450/450 `npm run test:all` PASS; OpenAPI check PASS; SDK TypeScript PASS; modified JSX parsed PASS. Vite build blocked by missing local dependency (`vite: not found`); HTTP/browser/Windows/live model unverified. No AI key, real paid call or GPU needed. See `docs/TEST_REPORT_R106.md`.

**Pending:** R1-07 provider credential + quota + paid dispatch integration; R1-08 long-video content regression; R2 semantic scene splitting/asset generation. No PO blocker.

**Final hardening:** Added SQLite `content_master_publish_guard` and regression for direct SQL bypass; reran entire test suite 450/450 PASS.

---
## 2026-10-14 — R1-07 Persistent LLM Jobs & Provider Integration

**Purpose:** Connect EP04 Outline/Chapter/Judge/Retry through the SAME SP-04 queue to optional Gemini/Groq/OpenRouter backends, while keeping all remote charges fail-closed and Vault credentials private.

**Changed:** NEW `apps/api/src/llm-dispatch.mjs` (fixed trusted HTTPS host adapters, bounded JSON, consent/quota/cost/paid guards, per-account throttle, safe free fallback and usage recording). Updated existing R1-02..R1-05 domain repositories and worker handlers with a server-side opt-in remote flag; pinned provider model/account in queued job payloads; wired Vault/paid policy through `apps/api/src/server.mjs` and `createControllers`. Updated Groq/OpenRouter paid cost-tier metadata support in `packages/core/src/provider-accounts.mjs`; `.env.example`, `package.json`, `AGENTS.md`, `README.md`, tracker and docs.

**Tests:** Added `apps/api/test/remote-llm-r107.test.mjs` (18 new cases), including official protocol fakes, no-secret error handling, strict JSON, free consent, paid budget, Vault lock, same-model fallback, quota selection, end-to-end staged content with mock network and persisted SQLite restart. Final `npm run test:all` 468/468 PASS; `npm run check` and SDK typecheck PASS. `npm run build:web` unavailable (`vite: not found`), live HTTP smoke unavailable (Fastify module not found). No live API call or billing.

**Next:** R1-08 Long Content & Policy Regression; maintain deferred hardware/browser/live validation. Full evidence: `docs/TEST_REPORT_R107.md`.

---
## 2026-10-15 — R2-01 · Scene Segmentation & Scene Builder (EP05 / US-5.2, US-5.3)

**Goal:** Convert explicitly approved R1 Master Script into editable scenes with exact source coverage; preserve content for a 30–40-minute video without needing provider calls or local GPU.

**Delivered:** Added `packages/core/src/scene-builder.mjs` for lossless Vietnamese sentence/paragraph splitting and long-sentence fallback, source UTF-16 offsets, coverage checks, editor split/merge functions, explicit edit/reorder acknowledgment and atomic immutably versioned scene-plan saves. Added SQLite v19 `scene_build_state`/`scene_build_revisions` and guarded legacy scene replacement after master approval. Added five contract-backed Scene Builder routes and OpenAPI/SDK artifacts, new React UI with preview, settings, drag/reorder, split/merge, 50-scene pagination, manual text/media/prompt fields, explicit save and history. UI is a useful start on R2-02 but prompt generation is **not** implemented.

**Changed paths:** `packages/core/src/{db,domain,index,scene-builder}.mjs`, `packages/contracts/src/catalog.mjs`, generated `docs/api/openapi.json`, `packages/{contracts,sdk}/src/*d.mts`, `apps/api/src/{controllers,routes}.mjs`, `apps/web/src/{SceneBuilderWorkspace.jsx,scene-editor.mjs,main.jsx,style.css}`, new tests in `packages/core/test`, `apps/api/test`, `apps/web/src`, adjusted `apps/api/test/master-script-r106.test.mjs`, `package.json`, this tracker and handoff.

**Tests actually executed:** 496/496 `npm run test:all` PASS (17 new), `npm run check` PASS, `npm run typecheck:sdk` PASS; new/modified JSX parsed with global TypeScript compiler without syntax errors. Test details `docs/TEST_REPORT_R201.md`. No browser/Windows/real TTS/media provider verification.

**Next:** R2-02 AI visual prompt proposal/media validation on top of scene editor; keep paid-model guard, scene history and source validation.

## 2026-10-15 — R2-02 Scene Builder & Visual Prompt Proposals
- Built `VisualPromptRepository` for approved scene plan input pins, immutable v20 snapshots, local Ollama-only model validation and idempotent 8-scene job chunks.
- Added local worker generating structured, bounded JSON with untrusted-script delimiters; it returns proposals only after SP-04 fenced completion.
- Integrated three authenticated Scene Visual Prompt APIs and generated OpenAPI + Typed SDK.
- Added React Scene Builder prompt model selector, generation button, progress polling, side-by-side result cards and manual apply-to-empty-prompts action; no save until explicit user click.
- Added unit/integration tests for malformed outputs, stale runs, paid/remote denial, import-video scenes, job fencing and manual prompt preservation.
- Offline `npm run test:all`: 513/513 PASS. Contracts, SDK, JSX parse PASS; live API/browser/Windows/AI remain untested.
- **NEXT** R2-03 Edge TTS production adapter. See `docs/HANDOFF.md`.

## 2026-10-15 — R2-04 Local TTS & Explicit Edge Fallback (EP06 US-6.2)

- **Done (offline):** Extended scene voice requests and immutable job snapshots with `edge`, operator-configured `piper`/`vieneu`, per-provider voice and explicit pinned single local fallback. Edge still requires per-job remote consent; local request does not. No automatic paid or remote routing; no native model installation.
- **Persistence:** Appended SQLite v22, preserving v21 source SQL/data while rebuilding former edge-only intent `CHECK` and storing `fallback_provider_id` + `fallback_voice_id`.
- **Worker:** Reused SP-02 local HTTP TTS adapter, SP-02 file creation/FFprobe, the sole SP-04 queue and R2-03 staleness/manifest promotion. Local fallback can happen only on allowlisted retryable Edge failures. Actual provider, voice and fallbackUsed are persisted in safe audio metadata.
- **Boundary:** strict operator-owned literal HTTP loopback, no DNS host, URL query/credentials, redirect or remote fallback; health/voice API returns bounded metadata only. New React provider and opt-in fallback selection; fully maintained shared API/SDK.
- **Tests:** Added 16 focused tests with mock HTTP loopback/real WAV byte streaming + FFprobe, explicit vs absent fallback, invalid endpoints and responses, no paid remote, cache, old job fencing, batch validation. Final Node suite **540/540 PASS**; `npm run check`, SDK typecheck and JSX syntax parse PASS.
- **Not tested:** Piper/VieNeu neural synthesis (no native model), full Fastify/React/browser build, Windows, large 35-minute voice production, timeline sync. Read `docs/TEST_REPORT_R204.md` / `docs/R204_LOCAL_TTS_CONTRACT.md`.
- **Next:** R2-05 Image Generation. R0/R1 live release gates still open.


## 2026-10-15 — R2-05 Local ComfyUI Image Generation (EP05/EP06)

**Goal:** Render committed scene visual prompts into real validated PNG/JPEG/WebP scene assets using existing local SP-03 ComfyUI/ImageService and SP-04 durable queue. Provide user-uploaded manual media and revision selection without silently sending prompts to remote paid services.

**Implemented:** New `packages/core/src/scene-image.mjs` for source+config+workflow input-hash, explicit image generation intent, scene status/cache, secure upload, manual asset selection and bounded private reads. Appended database migration **v23** for `scene_image_intents` and `scene_image_manual_selections` with historical manual selection backfill. Existing `packages/core/src/manifest.mjs` promotes queue result into versioned immutable `asset_revisions` only if current intent still matches inside SQLite transaction. `apps/api/src/{providers,handlers,controllers,routes,server,request-policy,scene-image-file}.mjs` integrates local ComfyUI, verifies workflow fingerprint, bytes and dimensions before and after provider processing, exposes authenticated routes, and blocks legacy unpinned image generation. Fixed worker queue asset logical key to include image inputHash, preventing sequential-generation collisions. Reused single SP-04 queue, SP-03 FFmpeg/FFprobe validator; no automatic fallback.

**Frontend/contracts:** Added `apps/web/src/SceneImageWorkspace.jsx` with explicit generate/import/preview/reselect/version list actions, joined Scenes tab `③ Hình ảnh`, generated OpenAPI+TypeScript contracts and typed SDK authenticated Blob streaming with MIME/signature/size checks. `tools/generate-api.mjs` now includes `getSceneImageFile` declaration. `.env.example` gives local ComfyUI API-export and binding placeholders.

**Evidence:** Targeted `npm run test:r205` **20/20 PASS**, full suite `npm run test:all` **560/560 PASS**, `npm run check` PASS, `npm run typecheck:sdk` PASS, TS JSX/JS parse without diagnostics. Four mock HTTP ComfyUI integration cases prove local POST/poll/file and bad response/redirect/change-during-job denial; image fixture verified via real FFprobe/FFmpeg, not a live checkpoint. One v22→v23 migration backfill test and one sequential multiple image revision collision regression. `npm run build:web` **blocked** (`vite: not found`); real ComfyUI/GPU, full Fastify/React browser, Windows, batch throughput unverified.

**Follow-up:** R2-06 asset hash/index and atomic reconciliation; R2-07 crash recovery. Read `docs/TEST_REPORT_R205.md`, `docs/R205_COMFYUI_IMAGE_CONTRACT.md`, `docs/HANDOFF.md`. R0/R1 release gates remain open.


## 2026-10-15 — PLAN-UPDATE-02 · Refresh extension feature list after R2-05 (DOCS ONLY)

**Purpose:** synchronize the previously approved R2-EXT-01..08 additions with the latest R2-05 code-complete workspace without rolling its implementation back to older R2-04 files.

**Changed:** `docs/VIDEO_AI_FLOW_EXTENSION_PLAN_20261015.md`, `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json`, `docs/RENDER_ENGINE_POC_GATE.md`, `R2_Status.md`, `docs/HANDOFF.md`, `docs/WORKLOG.md`, `docs/DECISIONS.md`, `AGENTS.md`, `README.md`, `docs/TEST_REPORT_PLAN_UPDATE_20261015.md`. No runtime, OpenAPI, SDK or DB schema change.

**Evidence verified in this workspace after doc sync:** `npm run test:r205` **20/20 PASS**, `npm run test:all` **560/560 PASS**, `npm run check` PASS, `npm run typecheck:sdk` PASS; JSON backlog parse PASS. See `docs/TEST_REPORT_PLAN_UPDATE_20261015.md`. Browser/Windows/GPU/long-form remain unverified; Vite build was not rerun and earlier dependency blocker remains open.

**Decisions:** R2-06 stays next, EXT-01 schema and EXT-03 benchmark may proceed independently without inventing the renderer result. After v23 use append-only migrations. No surprise paid APIs, duplicated queues or mutable manual media.

**Pending:** R2-06 implementation; real engine benchmark gate; Windows/browser/live provider acceptance; eventual export of 5-scene manually imported WAV/PNG MP4.

## 2026-10-15 — R2-06: Content Hash / Revision Registry (CODE_COMPLETE_TESTED_OFFLINE)

**Changes:** SQLite migration v24 adds SHA content index and immutable field triggers; `manifest.mjs` adds checksum/health lookup, read-only selective recompute, same-scene manual image dedupe, streamed reconciliation with corrupt/restored/unsafe/orphans; `scene-image.mjs` guards import/select with intent+optimistic scene lock and atomic selection. R2-03/R2-05 job bridge and single SP-04 queue kept intact. Migration-focused older tests updated for genuine v22 upgrade simulation. Updated `R2_Status.md`, `AGENTS.md`, `docs/{R206_ASSET_REGISTRY_CONTRACT,TEST_REPORT_R206,HANDOFF,WORKLOG,DECISIONS,VIDEO_AI_FLOW_EXTENSION_BACKLOG}.md`, `package.json`.

**Test evidence:** 14/14 focused PASS, 574/574 total PASS, `npm run check` PASS, SDK TypeScript PASS. `npm run build:web` blocked because `vite` isn't installed. Real Windows/provider/browser/long-form acceptance outstanding. No remote or paid calls made. Physical cross-scene dedupe and destructive garbage collection deferred.

**Why:** A byte-equal image may originate from a different scene, user choice, or prompt. Keep immutable provenance even with shared SHA index; avoid hardlinks and automatic deletions. Manual import may race a new generation job, so row lock + job-intent fence must both pass when writing the selected asset. Recompute is informational until R2-07 performs approved queue actions.

**Next:** R2-07 durable SP-04 queue DAG/resume, conditional requeue, timing ownership and fail-safe recovery.


## 2026-10-15 — R2-07: Durable queue DAG and crash/restart handoff

**Goal:** Execute only affected selected scene assets in one durable SP-04 DAG; safe recovery and explicit retries, no paid auto-routing. **Status:** `CODE_COMPLETE_TESTED_OFFLINE`.

**Changes:** SQLite v25 `asset_dag_runs`/`asset_dag_nodes`; `packages/core/src/asset-dag-r207.mjs`; `spikes/SP-04/src/store.js` atomic DAG batch and explicit retry; read-only selected-scene manifest planner; API/controller/worker registration; typed OpenAPI/SDK contract; 19 focused offline tests. Gate verifies asset promotion, preserves manual images, and reports measured voice vs estimated scene timing without changing timeline. Corrected legacy visual-prompt test that assumed unstable queue ordering, and migrated v25 assertions in prior tests.

**Executed:** `npm run test:r207` **19/19**, `npm run test:r205` **20/20**, `npm run test:r206` **14/14**, `npm run test:all` **593/593**; `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control` **PASS**. `npm run build:web` **BLOCKED** (`vite: not found`). Offline deterministic provider simulation is not live quality validation. No automatic paid calls.

**Follow-up:** R2-08, extension timing/caption ownership R2-EXT-02, frontend DAG UI and real browser/Windows/ComfyUI/Piper/VieNeu/long-form acceptance. Contracts: `docs/R207_ASSET_DAG_CONTRACT.md`; tests `docs/TEST_REPORT_R207.md`; handoff `docs/HANDOFF.md`.


## 2026-10-15 — R2-08 Quota Ledger & Fail-Closed Free LLM Dispatch

**Goal:** Account for in-flight requests against a conservative locally maintained quota ceiling before the network is called; never silently repay unknown usage, dispatch twice, or assume "free". This is not live provider quota verification.

**Changes:** Added SQLite migration v26 `provider_quota_calls` (immutable key/model/units identity + status), core `QuotaLedgerRepository` (reserve/settle/uncertain/recover/snapshot/list). Provider route planning now sees held quota. Guarded LLM free runtime with a required per-model operator token estimate when local limit is configured, durable per-job/attempt key, SQLite reservation before actual fetch, settlement with provider-reported units, and conservative hold on errors or missing usage. Paid remains R0-13. New read-only, bounded, authenticated GET quota-ledger API; request-query allowlist and OpenAPI/TS generation. Added env example and 20 tests (13 core, 7 API). Updated historical replay test to require no duplicate upstream free dispatch for the same attempt. All non-R2-08 code should behave identically except planned fail-closed safety behavior for capped free models.

**Testing:** `npm run test:r208` 20/20 PASS; `npm run test:all` 613/613 PASS; generated API check, TS SDK typecheck and negative control PASS. Web Vite build BLOCKED (`vite: not found`, exit 127). No native/GPU/Windows/browser/live-provider/35min QA. No charges incurred.

**Follow-up:** R2-09 according to original task tracker, and later provider-side quota reconciliation and UI. See `docs/R208_QUOTA_LEDGER_CONTRACT.md` and `docs/TEST_REPORT_R208.md`.

## 2026-10-15 — R2-09 Asset Library UI + Selective Recompute Review

**Purpose:** Let users inspect reusable per-video voice/image/video revisions, file integrity and selective-recompute needs before choosing to generate anything. No new model, billing or backend queue.

**Code:** `packages/core/src/asset-library-r209.mjs` read-only cursor pagination, checksum health and R2-06 plan summary. HTTP `apps/api/src/{routes,controllers,request-policy}.mjs`, contracts/catalog, generated TS+OpenAPI, React `apps/web/src/{AssetLibraryWorkspace.jsx,asset-library-view.mjs,main.jsx}`. UI uses R2-05 optimistic image-select API; manual images remain pinned. No database change (v26 stays canonical).

**Evidence:** `npm run test:r209` **11/11**, full `npm run test:all` **624/624**, `npm run check`, `npm run typecheck:sdk`, negative-control PASS; TS JSX parser zero diagnostics. `npm run build:web` BLOCKED (Vite dependency missing). Native provider, Fastify/browser, Windows and 30–40min remain NOT RUN. Logs in `docs/evidence/R209_*.log`.

**Next:** R2-10 per original roadmap. Extension tasks still planned, not secretly shipped. Details `docs/R209_STATUS.md`, `docs/R209_ASSET_LIBRARY_CONTRACT.md`, `docs/HANDOFF.md`.

## 2026-10-15 — R2-10 · Quota transparency and safe read-only ledger UX

**Purpose:** expose R2-08 held/uncertain quota clearly per model without creating a provider probe, repayment UI, paid approval shortcut or second accounting subsystem. User clicks `Sổ quota` in `AI Models & Accounts`. The previously misleading `model.quota.limit-used` meter now explicitly says it excludes in-flight holds; detailed local ledger includes pending/uncertain holds.

**Implementation:** `QuotaLedgerPanel.jsx` + pure `quota-ledger-view.mjs`, attached to `ProviderWorkspace.jsx`, responsive stylesheet, secure bounded history, unknown-source caveats, stale request abort, fail-closed response parsing. No migrations, contract/codegen changes, API writes or financial policy changes. Added 18 focused tests across pure UI/SDK ingress/Core SQLite.

**Evidence:** `npm run test:r210` **18/18**, `npm run test:all` **642/642**, API check, SDK typecheck, negative control PASS; changed JSX parse diagnostics 0. `npm run build:web` BLOCKED (`vite: not found`). Not verified on Windows, browser, live AI/provider quotas, billing reconciliation, or 30–40-minute video. See `docs/R210_STATUS.md`, `docs/TEST_REPORT_R210.md`, `docs/HANDOFF.md`.

**Next:** R2-11; read approved detailed scope, keep extensions planned unless explicitly implemented and tested.


## 2026-10-15 — R2-11 Selective Regen & Revert

- Confirmed original task title and scope in development execution plan v3: EP06 US-6.4/6.5; per-kind regeneration with old verified revision restore, zero new work for unaffected media/scenes.
- Implemented `SelectiveRegenerationR211`: request-key stable forced cache partition with side-effect-free replay/conflict verification, safe scene/voice revision restore with SHA and stale-job fences. Extended existing image/voice snapshot validation without breaking normal input hashes.
- Added API routes, operations/schema + generated OpenAPI/SDK, voice/image explicit per-scene re-regenerate controls and voice restore in Asset Library.
- Tests: 16 focused PASS, 658 full PASS; API check, typecheck, negative-control PASS; JSX parse PASS. `npm run build:web` BLOCKED (`vite` absent, exit 127).
- No DB migration, no provider billing changes, no new queue. GPU/Windows/browser/30–40min and real TTS unverified.
- Next: R2-12 quota/fallback monitoring UI, then R2-13 regression according to original v3, while retaining R2-EXT planned separately.


## 2026-10-15 — R2-12 · Provider Monitoring

- Confirmed original scope: EP12 US-12.2 quota/fallback monitoring UX from Development Execution Plan v3, after R2-11.
- New SQLite v27 persistent immutable `provider_switch_events`. Instrumented successful equivalent-model/confirmed-free remote LLM fallback only; existing runtime consent/free gate still governs provider call. Failed/preflight/paid or same-model operations never become success events. Best-effort event write prevents accidental rebilling on logging failure.
- `ProviderMonitorR212` read-only quota aggregation (held/uncertain units included), bounded endpoint, strict request policy; `ProviderMonitorPanel.jsx` shows account/model badges, 90% local threshold, paid approval guidance, recorded switch history. API schemas/SDK autogenerated.
- Updated historical tests expecting v26 as latest and fixtures emulating old databases to accept additive v27; no historical migration changed.
- Test evidence: `npm run test:r212` **15/15 PASS**, `npm run test:all` **673/673 PASS**, `npm run check` PASS, SDK typecheck PASS, negative-control PASS. Web build blocked exit 127 (`vite: not found`).
- Next R2-13 integration/regression. Live providers, billing, Windows, browser, 30–40min remain unverified.


## 2026-10-15 — R2-13 · Integration Regression / G3–G6 release assessment

- Status `CODE_COMPLETE_TESTED_OFFLINE` / release `NOT_READY`. Original R2-01..13 all have offline implementation/test evidence. QA-only change: no API, migration or new paid provider route.
- Added 53-scene, 106-asset / 160-job end-to-end SQLite/SP-04 fixture with 105-success / 1-image-failure selective retry, restart with persisted complete jobs, atomic rollback, blocked asset root, corruption and stale/manual safety. Vietnamese Unicode/emoji/CRLF source offsets, synthetic 429 retry/exhaustion and consent controls tested.
- Added `tools/r213-readiness.mjs` + tests and `docs/evidence/R213_release_readiness.json`, explicitly `NOT_READY` even on Windows with installed binaries.
- `npm run test:r213` 15/15 PASS, `npm run test:all` 688/688 PASS, API check, SDK typecheck, negative control PASS. Web build exit 127 (`vite` missing); Fastify HTTP smoke exit 1 (`ERR_MODULE_NOT_FOUND`). GPU/Windows/browser/live TTS/ENOSPC/30–40min output not run.
- Changed: `packages/core/test/integration-regression-r213.test.mjs`, `tools/r213-readiness{,.test}.mjs`, `package.json`, `.github/workflows/ci.yml`, `docs/{R213_INTEGRATION_ACCEPTANCE,TEST_REPORT_R213,R213_STATUS,HANDOFF,WORKLOG,DECISIONS}.md`, `docs/R213_BACKLOG.json`, extension backlog, `AGENTS.md`, `R2_Status.md`, `README.md`.
- Next: R2-EXT-01 engine-neutral video/scene composition; keep G6 hardware validation and EXT-03 real render benchmark open.


## 2026-10-15 — R2-EXT-01 / engine-neutral composition v1
**Status:** CODE_COMPLETE_TESTED_OFFLINE (12 focused, 698 full tests), release NOT_READY.
**WHY:** Prevent render engines disagreeing on source text/media revision/frame math; support cost-neutral manual import path without invoking models.
**Changed:** `packages/core/src/composition-r2ext01.mjs`, append SQLite v28 in `db.mjs`, core exports, controllers/routes, operation catalog/generated OpenAPI/SDK, standalone JSON Schema & generator, tests, and persistent handoff/status docs.
**Decision:** Explicit source pin and digest approval; draft missing media is preview-only; keep timing estimate until EXT-02. Recheck asset disk checksum at future dispatch.
**Tests:** 10/12 focused; full + check + SDK + negative control pass. Web build/HTTP remain dependency-blocked, no Windows/GPU/MP4 proof. **Next R2-EXT-02.**

## 2026-10-15 — R2-EXT-02: measured voice → frames and scene-level caption timing
**Result:** `CODE_COMPLETE_TESTED_OFFLINE`; release `NOT_READY`. **14/14 focused; 714/714 all offline tests PASS.**
**WHY:** Avoid WPM-duration drift and late-scene subtitles; FFprobe owns measured timing. Kept v1 documents immutable; opt-in v2 prevents silent data/renderer contract changes.
**Changed:** new `packages/core/src/composition-timing-r2ext02.mjs`, v1 historical validator dispatch in `composition-r2ext01.mjs`, core exports, API controller/routes, operation catalog/generated SDK/OpenAPI, v2 JSON schema and generator, package test script, core/API tests, `docs/R2EXT02_*`, README, status and agent handoff.
**Verified:** 1234ms real WAV FFprobe beats fabricated metadata; 38 audio frames + 7 padding = 45 total frames at 30fps; caption ends at frame 38; manual lock does not mutate timeline; bad/unprobeable/corrupt and out-of-position locked clips block publication; v1/v2 history coexist; no provider dispatch. `npm run check`, `npm run typecheck:sdk`, `npm run test:negative-control` PASS. `npm run build:web` blocked Vite (exit127); `npm run test:live-http` blocked missing Fastify dependency (exit1).
**Pending:** Actual Edge/Piper/VieNeu speech, Windows/browser/long-form validation, per-word forced alignment, MP4 export. Next task R2-EXT-03 comparative real renderer POC.

## 2026-10-15 — R2-EXT-03 renderer comparison harness (gate blocked)
**WHY:** Make a fair, reproducible 3-workload×3-repeat real comparison rather than choosing by README/licensing or misusing FFmpeg baseline. Reuse POC and keep business composition renderer-neutral.
**Changed:** `spikes/EXT-03/` (retained previously created assets, code and baseline), new Python benchmark generator with measured WAV, 1/5/15 scene workloads, identical caption/image/audio contracts, actual CLI invocation and metadata QA, separate harness tests, repo scripts/backlog, docs/handoff status. No new API/DB migrations or production renderer.
**Evidence:** Harness 7/7, EXT-02 14/14, existing full suite 714/714 offline. npm registry EAI_AGAIN; no engine installed; results 18 NOT_RUN. **NO speed/CPU/RSS comparisons, no engine choice.**
**Next:** Install npm dependencies on connected host, run real 18 renders, compare and inspect Vietnamese glyphs/native voice before EXT-04 production adapter.

## 2026-10-15 — R2-EXT-04 / 05 / 06 implemented (FFmpeg offline fast path)
- Inputs: R2-EXT-03 harness workspace and original R2-EXT-02 Composition v2 timing snapshot. Kept pending Remotion/HyperFrames gate; no npm engine installed.
- Implemented `render-ffmpeg-r2ext04.mjs`: verified immutable input media, secure local FFmpeg process, scene render/concat, AAC retiming, SRT burn, FFprobe QA and digest-addressed atomic MP4 promotion.
- Implemented `render-export-r2ext0406.mjs`: existing SP-04 job handler, scoped API enqueue/job/private file streaming, sanitized progress, defensive source revision checks. Updated contracts/OpenAPI/SDK with streaming download method for large videos.
- Updated Timeline UI: actual selected source image/audio Blob playback; editable locked timing and caption range; explicit v2 publish, FFmpeg enqueue, progress and download. No reordered scene claim or word-level sync claim.
- Added 8 Node tests (four core, four API) and real 3-scene video fixture; 722/722 suite PASS; `check`, `typecheck:sdk`, negative-control PASS; demo MP4 1920x1080 30fps H.264/AAC 8.533008s, drift <0.001s and screenshot subtitle reviewed.
- Blockers: web build Vite missing; real Windows/browser, GPU/native-TTS, Remotion/HyperFrames benchmark and 30–40min unresolved. No migration, no paid API calls.
- Next: validate cross-platform/long-form and primary renderer gate, then EXT-07/08; see `docs/HANDOFF_R2EXT040506.md`.


## 2026-10-15 — R2-EXT-07/08 (current checkpoint)
- Based on R2-EXT-04/05/06 workspace; no rebuild or migration rewrite. Added deterministic EXT-07 cost-mode route previews, health-aware reuse, local ComfyUI-configured-only suggestions, informational paid-clip option ALWAYS blocked. Preview invokes no provider and reports unknown actual billing correctly.
- EXT-08 introduces 4 allowlisted motion presets (clean/gentle/story/documentary), strict brand props/scene overrides, immutable SHA-addressed JSON revision store SQLite v29, optimistic publish, per-render style revision pin and idempotency conflict handling.
- FFmpeg applies safe numeric motion/black fades, branded subtitle colors and lower-third through textfile with `expansion=none`; real JPEG thumbnail derives from fully encoded MP4; output filenames incorporate composition+style digest to avoid cache collision.
- Routes/API catalog, generated OpenAPI/TypeScript SDK, authenticated JPEG download, timeline controls updated. Historical migration downgrade regression fixtures updated to drop new v29 table and avoid hard-coded latest user_version 28.
- Tests: 8/8 focused (4 core + 4 API), 730/730 full regression, API drift/typecheck/negative control PASS; JS/JSX parsed with TypeScript parser. Real short FFmpeg fixture MP4 1920x1080/30fps H264/AAC QA PASS and thumbnail JPEG generated. Web build BLOCKED missing Vite (exit 127). Real Windows/browser/30–40min and Remotion/HyperFrames POC pending.
- Next EXT-03 live benchmark and acceptance gates; R1-EXT-01 script style presets/workflow also pending. No unreviewed paid provider calls or auto-dispatch by visual planner.


## 2026-10-16 — IA-01 Integration & Acceptance partial execution
- User approved next Integration & Acceptance after EXT07/08. Baseline was 730/730 Node tests, real short FFmpeg only; Windows/browser/long form gated.
- Added deterministic 5-scene local fixture end-to-end persisted integration script and negative tests (tampers and stale revision). Used 10 verified PNG/WAV assets, measured FFprobe voice timing, immutable v2 publish, shared SP-04 queue, private FFmpeg render. No actual inference or spend.
- **Found and fixed media QA defect:** nominal 14.300s MP4 had 428 actual video frames for 429 composition frames due to concat/AAC start shift. Enforce `nb_frames == totalFrames`, normalized start-of-video `fps=start_time=0` and up to 2-frame tail padding; new negative test rejects frame loss under a valid duration. Retest full-resolution 1080x1920 30 FPS: 429/429 exact, H264/AAC, 14.300s QA PASS.
- IA-02 non-render long-form rehearsal: 300 scene revisions + 600 media versions, 300 real ffprobe measurements, 65,400 contiguous frames / 36.33min. Real 35min MP4 **NOT** rendered.
- Added cross-platform npm tests, CI FFmpeg prerequisite and IA-01 run. npm install blocked `EAI_AGAIN`, Vite build exits 127, live Fastify smoke missing dependency. Prior v1–v29 migrations untouched.
- Test evidence: IA-01 4/4, entire project 734/734, check/SDK/negative control PASS. Needs Windows/browser/live providers/EXT03 engine benchmark/disk-full/35min MP4 to close release gates.

## 2026-10-16 — R1-EXT-01 (Script Skills workflow)
- Resumed from IA-01 ZIP (734/734 tests). Added five built-in editorial skill presets for explainer/story/analysis/review/shorts, brief-level immutable skill choice, ~3-second hook + source-verification gates; current R1 outline/chapter generation honors the pinned preset without changing strict JSON model output.
- Implemented read-only skill preview, approval-gated JSON export with exact UTF-16 source spans / SHA-256 / estimate-only durations and manual review marker. UI selectors and export button; 3 authenticated routes, API catalog+generated OpenAPI/TypeScript SDK. No Superpowers external plugin/online research, new migration, paid dispatch, or queue.
- New tests 10/10 PASS, full 744/744 PASS, check/SDK/negative-control PASS, JSX parse PASS. Browser build blocked (vite missing), live Fastify blocked (ERR_MODULE_NOT_FOUND). Release NOT_READY. Follow-up: Windows/browser/live providers, 30–40min render, EXT-03 fair benchmark.

## 2026-10-16 — PO selected HyperFrames (primary local renderer)
- Implemented Composition v2 → local self-contained HyperFrames HTML/asset staging; source SHA guard before/after, HTML text escape, frame-based scene/voice/caption timing; FFprobe QA before immutable output publication; explicit FFmpeg fallback, never automatic.
- RenderExportService now queues `render:hyperframes` by default and preserves old `render:ffmpeg` jobs, engine-bound idempotency, clear failure when CLI not installed. Web now selects HyperFrames by default. Shared API catalog/OpenAPI/SDK regenerated.
- Offline evidence: `npm run test:hyperframes` 7/7 PASS (mocked HyperFrames CLI); entire offline 747/747 PASS, API/SDK/negative control PASS. `npm run build:web` blocked Vite absent. npm registry EAI_AGAIN; real HyperFrames MP4 NOT_RUN, Windows and long-form NOT_ACCEPTED.
- See `docs/HYPERFRAMES_PRIMARY_RENDERER.md`, `docs/HYPERFRAMES_SELECTION_HANDOFF.md`; no additional SQLite migration, paid/cloud traffic, or new queue.

## 2026-10-16 — IA-02 (Full System Acceptance harness and HyperFrames schema fix)
- Continued from HyperFrames-primary workspace, no parallel queue, migration, paid API or automatic FFmpeg fallback.
- Found root schema gap: standalone HTML lacked `data-start="0"` and `data-no-timeline`; added both because HyperFrames treats composition roots as timelines and otherwise may wait up to timeout. Updated contract test.
- Added `tools/ia02-acceptance.mjs` machine-readable explicit PASS/BLOCKED/FAIL matrix, `--strict` release exit, optional FFmpeg short fixture and real HyperFrames queue acceptance. Added `tools/ia02-hyperframes-acceptance.mjs` real installed CLI gate (never a mock).
- Unit tests: 4 new; total **751/751 PASS**. Contract drift, SDK typecheck and negative control PASS. FFmpeg five-scene short control MP4 **429/429 frames**; 300 scene/600 media 36.33min **PLAN ONLY**.
- `npm install --offline` ENOTCACHED and online registry ping EAI_AGAIN; Vite/React/Fastify/HyperFrames absent, no real HyperFrames render/Windows/browser/provider validation. IA-02 **5 PASS, 11 BLOCKED**, `release=NOT_READY`; `--strict` exits code 1 intentionally.
- Next: run Windows live gates and HyperFrames `lint/check/render`, then check browser and long MP4, record performance/recovery. See `docs/IA02_HANDOFF.md`.

## 2026-10-16 — R3-01 Scene Mutation + Inspector
- Started from IA-02 HyperFrames primary. Added atomic per-scene edit `text/visualPrompt/mediaType/durationMs`, read-only impact preview, 409 lock, user text ack, and SHA-only audit events. Generated image invalidation never triggers voice; text invalidates dependent voice/image; manual still pinned if media stays image. No provider calls/jobs/migrations.
- Added `SceneInspectorR301` React in Timeline with per-scene dirty guard, conflict messages, explicit impact preview/save, and preview media invalidation on source revision change. Existing Motion control and voice revision tools remain separate.
- Two new authenticated routes, catalog/OpenAPI/SDK generated, 8 focused tests and 759/759 full regression PASS. Runtime browser/Windows/HyperFrames real CLI/30–40min gates are STILL OPEN. Next R3-02.

## 2026-10-16 — R3-05 and R3-06 (current checkpoint)
- Implemented optimistic per-scene non-destructive visual window saved to existing timeline JSON; separate undo/dirty behavior, fps snap and on-track marker. Validates no voice/caption/scene-duration cut and 409 conflicts. Inspector duration edits reset old windows atomically.
- Implemented checksum-verified WAV/MP3-derived voice peaks from the existing private audio read, guarded `bins` ingress, bounded SHA LRU and lazy 3-concurrent/visible-only SVG clip rendering. No paid model calls.
- API contract/catalog/schema/OpenAPI/SDK generated. Focused 10/10 PASS, R3-02/04 13/13, R3-01 8/8, contract 6/6, check/typecheck/negative control, JSX parse PASS. `npm run test:all` attempted twice but hung at EXT08 1080p FFmpeg branded render and was interrupted at #574; current full-suite total cannot be claimed. Vite build blocked (`vite` not found).
- **Major outstanding:** visual window is preview/editor metadata only; HyperFrames/FFmpeg MP4 output does not apply the trim. No browser/Windows/HyperFrames/35min acceptance. Status NOT_READY; read `docs/R305_R306_HANDOFF.md`.

## 2026-10-16 — R3-05 renderer visual window integration
- Closed prior gap: `visualEdits` were editor-only; now the timed v2 Composition pins `visualWindow:{inFrame,outFrame}` (optional legacy compatibility). Invalid windows after real voice duration introduce `VISUAL_WINDOW_CONFLICT` and block publish. SHA/digest and historical immutable revisions preserved.
- HyperFrames primary: image CSS motion holds first/last pose; edited video locally preprocessed with FFmpeg to bounded 90-frame MP4 before HyperFrames CLI. Mocked CLI tests are not a real HyperFrames render. FFmpeg manual renderer: video first/last frame holds, image zoom/pan progress clamp; narration/SRT/total frames unchanged; fail closed short clip.
- 8 focused tests with actual 90-frame 1280×720 H264/AAC FFmpeg MP4; full suite and checks in `docs/R305_RENDER_TEST_REPORT.md`. Generated JSON schemas, OpenAPI/SDK; no DB migration, new API/queue, provider call, auto fallback. Repro `tools/r305-trim-demo.mjs` outputs independent proof clip.
- Next R3-07 revisions/undo/redo. Windows/browser/real HyperFrames/30–40min are still blocked; release NOT_READY.

## 2026-10-16 — R3-07 / R3-08 / R3-09 / R3-10
- SQLite schema appended v30 and v31. New timeline history journal + bounded undo/redo, all accepted reorder/trim/manual timing saves row-version fenced, historical revisions immutable. UI Cmd/Ctrl+Z/Y with dirty guard, preview and new approval required after undo.
- Pinned render jobs persist immutable enqueue-time Composition/style. A later timeline edit does not corrupt or mutate running jobs. FFmpeg per-scene SHA/FFprobe cache reused 1 unchanged scene of 2 in real H264/AAC rerender; no HyperFrames cache claimed. Existing FFmpeg segment concat/final QA preserved.
- Separate authenticated UTF-8 SRT generated from frozen timeline at successful job completion; SDK and UI download. Checksum/size/path guard and tamper test. No paid inference.
- Focused history 3/3, cache/SRT 4/4, export/API/contracts 15/15; previous R3 regressions PASS, SDK/code checks PASS, TypeScript JSX parser PASS, 300-scene long plan PASS without MP4. Full `test:all` was attempted, timed out near test 581; two artificial downgrade migration test fixture failures updated to drop new v30/v31 objects, focused historical migration suite then 27/27 PASS. Do not claim entire current suite passed.
- Web build blocked missing Vite; real HyperFrames, Windows/browser, 35-minute output not tested. Release NOT_READY. Next R3-11.


## 2026-10-16 — R3-11 Portable ZIP64
- Started from R3-07..10 cumulative workspace. Added standard-library ZIP64 STREAM/STORE writer (`packages/core/src/project-zip-r311.mjs`), approved v2 safe per-scene media/content archive and SHA manifest; no secrets, no new DB migrations, no render queue.
- Added private staged authenticated ZIP route/controller, ingress query policy, SDK browser file-picker streaming with 100MiB Blob fallback, React Export Project button; generated OpenAPI & SDK.
- Focused 7/7 PASS, isolated catalog/security contracts 6/6 PASS, check/typecheck/negative control and JSX parse PASS, Python zipfile and unzip -t accept ZIP64 bytes. Initial full suite 803/805 flagged 2 catalog/ingress issues; fixed and reran contract tests, global rerun incomplete.
- Still no Windows/Fastify/Vite live, >4GiB ZIP, real HyperFrames, real 35-minute MP4; release NOT_READY; next R3-12.

## 2026-10-16 — R3-12 Render Drawer + truthful progress
- Started from R3-11 full ZIP64 workspace. Added source-independent resolution variants with derived hashes and immutable enqueue-time request; real FFmpeg 720p H264/AAC test PASS. Supports 16:9/9:16 720p/1080p and square 1080p; square 720p rejected.
- Added `POST /api/videos/:id/renders/preflight`: read-only source/revision/asset-hash check (no jobs/no paid calls). Worker verifies again. Render state includes immutable output revision, rendition, stale-source label and measured stage progress; existing secure durable SSE used, no new global event stream.
- Added UI `RenderDrawerR312.jsx` with controls/preflight/explicit enqueue/retry and output revision; no blind progress % or hidden engine fallback. Code comments explain intent, OpenAPI generated, test report `docs/R312_TEST_REPORT.md`.
- First full run 810/811 surfaced a changed `RENDER_ASSET_CHANGED` code; fixed and reran legacy IA-01 4/4 PASS + focused R3-12 6/6 PASS. Second global rerun interrupted at ~201 cases; do NOT claim global green. Windows/Vite/Fastify/real HyperFrames & 35-minute acceptances blocked. Release NOT_READY, next R3-13 disk/crash safety.

## 2026-10-16 — R3-13 + R3-14
- R3-13: introduced `render-safety-r313.mjs`: fail-closed filesystem capacity using usable `bavail`, 512 MiB reserve, conservative scratch estimate and sanitized preflight report; worker independently rechecks. Startup orphan cleanup removes ONLY 24h-old UUID stages; does not touch verified output or SHA segment cache.
- Strengthened process-group cancellation and timeout in `runBinary` (POSIX `-pid` SIGKILL; Windows numeric `taskkill /T /F`, no shell); explicit abort/timeout codes, bounded stderr. Existing SP-04 lease recovery/idempotency/commit fencing reused; NO new DB/queue.
- R3-14: new evidence-based acceptance tool with optional real five-scene FFmpeg, 300-scene plan and externally probed long MP4. Never treats a plan, mocks or FFmpeg as a real HyperFrames/Windows 35-minute acceptance.
- Added focused tests for disk low/unknown, cleanup symlink safety, abort/timeout, stale lease rejection and strict R3-14 gate status; updated API contracts and UI messaging.
- See `docs/R313_R314_TEST_REPORT.md` for actual numbers, runtime limitations and release NOT_READY.

## 2026-10-16 — R4-01 channel preset comparison and selective update
- New pure diff builder (latest channel vs video effective), explicit selectable fields, no-opt-in bulk migration, optimistic source/version/digest binding, active-job guard, original snapshot preserved, immutable config revision reuse. Two authenticated POST routes, generated OpenAPI/typed SDK and React comparison UI with impact review. No migrations and no provider calls.
- R4-01 12/12 PASS; R0-11/domain/catalog 20/20 PASS; check/typecheck/negative-control PASS. Full test:all attempted and timed out near #613; no full-suite verdict. Vite build blocked, actual Windows/browser/HyperFrames 35-min gated; NOT_READY.
- R4-02 planned: DB/media backups with verified hashes and safe restore flow. See `docs/R401_*`.

## 2026-10-16 · R4-02..08 stabilization batch
- Implemented verified SQLite + selected media snapshot, sha manifest, explicit restore to clean path; storage graph conservative quarantine CLI.
- Advanced public Job Center group/search; multi-cue subtitle draft API/SQLite v32/editor; FFmpeg local second-pass music mix; read-only character/style token lint and warnings; fail-closed release audit.
- New focused 10/10 PASS incl 1-second real music MP4, legacy R4-01 12/12, contracts 6/6, check/typecheck/negative control pass. Full `test:all` timeout after #621; Vite absent. Release NOT_READY.
- NOT DONE: complete music in primary render queue, subtitle burn-in, actual reference-character image consistency, Windows/HyperFrames/35min/hardware E2E, bulk Job Center, full CI and security audit.

## 2026-10-16 · R4-05/06/08 completion integration
- Added opt-in subtitle draft revision and local music import/list to Render Drawer and authenticated API. Frozen draft cues/music SHA/settings into existing SQLite `render_snapshots` and SP-04 queue, no schema migration. FFmpeg libass and HyperFrames HTML use the exact same scene cue plan; separate SRT pinned; output digest includes chosen draft.
- Music H264-copy/AAC second pass executes after either engine's QA; original MP4 never overwritten, new source-pin/output-digest checked. User explicitly opts in; no provider billing. Managed imported music added to checksum backup.
- Test evidence: real FFmpeg 1920×1080 / 80 frames / 2.667s music+subtitle output; R4 focused 12/12, R3-12 regression 6/6, artificial legacy migration 27/27, schema/SDK/negative PASS. Global suite first 842/844 (2 stale downgrade fixtures corrected), later rerun stopped ~625: no full green claim.
- R4-08 audit now actively runs test/SDK/contract/security-negative gates with explicit status; 10 PASS / 11 BLOCKED. Vite/Fastify/HyperFrames CLI unavailable, Windows/browser/35min/security pending; release NOT_READY. See `docs/R405_R406_R408_*`.

## 2026-10-16 — FI-01 R4-08 Final Integration Hardening
- Pin project-local HyperFrames CLI 0.8.159; reject globally installed/unmatched versions and unsafe bin resolution, bump render fingerprint with renderer version. Preserve explicit FFmpeg fallback only.
- Add lockfile reproducibility check to release audit; NO lockfile is present, and npm registry DNS failed. Launcher now counts local HyperFrames among needed runtime packages.
- Add opt-in genuine HyperFrames 5-scene durable queue check and edited Vietnamese 2-cue + imported music end-to-end proof. Here live attempt returned `HYPERFRAMES_NOT_INSTALLED` (expected BLOCKED, not fake PASS).
- Executed full offline test suite 852/852 PASS, process exit 0; check/SDK/negative pass. R4-08 audit 11 PASS / 13 BLOCKED / 0 FAIL. Release NOT_READY; Windows browser, live HyperFrames/AI and 35min job still unverified.
- Source and evidence in `docs/FI01_*`, report `docs/evidence/FI01_full_test_summary.json`. Next: generate/commit lockfile online, real runtime acceptance and 35min production recovery.

## 2026-10-16 — FI-02 production readiness & reproducibility
- Added fail-closed reviewed npm lock/workspace consistency check to Windows production launcher; no floating first-run npm install. Kept HyperFrames exact 0.8.159; FFmpeg fallback manual only.
- Added machine-readable honest release orchestrator with focused/offline/runtime/real HyperFrames opt-ins and strict nonzero release denial. Repaired missing FI-01 release script alias; operator-only Windows acceptance script.
- 7/7 new tests, FI01 7/7, HyperFrames mocks 8/8, R3 recovery 9/9, R4 finishing 12/12, OpenAPI/SDK/negative-control PASS; FI02 full suite attempt timed out after #629, no global PASS claim. npm EAI_AGAIN, lock missing, Vite missing; audit 8 PASS/12 BLOCKED, release NOT_READY.
- Next: create reviewed/committed lock on networked Windows computer, npm ci, real HyperFrames multi-cue/music export, UI/HTTP and 35-minute/restart/security acceptance.


## 2026-10-16 · FI-03 unresolved-issues hardening
- Fixed production launch bug: `verifyWorkspaceLock` returns status not lock; added explicit fail-closed regression tests.
- Scrubbed sensitive environment variables before launching HyperFrames subprocess; no model/cloud keys inherited.
- Prepared opt-in 3-stage Windows dependency/lock installation + verification script (not executed on Windows).
- Proved *synthetic* 35-min 640x360 FFmpeg H264/AAC 63,000-frame video (24.78 s local wall); DOES NOT pass real HyperFrames/1080p gate.
- Added concurrency and batched all-suite runner to diagnose intermittent stalls; new 6/6 focused, API/SDK/negative PASS; post-change full suite did NOT complete. npm EAI_AGAIN. Release NOT_READY.

## 2026-10-17 — FI-04-04 pinned local HyperFrames 5-scene acceptance harness
- Added operator-only real CLI/one-SP-04-queue proof for 5 image/voice scenes, 10 Vietnamese multi-cue subtitles, explicit local music postmix and H264/AAC/FFprobe exact-frame QA. No renderer mocks or silent FFmpeg engine fallback count as proof. `--inspect` is read-only; `--run` requires approved lock/CLI; optional `--save-review` keeps short local MP4/SRT on PASS only.
- Hardened production dispatch: removed `CONTENTSTUDIO_HYPERFRAMES_BIN` arbitrary binary override, preserving exact pinned local HyperFrames and existing safe test injection.
- Updated generated unified backlog to 60 task IDs; wrote FI0404 contract/status/test/handoff plus regression assertions and Windows operator wrapper.
- Real HyperFrames package/MP4 cannot run on this Linux offline host: missing lockfile/node_modules. Maintain release NOT_READY, no provider/API/network calls; do not claim ready until Windows/live evidence.
- FI-04-04 final focused 5/5 PASS (including real local SQLite/SP-04 five-scene fixture), existing FI04 10/10, HF policy 8/8, finishing 12/12; entire batched offline suite 19/19, **880/880 PASS**. A direct unbatched suite attempt was incomplete at #634; no direct-suite PASS. Strict real CLI acceptance correctly exits 1 with `HYPERFRAMES_NOT_INSTALLED`; release remains NOT_READY. See `docs/FI0404_TEST_REPORT.md`.

## 2026-10-17 · FI-04-05 Timeline Windows UX hardening
- Prevented simultaneous unsavable reorder+trim drafts; explicit cancel trim to saved visual in/out; keyboard timeline seek with focus instructions; playhead-anchored zoom, truthful R4 music lane and focus-visible styles.
- Corrected stale voice clock on manifest/order change: abort fetch, revoke blob, pause playback, reset old scene; audio remains singleton. Kept SP-04 queue, existing R3 optimistic PATCH/history and no paid/cloud/provider calls.
- Added read-only loopback Chrome/Edge CDP acceptance harness and Windows runbook; human drag/trim/Undo/Redo/500-scene/voice verification remains independently BLOCKED.
- Added 10/10 focused tests, FI04 10/10, R3 13/13; OpenAPI/SDK/negative PASS; parser JSX clean. Regenerated backlog 61 IDs.
- Fresh `npm run test:all:batched`: batches 1–10 PASS; outer process timed out prior to batch 11; no full-suite PASS claimed. Vite missing (`build:web` exit 127), strict browser gate NOT_READY.
- Next: approved Windows npm lock + install, real Vite/Fastify/browser, manual UX/recovery; then FI-04-06 actual HyperFrames long video.

## 2026-10-17 — FI-04-06 → FI-04-10 gated acceptance implementation
- Built Windows-only genuine long HyperFrames 35–40min real-project queue acceptance CLI with explicit selections, strict H264/AAC/1080p/exact frame/SRT/music checks and parent/host samples; NO long render actually run on this Linux environment.
- Added disposable real process SIGKILL + SP-04 durable SQLite fencing/retry proof, separate real recovery inspection requiring actual Windows manual interruption to release.
- Added loopback-only read-only local LLM/ComfyUI provider handshake inventory (no inference), explicit network-consent security audit workflow and fail-closed final release inventory.
- Kept exact HyperFrames 0.8.159, FFmpeg optional/manual, one durable queue; no paid calls/install/schema changes/deletions.
- Regenerated merged roadmap to 66 task IDs (42 FI02 + 14 AI Video + 10 FI04), created Windows operator runbook and 19 focused gate regression tests.
- Real lock/node_modules/Vite/Fastify/Windows/browser/HyperFrames/35min/AI inference/OS kill/security remain BLOCKED. See docs/FI0406_FI0410_TEST_REPORT.md.

## 2026-10-17 — WI-01 Windows Integration preflight
- Continued from FI-04-10. Added read-only, actionable twelve-gate Windows prerequisite inspector (`tools/wi01-windows-preflight.mjs`); Windows PowerShell wrapper, strict nonzero blocking, no remote/premium model calls, installs or schema changes.
- Kept production HyperFrames 0.8.159 pin, FFmpeg manual-only and one SP-04 queue. Machine `PREREQUISITES_OK` never equals release READY.
- Updated canonical merged backlog from 66 -> 67 unique tasks, retaining all 14 AI-video task IDs, deterministic generator integrity test updated.
- New WI01 tests 9/9 PASS; earlier FI-04 regressions 19/19 + 10/10 + 10/10 + 5/5 PASS, check/typecheck/negative PASS. Actual Linux inspect 5 PASS/7 BLOCKED, strict exits 1. npm EAI_AGAIN, build missing vite, Windows live proof unavailable.
- Full batched test attempt timed out after batch 10/20 (no fresh global PASS); isolated direct batch 11 73/73 PASS. Do not claim prior FI-04-10 909/909 baseline covers new changes. See `docs/WI01_*`.

## 2026-10-17 — WI-02 Windows bootstrap and live runtime lifecycle
- Added operator-only four-phase Windows bootstrap wrapper; lock resolution and reviewed `npm ci` remain distinct steps. No automatic provider/cloud calls, migrations or changes to renderer selection.
- Added genuine production Fastify *loopback socket* runtime acceptance after actual Vite build, checking health/auth/unknown-API guard/same-origin HTML/security header and IPC graceful stop + port released. Child uses a disposable SQLite directory and allowlisted env, and its console pairing code is never captured to logs.
- Added 10 focused WI-02 tests and updated deterministic merged roadmap to **68** IDs (all 14 AI-video IDs preserved).
- Live run on this authoring host remains BLOCKED: Linux, no npm lock/dependencies, no pinned installed HyperFrames, no Windows browser; inspect 5 PASS/7 BLOCKED, report release `NOT_READY`. Do not claim that unit TCP fixture tests are real app acceptance.
- Next: apply explicit reviewed lock/install on Windows 11; run WI-02 verify then FI-04-04 real 5 scenes, Windows browser UX, HyperFrames 35 minute render, actual restart/AI/security acceptance. Keep independent release gates unapproved.
- Completed fresh `npm run test:all:batched` after WI-02 implementation: **20/20 batches PASS, 928/928 Node tests PASS** (two separate successful full runs observed), API/SDK/negative control and WI02 10/10 focused PASS. This is **offline test evidence only**. No Vite/Fastify/HyperFrames runtime was available on this Linux machine; release remains `NOT_READY`.

## 2026-10-17 — GitHub CI readiness preparation (no GitHub push)
- Replaced floating `npm install` CI with separate offline Linux, optional Windows, and reviewed-lock runtime build/HTTP jobs.
- Added manual `resolve-lock.yml` workflow producing review-only npm package-lock artifact.
- Added `ci-github-lock.mjs` fail-closed verification and `docs/GITHUB_CI_HANDOFF.md`.
- No remote GitHub repository modified: the connected account currently has no ContentStudio repository, and available connector actions cannot create a repository.
- Gates needing committed lock, Windows/HyperFrames/GPU/35min stay NOT_READY.

## 2026-10-17 — GitHub lockfile, real Ubuntu runtime CI and dependency security
- Initialized private repository `toantqnet-a11y/video-ai-flow`; imported WI-02 source/tests/docs. Enabled GitHub Actions with strict fail-closed CI.
- Fixed Ubuntu CI OS prerequisites (FFmpeg + eSpeak). Observed `20/20` offline batches, `928/928` Node tests PASS on hosted Ubuntu (run 39011924436).
- User triggered `Prepare npm lockfile (manual)` run 39012701743: PASS and uploaded artifact. Reviewed npm v3 lockfile: 7 workspaces, HyperFrames 0.8.159 exact, 269 registry packages with SHA integrity, npm registry hosts only; committed `package-lock.json` on main (commit f3eca82).
- Hosted Ubuntu CI verified `npm ci --ignore-scripts`, TypeScript SDK, production Vite bundle, and **real Fastify live HTTP smoke PASS**. `npm audit` then identified 1 HIGH severity `@fastify/static` path traversal / route guard advisory in 8.x.
- Created security remediation PR #1, updated `@fastify/static` to pinned `10.1.6`, generated and reviewed candidate lockfile (HyperFrames 0.8.159 unchanged), and verified full PR CI + audit PASS on Ubuntu. Squash merged to main commit `311c5e40`.
- Main CI run `39013509252` **SUCCESS**: Ubuntu offline regression + dependency install + SDK/Vite + Fastify live HTTP + npm audit. Windows opt-in jobs were skipped, not PASSED.
- **Still NOT_READY for production**: real Windows Chrome/Edge interaction, installed HyperFrames CLI with genuine MP4, >=35-minute Full HD render, crash-restart recovery, local GPU/TTS/LLM inference, and on-device security acceptance remain unverified. No paid AI APIs or user project data were accessed. Next: Windows opt-in hosted CI and genuine HyperFrames/long-render tests on user hardware.

## 2026-10-17 — WI-03 hosted Windows integration verification
- Added dedicated opt-in Windows Server 2022 Actions workflow on `wi03/windows-verification` branch. Uses reviewed npm lock and Node 22; real `npm ci --ignore-scripts`, SDK/contracts, Vite production build, Fastify live HTTP, WI01/WI02 focused tests and hosted Chromium DOM. No cloud/paid AI provider or user data.
- Genuine hosted Windows run **39014629188** PASS (job 117344045599). Compiled React pairing UI rendered by isolated headless Edge/Chrome, backend real loopback TCP + graceful stop + port free. Windows WI01/WI02 focused tests **19/19 PASS**. This is NOT authenticated Timeline or Windows 11 owner hardware.
- Fixed generator drift from Windows `core.autocrlf` by adding `.gitattributes` LF pin; `npm run check` is now PASS on Windows. Also added fail-closed WI03 classifier tests.
- Media preflight on hosted Windows: **10 PASS / 2 BLOCKED**; FFmpeg/FFprobe not installed. Chocolatey installation returned HTTP 504 (run 39014421247) and was intentionally decoupled from web/API runtime gating; not a fake media PASS.
- Updated deterministic `fi04-backlog` generator, master 69-task JSON, milestone and docs WI03_{STATUS,TEST_REPORT,HANDOFF}. Single SP-04 queue, exact HyperFrames 0.8.159 and NOT_READY release state preserved.
- **Outstanding:** trusted FFmpeg install, genuine HyperFrames 5-scene MP4 and 35+ minute video, Windows 11 authenticated Timeline drag/trim/500 scene UX, crash/restart, GPU/ComfyUI/TTS inference, production security signoff.

## 2026-10-17 — FI-04-04 genuine hosted Windows HyperFrames MP4
- Created opt-in `fi04/real-hyperframes-windows` pipeline and SHA-256-pinned
  third-party Gyan FFmpeg/FFprobe 8.1.2 installer. No floating Chocolatey,
  paid/cloud model or production asset access; GPLv3 binary used in CI only.
- Diagnosed/fixed case-sensitive Windows canonical-path checks in manifests,
  music imports, and FFmpeg asset pins while retaining symlink/traversal
  rejection; corrected SP-04 lease=60s, heartbeat=5s in acceptance fixture.
- Hosted Windows Server 2022 run **39022682686 SUCCESS**: local HyperFrames
  0.8.159 real queued MP4 (5 scenes, 10 subtitle cues, music), H264/AAC,
  429 exact frames, 14.3s, output SHA256
  `110e290b3898fe9bf1d0fc05c064dcc431eea181f3a3e0b38c85026681c3ebb7`.
  8/8 strict invariants PASS, 0 paid/provider calls. Saved MP4/SRT/JSON in a
  7-day artifact (expires 2026-10-24).
- Opened **draft PR #3**, requiring Linux CI and review before merge.
- FI-04-04 **automated proof PASS**, but manual A/V glyph/music review,
  Windows 11 authenticated Timeline, Full HD 35+min / crash recovery,
  local AI GPU/provider and production security remain **NOT_READY**.
  See `docs/FI0404_HOSTED_WINDOWS_TEST_REPORT.md`.
