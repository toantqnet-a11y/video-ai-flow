# VIDEO AI FLOW / CONTENTSTUDIO — DEVELOPMENT EXECUTION PLAN & TASK BREAKDOWN
**Phiên bản:** v3.0 · **Ngày:** 13/10/2026 · **Trạng thái:** PO scope approved; technical feasibility & ADR pending; code chưa triển khai.
**Nguồn:** PRD v2, EP01–EP13 Detailed Refinement, Cross-Epic Technical Baseline v1, PO Decision Pack v1, Development Roadmap v1. Tài liệu này là bản supersede về _phân kỳ và ưu tiên_ khi xung đột với roadmap v1.

## 0. Executive decision: có thể bắt đầu phát triển chưa?
**Có thể bắt đầu ngay** với S0/R0, không còn câu hỏi PO chặn thiết kế luồng nghiệp vụ. Chưa thể cam kết image/TTS production hoạt động trên máy chưa diagnostic, chưa thể gọi toàn bộ MVP “Ready for Development” khi ADR/OpenAPI/migration và benchmark chưa chốt. Đây là rủi ro kỹ thuật cần spike, **không yêu cầu PO phê duyệt lại**.

### 0.1 Bảng quyết định PO đã khóa
| ID | Quyết định PO (13/10/2026) | Hệ quả triển khai |
|---|---|---|
| PO-01 | A: Tự generate+score+retry tối đa 2 → **dừng duyệt Master Script** → auto tạo scene/asset → **xác nhận Render** | Approval gate persisted, UI notification; downstream không dispatch trước Approve. |
| PO-02 | Windows làm nền tảng chính (mặc định target **Windows 11**, Windows 10 chỉ sau test) | PowerShell launch; paths/permissions/FFmpeg và smoke trên Windows. |
| PO-03 | Ưu tiên miễn phí/local, trả phí OFF theo mặc định; **cảnh báo/xin phép trước khi chuyển sang trả phí** | Hard paid authorization gate + price/budget/data-scope; log/notify khi fallback đã duyệt. |
| PO-04 | Chấp thuận khuyến nghị **có điều kiện phần cứng** | Diagnostic GPU/VRAM; có GPU phù hợp → ComfyUI; không phù hợp → remote user-configured hoặc import ảnh; không tự động gửi remote. |
| PO-05 | A: Edge TTS ưu tiên, custom local/Piper/VieNeu nếu được kiểm chứng | Không quảng cáo bảo đảm miễn phí/khả dụng vĩnh viễn. |
| PO-06 | **B: kéo thả ngay MVP** | Chuyển drag reorder + trim visual + zoom/snap + waveform từ R4/P1 lên **R3/P0**; lập test UX & perf. |
| PO-07 | A: khoảng 18s/scene, chỉnh 12–25s, ảnh + Ken Burns | ~117 scene/35 phút; 500-scene dùng stress test. |
| PO-08 | A: MP4 H264/AAC, 16:9 720/1080p 30fps, SRT rời, ZIP thủ công cho CapCut | Không cam kết native CapCut project; burn-in subtitle P1. |
| PO-09 | A: soft delete; giữ asset revisions; manual cleanup sau | Không auto purge; bảo vệ refs history/render snapshots. |
| PO-10..22 | Chấp thuận toàn bộ defaults trong Decision Pack | 80/100 cảnh báo, 3 LLM song song, 145 WPM, không render asset thiếu, explicit inspector save, desktop editor, v.v. |

**Làm rõ paid fallback (giải pháp bắt buộc):** hệ thống không gọi AI trả phí trước khi người dùng cho phép rõ ràng account/model, loại dữ liệu gửi ra ngoài, phạm vi kênh/video và mức chi tối đa. Lần đầu gặp switch từ free/local sang paid: job vào `waiting_paid_approval`, giao diện hiển thị nhà cung cấp, model, giá ước tính (nếu có), hạn mức và tác động; lựa chọn **Cho phép theo lần / Cho phép trong ngân sách / Hủy**. Nếu chi phí không xác định, **không auto-approve**. Trong phạm vi budget đã cấp có thể tự switch và bắt buộc phát notification+audit, vượt budget thì tạm dừng. Không dùng nhiều account để né provider-level limit. Remote transfer và paid consent là hai phép cho riêng biệt.

### 0.2 Hạng mục còn mở — ai quyết, có block không?
| Vấn đề | Owner | Đang chặn | Cách xử lý/đầu ra |
|---|---|---|---|
| GPU/VRAM, CPU/RAM, đĩa của máy Windows | Tech Lead/OPS | Chỉ chặn provider ảnh/video AI local thực, không chặn R0 | SP-01/SP-03 diagnostics + chọn ComfyUI/remote/import. |
| Edge TTS và local TTS xuất file thật, quyền sử dụng | Tech Lead | Chặn QA R2 | SP-02 reproducible voice smoke + fallback. |
| SQLite durable DAG, staging, fencing | Tech Lead/DB | Chặn scheduler production | SP-04 + ADR-02/06, crash tests. |
| Timeline kéo thả 500-scene/chỉnh timing | FE Lead/QA | Chặn sign-off R3 | SP-05, perf budget freeze, interaction spec. |
| Loopback/auth/OS vault threat model | Tech Lead/Security | Chặn merge secrets API | SP-06 ADR-04/09. |
| ADR render timing/codec/filter, API/DB versioning | Tech Lead+QA | Chặn contract và release gate | ARC-01, OpenAPI v1, migrations, renderer benchmark. |
| Số lượng dev/QA, máy benchmark, lịch sprint | Project Lead | Chặn ngày giao/estimate chính xác | Estimate sau S0; bảng capacity/template ở §7. |

## 1. MVP acceptance contract
**Hành trình người dùng:** Kênh → chọn/tạo Video → Brief → Generate outline/chapter đa-model → AI Judge/Retry → duyệt bản chuẩn → Split scene → tạo Voice/Hình theo queue → Editor 4 track (có kéo thả/zoom/trim/waveform) → xác nhận Render → MP4 + SRT + ZIP.

**P0 bắt buộc:** Windows local-first; SQLite và filesystem, nhiều tài khoản AI, paid safety gate, kênh preset revisions, content dài 30–40 phút, voice/image thực + import thủ công dự phòng, resumable queue, selective regen, 4 lanes+drag, output 35 phút đã verify. **P0 bổ sung theo yêu cầu PO 13/10/2026:** tạo **AI video clip thật** (ít nhất 1 provider có thể chạy qua local ComfyUI/Wan trên GPU phù hợp hoặc approved remote API), T2V/I2V capabilities + hybrid per-scene mode, file provenance, paid/privacy guard, audio/timing fit, fallback import/ảnh; **không cam kết phủ 100% video bằng clip AI miễn phí.** **Không P0:** native CapCut project, voice cloning, mobile editor, burn-in subtitle, ducking nhạc nâng cao, cloud multi-user.

**Quy tắc thanh toán:** paid OFF default kể cả khi người dùng đã thêm API key của model trả phí; cấm chuyển local→remote nếu chưa có riêng quyền chia sẻ dữ liệu. `COST_UNKNOWN` hoặc vượt cap => pause. Không tự suy đoán giá token/provider; lấy giá hiển thị từ catalog người dùng cấu hình có timestamp, đánh dấu ESTIMATED và chốt theo usage observed khi có.

