> **PRODUCT SCOPE (18/10/2026):** Video AI Flow is a **React/Vite + Fastify web app served on localhost**, not a Windows Desktop/EXE/Electron app. Windows Server CI below is historical test evidence, not a Windows 11 release prerequisite. The canonical 69-task release gates now target a real authenticated localhost browser, local AI where configured, genuine HyperFrames render, performance and recovery; release remains **NOT_READY**. See [localhost backlog handoff](docs/LOCALHOST_BACKLOG_HANDOFF.md), [canonical backlog](docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json).

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

> **LATEST — FI-01, 2026-10-16:** Full offline regression **852/852 PASS**, but release audit **11 PASS / 13 BLOCKED / 0 FAIL** and `NOT_READY`. Exact local HyperFrames 0.8.159 pinned; no global/npx fallback; real HyperFrames subtitle/music acceptance runner added but CLI+lockfile+Vite/Fastify unavailable here. Read `docs/FI01_HANDOFF.md` first. No paid APIs or automatic FFmpeg fallback.

> **LATEST R4-05/06/08 (2026-10-16):** Start `docs/R405_R406_R408_HANDOFF.md` and `docs/R405_R406_R408_TEST_REPORT.md`. Explicit saved subtitle draft → immutable render snapshot → MP4/SRT (FFmpeg real E2E), local music import/list → snapshot → H.264-copy/AAC music postmix, also wired after HyperFrames primary. 12/12 focused PASS; release audit 10 PASS/11 BLOCKED; full global suite not established. **NOT_READY** until real HyperFrames/Windows/35-min/browser acceptance. Never auto-pay or silently switch engine.

> **CURRENT checkpoint (2026-10-16): R3-07..10.** Immutable SQLite v30 timeline Undo/Redo, v31 frozen render snapshots and FFmpeg SHA segment cache, final MP4 QA and authenticated separate Vietnamese SRT. New focus 7/7, export/API suite 15/15; **full test suite timed out**, not new full PASS. HyperFrames primary but real CLI and segment cache remain pending. Start `docs/R307_R310_HANDOFF.md`. Release NOT_READY.

> **Latest R3 update (2026-10-16):** R3-05 per-scene visual in/out editor MVP; R3-06 waveform from selected verified voice. **Visual trims do not yet affect exported MP4.** See `docs/R305_R306_HANDOFF.md` and `docs/R305_R306_TEST_REPORT.md`.

> R3-02/03/04 checkpoint: 4-track virtual timeline + singleton voice preview + persisted reorder added. See `docs/R302_R304_HANDOFF.md`. Tested offline; browser/Windows/HyperFrames real render pending.

> **R3-01 checkpoint:** Scene Inspector + selective edit/impact API is available in source (offline tested). Release remains NOT_READY pending HyperFrames/Windows/browser gates. See `docs/R301_HANDOFF.md`.

> **Current IA-02 checkpoint (2026-10-16):** HyperFrames primary, real CLI rendering NOT YET ACCEPTED. `npm run acceptance:ia02` produces an honest PASS/BLOCKED/FAIL matrix; `npm run acceptance:ia02:strict` is the release gate and currently fails as intended. See `docs/IA02_ACCEPTANCE_PLAN.md`.

> **Renderer update (2026-10-16):** HyperFrames selected as primary local render engine; FFmpeg available as an explicit manual fallback. Install `hyperframes` on your connected Windows machine before running real renders. See `docs/HYPERFRAMES_PRIMARY_RENDERER.md`. Offline tests are NOT evidence of successful real HyperFrames MP4 rendering.


> **Latest 2026-10-16 — R1-EXT-01:** Built-in five-stage Script Skills templates integrated into R1 brief and outline/chapter prompt guidance; read-only script plan, approved-master exact-source JSON export. 744/744 offline tests PASS; not external Superpowers or live research. Runtime Vite/Fastify/Windows and EXT-03 benchmark still pending. See `docs/R1EXT01_STATUS.md`.

> **Current build checkpoint (2026-10-15):** EXT-07/08 cost planner and motion brand templates implemented; 730/730 offline tests PASS, local FFmpeg styled MP4/JPG QA PASS, Vite/browser/Windows/long-form acceptance pending. See `docs/R2EXT0708_STATUS.md`. No paid auto-fallback, Remotion/HyperFrames POC not accepted.

> **Latest:** R2-10 quota inspector UX completed with 642/642 offline tests. Live provider/Windows/browser and production billing proof pending. See `docs/R210_STATUS.md`.

> Latest code stage: **R2-09** Asset Library (624/624 offline tests); see `docs/HANDOFF.md` / `docs/R209_STATUS.md`. Browser/Vite, Windows and providers require live validation.

> **R2-08 (15/10/2026):** Quota ledger + guarded opt-in free LLM token reservations, **613/613 offline tests pass**. Web build still blocked (`vite: not found`); provider billing/Windows/browser/live usage are **not** verified. See `docs/HANDOFF.md` and `docs/R208_QUOTA_LEDGER_CONTRACT.md`. Next R2-09.

> **Latest development milestone (2026-10-15):** R2-07 durable asset DAG/recovery, `CODE_COMPLETE_TESTED_OFFLINE`; 19/19 focused, 593/593 project tests PASS. Run history/preview/retry API; no DAG UI screen or actual MP4 renderer yet. For agent continuation read [HANDOFF](docs/HANDOFF.md) and [R2-07 technical contract](docs/R207_ASSET_DAG_CONTRACT.md). Live Windows/GPU/TTS/browser/long-form checks remain open.

## Roadmap tính năng mới — cập nhật sau R2-05 (2026-10-15)

