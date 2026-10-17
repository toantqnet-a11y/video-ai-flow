## IA-02 checkpoint · 2026-10-16
HyperFrames selected, output unverified on real CLI. Full Node regression 751/751; 5/16 IA-02 acceptance gates PASS; Linux FFmpeg short control MP4 429/429 frames, 300-scene long plan only. Actual Windows/browser/AI models/long video remain pending. See `docs/IA02_STATUS.md`.

## 2026-10-16 — HyperFrames selected as primary render engine
- Product decision recorded. Adapter/queue/UI/API contract implemented; 747/747 offline tests PASS. Legacy FFmpeg is explicit manual fallback.
- npm registry EAI_AGAIN; HyperFrames CLI not installed, real engine output and Windows/browser/long-form acceptance pending.
- Read `docs/HYPERFRAMES_PRIMARY_RENDERER.md`.

## Latest cross-sprint checkpoint — R1-EXT-01 (2026-10-16)
- Script Skills workflow built-in: 10/10 focused, 744/744 all offline PASS, no new migration/paid calls; read `docs/R1EXT01_STATUS.md`.
- IA-01 5-scene FFmpeg gate remains PASS, full Windows/30–40min acceptance and EXT-03 benchmark still OPEN. Release NOT_READY.

# ContentStudio — R2 Development Tracker

**Date:** 2026-10-15 · **Scope:** EP05 / EP06 / EP12 / EP13 · **Windows validation:** Deferred by PO.

| Task | Dependency | Current status | Remaining acceptance |
|---|---|---|---|
| **R2-01** — Vietnamese splitting + exact source mapping | R1-06 | **CODE_COMPLETE_TESTED_OFFLINE (18 new tests)** | Real Fastify/React UI and Windows; readability review of abbreviation/URL rules |
| **R2-02** — Scene builder + AI visual prompts | R2-01 | **CODE_COMPLETE_TESTED_OFFLINE** (18 new tests) | Ollama live, HTTP/UI/Windows; actual media preflight belongs to R2-05/R2-VID |
| **R2-03** — Edge TTS production adapter | SP-02,R0-07 | **CODE_COMPLETE_TESTED_OFFLINE** (11 new tests; 524/524 total) | Live Edge Vietnamese audio, Fastify/React browser, Windows and timeline-duration sync |
| **R2-04** — Local TTS fallback | R2-03 | **CODE_COMPLETE_TESTED_OFFLINE (16 new tests; 540/540 total)** | Native Piper/VieNeu endpoint & Windows/live/browser validation |
| **R2-05** — Local image generation, ComfyUI & manual import | R2-02 | **CODE_COMPLETE_TESTED_OFFLINE (20 new tests; 560/560 total)** | Live ComfyUI checkpoint/GPU, Windows, Fastify/browser and 35-minute image throughput |
| **R2-06** — Asset hash, revisions, atomic promote | R2-03,R2-05 | **CODE_COMPLETE_TESTED_OFFLINE (14 new tests; 574/574 total)** | Live Windows/storage failure validation; physical cache GC deferred |
| **R2-07 — Queue DAG and recovery** | R2-06 | **CODE_COMPLETE_TESTED_OFFLINE (19 new tests; 593/593 total)** | Real live providers, browser/Windows/long-form pending |
| **R2-08 — Local quota ledger + guarded free LLM quota** | R2-07 | **CODE_COMPLETE_TESTED_OFFLINE (20 new tests; 613/613)** | Live quota, browser/Windows, real provider verification |
| **R2-09 — Asset Library UI & read-only recompute** | R2-06,R2-07,R2-08 | **CODE_COMPLETE_TESTED_OFFLINE (11 new; 624/624 total)** | Browser/Windows/long-form, Vite installation |
| **R2-10 — Quota Transparency UX** | R2-08,R2-09 | **CODE_COMPLETE_TESTED_OFFLINE (18 new; 642/642 all)** | Browser/Vite/Windows/provider billing still open |
| **R2-11 — Selective regeneration & revert** | R2-06,R2-10 | **CODE_COMPLETE_TESTED_OFFLINE (16 new, 658/658)** | Real model/browser/Windows/long-form; Vite install |
| **R2-12 — Quota & fallback monitoring UI** | R2-08,R2-10,R2-11 | **CODE_COMPLETE_TESTED_OFFLINE (15 new; 673/673)** | Vite/browser, Windows, live provider billing reconciliation and broader fallback telemetry |
| **R2-13 — Integration Regression & 100+ assets** | R2-01,R2-07,R2-09,R2-11,R2-12 | **CODE_COMPLETE_TESTED_OFFLINE (15 new; 688/688 all)** | **NOT_RELEASE_READY:** Windows/browser/native providers/real disk-full/30–40-min render |
| R2-VID-01–06 | R2-02 onward | TODO | Video generation, policy and queue |