## 2. Kiến trúc đích & module ownership
```text
React/Vite + Zustand + Query + virtual timeline (Windows Chrome)
   │ REST /api/v1 + SSE /events; JSON Schema/OpenAPI
Fastify loopback 127.0.0.1
   ├─ EP01 Channel / EP10 PresetResolver+Revisions / EP03 Video
   ├─ EP04 Script / EP05 Scenes / EP07 SceneMutation
   ├─ EP02 ProviderRegistry+Quota / EP12 Scheduler+Routing+Outbox
   ├─ EP13 AI Video Provider (T2V/I2V) → local ComfyUI/Wan; optional paid adapters
   ├─ EP06 AssetStore+TTS/Image adapters / EP11 TimelineUI
   ├─ EP08 RenderService→FFmpeg / EP09 SQLite+Vault+Filesystem
   └─ SQLite WAL + {DATA_ROOT}/projects/{videoId}/...
```
FE không dùng `localStorage` làm nguồn production. P0 có **một** scheduler, **một** scene mutation API, **một** timeline engine, **một** bảng jobs canonical. Render chỉ đọc immutable manifest; file staging+checksum+guarded promote. Windows path được resolve từ DATA_ROOT, không nhận absolute path từ UI.

**Interface freeze S0/R0:** `/api/v1`; error `{error:{code,message,traceId,details}}`; mutations `If-Match` dùng `412 PRECONDITION_FAILED`; idempotency cho create/video/batches/render; backend authoritative statuses; SSE `Last-Event-ID` và GET reconciliation. Specific schema version là `1` của nội bộ, nâng version bằng migration, không gắn business IDs trong đường dẫn files.

## 3. Phân kỳ vertical slices và điều kiện release
| Phase | Demo outcome/exit criteria | Gates |
|---|---|---|
| **S0** | Có báo cáo Windows, **AI-video model smoke & hardware viability** + lựa chọn provider khả thi + ADR/API/schema; không chờ GPU info từ PO để làm mock. | Technical spikes + approved blocker ADRs |
| **R0** | Đã tạo 2 kênh, 2 video snapshots khác nhau, secrets an toàn, paid approval không bị bypass. | G0, G1, G11 |
| **R1** | Video 35 phút có outline/chapter/drafts/judge/retry ≤2 và một Master Script được PO duyệt. | G2 |
| **R2** | Scene 18s mặc định, có file voice/hình thực **và tối thiểu 1 AI video clip tạo thật nếu provider hợp lệ**, queue durable, selective regen, paid/remote switching an toàn; manual clip fallback. | G3–G6 |
| **R3** | Timeline 4 lane có drag/reorder, trim/zoom/snap/waveform, preview đồng bộ **mixed image+AI clip+imported clip**; xuất 35 phút H264/AAC MP4 + SRT + ZIP. | G7–G10, G12–G14 **và kéo thả** |
| **R4** | Provider AI Video API tùy chọn **Seedance/Google Veo paid**, local model thay thế, tăng độ tin cậy; không chặn MVP nếu adapter chính đã được kiểm chứng. | P1 + full regression |

**Thay đổi roadmap v1:** `US-11.4` drag reorder/trim/zoom/snap, `US-11.5` waveform thành **P0/R3** theo PO-06. R3 không pass nếu chỉ hiển thị track mà chưa thực hiện kéo thả thật. Music lane P0 hiển thị và có thể import nhạc thủ công; mixing P1. P0 trim là trim vùng hiển thị media/hold, không được cắt lời thoại hoặc xê dịch timing trái chính sách audio-authoritative.

## 4. Development tasks — Epic → User Story → Task + AC
**Ước lượng:** XS/S/M/L/XL là độ phức tạp tương đối, **không phải story point hoặc số ngày**. Chủ sở hữu ghi vai trò; chưa phân công tên người. Dependency dùng Task ID. Mọi task phải có unit/contract/integration test phù hợp ngoài AC ngắn dưới đây; AC chi tiết xem EPxx Refinement.

### S0 — Technical proof & design freeze (bắt đầu ngay)
**Exit:** Có báo cáo Windows + lựa chọn provider khả thi + ADR/API/schema cần thiết; không chờ GPU info từ PO để làm mock.

#### SP-01 — Khảo sát Windows + FFmpeg · P0 · BE+OPS · M
**Ref:** EP09/EP08 · **Phụ thuộc:** Không.  
**UI/BE/deliverable:** Diagnostic thu thập Windows, CPU/RAM/GPU/VRAM, disk, FFmpeg path/encoders; render mẫu 5 và 35 phút từ fixture.  
**API/DB/contracts:** GET /system/diagnostics; benchmark.md.  
**Acceptance/test:** Biên bản ghi máy, encoder, thời gian, RAM, ổ đĩa; ffprobe xác nhận file 35 phút.

#### SP-02 — Spike TTS lưu file thật · P0 · BE · M
**Ref:** EP06/EP02 · **Phụ thuộc:** Không.  
**UI/BE/deliverable:** Edge TTS tạo file vi-VN, kiểm tra độ bền giọng; probe Piper/VieNeu custom local endpoint.  
**API/DB/contracts:** TTSAdapter smoke; provider capability matrix.  
**Acceptance/test:** Có ít nhất một đường xuất voice thành audio file thực; failure/fallback được chứng minh; không gọi browser speech là output.

#### SP-03 — Tự phát hiện GPU và lựa chọn ảnh · P0 · BE+OPS · M
**Ref:** EP06/EP09 · **Phụ thuộc:** SP-01.  
**UI/BE/deliverable:** Nếu đủ GPU thử ComfyUI; nếu không kiểm chứng remote provider do user cấu hình + import thủ công.  
**API/DB/contracts:** ImageAdapter capabilities + diagnostic result.  
**Acceptance/test:** Có đường tạo/import ảnh thực; chi phí, latency, giới hạn được báo rõ; chưa có GPU không chặn UI/mock.

#### SP-04 — Spike job durable/fencing · P0 · BE+DB · L
**Ref:** EP12/EP09 · **Phụ thuộc:** Không.  
**UI/BE/deliverable:** Chạy 100 job giả lập; kill/restart; kiểm tra lease/commit và event replay.  
**API/DB/contracts:** jobs/attempts/leases/outbox PoC.  
**Acceptance/test:** Không có hai active asset cùng logical version; resume không lặp tác vụ succeeded hợp lệ.

#### SP-05 — Spike timeline 500 scene · P0 · FE · M
**Ref:** EP11 · **Phụ thuộc:** SP-01.  
**UI/BE/deliverable:** Prototype virtualization, drag reorder, zoom, waveform và seek trên Chrome Windows.  
**API/DB/contracts:** timeline bench fixture 120/500 scene.  
**Acceptance/test:** Đo p95 seek, FPS, bộ nhớ, drag interactions; đặt perf budget theo máy đo.

#### SP-06 — Threat model localhost & vault · P0 · BE+QA · M
**Ref:** EP09 · **Phụ thuộc:** Không.  
**UI/BE/deliverable:** Thử Host/Origin/CSRF, endpoint SSRF, OS vault, logging redaction.  
**API/DB/contracts:** security checklist, negative tests.  
**Acceptance/test:** API key không xuất trong DB/log/SSE/ZIP; host/origin lạ bị chặn.

#### SP-VID-01 — Spike sinh clip AI video thực trên Windows · P0 · BE+OPS · L
**Ref:** EP13 US-13.2 · **Phụ thuộc:** SP-01,SP-03.  
**UI/BE/deliverable:** Probe ComfyUI workflow Wan2.2 I2V/T2V trên GPU Windows thực tế, xuất 1 file clip MP4 có thể ffprobe; đo VRAM/RAM/disk/time; xác định fallback nếu máy không đạt, kiểm tra license weights.  
**API/DB/contracts:** VideoCapability; benchmark-video.md; workflow schema/version/hash.  
**Acceptance/test:** Có chứng cứ output video AI **thật** hoặc báo BLOCKED_HW có giải pháp remote đã kiểm chứng; không lấy demo trên website làm smoke local.