R2-01..R2-05 đã hoàn thành code và test offline (R2-05: **560/560** toàn bộ; **20/20** riêng). **R2-06 Asset Hash & Revision Registry** là bước code kế tiếp. Đã hợp nhất kế hoạch thêm 8 phần mở rộng R2-EXT-01..08: contract video/scene, audio/caption sync, benchmark Remotion–HyperFrames, renderer + FFmpeg, preview/timeline, export MP4 QA, cost router, motion templates. Tất cả EXT **chưa triển khai**; Remotion/HyperFrames chưa benchmark thật. Xem `docs/VIDEO_AI_FLOW_EXTENSION_PLAN_20261015.md`, `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json` và `docs/RENDER_ENGINE_POC_GATE.md`. Không có code mới chỉ bởi việc cập nhật roadmap này.

---

## R2-05 — Hình ảnh cho từng scene bằng ComfyUI (triển khai offline, 2026-10-15)

Trong **Scenes → ③ Hình ảnh**, ứng dụng dùng **visual prompt đã lưu** để tạo ảnh `image_motion` thông qua ComfyUI chạy nội bộ trên máy (phải tự cài workflow/checkpoint). Có thể tạo lại bằng seed, tải ảnh PNG/JPEG/WebP (≤512 KiB mỗi ảnh) hoặc **chọn phiên bản ảnh đã lưu**. Mỗi job có snapshot, nguồn, workflow hash và bảo vệ không ghi đè ảnh được người dùng chọn; không gọi cloud hay phát sinh API trả phí tự động. Ảnh chỉ xem qua phiên Bearer bảo vệ, không công khai đường dẫn.

**Cấu hình:** `CONTENTSTUDIO_COMFY_URL` và `CONTENTSTUDIO_IMAGE_WORKFLOW`, `CONTENTSTUDIO_IMAGE_BINDINGS_JSON` trong `.env.example`; xem **`docs/R205_COMFYUI_IMAGE_CONTRACT.md`** để xác định node IDs. Cần FFmpeg/FFprobe và npm dependencies cho UI Fastify/Vite. Bấm **Kiểm tra kết nối** chỉ thử gọi ComfyUI tại loopback, không xác nhận checkpoint/GPU chạy được.

**Đã kiểm thử:** `npm run test:r205` 20/20 PASS, `npm run test:all` **560/560 PASS**, API generation/SDK typecheck/JSX parse PASS; **chưa** kiểm nghiệm inference thật, browser, Windows, dự án video dài. `npm run build:web` hiện bị chặn do thiếu package Vite. Tiếp theo: **R2-06 Asset Revision Registry & Recovery**. Chi tiết: `docs/HANDOFF.md`, `docs/TEST_REPORT_R205.md`.

---

## R2-03 — Tạo voice theo Scene (offline implementation, 2026-10-15)

Sau khi lưu scene, vào **Scenes → ② Voice TTS**. Chọn Hoài My / Nam Minh và tốc độ, đánh dấu đồng ý gửi lời thoại tới Edge TTS trực tuyến rồi bấm **Tạo voice** cho từng scene hoặc theo trang tối đa 50 scene. Job chạy trong SP-04 queue; xem trạng thái ở tab Jobs. Khi thành công và được kiểm tra, thời lượng FFprobe thực hiển thị bên cạnh thời lượng ước tính. Audio nghe thử được tải qua Bearer SDK, không công khai đường dẫn file.

**Để chạy thực tế** cần Node 22+, npm dependencies cho Fastify/Vite, Python và `pip install edge-tts`, cùng `ffprobe`. Đây là dịch vụ Edge không chính thức có thể bị hạn chế/thay đổi; không cam kết free/unlimited. Không tự động gọi Edge hoặc dịch vụ trả phí khi chưa đồng ý. Bản này **524/524 automated tests PASS offline**, chưa nghiệm thu gọi Edge thật, Windows và React/Vite trình duyệt. Xem `docs/TEST_REPORT_R203.md`.

---

> **R1-08 (2026-10-14):** 30/35/40-minute multi-model mock content regression, 479/479 Node tests PASS. `npm run rehearsal:r108` runs actual queue/DB with synthetic text and records anonymous metrics. Browser/HTTP/Windows/real provider and actual TTS duration remain UNVERIFIED. See `docs/HANDOFF.md`, `docs/TEST_REPORT_R108.md`, `docs/R1_RELEASE_READINESS.md`.

> **R1-05 (2026-10-14):** AI Judge feedback can now be edited and used to regenerate one chapter as a new immutable version, compare before/after, and re-score. Local Ollama only; mock-tested 437/437, live/browser/Windows pending. See `docs/HANDOFF.md` and `docs/TEST_REPORT_R105.md`.

> **R1-03 (2026-10-14):** Local Ollama parallel model/chapter generation has been added (migration v15), with independent model chains, retry and chapter comparison UI. See `docs/HANDOFF.md`, `docs/TEST_REPORT_R103.md`. **Live Ollama, Fastify/browser and Windows are NOT yet verified; remote/paid model adapters are not enabled.**

# ContentStudio — R0-10 Channel Voice Preview (2026-10-14)

Trong **Kênh → Cấu hình → Nhân vật & Voice**, chọn giọng đọc, tốc độ, nhập đoạn mẫu tối đa 350 ký tự rồi chọn **Tạo giọng & nghe thử**. Đây là audio thực do adapter trả về, không phải file giả lập; không tạo job, không lưu văn bản/âm thanh lên đĩa, không thay đổi preset.