**Historical R2-03 delivery gate:** R2-03 connects real Edge TTS adapter to consented per-scene/batch voice jobs. FFprobe-measured audio duration is persisted separately from the estimated scene/timeline duration. All 524 tests pass offline. **Live Edge, browser, HTTP, Windows, 35-minute audio and complete timeline sync are NOT validated.** R2-02 visual prompt proposals remain review-only; R2-04 completed offline; R2-05 image generation has been implemented offline; R2-06 is now complete offline; R2-07 is next.


**R2-04 delivery gate:** 540/540 offline tests pass, including mocked local HTTP health, WAV bytes + real FFprobe, Edge→Piper explicit fallback and negative tests against silent local/remote switching. v22 migration is additive; one SQLite queue and existing intent fences remain. **No actual Piper/VieNeu model inference, browser/live Fastify, Windows or 35-minute TTS has been accepted.** R2-05 was the subsequent task and has since been completed; see `docs/TEST_REPORT_R204.md` and `docs/R204_LOCAL_TTS_CONTRACT.md`.


**R2-05 delivery gate (2026-10-15):** 560/560 offline tests PASS including mock ComfyUI HTTP/FFmpeg, immutably revisioned manual/generated images, stale-job/workflow fencing, v23 backfill, protected SDK previews and sequential generation collision regression. `npm run check`, `npm run typecheck:sdk` PASS; JSX parse PASS. **No real GPU/checkpoint, Fastify browser, Windows or 30–40-minute batch acceptance.** `npm run build:web` blocked due missing Vite dependency. R2-06 completed offline; next **R2-07**. See `docs/TEST_REPORT_R205.md` and `docs/HANDOFF.md`.


## 2026-10-15 — Feature plan updated **AFTER R2-05** (DOCS ONLY)

- Source: `docs/VIDEO_AI_FLOW_EXTENSION_PLAN_20261015.md` and machine-readable `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json`.
- R2-01..R2-06 = **6/13 original R2 tasks CODE_COMPLETE_TESTED_OFFLINE**; latest actual evidence R2-06 **14/14 focused, 574/574 full offline**. Remains unverified on live provider/Windows/browser/long-form.
- R2-07 complete offline; R2-08..13 remain TODO; next implementation is **R2-08**, optionally schema-only EXT-01 in parallel.
- R2-EXT-01..08 are **PLANNED**; EXT-03 benchmark prepared **but real Remotion/HyperFrames NOT RUN**. R2-VID-01..06 and R3/R4 are not marked complete.
- No source/API/migration changes and no new tests claimed by this plan refresh. All schema modifications after v23 must be append-only.

## 2026-10-15 — R2-06 · Asset registry and selective invalidation

- **CODE_COMPLETE_TESTED_OFFLINE:** new SQLite v24 `asset_content_index` and immutable revision guard; content-hash lookup; same-scene manual import reuse; intent+row-version fenced atomic image promotion; SHA streaming reconciliation (`missing/corrupt/restored/unsafe/orphan`), read-only per-scene selective recompute. Manual images remain pinned and disk orphans are not automatically deleted.
- **14/14** focused, **574/574** full regression, `npm run check` and `npm run typecheck:sdk` PASS. Web build remains blocked by missing Vite. Windows/live GPU/provider/browser/long-form acceptance deferred.
- **Next: R2-07** — queue DAG, restart/resume and explicit affected-asset scheduling. See `docs/TEST_REPORT_R206.md` / `docs/R206_ASSET_REGISTRY_CONTRACT.md`.


## 2026-10-15 — R2-07 · Queue DAG & Recovery