#### ARC-01 — Chốt ADR + contracts skeleton · P0 · TL · L
**Ref:** Cross-epic · **Phụ thuộc:** SP-01,SP-04,SP-06.  
**UI/BE/deliverable:** Phê duyệt ADR01–12; state machines; event/error envelopes; single owner; initial ERD/OpenAPI stub.  
**API/DB/contracts:** ADR/*.md; /api/v1; migrations roadmap.  
**Acceptance/test:** FE/BE/QA xác nhận các contract chặn R0, các ADR chưa qua spike giữ pending và flag riêng.


### R0 — Foundation / Kênh / Video / Preset / Paid guard
**Exit:** Đã tạo 2 kênh, 2 video snapshots khác nhau, secrets an toàn, paid approval không bị bypass.

#### R0-01 — Monorepo Windows one-command · P0 · BE+FE+OPS · M
**Ref:** EP09 US-9.1 · **Phụ thuộc:** ARC-01.  
**UI/BE/deliverable:** pnpm workspace apps/web api; packages/contracts/domain/provider-sdk; env example; scripts dev.  
**API/DB/contracts:** GET /api/v1/system/health.  
**Acceptance/test:** Máy mới theo README chạy được UI+API một lệnh; app chỉ bind 127.0.0.1.

#### R0-02 — SQLite schema và migration v1 · P0 · DB+BE · L
**Ref:** EP09 US-9.1 · **Phụ thuộc:** R0-01.  
**UI/BE/deliverable:** WAL, FK, indices, migrations/seed/backup-before-destructive; DATA_ROOT.  
**API/DB/contracts:** tables channels/videos/presets/jobs/assets + core indexes.  
**Acceptance/test:** Restart không mất dữ liệu; upgrade fixture không orphan/corrupt.

#### R0-03 — Vault + loopback security · P0 · BE · L
**Ref:** EP09 US-9.2 · **Phụ thuộc:** SP-06,R0-01.  
**UI/BE/deliverable:** OS credential vault Windows, fallback encrypted passphrase; Host/Origin/CSRF, secrets redaction.  
**API/DB/contracts:** credential aliases; 403 ORIGIN_DENIED; secret-masked API.  
**Acceptance/test:** Không khóa plaintext trong DB, API, outbox, logs; negative security suite pass.

#### R0-04 — System diagnostic UI · P0 · BE+FE · M
**Ref:** EP09 US-9.3 · **Phụ thuộc:** SP-01,R0-01.  
**UI/BE/deliverable:** Thông báo FFmpeg/ffprobe, dung lượng, provider, CPU/GPU, test & hướng xử lý.  
**API/DB/contracts:** GET /system/diagnostics, /system/health.  
**Acceptance/test:** Thiếu FFmpeg/GPU hiển thị reason và fallback; không crash hoặc tự nhận provider là ready.

#### R0-05 — API shared SDK và revision · P0 · BE+FE · L
**Ref:** Cross-epic · **Phụ thuộc:** ARC-01,R0-01.  
**UI/BE/deliverable:** Zod/OpenAPI generator, typed client, error normalization, If-Match=412, idempotency keys.  
**API/DB/contracts:** /api/v1; standardized error {code,traceId}.  
**Acceptance/test:** Contract test rejects wrong payload/older revision; duplicate POST same key not duplicated.

#### R0-06 — Job persistence skeleton + SSE · P0 · BE+DB · L
**Ref:** EP12 US-12.1 · **Phụ thuộc:** R0-02,R0-05.  
**UI/BE/deliverable:** Canonical jobs DAG/outbox tables, event stream + GET reconciliation; mock workers.  
**API/DB/contracts:** GET /events; GET /jobs/:id.  
**Acceptance/test:** Reconnection no phantom completion; job state persists restart.

#### R0-07 — Provider/account registry · P0 · BE+FE · L
**Ref:** EP02 US-2.1 · **Phụ thuộc:** R0-03,R0-05.  
**UI/BE/deliverable:** Danh sách LLM/TTS/Image, keys references, capabilities and provider health; add/edit/test account.  
**API/DB/contracts:** GET /providers; POST /provider-accounts.  
**Acceptance/test:** Thêm nhiều account; key masked; disable account excludes routing.

#### R0-08 — Preset schema canonical + revision · P0 · DB+BE · L
**Ref:** EP10 US-10.3 · **Phụ thuộc:** R0-02,R0-07.  
**UI/BE/deliverable:** Versioned content/media/voice/render/model config with defaults and JSON schema.  
**API/DB/contracts:** channel_preset_revisions; POST /channels/:id/presets/revisions.  
**Acceptance/test:** Mỗi save tăng revision bất biến, validate schema, không lưu secret.

#### R0-09 — Kênh list/create/edit/archive · P0 · FE+BE · M
**Ref:** EP01 US-1.1 · **Phụ thuộc:** R0-08.  
**UI/BE/deliverable:** CH01/CH02 + empty/loading/error/confirm; soft delete.  
**API/DB/contracts:** GET/POST/PATCH/DELETE /channels.  
**Acceptance/test:** Tạo 2 kênh, lọc và lưu trữ; reopen/restart dữ liệu còn.

#### R0-10 — Cài đặt kênh Content/Character/Media · P0 · FE+BE · L
**Ref:** EP01 US-1.2,1.3 · **Phụ thuộc:** R0-08,R0-09.  
**UI/BE/deliverable:** CH03: tên/nhân vật cơ bản, writing/tone, prompt nền, image style/voice presets.  
**API/DB/contracts:** GET current preset; POST revision.  
**Acceptance/test:** Save/preview/reopen giữ cấu hình; required fields validation.

#### R0-11 — Video config snapshot resolver · P0 · DB+BE · M
**Ref:** EP10 US-10.1 · **Phụ thuộc:** R0-08,R0-09.  
**UI/BE/deliverable:** Immutable preset capture on new video; overrides path semantics.  
**API/DB/contracts:** video_config_revisions; GET /videos/:id/config.  
**Acceptance/test:** Tạo video A preset v1 và B preset v2; A không đổi khi channel cập nhật.

#### R0-12 — Danh sách video, tạo mới, mở lại · P0 · FE+BE · L
**Ref:** EP03 US-3.1,3.2,3.4 · **Phụ thuộc:** R0-11.  
**UI/BE/deliverable:** VD01–VD04: grid/list/filter/new video; stage status; reopen route.  
**API/DB/contracts:** GET/POST /channels/:id/videos; GET /videos/:id.  
**Acceptance/test:** 1 kênh nhiều video; create idempotent; mở video trở lại đúng stage.

#### R0-13 — Paid policy + approval guard · P0 · FE+BE · L
**Ref:** EP02/EP12 · **Phụ thuộc:** R0-07,R0-05.  
**UI/BE/deliverable:** Paid disabled mặc định; config allowance; dialog trước first paid call; rõ provider/model/budget/remote data; audit/notification.  
**API/DB/contracts:** route_policies; spend_approvals; POST /usage/approvals.  
**Acceptance/test:** Không phát paid request nếu chưa approve/budget; khi hết cap pause, cảnh báo; UNKNOWN cost yêu cầu duyệt thủ công.

#### R0-VID-01 — Thêm Video AI provider capability & configuration · P0 · BE+FE · L
**Ref:** EP13 US-13.1,13.2 · **Phụ thuộc:** R0-07,SP-VID-01.  
**UI/BE/deliverable:** AI Models thêm nhóm Video AI: ComfyUI Wan (local), Seedance API, Gemini Veo API (disabled), Google Flow (import only). Badge paid/free verified/unknown/capability, cấu hình endpoint/mode, remote consent.  
**API/DB/contracts:** GET /video-providers/capabilities; POST /video-providers/:id/test.  
**Acceptance/test:** Không gắn nhãn “Google Flow free API”; không gọi paid route/test generation trước approval; local endpoint handshake mock pass.

#### R0-14 — Mock providers & CI tests · P0 · QA+BE · M
**Ref:** Cross-epic QA · **Phụ thuộc:** R0-03,R0-05,R0-12.  
**UI/BE/deliverable:** Fixtures fake LLM/TTS/Image and FFmpeg, seeded SQLite, clean data root scripts.  
**API/DB/contracts:** test helpers; smoke suite G0,G1,G11.  
**Acceptance/test:** CI pass init/restart, snapshot v1/v2, secrets protection, no real API calls.


### R1 — Content Generation & Human Approval
**Exit:** Video 35 phút có outline/chapter/drafts/judge/retry ≤2 và một Master Script được PO duyệt.

#### R1-01 — Content brief UI + estimator · P0 · FE+BE · M
**Ref:** EP04 US-4.1,4.2 · **Phụ thuộc:** R0-12,R0-07.  
**UI/BE/deliverable:** CT01: topic/ideas/prompt; length words/minutes; WPM, style, up to 3 models.  
**API/DB/contracts:** POST /videos/:id/brief.  
**Acceptance/test:** 35min at 145WPM estimate 5075; validate invalid and remote consent.

#### R1-02 — Outline generator + chapter version · P0 · BE+DB · L
**Ref:** EP04 US-4.4 · **Phụ thuộc:** R1-01,R0-06.  
**UI/BE/deliverable:** Outline editable; chapter dependencies summaries, 800–1200 word targets and checkpoints.  
**API/DB/contracts:** POST /videos/:id/outline/jobs; chapters tables.  
**Acceptance/test:** Failed chapter resumes without replacing approved/succeeded chapters.

#### R1-03 — Generate 1–3 model song song · P0 · FE+BE · L
**Ref:** EP04 US-4.3 · **Phụ thuộc:** R1-02,R0-07.  
**UI/BE/deliverable:** LLM adapter candidates and comparison side-by-side, per-candidate errors.  
**API/DB/contracts:** POST /videos/:id/chapter-batches; drafts versions.  
**Acceptance/test:** 1 model fail vẫn giữ output model khác; max concurrent respects policy.

#### R1-04 — Judge score structured · P0 · BE+FE · M
**Ref:** EP04 US-4.5 · **Phụ thuộc:** R1-03.  
**UI/BE/deliverable:** Judge model, criterion scores, notes; invalid JSON guard and retry.  
**API/DB/contracts:** POST /drafts/:id/evaluations.  
**Acceptance/test:** Scores are model-generated not fabricated; missing scores display error.

#### R1-05 — Feedback retry + history/diff · P0 · BE+FE · L
**Ref:** EP04 US-4.6 · **Phụ thuộc:** R1-04.  
**UI/BE/deliverable:** Retry <=2 cycles automatic below 80/100 warning, manual rerun; immutable versions.  
**API/DB/contracts:** POST /drafts/:id/retry.  
**Acceptance/test:** Version N stays; max attempt enforced; no endless loops.

#### R1-06 — Approve master script gate · P0 · FE+BE · M
**Ref:** EP04 US-4.7 · **Phụ thuộc:** R1-05.  
**UI/BE/deliverable:** CT05 compare, choose canonical, user explicit Approve; lock revision, UI state.  
**API/DB/contracts:** POST /videos/:id/master-script/approve.  
**Acceptance/test:** Jobs downstream cannot start before approval; once approved script content immutable.

#### R1-07 — Persist LLM jobs & retries · P0 · BE · L
**Ref:** EP12 US-12.1 · **Phụ thuộc:** R0-06,R1-02.  
**UI/BE/deliverable:** DAG chapter candidates/judge/retry jobs with bounded backoff/restart safety.  
**API/DB/contracts:** job_dependencies, attempts, SSE.  
**Acceptance/test:** Kill/restart in middle of chapter, no lost versions/no duplicate active master.

#### R1-08 — Script dài & policy regression · P0 · QA · M
**Ref:** EP04/QA · **Phụ thuộc:** R1-06,R1-07.  
**UI/BE/deliverable:** Fixture 5k+ words, Vietnamese continuity, 429, judge malformed JSON.  
**API/DB/contracts:** G2 E2E smoke suite.  
**Acceptance/test:** Approval is hard gate; 2 retry cap; local/remote paid policy respected.


### R2 — Scene / Voice / Image / Queue / Quota
**Exit:** Scene 18s mặc định, có file voice/hình thực **và clip AI video thật khi provider đủ điều kiện**, có queue durable, selective regen, paid/remote switching an toàn.

#### R2-01 — Vietnamese sentence split + mapping · P0 · BE · L
**Ref:** EP05 US-5.2,5.3 · **Phụ thuộc:** R1-06.  
**UI/BE/deliverable:** Regex tokenizer with abbreviation/URL/ellipsis rules; 18s default, config 12–25; split preview.  
**API/DB/contracts:** POST /videos/:id/scenes/split-preview.  
**Acceptance/test:** Span reconstruction matches master normalized source; no lost or repeated words.

#### R2-02 — Scene builder & prompts · P0 · FE+BE · L
**Ref:** EP05 US-5.1,5.4 · **Phụ thuộc:** R2-01.  
**UI/BE/deliverable:** SC01–SC04 scene list, media type IMAGE/MANUAL/CLIP, AI imgPrompt, locked overrides.  
**API/DB/contracts:** POST /videos/:id/scenes/commit; PATCH /scenes/:id.  
**Acceptance/test:** Wrong media and missing prompt identified before enqueue; manual prompt preserved.

#### R2-03 — Edge TTS adapter & voice metadata · P0 · BE · L
**Ref:** EP06 US-6.2 · **Phụ thuộc:** SP-02,R0-07.  
**UI/BE/deliverable:** Edge file output, HoaiMy/NamMinh if available, probe audio, retry errors.  
**API/DB/contracts:** TTSAdapter; asset_versions kind=VOICE.  
**Acceptance/test:** Vietnamese output WAV/MP3 playable, duration verified; failure classified.

#### R2-04 — Local TTS endpoint fallback · P0 · BE · M
**Ref:** EP06 US-6.2 · **Phụ thuộc:** SP-02,R2-03.  
**UI/BE/deliverable:** Custom endpoint contract (Piper/VieNeu adapter where spike validates), health+headers+file.  
**API/DB/contracts:** GET provider voices/health; audio schema.  
**Acceptance/test:** When Edge fails and policy allows fallback local generates file; no browser-only synthesis.

#### R2-05 — Image adapter conditional · P0 · BE · L
**Ref:** EP06 US-6.1 · **Phụ thuộc:** SP-03,R2-02.  
**UI/BE/deliverable:** ComfyUI if GPU passes diagnostic, else configured remote or manual image import; metadata/seed/style.  
**API/DB/contracts:** ImageAdapter; asset file validation.  
**Acceptance/test:** 100-sample pilot and deterministic unsupported diagnostics; manual import works if no provider.

#### R2-06 — Asset versions, hashes & safe promote · P0 · DB+BE · L
**Ref:** EP06 US-6.4 · **Phụ thuộc:** SP-04,R2-03,R2-05.  
**UI/BE/deliverable:** Staging, checksum, atomic rename, voice/image hashes separately, selection fencing.  
**API/DB/contracts:** asset_versions, scene_asset_selections.  
**Acceptance/test:** Changed image prompt stales only image; old output never overwrites revised scene.

#### R2-07 — Scheduler DAG + recovery + controls · P0 · BE · XL
**Ref:** EP12 US-12.1 · **Phụ thuộc:** SP-04,R1-07,R2-06.  
**UI/BE/deliverable:** SQLite durable job scheduler, p-queue, deps, leases; pause/resume/retry/cancel.  
**API/DB/contracts:** POST /job-batches/:id/pause|resume|cancel.  
**Acceptance/test:** 100+ job crash/restart preserves valid completed assets; cancellation best effort.

#### R2-08 — Quota truth & usage ledger · P0 · BE+FE · M
**Ref:** EP02 US-2.2,2.6 · **Phụ thuộc:** R0-07,R2-07.  
**UI/BE/deliverable:** Confirmed/estimated/unknown/local, history/provider limits, near-exhausted notifications.  
**API/DB/contracts:** quota_observations, usage_ledger.  
**Acceptance/test:** Never show made-up remaining quota; timestamp/evidence displayed.

#### R2-09 — Provider routing + safe paid fallback · P0 · BE · XL
**Ref:** EP12 US-12.3 · **Phụ thuộc:** R0-13,R2-07,R2-08.  
**UI/BE/deliverable:** Capability, privacy, rate limit, Retry-After, permission/budget enforcement and pause gates.  
**API/DB/contracts:** route_policies, spend_approvals, job_attempts.  
**Acceptance/test:** Unapproved paid fallback blocked with actionable banner; approved switch logs reason/cost.

#### R2-10 — Asset workspace + queue progress · P0 · FE+BE · L
**Ref:** EP06 US-6.1,6.3 · **Phụ thuộc:** R2-06,R2-07.  
**UI/BE/deliverable:** AS01 batch buttons + scene image/audio players, status, error and retry action.  
**API/DB/contracts:** POST asset-batches; GET scene assets; SSE.  
**Acceptance/test:** User can see progress each scene and reopen after restart.

#### R2-11 — Selective regen and revert · P0 · FE+BE · M
**Ref:** EP06 US-6.4,6.5 · **Phụ thuộc:** R2-06,R2-10.  
**UI/BE/deliverable:** Regenerate voice/image separately, maintain previous verified versions; undo activation.  
**API/DB/contracts:** POST /scenes/:id/assets/regenerate/activate.  
**Acceptance/test:** Regen one scene has zero new calls for unaffected assets/scenes.

#### R2-12 — Quota and fallback monitoring UI · P0 · FE+BE · M
**Ref:** EP12 US-12.2 · **Phụ thuộc:** R2-08,R2-09.  
**UI/BE/deliverable:** AI01/AI03/AI04 dashboard, account badges, cost-approval prompt and switch feed.  
**API/DB/contracts:** GET /quota-observations; GET /jobs.  
**Acceptance/test:** Provider near quota is visible, fallback event shows provider, consent and status.

#### R2-VID-01 — Video media policy per kênh/video/scene · P0 · DB+BE+FE · L
**Ref:** EP13 US-13.1 · **Phụ thuộc:** R0-08,R0-11,R2-02.  
**UI/BE/deliverable:** Hybrid/AI Video/ảnh/clip import, I2V/T2V settings và revision; voice vẫn authoritative.  
**API/DB/contracts:** video_media_policies; GET/PATCH /videos/:id/media-policy.  
**Acceptance/test:** Đổi scene #17 sang I2V không đổi #18 hay asset audio; video mới kế thừa preset kênh.

#### R2-VID-02 — ComfyUI/Wan I2V adapter local · P0 · BE · XL
**Ref:** EP13 US-13.2,13.3 · **Phụ thuộc:** SP-VID-01,R2-VID-01,R2-05.  
**UI/BE/deliverable:** Workflow executor HTTP/WS, submit/poll/validate/download video thật, cancel best effort, checkpoint & consistent seed/reference.  
**API/DB/contracts:** VideoProvider; POST /prompt, /ws, /history (ComfyUI local); video_clip_revisions.  
**Acceptance/test:** 1 I2V clip output local MP4 thật và ffprobe valid trên máy đủ GPU; không đánh dấu passed khi chỉ trả mock.

#### R2-VID-03 — Import clip & asset provenance · P0 · FE+BE · M
**Ref:** EP13 US-13.4 · **Phụ thuộc:** R2-06,R2-VID-01.  
**UI/BE/deliverable:** Local drag/drop MP4/MOV, validate/normalize metadata, source labels AI/import/image-motion, revision history.  
**API/DB/contracts:** POST /scenes/:id/video-clips/import; video_clip_revisions.  
**Acceptance/test:** Clip nguồn lỗi báo chính xác; path traversal blocked; nhập clip sau khi tạo ngoài Google Flow hợp lệ.

#### R2-VID-04 — Durable clip batch queue + selective regen · P0 · BE · L
**Ref:** EP13 US-13.3 · **Phụ thuộc:** R2-07,R2-VID-02,R2-VID-03.  
**UI/BE/deliverable:** I2V/T2V job DAG; concurrency GPU mutex; retry/backoff, crash-resume, only clip regen & provenance.  
**API/DB/contracts:** POST /videos/:id/video-clips/batches; POST /scenes/:id/video-clips/regenerate.  
**Acceptance/test:** 10 clip jobs crash after 6 valid → resume missing four; no duplicate published clips.

#### R2-VID-05 — Clip UI preview/batch/config & fallback · P0 · FE+BE · L
**Ref:** EP13 US-13.1,13.4 · **Phụ thuộc:** R2-VID-01,R2-VID-03,R2-VID-04.  
**UI/BE/deliverable:** Media inspector/video player; select media, batch generate, statuses, compare, use still fallback; explicit clip duration vs voice.  
**API/DB/contracts:** GET /scenes/:id/video-clips; activate revision; SSE.  
**Acceptance/test:** AI clip 6s + voice 18s visually warned; provider unavailable offers alternatives.

#### R2-VID-06 — Clip resource/cost estimate & paid/remote guards · P0 · BE+FE · M
**Ref:** EP13 US-13.6 · **Phụ thuộc:** R0-13,R2-08,R2-VID-01.  
**UI/BE/deliverable:** Before enqueue estimate #jobs/seconds/VRAM/known credits; paid and data consent, unknown price fail closed.  
**API/DB/contracts:** POST /videos/:id/video-clips/estimate.  
**Acceptance/test:** 0 paid outbound requests without explicit approval; not imply Flow website credits are API quota.

#### R2-13 — Scene + 100+ asset failure suite · P0 · QA · L
**Ref:** EP05/06/12 QA · **Phụ thuộc:** R2-01,R2-07,R2-09,R2-11.  
**UI/BE/deliverable:** Vietnamese split, media validation, 429, disk full, restart, image provider missing.  
**API/DB/contracts:** G3–G6 automated tests.  
**Acceptance/test:** No source loss, no charged job replay when completed, no policy breach.


### R3 — Editor kéo thả + Render 35 phút + Export (MVP)
**Exit:** Timeline 4 lane có drag/reorder, trim/zoom/snap/waveform, preview đồng bộ cả ảnh/AI clip/clip nhập; xuất 35 phút H264/AAC MP4 + SRT + ZIP.

#### R3-01 — Scene mutation + inspector · P0 · BE+FE · L
**Ref:** EP07 US-7.1 · **Phụ thuộc:** R2-06,R2-02.  
**UI/BE/deliverable:** Text, voice, image prompt/effect save explicit, revision check and invalidate dependencies.  
**API/DB/contracts:** PATCH /scenes/:id; asset impacts API.  
**Acceptance/test:** Changing image prompt never triggers voice regen; dirty guard and conflict UI.

#### R3-02 — 4-track editor with virtualization · P0 · FE · XL
**Ref:** EP11 US-11.1 · **Phụ thuộc:** SP-05,R2-10.  
**UI/BE/deliverable:** Ruler/playhead, 4 lanes Media/Text/Voice/Music, navigator/inspector/preview layout.  
**API/DB/contracts:** GET /videos/:id/timeline, manifest.  
**Acceptance/test:** 120 scenes coherent, 500-scene stress loads without full DOM layout.

#### R3-03 — Sync playback seek preview · P0 · FE · XL
**Ref:** EP11 US-11.2 · **Phụ thuộc:** R3-02.  
**UI/BE/deliverable:** Single playback clock/audio, thumbnail/visual switching, subtitle overlays, seek.  
**API/DB/contracts:** timeline manifest, audio media API.  
**Acceptance/test:** Fast seek does not double-play voice; scene selected follows playhead.

#### R3-04 — Drag reorder scene & persist · P0 · FE+BE · XL
**Ref:** EP11 US-11.4 · **Phụ thuộc:** R3-02,R3-01.  
**UI/BE/deliverable:** Pointer/keyboard drag reorder within video, preview change, undo entry, drop validation.  
**API/DB/contracts:** PATCH /videos/:id/timeline If-Match.  
**Acceptance/test:** Drag scene 17 to 4 persists after refresh; both text/audio/image move as a unit.

#### R3-05 — Trim, zoom, snap usable · P0 · FE+BE · XL
**Ref:** EP11 US-11.4 · **Phụ thuộc:** R3-03,R3-04.  
**UI/BE/deliverable:** Zoom in/out, snapping; visual hold/clip trim but narration not cut; conflict boundaries.  
**API/DB/contracts:** timeline_revision with visual window/hold.  
**Acceptance/test:** Trim visual never cuts voice; invalid trim gives warning, persists after reload.

#### R3-06 — Voice waveform cache & UI · P0 · FE+BE · L
**Ref:** EP11 US-11.5 · **Phụ thuộc:** R3-03,R2-06.  
**UI/BE/deliverable:** Waveform generation/downsample cache; align to voice lane, zoom interactive.  
**API/DB/contracts:** GET /assets/:id/waveform; cache keyed audio hash.  
**Acceptance/test:** Waveform lines up with spoken audio/seek; 500-scene stress budget reported.

#### R3-07 — Timeline revisions undo/redo · P0 · FE+BE · L
**Ref:** EP07/EP11 · **Phụ thuộc:** R3-04,R3-05.  
**UI/BE/deliverable:** Immutable revision, keyboard shortcuts, dirty guard, action stack and optimistic locking.  
**API/DB/contracts:** PATCH /videos/:id/timeline; revisions.  
**Acceptance/test:** Undo/redo reorder/trim reversible; concurrent tab returns conflict not overwrite.

#### R3-08 — Immutable render manifest/cache · P0 · BE · XL
**Ref:** EP08 US-8.1,8.2 · **Phụ thuộc:** R2-06,R3-07.  
**UI/BE/deliverable:** Manifest captures asset IDs, timing/config versions, effect params; segmentHash and cache reuse.  
**API/DB/contracts:** render_snapshots, render-cache records.  
**Acceptance/test:** Edit after render starts does not mutate snapshot; one scene change rerenders one relevant segment.

#### R3-09 — FFmpeg segments and concat · P0 · BE+OPS · XL
**Ref:** EP08 US-8.1 · **Phụ thuộc:** SP-01,R3-08.  
**UI/BE/deliverable:** Cumulative-frame timing, Ken Burns images, audio mux, H264/AAC/30fps, verify with ffprobe.  
**API/DB/contracts:** RenderWorker + GET /renders/:id.  
**Acceptance/test:** 35-min MP4 valid and no narration truncated; failed partial output never marked done.

#### R3-10 — Subtitles SRT separate · P0 · BE · M
**Ref:** EP08 US-8.1 · **Phụ thuộc:** R3-09.  
**UI/BE/deliverable:** Export Unicode Vietnamese SRT with exact scene voice timing; no burn-in P0.  
**API/DB/contracts:** subtitle timing; /renders/:id subtitle ref.  
**Acceptance/test:** SRT parsable, no overlap unintended, file references manifest snapshot.

#### R3-11 — Asset ZIP export & manifest · P0 · BE+FE · L
**Ref:** EP08 US-8.3 · **Phụ thuộc:** R3-08,R3-10.  
**UI/BE/deliverable:** Stream ZIP64 assets voice/image/text/SRT/timeline.json, safe relative paths, checksums, UI.  
**API/DB/contracts:** POST /videos/:id/exports; GET /exports/:id.  
**Acceptance/test:** ZIP extracted verifies checksum, no credentials, manual CapCut import instructions.

#### R3-12 — Render drawer + progress · P0 · FE+BE · L
**Ref:** EP11 US-11.6 · **Phụ thuộc:** R3-09,R3-02.  
**UI/BE/deliverable:** In-editor render settings 720/1080p, preflight, SSE stage and failure/retry, output revision badge.  
**API/DB/contracts:** POST /videos/:id/renders; GET /renders/:id.  
**Acceptance/test:** Blocked stale asset CTA; progress honest; output N labelled after edits N+1.

#### R3-13 — Render recovery & disk safety · P0 · BE+QA · L
**Ref:** EP08/EP09/EP12 · **Phụ thuộc:** R3-09,R2-07.  
**UI/BE/deliverable:** Kill FFmpeg then restart; staging cleanup, disk preflight and validation.  
**API/DB/contracts:** job snapshot checkpoint, renders statuses.  
**Acceptance/test:** No half output marked complete; rerender uses valid cached segments.

#### R3-VID-01 — Mixed-media timeline with visual clip fit · P0 · FE+BE · XL
**Ref:** EP13 US-13.4,13.5 · **Phụ thuộc:** R3-03,R3-04,R2-VID-05.  
**UI/BE/deliverable:** Filmstrip/playback for real video clip, mute native audio by default, hold-last-frame/loop/concat, drag+trim visual, highlight source.  
**API/DB/contracts:** Timeline clip mapping + version; media revision.  
**Acceptance/test:** Clip 6s/voice 18s preview đúng timing, seek/snap và text/voice không bị ảnh hưởng.

#### R3-VID-02 — FFmpeg normalize AI/imported clips for render · P0 · BE · XL
**Ref:** EP13 US-13.5 · **Phụ thuộc:** R3-08,R3-09,R3-VID-01.  
**UI/BE/deliverable:** Normalize FPS/codec/aspect/timebase, clip loop/hold/concat, caching; render actual mixed MP4.  
**API/DB/contracts:** normalized clip segment cache keys.  
**Acceptance/test:** 35m mixed video with AI clips, voices untouched, SRT/ffprobe valid; one clip change rerenders only relevant segments.

#### R3-VID-03 — Hybrid 35-min AI clip+still render E2E · P0 · QA · L
**Ref:** EP13 QA · **Phụ thuộc:** R2-VID-06,R3-VID-02,R3-14.  
**UI/BE/deliverable:** Fixture ~120 scenes, ≥1 genuine AI video clip from enabled provider and remaining images/import; crash, consent, 6s+18s fit, perf/security.  
**API/DB/contracts:** V-01..V-15 evidence + Windows benchmark.  
**Acceptance/test:** Final file 30–40min playable, no voice crop, no paid requests without approval; actual AI clip evidenced separately.

#### R3-14 — 35-min drag-editor-render E2E · P0 · QA · XL
**Ref:** EP11/EP08 QA · **Phụ thuộc:** R3-03,R3-05,R3-06,R3-11,R3-13.  
**UI/BE/deliverable:** Windows Chrome drag/trim/zoom/waveform, 120 scenes typical/500 stress, render and re-render.  
**API/DB/contracts:** G7–G10,G12,G13,G14.  
**Acceptance/test:** 35min fixture accepted; reorder survives restart; voice preserved; cost guard enforced.


### R4 — P1: Backup / Preset diff / Job Center / Music
**Exit:** Tăng độ tin cậy và tiện ích vận hành, không chặn phát hành MVP trừ lỗi bảo mật/dữ liệu.

#### R4-01 — Preset diff + selective apply · P1 · FE+BE · L
**Ref:** EP10 US-10.2 · **Phụ thuộc:** R0-11,R2-06.  
**UI/BE/deliverable:** Compare channel current and video effective; select individual fields, impact preview.  
**API/DB/contracts:** POST /videos/:id/config/diff, apply.  
**Acceptance/test:** No implicit changes to existing videos; only selected fields stale.

#### R4-02 — Backup/restore verified · P1 · BE+FE · L
**Ref:** EP09 US-9.4 · **Phụ thuộc:** R3-11.  
**UI/BE/deliverable:** Snapshot DB and media with checksums, separate secrets, recovery preview UI.  
**API/DB/contracts:** POST /system/backups; restore flow.  
**Acceptance/test:** Restore recovers video and outputs; corrupted manifest refuses destructive overwrite.

#### R4-03 — Storage analyzer / manual cleanup · P1 · BE+FE · L
**Ref:** EP09 US-9.5 · **Phụ thuộc:** R2-06,R3-08.  
**UI/BE/deliverable:** Referenced/pinned files graph, cleanup preview, reclaim UI.  
**API/DB/contracts:** GET /system/storage; POST /system/storage/cleanup.  
**Acceptance/test:** Never deletes active/history/snapshot/referenced files; dry run exact.

#### R4-04 — Advanced Job Center · P1 · FE+BE · M
**Ref:** EP12 US-12.4 · **Phụ thuộc:** R2-07.  
**UI/BE/deliverable:** Filters by queue/video/account, retry failed in bulk, history pagination.  
**API/DB/contracts:** GET /jobs cursor; POST /jobs/:id/retry.  
**Acceptance/test:** 10k history records paged; failure cause no secrets.

#### R4-05 — Subtitle editor & burn-in · P1 · FE+BE · L
**Ref:** EP08 US-8.5/EP07 7.4 · **Phụ thuộc:** R3-10.  
**UI/BE/deliverable:** Text timing editor, optional .ass hard subtitles and font checks.  
**API/DB/contracts:** subtitle_overrides; renderer filter.  
**Acceptance/test:** Unicode glyphs correct; caption changes do not regen narration.

#### R4-06 — Simple background music mix · P1 · FE+BE · M
**Ref:** EP07 US-7.5 · **Phụ thuộc:** R3-09.  
**UI/BE/deliverable:** Choose file, level mix, voice retained, music loop/fade basic.  
**API/DB/contracts:** music track asset + render manifest.  
**Acceptance/test:** Voice intelligible, music does not replace narration; copyright user owns imported assets.

#### R4-07 — Character/style consistency · P1 · BE+FE · M
**Ref:** EP06 US-6.6 · **Phụ thuộc:** R2-05.  
**UI/BE/deliverable:** Fixed seed/reference prompt, channel style guide, batch manual review.  
**API/DB/contracts:** imgPrompt and provider metadata.  
**Acceptance/test:** Sample storyboard visually consistent enough for PO review.

#### R4-VID-01 — Seedance BytePlus official API adapter (opt-in) · P1 · BE · L
**Ref:** EP13 US-13.7 · **Phụ thuộc:** R2-VID-06,R2-VID-04.  
**UI/BE/deliverable:** Authorized async video-generation task submit/poll, download within URL TTL, usage/cost ledger, model capability checks.  
**API/DB/contracts:** BytePlus ModelArk adapter + docs/version pin.  
**Acceptance/test:** Tests with approved account & pricing snapshot, protected billing and secrets; no assumption of free API.

#### R4-VID-02 — Google Veo via Gemini paid API adapter (opt-in) · P1 · BE · L
**Ref:** EP13 US-13.7 · **Phụ thuộc:** R2-VID-06,R2-VID-04.  
**UI/BE/deliverable:** Gemini Veo official API, long-running job poll, per-second known cost, credit/approval policy; Flow UI import separate.  
**API/DB/contracts:** official Gemini Veo route, paid guard, usage ledger.  
**Acceptance/test:** Pricing shows not free, 0 paid calls before approval; video import from Flow independent.

#### R4-VID-03 — LTX/CogVideo alternate local workflow · P1 · BE · L
**Ref:** EP13 US-13.8 · **Phụ thuộc:** SP-VID-01,R2-VID-02.  
**UI/BE/deliverable:** Probe one further approved checkpoint/comfy workflow with quality/performance/licensing comparison, optional highlight planner.  
**API/DB/contracts:** VideoCapability with measured VRAM and supported modes.  
**Acceptance/test:** Optional path has actual file smoke/license check or marked unavailable; no phantom free tier.

#### R4-08 — Performance/security hardening + release packaging · P1 · QA+OPS · XL
**Ref:** Cross-epic QA · **Phụ thuộc:** R4-01,R4-02,R4-04.  
**UI/BE/deliverable:** Windows local installer/launcher optional, backup/restore, automated bench & regression.  
**API/DB/contracts:** CI runbook; release notes; diagnostics.  
**Acceptance/test:** Full regression green on target device; measured 120/500 scene budgets met.

## 5. Dependency/critical path và kế hoạch song song
```text
S0: Windows+FFmpeg ─┬─> Render POC ────────────────────────────┐
                   ├─> GPU choice ─> Image adapter ──┐        │
TTS spike ────────────────────────────> TTS adapter ─┤        │
Queue spike ─> JobService ──┬─> content jobs ─┐      ├─> Assets ─> Timeline ─> Render
                           └─> Asset jobs ───┼─> Scenes ─────┘       ↑       ↑
Channels/Preset ─> Video ─> Brief/Outline ─> Master approval ────┘       │
Paid guard+quota+privacy ────────────────────────────────────────────────┘
```
**AI Video path:** SP-VID-01 → R0-VID-01 → R2-VID-01/02/04/05/06 → R3-VID-01/02/03. Optional paid adapters R4-VID-01/02 không được dùng làm điều kiện miễn phí bắt buộc.

**Critical path khả dĩ:** S0 → R0 video+provider/job → R1 approved script → R2 verified voice+image+AI video+recovery → R3 playback/drag + FFmpeg → 35-min E2E. Paid approval và security là blocking cross-cutting acceptance, không để sau. Có thể chạy song song UI Channel/Video (sau schemas), adapter TTS/Image spikes và FFmpeg spike, timeline proof (fake manifest) và LLM compare (mock adapter).

## 6. Chiến lược QA, chứng cứ nghiệm thu và không hoàn thành giả
| Gate | Fixture | Bắt buộc chứng minh |
|---|---|---|
| G0/G1 | Kênh preset v1/v2, 2 video, restart | A giữ snapshot v1, B dùng v2, dữ liệu có persistence. |
| G2 | 35 phút/≈5075 từ, 5 chương, nhiều model | No lost chapters, judge/retry cap, approval gate. |
| G3 | Vietnamese abbreviations, URLs, punctuation | No source text missing/duplicated. |
| G4 | 100+ jobs; kill backend/restart | Completed validated outputs preserved, no duplicate active assets. |
| G5 | Edit narration #17/image #21 | Only intended dependent asset and segments stale/regen. |
| G6 | 429, bad key, quota UNKNOWN; paid provider available | No paid request before explicit approval; budget exhausted pauses; compliant fallback only. |
| G7 | 4 lanes 120 scenes, drag #17→#4, trim/zoom/waveform | Persist/order/audio alignment, undo, seek and preview work. |
| G8 | 35-min file H264/AAC 1080p/30fps with SRT | ffprobe-valid duration/audio; no clipping, no invalid artifact marked final. |
| G9 | Change one scene/transition only | Only related cached segments re-rendered. |
| G10 | ZIP large package | Checksums verified; no secrets; manual CapCut import usable. |
| G11 | Host/Origin/CSRF, path traversal, secret leakage | Blocked and redacted; DB secret vault references only. |
| G12 | 500 scenes, 10k historical jobs | Perf targets measured/frozen after SP-05 on target Windows. |
| G13/G14 | Kill FFmpeg; disk-full, invalid staging | Recover/repair via valid checkpoints; no incomplete output published. |
| **G15** | Windows local I2V actual clip | 1 clip **AI-generated thật** with logs/ffprobe; GPU mismatch correctly blocked and fallback documented. |
| **G16** | 35-min hybrid: AI clip + static/import | Timeline playback, audio 6s visual vs 18s voice fit, valid MP4; provider paid guard verified. |

**Benchmark protocol:** kiểm tra ffprobe video/audio/subtitle; đo A/V drift trên marker fixtures ở đầu/giữa/cuối, seek p95, memory peak, render time, disk footprint; báo máy cụ thể và pass/fail theo thresholds được chốt sau S0. Không tuyên bố 35 phút chạy tốt dựa trên clip demo 30 giây.

## 7. Execution management, estimation và sprint plan (tương đối)
**Chỉ định Sprint 0 + Sprint 1 trước**, không hứa ngày giao khi chưa có capacity/hardware. S0 dùng spikes và xác nhận blocker ADR. Mỗi sprint 2 tuần (đề xuất) lựa chọn task theo dependency + năng lực đội, không thực hiện mỗi Epic theo tuần cứng. Có thể 1 sprint chứa task nhiều release nếu độc lập.

| Batch | Sản phẩm/deliverable | Gate bàn giao |
|---|---|---|
| Sprint 0 (S0) | SP-01..06 + ARC-01; ADR/OpenAPI/db schema v1 trước merge feature | Approve technical assumptions. |
| Sprint 1..n (R0) | Startup/security/db + Channel/Preset/Video + paid guard | G0/G1/G11. |
| Sprint n+1.. (R1) | Outline/multi-model/judge/retry/master approval | G2. |
| Sprint sau (R2) | Scene/TTS/Image/asset cache/job recovery+paid/quotas | G3–G6. |
| Sprint cuối MVP (R3) | Editor drag/trim/zoom/waveform + render/export 35 phút | G7–G10/G12–G14. |
| Sau MVP (R4) | P1 backup/preset compare/music/subtitles/jobs/hardening | QA+PO re-prioritize. |

**Capacity template:** ghi mỗi developer availability (ngày/sprint), stack experience, total story-points baseline sau S0; mỗi task estimate nhỏ hơn 1 sprint nếu quá XL thì FE/BE/QA tách subtasks theo giao diện/API/test. S0 chọn thang Fibonacci 1/2/3/5/8/13 sau spike; không tự điền số giả. QA tự động hóa được ưu tiên trong cùng sprint với code.

**Suggested task status:** Backlog → Ready → In Progress → Code Review → QA → PO Review → Done; thêm Blocked: Technical/External Provider. Definition of Ready yêu cầu signed schema/UI/AC/contracts/test fixture + owner/estimate; DoD yêu cầu tests green, security no leaks, migration/restart proof, docs, demo and acceptance.

## 8. Rủi ro kiểm soát và xử lý yêu cầu mới
- **AI video generation:** video AI thực đã được bổ sung vào MVP (không chỉ Ken Burns). Wan/ComfyUI là ưu tiên khi GPU Windows đáp ứng; user có thể import Google Flow clip thủ công; Seedance và Veo API không được mặc định coi là free. Phạm vi full AI footage 35 phút chưa được phê duyệt; hybrid đảm bảo complete MP4.
- **Image generation trên Windows không GPU:** không hứa ComfyUI; fallback provider remote phải được cấu hình và được phép gửi prompt, hoặc ảnh import thủ công; đi qua UI diagnostic chứ không block khởi tạo kênh/video.
- **Edge TTS unofficial:** kiểm thử sản sinh file & voice catalog, không cam kết miễn phí vĩnh viễn; local endpoint cần health/auth contract và retry.
- **Chi phí trả phí:** có notification + hard consent/budget gate; model trả phí dù account có key cũng không tự chạy. Hết free quota không được hiểu là user đã mua dịch vụ.
- **Drag/trim ngay MVP:** đây là scope tăng so với roadmap trước; có thêm perf/interaction/error testing; không cắt voice chỉ vì trim visual.
- **Job/Render crash:** finished assets/checksum pin; cancel best-effort; sau Windows restart mới resume khi backend khởi động lại, không làm tác vụ lúc máy tắt.
- **CapCut:** P0 export ZIP+manifest/audio/images/SRT để import thủ công; project native bị hoãn.

## 9. Cổng duyệt còn lại và hành động tiếp theo (không cần hỏi lại PO)
1. **Tech Lead** thực hiện SP-01..06; chốt/ghi ADR-01..12 dựa trên kết quả, ưu tiên vault, queue, timing, endpoints và image fallback.
2. **FE+BE Lead** phân rã các task XL thành subtasks code/test đủ nhỏ, ký OpenAPI v1 và DB migration checklist trước khi code đồng thời.
3. **QA** tạo fixtures từ G0..G14, đặc biệt paid request mock fail-closed và timeline drag E2E.
4. **Project Lead** lấy capacity thực tế, ước lượng story points/owner/sprint schedule từ CSV; xác nhận các kết quả ở release gates.
5. **PO** duyệt demo R0..R3 theo outcomes đã khóa; chỉ cần quyết thêm nếu spike chứng minh các lựa chọn mặc định không khả thi (ví dụ không có image provider có thể dùng và không chấp nhận import/remote). Khi đó mở change request có lựa chọn, chi phí và ảnh hưởng, không tự đổi tính năng.

**Kết luận:** PO bổ sung AI Video và phạm vi EP13 P0 ở phiên bản v3; không chặn S0/R0. **S0 và R0 có thể start**; adapter/render performance là technical verification gates, không phải lý do chờ thêm cuộc họp PO.

## 10. CHANGE v3 — AI Video Generation (PO bổ sung 13/10/2026)
- **Đã thay đổi so với v2:** có T2V/I2V thật, không chỉ fake-motion Ken Burns. Thêm EP13, task `SP-VID-01`, `R0-VID-01`, `R2-VID-01..06`, `R3-VID-01..03`, `R4-VID-01..03`.
- **Provider policy:** Wan/ComfyUI local P0 (gated by technical proof), Seedance/BytePlus + Gemini Veo official API optional P1 paid, Google Flow web credits manual import; LTX/CogVideo optional local P1. Provider matrix xem `Video_AI_Flow_AI_Video_Provider_Catalog_v1.md`.
- **Acceptance:** G15 actual AI-video output + G16 35min hybrid mixing. Khi không có GPU/provider ready, giữ tính năng trong MVP nhưng trạng thái `BLOCKED_TECH/NO_PROVIDER` là rủi ro release cần tech-owner xử lý, **không được tuyên bố AI Video P0 passed**.
- **Impact:** thêm 14 task, tăng critical path và QA; không giữ nguyên estimate hoặc cam kết deadline của v2.