- **Microsoft Edge TTS**: chọn `vi-VN-HoaiMyNeural` hoặc `vi-VN-NamMinhNeural`, phải đánh dấu đồng ý gửi **đoạn mẫu** qua Internet cho **mỗi lần chọn lại voice/cấu hình**. Edge TTS dùng Python bridge (`pip install edge-tts`), có thể gặp lỗi do phụ thuộc dịch vụ không chính thức; không cam kết luôn miễn phí/khả dụng.
- **Piper/VieNeu local**: chỉ gọi HTTP endpoint literal loopback `127.0.0.1`, được người vận hành cấu hình qua các biến môi trường `CONTENTSTUDIO_PIPER_TTS_URL` hoặc `CONTENTSTUDIO_VIENEU_TTS_URL` (ví dụ `http://127.0.0.1:8000/tts`). Adapter gửi `{text,voice,rate}` và yêu cầu server trả về `audio/wav` hoặc `audio/mpeg` thực. Mỗi server tự phát triển có thể khác giao thức; cần adapter tương thích khi triển khai.
- **eSpeak**: vẫn là giọng kiểm thử ở Sprint 0, chưa được bật trong preview để tránh nhầm với chất lượng Neural.

**Bảo mật:** API `POST /api/channels/:id/voice-preview` bắt buộc Bearer/CSRF như các route khác, giới hạn 350 ký tự và tối đa 2 MB audio; bản nghe thử chỉ lưu tạm trong RAM/Blob URL và không được dùng làm asset sản xuất. Edge phải có consent rõ ràng. Không tự động fallback sang dịch vụ trả phí.

**Kiểm thử offline:** 12 tests mới, tổng 372/372 PASS; OpenAPI và TypeScript SDK PASS. **Chưa xác minh** Edge TTS thực (thiếu Python package), Piper/VieNeu server thật, Fastify HTTP, React UI trên trình duyệt hoặc Windows. Build Vite vẫn thiếu dependencies. Xem `docs/TEST_REPORT_R010.md`, `docs/HANDOFF.md`.

---

# ContentStudio — khởi chạy Windows (R0-01)

**Khởi động UI + Backend bằng một lệnh**, không cần mở hai terminal:

```powershell
# Windows PowerShell, tại thư mục ContentStudio
.\Run-Windows.ps1 -Mode start
```

Hoặc **nhấp đúp** `Start-ContentStudio.cmd`. Yêu cầu Node.js **22.13+**, npm và kết nối npm registry **ở lần cài đầu**. Chương trình sẽ tự cài dependencies nếu thiếu, build React rồi chạy UI + Fastify cùng địa chỉ **http://127.0.0.1:4311/**. Chỉ mở trình duyệt sau khi `/health` thực sự phản hồi từ ContentStudio. Mã ghép nối bảo mật chỉ hiển thị trong terminal; nhập mã vào giao diện, **không chia sẻ hoặc lưu mã**. Giữ terminal mở để ứng dụng tiếp tục chạy, nhấn Ctrl+C để kết thúc. Dữ liệu đã tạo trong `data/` không bị xóa khi dừng hay cập nhật source.

Nếu PowerShell chặn thực thi, có thể chạy file `.cmd` đi kèm mà **không thay đổi Execution Policy của cả hệ thống**. Trường hợp máy bị quản trị bằng chính sách doanh nghiệp, cần tuân thủ chính sách đó; không tự ý thay đổi bảo mật máy.

```powershell
.\Run-Windows.ps1 -Mode diagnose                 # Kiểm tra môi trường, không cài npm
.\Run-Windows.ps1 -Mode test                     # Chạy toàn bộ test (cần Node)
.\Run-Windows.ps1 -Mode start -NoBrowser         # Không tự mở trình duyệt
.\Run-Windows.ps1 -Mode start -SkipInstall       # Không tự npm install
.\Run-Windows.ps1 -Mode start -SkipBuild         # Dùng bản build UI hiện có
```

**Cần FFmpeg/FFprobe để render video**, nhưng thiếu hai công cụ này không ngăn mở giao diện; Diagnostics sẽ hiển thị vấn đề. ComfyUI/GPU và tài khoản AI là tùy chọn, không tự kích hoạt. API trả phí mặc định bị chặn và chỉ thực thi sau phê duyệt hợp lệ theo R0-13. Mặc định chỉ lắng nghe **127.0.0.1**; nếu cổng 4311 có chương trình khác sử dụng, launcher báo `LOCAL_PORT_UNAVAILABLE` và không chiếm quyền tiến trình đó. Có thể cấu hình biến môi trường `CONTENTSTUDIO_PORT` trước khi chạy hoặc dùng file `.env` local (không commit), nhưng không cấu hình cổng mạng ngoài localhost.

**Giới hạn đã xác minh:** Launcher core đã chạy và kiểm thử trên Linux Node 22; *chưa* chạy Windows PowerShell thực tế, chưa cài npm dependencies trong môi trường offline hiện tại, chưa có browser E2E và chưa xác minh AI/GPU Windows. Không coi mã nguồn launcher là nghiệm thu máy Windows. Chi tiết xem `docs/TEST_REPORT_R001_LAUNCH.md` và `docs/HANDOFF.md`.

---

**R0-13 latest:** Paid Policy & Approval Guard (offline-tested). See `docs/HANDOFF.md` and `docs/TEST_REPORT_R013.md`. Paid AI dispatch is fail-closed; no live billing integration has been verified.

# ContentStudio / Video AI Flow — R0-12 Video Management

**Latest (R0-06):** Safe Job Center + durable SSE/read controls, no second queue. See `docs/HANDOFF.md`, `docs/R0_BACKLOG_AUDIT.md`. R0 remains open.

**Previous:** EP03 CRUD and lifecycle with SQLite migration v9, channel-scoped search/pagination, resume, clone/delete/restore and updated UI/API contracts. **Code complete + offline tests; not production-validated.**