- **CODE_COMPLETE_TESTED_OFFLINE:** migration v25, one-transaction durable SP-04 asset DAG with selective voice/image generation and scene/final gates, stage dedupe remapping, crash/lease recovery, explicitly authorized retry and manual pin protection. Timings are reported as measured TTS versus estimate; no automatic subtitle/timeline edit.
- **19/19** new R2-07, **593/593** full regression; `npm run check`, `npm run typecheck:sdk`, negative control PASS. Web build blocked (`vite: not found`). Hardware/live Windows/browser/30–40 min remains pending.
- **Next R2-08** from approved tracker; R2-EXT tasks remain planned. See `docs/TEST_REPORT_R207.md` and `docs/R207_ASSET_DAG_CONTRACT.md`.


## 2026-10-15 — R2-08 · Local Quota Ledger & Guarded Free LLM

- **CODE_COMPLETE_TESTED_OFFLINE:** SQLite v26 with reservation/settlement/uncertain states, restart conservative recovery, duplicate dispatch blocking and route previews reflecting held capacity. Free remote LLM jobs with a configured local quota ceiling require explicit conservative per-model token estimate, otherwise fail closed. Existing R0-13 paid approval remains separate.
- **20/20** R2-08 focused, **613/613** full tests; `npm run check`, SDK typecheck and negative-control PASS. Web build **BLOCKED (`vite: not found`)**. No live provider quota/billing, Windows/browser, GPU or 30–40-minute tests.
- Next original task **R2-09**, with R2-EXT tasks still planned. See `docs/R208_STATUS.md`, `docs/R208_QUOTA_LEDGER_CONTRACT.md`, `docs/TEST_REPORT_R208.md`.

## 2026-10-15 — R2-09 · Asset Library UX

- **CODE_COMPLETE_TESTED_OFFLINE:** Added video-scoped paginated revisions, SHA-256 file-health inspection, read-only R2-06 recompute summary, explicit restore of healthy older scene image through existing R2-05 fencing, safe API/SDK, and Scenes → ④ Assets UI. No new migration and no media deletion or AI dispatch.
- **11/11 focused, 624/624 full tests** PASS; OpenAPI contract check, SDK typecheck and negative-control PASS; JSX parse 0 errors. Vite build blocked (`vite: not found`). Not tested on Windows/browser/live providers/30–40min. **Next:** R2-10. See `docs/R209_STATUS.md` and `docs/TEST_REPORT_R209.md`.


## 2026-10-15 — R2-10 · Quota Transparency UX

- **CODE_COMPLETE_TESTED_OFFLINE:** 18/18 focused, 642/642 full project tests; source labeling, per-model quota inspector and bounded call history show reserved/uncertain holds. No provider verification, API cost or ledger mutation.
- `npm run check`, `npm run typecheck:sdk` and negative-control PASS. JSX syntax PASS; Vite web build BLOCKED (missing dependency). Windows/browser/provider/long video unverified.
- **Next: R2-11** under approved roadmap, task detail must be confirmed; no automatic billing/reconciliation claims. See `docs/R210_QUOTA_UX_CONTRACT.md`.


## 2026-10-15 — R2-11 · Selective Regeneration & Revert
- **16/16 focused, 658/658 all offline PASS** with explicit one-scene voice or image regeneration, stable request key (no duplicate calls), old healthy voice/visual revisions restorable, SHA/intent/optimistic-lock fences, unchanged other assets/scenes.
- OpenAPI, SDK typecheck, negative control, JSX syntax pass. Browser production build `vite: not found`, Windows/GPU/real TTS/long-form remain open. **Next: R2-12** original quota & fallback monitoring UX, then R2-13 integration regression. Consult docs/HANDOFF.md.


## 2026-10-15 — R2-12 · Quota & fallback monitoring
- **CODE_COMPLETE_TESTED_OFFLINE** (15/15 focused, 673/673 full) with local-only per-account/model quota badges, pending/uncertain holds, near/exhausted alerts, paid-approval guidance, and append-only SUCCESS-only equivalent remote free LLM fallback log.
- SQLite v27; new authenticated read-only monitor GET; React component; shared API/OpenAPI/SDK. No official provider quota verification, no auto-paid fallback, no new worker queue.
- API check, SDK typecheck, negative control PASS. `npm run build:web` blocked (`vite: not found`); Windows/React browser/real account/long-form NOT validated.
- **Next: R2-13 integration regression**. See `docs/R212_STATUS.md`, `docs/HANDOFF.md`.