Read `AGENTS.md` and `docs/HANDOFF.md` for an agent fast-start; then `docs/TEST_REPORT_R012.md` for verified limits.

Run `npm test`, `npm run check`, `npm run typecheck:sdk`. Start Fastify / React only after dependencies are installed. Previous history below.

---

# ContentStudio / Video AI Flow — R0-11

**Current deliverable:** R0-11 Video Config Snapshot Resolver (EP10) — offline-tested source only.
**Download full workspace / AI agent context:** Archive includes `AGENTS.md`, `docs/HANDOFF.md`, `docs/WORKLOG.md`, generated OpenAPI/SDK, tests and all previous Sprint 0 modules.

New: frozen per-video channel source, field-level overrides, version history, preview impact before saving, safe cost policy, API contracts and React tab **Cấu hình video**. See `docs/HANDOFF.md` to resume without scanning the entire project.

```bash
npm test
npm run check
npm run typecheck:sdk
# Install npm dependencies only when reachable:
npm install
npm run dev:api
npm run dev:web
```

**Known limitation:** `npm run build:web` cannot run in this environment (`vite` dependency unavailable). No live browser/Fastify HTTP or Windows hardware acceptance has been performed. R2/R3 must still implement real stale-asset enforcement and selective asset generation.

---

# ContentStudio / Video AI Flow — R0-05

**Current status:** Offline-tested source and API contracts; not production-ready. See `docs/HANDOFF.md` for next task.

**New in R0-05:** 35-operation OpenAPI 3.1 contract (`docs/api/openapi.json`), typed SDK (`packages/sdk`), TS declarations generated from `packages/contracts`, authenticated resumable SSE and stable error codes.

```sh
npm test                  # app tests (no external install required in Node 22)
npm run check             # source syntax + generated contract consistency
npm run api:generate      # after changing packages/contracts/src/catalog.mjs
npm run typecheck:sdk     # needs TypeScript compiler (devDependency)
```

**For development with npm network access:** `npm install`; launch API with `npm run dev:api`, UI in another terminal with `npm run dev:web`. Target Windows; local URL `http://127.0.0.1:5173`. Pair the frontend using the terminal code. Do not paste the code into logs.

The OpenAPI publication does not imply live Fastify or browser validation has passed. No Windows hardware or real AI/GPU inference is required to continue coding; see deferred tests and security boundaries in `docs/HANDOFF.md`.

---

# ContentStudio / Video AI Flow — R0-04 (diagnostics integrated)

**Trạng thái:** Sprint 0 Architecture Integration, source delivered. **Không phải ứng dụng hoàn chỉnh**. Chưa được kiểm chứng chạy Fastify/Vite trên Windows; npm registry không truy cập được từ môi trường triển khai hiện tại.

## Thành quả tích hợp

- Monorepo: `apps/api` Fastify, `apps/web` React/Vite/Zustand, `packages/core` SQLite migrations + nghiệp vụ, `packages/providers` router, `packages/security` pairing/vault.
- Kênh (preset riêng) → Video (preset snapshot) → Master Script → Scenes → Timeline 4 track lưu SQLite.
- **Tái sử dụng SP-04 JobStore/JobRunner**, không tạo queue thứ hai. SSE job events phát từ outbox bền vững.
- Edge TTS (online, cần consent), ComfyUI ảnh/video (local, cần API workflow export) dùng adapter từ các Spike, không giả vờ đã chạy model thật.
- File asset được Queue fenced commit rồi promoter gắn vào scene; khi crash giữa file/DB sẽ kiểm tra và reconcile, tránh kích hoạt asset chưa được job xác nhận.
- Security: bind 127.0.0.1, kiểm tra Host/Origin, one-time pairing, Bearer + CSRF, Passphrase Vault AES-256-GCM từ SP-06. Mặc định không dùng API trả phí.

## Chạy trên Windows khi có máy

Yêu cầu Node.js **22.13+**, npm, PowerShell. Để render thật cần FFmpeg+FFprobe; chạy AI local cần ComfyUI và model/workflow phù hợp.

```powershell
# Giải nén ZIP, cd vào thư mục có package.json rồi chạy:
npm install
npm run test
npm run dev:api
# Terminal khác:
npm run dev:web
```

Mở **http://127.0.0.1:5173**; nhập mã ghép nối chỉ hiển thị một lần trong terminal API. Không đưa mã này vào ảnh chụp màn hình/log. Nếu backend restart, cần mở phiên pairing mới; SPA giữ token trong RAM.

Có thể chạy `./Run-Windows.ps1 -Mode test` hoặc `./Run-Windows.ps1 -Mode api`.

> Server Fastify yêu cầu các gói npm; chúng **chưa được tải/cài trong sandbox offline**, vì vậy không khẳng định đã chạy HTTP/browser thực tế. Unit/integration tests không cần npm install.

## Chạy test ngay không cần npm install (Node22)

```bash
npm test             # Core + API controllers/handlers/security route unit tests
npm run test:spikes   # Queue SP-04 regression
npm run diagnose     # Local FFmpeg/Node readiness
npm run check        # API JavaScript syntax
```

## Cấu trúc quan trọng

```text
AGENTS.md                       Quy chuẩn agent (đọc đầu tiên)
docs/HANDOFF.md                 Trạng thái hiện tại + tiếp theo
docs/WORKLOG.md                 Lịch sử thay đổi, kiểm thử
docs/DECISIONS.md               ADR + chính sách PO
docs/ARCHITECTURE.md            Sơ đồ, DB, asset/queue
apps/api/src/server.mjs         Backend Fastify
apps/api/src/routes.mjs         REST/SSE endpoints
apps/api/src/security.mjs       Host/Origin/Bearer/CSRF
apps/api/src/vault-routes.mjs   API key vault SP-06
apps/api/src/providers.mjs      Bridges to SPIKE adapters
apps/api/src/handlers.mjs       Queue execution handlers
apps/web/src/main.jsx           Channel/Video/Content/Scene/Timeline/Jobs
packages/core/src/db.mjs       SQLite migrations v1-v5
packages/core/src/domain.mjs   Channel/video/scene/preset
packages/core/src/manifest.mjs Durable file/DB asset promotion
spikes/SP-*                     Tested Sprint 0 spikes unchanged, except packaged without bulk outputs
```

## Giới hạn còn mở

1. Không có Windows để kiểm tra; không có GPU/ComfyUI/model Wan chạy thật.
2. Không thể cài dependencies từ npm registry; Fastify/Vite UI chưa có kết quả smoke HTTP/browser.
3. `node:sqlite` Node22 còn experimental; ORM migration (Drizzle) chưa thực hiện.
4. `image_motion`/`AI video` render 30–40 phút, full waveform, timeline playback thật, LLM generation/scoring đều thuộc R1–R3.
5. Job external có thể được provider thực thi lại sau crash; fence chỉ bảo vệ DB commit, không thể hoàn tác chi phí phía nhà cung cấp.
6. Scene split trong UI là bản đơn giản để kiểm chứng CRUD, không phải bộ tách tiếng Việt thông minh EP05.
7. Windows DPAPI chưa tích hợp; Vault dùng passphrase SP-06.

Không đưa API key vào `.env` hoặc log; API key được mã hóa trong vault và không có route HTTP trả lại plaintext.


## R0-01 · Channel Workspace

This release adds a channel dashboard (search/status including soft-deleted), a quick-create modal, a 6-tab channel settings editor (Info, Content, Character & Voice, Media, Models, Render), versioned preset saves, read-only local prompt preview, archive/restore/reversible delete, and warnings/guards for active queue jobs.

- Channel config changes **do not affect existing video snapshots**.
- Paid and remote providers remain disabled; enabling them needs a separate approval flow.
- API credentials belong only in the vault, never a channel preset.
- New schema migration v4 creates tombstone and idempotency-key tables. Back up data before upgrades.
- Start with `npm install`, `npm run dev:api` + `npm run dev:web` on a machine with npm registry access. `npm test` works on Linux/Node22 without installing React/Fastify.
- Actual Fastify/Vite browser tests remain pending while dependency installation is blocked by npm DNS.

## R0-02 · SQLite schema/migration hardening

Canonical DB now uses **migrations v1–v5**. Historical migrations are unchanged. A schema upgrade on any existing nonempty SQLite database (including SP-04 queue-first DB) takes a verified **WAL-safe SQLite snapshot** before touching schema. Backups are named `studio.sqlite.pre-v5-...sqlite` in the database directory. New databases do not make a redundant snapshot. Migration integrity failure is **fail-closed**: do not delete or rename files to bypass the protection.

On a stopped app, use Node22 to inspect or create a manual snapshot:

```bash
node tools/db-maintenance.mjs inspect ./data/studio.sqlite
node tools/db-maintenance.mjs backup ./data/studio.sqlite
# same via: npm run db:inspect -- ./data/studio.sqlite
```

Recovery procedure: **stop the app and any workers**, preserve the original `.sqlite` **and** any `-wal` / `-shm` sidecars, copy the desired backup to a **new test path** and verify it with `inspect` before considering restoration. Avoid overwriting the live path with an external file while a SQLite connection is open. Media files and encrypted vault have separate backup requirements; this command only protects the database. Full supported restore tooling is a later EP09 task.

R0-02 automated tests: **51/51**, plus **146/146** historical spike tests on Linux Node22. This does not certify Windows or runtime Vite/Fastify browser behavior.


## R0-03 · Security Integration

The backend now validates raw localhost transport headers and route/query format before API route handlers. All API routes require session bearer, and POST/PUT/PATCH/DELETE require CSRF; `/api/session/pair` remains a one-time terminal pairing route. Encrypted credentials are listed by **metadata only**, and cannot be read back over HTTP. Unlock attempts are throttled (5 failures/60s); the backend logger never serializes untrusted request URLs or request bodies. ComfyUI's `localhost` is canonicalized to `127.0.0.1`.

New tests: `apps/api/test/security-r003.test.mjs`. Result: **58/58 app tests + 146/146 previous SPIKE tests = 204/204 passed** on Linux Node22. This is **offline test evidence**, not proof of Fastify HTTP integration or Windows DPAPI, both still pending. See `docs/TEST_REPORT_R003.md` and `docs/HANDOFF.md`. Do not store real production credentials until those validations pass.


## R0-04 · System Diagnostics Dashboard

In the sidebar choose **⚙ Hệ thống** after pairing to inspect CPU, RAM, storage, SQLite, FFmpeg/FFprobe, NVIDIA GPU and registered AI providers. Results are sanitized to prevent leaking filesystem/secret data; a 30-second cache reduces repeated checks. **↻ Kiểm tra lại** uses authenticated POST with CSRF, without executing any AI request or using paid APIs.

Offline smoke check (no npm install or GPU required):
```bash
npm run diagnose:r004     # opens disposable local SQLite and inspects available tools
npm test                  # R0-04 tests + prior integrated app regressions
npm run check             # API diagnostics and server syntax checks
```

The API endpoints are `GET /api/system/diagnostics` and `POST /api/system/diagnostics/refresh` (empty object JSON). Tests and examples are in `docs/TEST_REPORT_R004.md` and `docs/API_CONTRACT.md`. Live React/Fastify browser acceptance, Windows environment and actual AI model inference remain pending. No hard drive or API key is required from PO for this phase.