## 2026-10-15 — R2-13 completed offline (G3–G5 tests; G6 open)

- 53 scenes, 106 assets / 160 DAG jobs, persisted version checks + selective post-failure retry, no replay of committed provider successes; 110 Vietnamese paragraphs lossless. 15/15 focused, **688/688** project tests offline.
- `npm run check`, SDK typecheck, negative-control PASS; web build blocked due missing Vite; HTTP smoke blocked Fastify runtime dependency missing. Windows/browser, actual AI provider, disk-full, 30–40-minute video export **NOT** accepted.
- Original R2-01..13 code/test offline tasks **13/13**, release **NOT_READY**. Extensions R2-EXT remain PLANNED. Next implementation R2-EXT-01. See `docs/R213_INTEGRATION_ACCEPTANCE.md` and `docs/TEST_REPORT_R213.md`.


## 2026-10-15 R2-EXT-01 checkpoint
Original R2-01..13 remain CODE_COMPLETE_TESTED_OFFLINE. Engine-neutral composition v1 EXT-01 is now CODE_COMPLETE_TESTED_OFFLINE, SQLite v28, 12 focused/698 full regression PASS. Browser/Windows/real AI provider and MP4 export unverified. Next R2-EXT-02 voice measured timing; EXT-03 benchmark gated on real engines.

## 2026-10-15 — R2-EXT-02 checkpoint
**14/14 targeted and 714/714 total tests PASS offline**. Opt-in measured FFprobe voice-timing composition v2, scene-level caption ending at audio end, manual timeline lock preservation, extra health blockers; v1 unchanged. SQLite v28 reused; no second worker or paid API. Browser/Fastify/Windows/actual TTS/long video still NOT_ACCEPTED; next R2-EXT-03 real render POC. See `docs/R2EXT02_STATUS.md`.

## 2026-10-15 — R2-EXT-03 benchmark protocol implemented, real gate BLOCKED
- EXT-02 remains completed offline: **14/14 tests; full suite 714/714 PASS**. EXT-03 new reproducible 1/5/15 scene, 3-repeat/engine bench, harness-only tests **7/7 PASS**.
- **0 Remotion/0 HyperFrames** actual MP4 rendered; no eligible engine metrics. Offline npm missing (`EAI_AGAIN`). Production adapter decision **DEFERRED** until same-machine real engine runs with FFprobe, visual/voice/expense/license checks.
- R2-EXT-04 and production MP4 exports remain TODO. See `docs/R2EXT03_STATUS.md`.


## 2026-10-15 — R2-EXT-07/08 checkpoint
- EXT-07: `CODE_COMPLETE_TESTED_OFFLINE_PREVIEW_ONLY`; no automatic dispatch/billing; all three recommendation modes and strict cost-evidence caveat implemented.
- EXT-08: `CODE_COMPLETE_TESTED_LOCAL_FFMPEG_UI_UNBUILT`; four allowlisted presets, SQLite v29 immutable style revisions, real styled MP4+JPG, authenticated thumbnail; browser preview not yet verified.
- 8/8 focused, **730/730 total tests**, OpenAPI/SDK/negative control PASS; Vite missing; Windows/live providers/30–40-minute remain pending. EXT-03 engine comparison gate still blocked.


### 2026-10-16 — IA-01 Integration & Acceptance checkpoint
Partial Linux media acceptance: 5-scene 1080x1920 H264/AAC MP4 429/429 frames, 14.3 seconds, QA PASS; persisted existing SP-04 queue. 300-scene/600-asset 36.33min Composition plan PASS; no long MP4. Found/fixed one-frame loss not caught by duration-only QA. New 4/4 IA tests, **734/734** full suite. Release NOT_READY (npm/Vite/Fastify EAI_AGAIN; target Windows/browser/GPU/live AI/real long-form/EXT03 real comparison still pending). See `docs/IA01_STATUS.md`.