### R0-08 — Versioned channel presets
The settings screen now includes **Lịch sử preset** for read-only version comparison. Canonical defaults + JSON Schema are shared across React/API/database. Channel revision changes do not modify previously created videos. Run `npm test && npm run check && npm run typecheck:sdk` to verify offline; see `docs/TEST_REPORT_R008.md`. Windows/browser/provider verification is still deferred.


## R0-07 — AI Models & Quota Workspace

After pairing with localhost API, open **AI Models & Quota** sidebar: add provider accounts → (optional) initialize/unlock encrypted Vault and associate a secret → create models → set UNKNOWN or estimated quota → preview fallback routing. Optional **Kiểm tra local** probes only built-in Ollama/ComfyUI loopback health. Never makes billable remote calls. Metadata configuration does not install models or enable working AI generation by itself.

R0-07 migration v8 runs at startup with WAL-safe backup of previous DB. Existing channel/video snapshot revisions remain unchanged. Tests: `npm test`, `npm run check`, `npm run typecheck:sdk`. Full status in `docs/TEST_REPORT_R007.md`.


## R0-14 – Portable offline CI and test doubles

Run `npm run test:all` (333 Node tests at R0-14), `npm run check`,
`npm run typecheck:sdk`, and `npm run test:negative-control`.
`npm run test:mock` exercises the non-billable, network-free simulation providers.
The test-only implementations are in `packages/providers/testkit/`; no real AI
media is generated by this test harness. See `docs/TEST_REPORT_R014.md`.

`.github/workflows/ci.yml` defines an Ubuntu/Windows matrix that additionally
installs dependencies and builds the React UI. It **has not been executed**
in this sandbox. An npm lockfile is not yet available; use npm install in CI
until a registry-enabled maintainer commits a tested lockfile and switches to
`npm ci`.

### R0-VID-01 · Video model capability preflight (metadata only)

In **AI Models & Quota**, register a video-kind provider model and configure its declared T2V/I2V modes, maximum duration, resolution, FPS and GPU hint. Use the preflight form to check a proposed scene locally **without** starting an AI job or incurring charges. The declarations are not guaranteed provider specs. Live inference needs a configured ComfyUI API-format workflow, model and GPU; Windows/browser provider tests are pending. See `docs/TEST_REPORT_R0VID01.md` and `docs/HANDOFF.md`.


## Current release readiness
R0 release has NOT been accepted on Windows or in browser. See `docs/R0_RELEASE_READINESS.md`. Latest R0-GATE-01 adds private channel image upload (PNG/JPEG <=256 KiB) with SQLite v12 and protected binary SDK. Test with `npm run test:all`; after npm installation run `npm run ci:verify` (includes build and real Fastify HTTP smoke).

## R1-01 — Content Brief (2026-10-14)

Under **Kênh → Video → Nội dung → Brief & Cấu hình**, draft topic, idea, source text,
free prompt, duration/word target, WPM, style overrides and up to three registered LLM models.
This **does not generate AI text**: it is a versioned, SQLite-backed input for R1-02.
The estimate is heuristic (35 min × 145 WPM ≈ 5,075 words; five ~1,100-word chapters).
`docs/HANDOFF.md` points agents to the exact implementation and tests.

Local verification without AI account/GPU: `npm run test:all`, `npm run check`,
`npm run typecheck:sdk`. To run the UI later, install npm dependencies and
`npm run build:web` on a networked machine / CI. Current Linux environment
has no Vite dependency installed; no browser/Windows production acceptance yet.

### R1-02: Chapter Outline Editor

Navigate **Video → Nội dung → ② Dàn ý chương**. Manually add/edit/reorder chapters with target words and version history, or explicitly enqueue AI outline generation using an enabled local Ollama LLM already selected in a saved Content Brief. Generation produces a *proposal*; click **Duyệt & áp dụng** to save it as an outline revision. No final script is created, no remote model is called, no payment is authorized automatically.

The Ollama endpoint defaults to `http://127.0.0.1:11434`; optional `CONTENTSTUDIO_OLLAMA_URL` accepts **literal loopback HTTP only**, not arbitrary remote domains. R1-02 unit tests run without Ollama; live inference requires a compatible installed local model and Windows/GPU/CPU resources. The next story writes versioned chapter content.


### R1-04 · AI Judge & Scoring (local-only)

Open Video → Nội dung → **④ AI Judge**, choose a saved generation batch, chapter and local Ollama judge, then score any completed draft. Compare scores across model outputs; view rubric breakdown, suggestions and immutable scoring history. Uses one existing SP-04 queue. Full system tests: `npm run test:all`; API drift: `npm run check`; SDK typecheck: `npm run typecheck:sdk`. Migration v16 backfills variant IDs for pre-existing chapter drafts. For caveats and handoff read `docs/HANDOFF.md` and `docs/TEST_REPORT_R104.md`. Browser build and live Ollama testing remain open (Vite unavailable in this environment).


## R1-06 — Master Script Approval
The Content editor now has a dedicated **Bản chuẩn & Duyệt** step (CT05). Choose one candidate per chapter, compare/review, optionally edit, save a version and explicitly approve before scene generation. Manual import follows the same approval flow. See `docs/HANDOFF.md`, `docs/TEST_REPORT_R106.md` and `docs/DECISIONS.md`.

---
## R1-07 — Optional remote LLM for ContentStudio

R1-02 to R1-05 now support **Ollama local** or explicit external LLM providers **Gemini / Groq / OpenRouter**. The default remains local-only; no provider is contacted automatically. Configure external accounts/models through **AI Models & Accounts** and put credentials in the encrypted Vault. Only official pinned HTTPS hosts are called; user-configurable endpoints are never used for authenticated remote LLM in this release.

Before any external LLM use, independently verify the provider account's plan and enable local environment settings:

```dotenv
CONTENTSTUDIO_REMOTE_LLM_CONSENT=1
CONTENTSTUDIO_CONFIRMED_NO_BILLING_MODEL_IDS=<comma-separated internal provider_models.id>
```

`free_unverified` is only a *user-entered* metadata class. **Do not** list a model as no-billing unless you independently verified the account cannot incur charges. Explicitly billable models additionally require a verified per-call cost cap in `CONTENTSTUDIO_VERIFIED_LLM_PRICE_CAPS_JSON` (integer micro-USD, internal model ID) and the existing human **R0-13 job-specific paid approval**. Missing pricing/approval means no outbound billable call. Actual invoices can differ; no cost guarantee.

Free-only account fallback is restricted to the same provider and actual model, with individually confirmed non-billable entitlements; local usage counters update only after acknowledged responses. Paid failed/uncertain requests are **not** automatically resent. Job progress uses the existing SQLite queue and SSE.

**Verification:** 468/468 automated tests PASS with HTTP provider mocks; live services, Windows, Fastify HTTP and React build remain unverified (environment lacks dependencies). See `docs/TEST_REPORT_R107.md`.

### R2-01 — Scene Builder (offline engineering milestone)
From **Video → Nội dung → Bản chuẩn & Duyệt**, explicitly approve the Master Script. In the **Scenes** tab, click **Tự động chia scene**, adjust the proposals, then **Lưu Scene & Phiên bản**. The backend preserves every source character, prevents overwrite of plans with generated assets, and keeps immutable revision history. Estimated durations are not actual TTS audio durations.

For an independent backend/core check (without AI keys/GPU): `npm run test:r201`. UI requires React/Vite dependencies; Windows/browser validation is still pending.


## R2-04 — Piper/VieNeu local voice and manual fallback (offline code, 2026-10-15)

In **Video → Scenes → Voice TTS**, select `Edge`, `piper` or `vieneu`. The local choices appear **only after** configuring a local synthesis bridge. Select an optional explicit Edge→local fallback to use Piper or VieNeu if Edge fails; choosing Edge still requires consenting to its online data transfer for that batch. Local-only voice generation needs no remote consent. Never auto-switch to a paid provider.

To configure a local server, set `CONTENTSTUDIO_PIPER_TTS_URL=http://127.0.0.1:8111/synthesize` or `CONTENTSTUDIO_VIENEU_TTS_URL=http://127.0.0.1:8112/synthesize`, optionally `..._TTS_VOICE` and `..._TTS_BODY_FORMAT=json|text`, before starting the API. The service must be operated/installed separately and return real WAV/MP3 bytes. Check `docs/R204_LOCAL_TTS_CONTRACT.md` for the exact HTTP contract and Windows runbook. Neither Piper nor VieNeu native model is bundled or installed automatically.

**Validation:** 540/540 offline Node tests PASS, including a local HTTP fixture and real FFprobe WAV inspection. No live Piper/VieNeu/Edge synthesis, full Fastify/Vite/browser build, Windows or production video render is confirmed. See `docs/TEST_REPORT_R204.md`.


### Latest R2-06 (2026-10-15)

Asset SHA content registry, immutable revisions, scene-selective read-only regeneration planner, non-destructive file reconciliation and guarded manual-image promotion are implemented offline. **574/574 tests PASS**; web build requires installing Vite dependencies, Windows/GPU/live providers remain unverified. See `docs/R206_ASSET_REGISTRY_CONTRACT.md` and `docs/HANDOFF.md`. **Next R2-07.**


### Latest implementation: R2-11
Selective voice/image regeneration per scene (new version on explicit click), verified previous version restoration and request-key replay protection. Read `docs/HANDOFF.md`, `docs/R211_SELECTIVE_REGEN_CONTRACT.md`, `docs/TEST_REPORT_R211.md`. `npm run test:r211` and `npm run test:all` verify the offline implementation; browser build requires Vite installation. Next original task R2-12.

### R2-12 — Quota & Fallback Monitoring (offline milestone, 2026-10-15)

Open **AI Models & Accounts → 6 · Giám sát quota & chuyển tài khoản** to view local per-account/model usage/held units, 90%-threshold alerts, paid-approval guidance and recorded **successful** equivalent free LLM account switches. Viewing the dashboard never calls an AI provider or grants authorization. API: `GET /api/providers/monitor?limit=20` (authenticated, read-only). The quota ledger is an internal estimate/observation, **not a live provider billing balance**; unknown always stays unknown. Fallback telemetry currently covers successful equivalent remote *free LLM* switches only (not TTS/video and not attempted/failed switches). Existing R0-13 paid approval must still be granted explicitly for any paid job.

Engineering verification: `npm run test:r212` 15/15, `npm run test:all` 673/673, `npm run check`, `npm run typecheck:sdk`, negative-control PASS. Production web build currently BLOCKED: Vite not installed. Windows, browser, real provider quotas and 30–40-minute tests remain open. Next original task R2-13. Details in `docs/R212_PROVIDER_MONITOR_CONTRACT.md`, `docs/TEST_REPORT_R212.md`, `docs/HANDOFF.md`.


### R2-13 — Original R2 offline QA checkpoint (2026-10-15)

All **13/13 original R2 code/test tasks** have offline verification; last task R2-13 adds a 53-scene/106-asset crash/retry/failure regression with **15/15 focused; 688/688 project tests**. Reproduce with `npm run test:r213`, `npm run test:all`, `npm run readiness:r213`. The readiness snapshot deliberately reports release **NOT READY** until target Windows/browser/Fastify, native TTS/ComfyUI, actual disk-full, quota/429 and 30–40-minute end-to-end media export have been validated. Vite is not installed in this offline workspace. The R2-EXT render/timing features are **still planned**. Agent resume map: `docs/HANDOFF.md`; QA contract: `docs/R213_INTEGRATION_ACCEPTANCE.md`. Next task: R2-EXT-01.


### R2-EXT-01 — Engine-neutral composition snapshot (2026-10-15)
Build/update guide: `docs/R2EXT01_COMPOSITION_CONTRACT.md`; versioned schema: `docs/contracts/composition-v1.schema.json`. Use authenticated POST preview and explicit digest-pinned publish operations; no paid calls or renderer are executed. Tested offline only; release gate remains open.

### R2-EXT-02 — FFprobe-measured voice timing (2026-10-15)
Existing composition v1 preview/publish remains unchanged. For an opt-in frame-accurate v2 **scene-level** caption manifest use authenticated `POST /api/videos/:id/composition/timing/preview` with optional `{ "tailPaddingMs": 250 }` (0–5000); inspect blockers and then publish using `POST /api/videos/:id/composition/timing/revisions` with the returned digest and video rowVersion. No AI provider calls, MP4 export, or fabricated word timestamps. FFprobe must be installed to create ready v2 snapshots. Check `docs/R2EXT02_TIMING_CONTRACT.md`; reproduce `npm run test:ext02` (14) and `npm run test:all` (714). Windows/browser/real model and MP4 gates remain open. **Next:** EXT-03 real renderer benchmark.

### R2-EXT-03 — Render engine POC protocol (pending real engine runs)
`spikes/EXT-03/README-R2EXT03.md` describes the fair Remotion vs HyperFrames benchmark (3 workloads × 3 repeats per engine). `npm run test:ext03` verifies fixtures; `npm run poc:ext03:prepare` writes deterministic measured manifests and explicit NOT_RUN evidence without network/API calls. **No engine was rendered in this environment**: npm registry inaccessible. Do not infer a winner from the FFmpeg-only baseline. Before EXT-04, install the engines on a connected machine, run both actual CLIs, inspect visual/audio and verify licensing. EXT-02 composition-v2 remains the authoritative product timing contract.


## IA-01 — Five-scene actual MP4 acceptance (2026-10-16)
Run `npm run test:acceptance`, `npm run acceptance:five-scenes` and optional `npm run acceptance:long-plan`. The short fixture uses 5 local PNG/WAV samples and renders a **1080×1920 30fps/429-frame H264/AAC MP4** through the real Composition v2 + SP-04 queue (temporary by default; pass `--output=` to preserve it); 300-scene 36.33-minute case validates the **plan only**. UI/Fastify need npm dependencies unavailable in the current Linux authoring environment. Actual Windows/browser/live AI/35minute MP4/EXT03 comparison still unverified. `docs/IA01_INTEGRATION_ACCEPTANCE.md` is authoritative for release gates.


### R3-11 Portable Project ZIP
Export an approved Composition v2 from Timeline using **Export Project ZIP**. ZIP64 STORE bundles per-scene voice/visual, `script.txt`, `subtitles.srt`, `timeline.json`, `manifest.json` with SHA-256; no credentials or absolute paths. Browser File System Access streams large archives, fallback downloads are capped at 100 MiB. See `docs/R311_PROJECT_ZIP_CONTRACT.md`. No native re-import, Windows or >4GiB acceptance yet.

### R3-12 Render Drawer checkpoint
Use Timeline > Render Drawer: approve Composition v2, select HyperFrames (preferred) or explicitly FFmpeg; select source/720p/1080p, wait for read-only preflight, enqueue. Progress shows measured scenes only and a revision badge; output N remains available if timeline advances. See `docs/R312_RENDER_DRAWER_CONTRACT.md`. Not production-accepted on Windows/HyperFrames CLI.

### R3-13 / R3-14 current checkpoint

Local render disk/crash safety and evidence-based release gate; see `docs/R313_R314_HANDOFF.md`. Run `npm run test:r313-r314` and `npm run acceptance:r314` (not a release certificate). Real HyperFrames and Windows/35-minute acceptance remain **NOT_READY**.

### R4-01 Selective Channel Preset Sync
From a video’s **Cấu hình video** page, click **So sánh preset mới nhất**, tick only fields to update, preview downstream impact, then apply explicitly. An updated channel preset does not change existing videos. No AI or render jobs start during this operation. See `docs/R401_PRESET_DIFF_CONTRACT.md` and `docs/R401_TEST_REPORT.md`.

## R4-02..08 stabilizing bundle
See `docs/R402_R408_HANDOFF.md`. Local CLI backup, draft subtitles and post-mix audio are incremental; still NOT_READY for production without Vite, HyperFrames and Windows E2E acceptance.


## Latest release checkpoint — FI-03
See `docs/FI03_IMPLEMENTATION_AND_LIMITS.md`. Windows staged setup: `tools/FI03-Windows-Setup.ps1`. HyperFrames is primary; this Linux environment cannot install npm dependencies or prove real HyperFrames/Windows rendering. Release **NOT_READY**.

### FI-04-04 — genuine HyperFrames acceptance (operator-only)
The local primary renderer remains **HyperFrames 0.8.159**. After Windows lock review, `npm ci` and the FI04 setup, run `npm run acceptance:fi0404:inspect`, then explicitly `tools/FI04-Hyperframes-Acceptance.ps1 -Run`. Real queue + 5 scenes + 10 Vietnamese subtitle cues + selected local music + MP4 H264/AAC QA are required; automatic FFmpeg substitutes do not pass. See `docs/FI0404_CONTRACT.md` and `docs/FI0404_HANDOFF.md`. This cannot certify 35-minute video or Windows UI by itself.
