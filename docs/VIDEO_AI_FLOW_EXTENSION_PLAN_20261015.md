> **Cập nhật checkpoint 15/10/2026 sau EXT-07/08:** Sprint R2 gốc 13/13 code offline. EXT-01/02/04/05/06/07/08 có code theo từng phạm vi; EXT-03 Remotion/HyperFrames chưa benchmark thật. 730/730 Node tests PASS; Windows/browser/Vite/30–40 phút và AI providers thật chưa nghiệm thu. Các dòng trạng thái cũ bên dưới là lịch sử, xem `docs/R2EXT0708_STATUS.md` làm nguồn mới nhất.

# Video AI Flow / ContentStudio — Feature Plan & Roadmap (2026-10-15, revision R2-06)

> **Phạm vi:** cập nhật **danh sách tính năng, thứ tự triển khai và trạng thái** sau khi hoàn thành R2-06. R2-06 đã được code/test offline; các mục R2-EXT vẫn chỉ là kế hoạch, chưa triển khai. Không tái tạo lại dự án.

## Tình trạng thực tế

| Nhóm | Tiến độ | Mức xác minh |
|---|---|---|
| Sprint 0 / R0 nền tảng | Đã có code nền tảng, nhiều gate live chưa nghiệm thu | Offline tests và kiểm thử mô phỏng; Windows/browser chưa đạt release gate |
| R1 — Nội dung / AI Script | R1-01..R1-08 đã triển khai ở mức code/offline | Không đồng nghĩa chạy live ổn định 30–40 phút |
| R2 — Scene + voice + image | **R2-01..R2-06: 6/13 task, code hoàn thành và test offline** | R2-06: 14/14 task; toàn dự án **574/574** theo báo cáo ngày 15/10/2026 |
| R2-07 | **CODE_COMPLETE_TESTED_OFFLINE (19/19 focused, 593/593 total)** | Live Windows/browser/providers pending |
| R2-08 | **Quota ledger** | CODE_COMPLETE_TESTED_OFFLINE; 20 new tests, 613/613 overall |
| R2-09..R2-13 | **5 task còn lại** | TODO; next R2-09 |
| R2-EXT-01..08 | **8 hạng mục mở rộng được thống nhất trong plan**, chưa code | EXT-03 có fixture/FFmpeg baseline; benchmark Remotion/HyperFrames *chưa chạy* |
| R2-VID-01..06 | Backlog video sinh bằng AI tùy chọn | TODO trong ứng dụng; có SP-VID proof riêng, không phải production adapter |
| R3/R4 | Timeline, editing, rendering/export sản phẩm hoàn chỉnh | Chưa thể coi hoàn thành; EXT-04/05/06 là mốc triển khai chi tiết, **không tạo hệ thống thứ hai** |

**R2-05 đã có:** ComfyUI local/manual image import, prompt đã lưu, image versions/selection, stale-job fencing, v23 schema, API/SDK/Scene UI; **còn nợ** checkpoint GPU thật, Windows, Fastify/browser, build Vite (chưa cài dependency) và video 30–40 phút. Không claim nghiệm thu thiết bị hay chất lượng ảnh thực.

## Những tính năng mới được bổ sung vào kế hoạch (R2-EXT)

| ID | Tính năng | Ưu tiên | Trạng thái | Giá trị cho người dùng / tiêu chí nghiệm thu |
|---|---|---|---|---|
| **EXT-01** | Video/Scene Composition Contract v1 | P0 | PLANNED | Gắn scene + text + image/video + voice + caption + frame/ratio vào manifest có version; validate và pin revision; 9:16/16:9, không buộc engine |
| **EXT-02** | Đồng bộ thời lượng & phụ đề | P0 | PLANNED | FFprobe đo thời lượng voice; padding → frames; caption thực nếu có timestamp, không giả định chia đều là word alignment; không ghi đè timing thủ công |
| **EXT-03** | Gate so sánh Remotion–HyperFrames | P0 | POC_PREPARED_NOT_BENCHMARKED | Mỗi engine xuất MP4 thật từ fixture giống nhau; 3 workloads × ít nhất 3 lần/engine; kiểm tra tốc độ, RAM/CPU, giấy phép, chất lượng tiếng Việt |
| **EXT-04** | Render Adapter duy nhất + FFmpeg fast path | P0 | PLANNED | Render MP4 từ composition, dùng **một** queue SP-04, progress/cancel/retry, xác minh codec/audio/resolution/failed jobs; không tạo 2 engine sản xuất song song |
| **EXT-05** | Scene Preview + Timeline chỉnh sửa trực quan | P1 | PLANNED | Preview ngay từng scene/timeline; sửa lời thoại, asset, sắp xếp, timing, transition; tránh render cả MP4 khi sửa nhỏ; nâng thành trải nghiệm timeline R3 |
| **EXT-06** | MP4 Export + QA kỹ thuật | P0 | PLANNED | Xuất dọc 1080×1920 30fps H.264/AAC trước, hỗ trợ profile khác sau; kiểm phụ đề dấu tiếng Việt, khoảng lặng, thiếu asset, méo tiếng, cutoff, ffprobe/manifest |
| **EXT-07** | Cost Guard & Smart Visual Router | P1 | CODE_COMPLETE_TESTED_OFFLINE_PREVIEW_ONLY | 3 chế độ **Tiết kiệm / Cân bằng / Chất lượng**; ưu tiên reuse/import → ảnh+motion → AI local → clip AI trả phí **chỉ sau approval**; ghi estimate ≠ actual |
| **EXT-08** | Motion Template Library / Brand Kit | P2 | CODE_COMPLETE_TESTED_LOCAL_FFMPEG_UI_UNBUILT | Preset pan/zoom, transition, lower-third, caption, thumbnail; giới hạn props, version hóa, không thực thi code AI tự do trong scene |

Lưu ý: `EXT-xx` là task mở rộng **không thay thế** ID R2-06..13, R2-VID-01..06 hoặc epic R3/R4 đã có. Các tính năng đã lên kế hoạch không được ghi nhận là đã code.

## Kế hoạch triển khai theo phụ thuộc — thứ tự khuyến nghị

| Nhịp | ID | Công việc | Phụ thuộc / điều kiện |
|---:|---|---|---|
| 0 | R2-05 | ComfyUI image adapter, manual asset, selected revisions | **DONE_OFFLINE**; còn live gate |
| 1 | **R2-06** | Hash tài nguyên, revision registry, dedupe, atomic promotion, orphan reconcile | **DONE_OFFLINE**, v24; 574/574 tests; live gate còn mở |
| 1 (song song) | **R2-EXT-01** | Data contract video/scene độc lập engine | R1 approved script, R2-01..05; spec/schema + tests |
| 1 (song song) | **R2-EXT-03** | Chạy benchmark 2 render engine trên máy cài được npm | Đợi môi trường có npm/browser/FFmpeg, không chặn R2-07 |
| 2 | **R2-07** | Queue DAG + crash/restart + recompute plan | R2-06, vẫn chỉ một SP-04 queue |
| 2 | **R2-EXT-02** | Measured voice → durationFrames → caption timing | R2-03/04 + R2-07 timing ownership + EXT-01 |
| 3 | **R2-EXT-04** | Renderer được chọn sau POC + FFmpeg fast path | EXT-01, EXT-03, R2-07 |
| 4 | **R2-EXT-06** | Xuất MP4 thật + QA | EXT-02/04, đầu vào có thể là media import — không đòi GPU |
| 5 | **R2-EXT-05** | Preview và edit theo scene/timeline | R2-06/07 + EXT-01/02/04; frontend R3 |
| 6 | **R2-08..13 + EXT-07** | Quota ledger, provider fail-closed, asset UI, selective regen, quota UX, regression, visual router | Theo dependency gốc; giữ nguyên task ID R2-08..13 |
| 7 | **EXT-08 / R2-VID-01..06** | Motion templates/brand và tùy chọn video AI clip | Sau render thật + guardrails; clip AI trả phí cần consent/approval |

**Lưu ý thứ tự:** R2-06 đã code/test offline; R2-07 đã code/test offline; R2-08 là code task kế tiếp. EXT-01 có thể lập schema song song; EXT-03 chỉ có thể chốt engine khi đo *Remotion và HyperFrames chạy thật*. Khi người dùng chưa có máy, tiếp tục phát triển và test deterministic offline; không tự nhận hoàn tất kiểm thử trên Windows.

## Các cổng nghiệm thu rõ ràng

**Gate A — Có thể xuất video thật không cần API trả phí:** 5 scene với WAV + PNG/JPEG nhập tay; contract → timing → render → QA → MP4; tiêu chí kiểm tra từng scene, tiếng Việt, audio/video sync, dimensions/frame rate. Có thể xây FFmpeg baseline trước, nhưng không dùng kết quả đó để kết luận Remotion/HyperFrames.

**Gate B — Sửa một câu không dựng lại toàn bộ:** Scene text/prompt thay đổi chỉ invalidate dependency liên quan, không âm thầm xóa manual media hoặc thay approved script; jobs cũ không được ghi đè selection mới. Project render cuối có thể cần ghép lại tùy transitions.

**Gate C — Tối ưu chi phí và chất lượng:** thông báo dự toán, người dùng chủ động chọn chế độ, paid dispatch chỉ sau approval/ledger, template first, không tự gửi prompt/asset ra Internet; benchmark video 30/35/40 phút sau 3 video nhỏ thành công.

## Những rào cản phải ghi đúng

- **POC engine:** 5 scene 1080×1920 30fps/459 frames (~15.3s); FFmpeg-only baseline PASS 10.73s *trên môi trường benchmark cũ*. Remotion/HyperFrames **NOT RUN** vì npm bị chặn; không có kết luận engine nhanh hơn.
- **R2-05:** test offline 560/560 PASS, chưa test GPU/ComfyUI thật; `build:web` bị chặn do Vite chưa cài, chưa xác minh bundle chạy.
- **TTS:** Piper/VieNeu hiện dùng contract HTTP bridge do operator cấu hình, chưa có model thật; Edge và tiếng Việt word-level alignment chưa được nghiệm thu.
- **Live/Windows/long-form:** Fastify/browser UI, FFmpeg end-to-end trong máy mục tiêu, video 30–40 phút chưa được nghiệm thu; không coi mock là sản phẩm chạy thật.

## Kiến trúc và quy tắc phát triển bất biến

1. Windows local-first; React/Vite + Zustand, Fastify, SQLite, FFmpeg/FFprobe; **1 SP-04 queue + 1 asset store**. Dùng các module có sẵn, không build lại từ đầu.
2. Migrates SQLite **append-only sau v23**, không thay checksum/migration lịch sử; đồng bộ OpenAPI, TypeScript SDK, UI, tests.
3. Approved Master Script R1-06, imported/user media và lựa chọn revision **bất biến**; dùng inputHash + pinned source revision + transactional job fencing; không xóa file đang dùng.
4. Không tự gọi API trả phí, không tự động fallback remote, không lộ secrets/PII trong logs. Điều kiện chi phí theo R0-13 tại thời điểm dispatch, không chỉ ở preview.
5. Mã cần comment **mục đích/why**, nhất là stale job/cache/timing/security; cập nhật `docs/WORKLOG.md`, `docs/HANDOFF.md`, `docs/DECISIONS.md`, `AGENTS.md`, `R2_Status.md` sau mỗi task.
6. Chỉ ghi **CODE_COMPLETE** sau khi code+test đã chạy. Plan update hôm nay **không thay đổi kết quả 560/560 đã được xác minh của R2-05**.

## Tài liệu liên quan

- `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json`: task IDs, dependencies, machine-readable statuses.
- `docs/RENDER_ENGINE_POC_GATE.md`: checklist đo hai engine thật trước khi chọn renderer.
- `docs/TEST_REPORT_R205.md` & `docs/R205_COMFYUI_IMAGE_CONTRACT.md`: kết quả đã code và còn nợ thực nghiệm.
- `docs/HANDOFF.md` & `docs/WORKLOG.md`: trạng thái chuyển giao, đường dẫn sửa đổi, test/thử nghiệm còn thiếu.


> **R2-07 update (2026-10-15):** completed offline durable queue DAG and timing metadata handoff. The implementation does NOT complete subtitle-frame sync, actual render or live engine benchmark. See `docs/TEST_REPORT_R207.md`. Next R2-08.


> **R2-08 update (2026-10-15):** implemented local durable token quota reservation and fail-closed guarded free LLM dispatch (v26) with read-only API, 20/20 R2-08 and 613/613 total offline tests. This is not provider-verified quota, billing proof or complete paid-provider quota coordination. Next R2-09; extension tasks remain planned. See `docs/TEST_REPORT_R208.md`.

> **R2-09 update (2026-10-15):** Implemented asset version library, bounded SHA-256 verification and read-only selective recompute inspector with a guarded manual image revision selection UI. **11/11 focused; 624/624 total offline.** No media deletion, quota policy change, auto generation or new DB migration. Next R2-10; extension tasks remain planned. Read `docs/R209_ASSET_LIBRARY_CONTRACT.md`.

> **R2-10 update (2026-10-15):** Read-only model quota inspector completed, 18/18 focused + 642/642 project tests offline. Holds and uncertain calls visible; no provider reconciliation, paid approval change or new migration. R2-EXT-07 remains PLANNED. Next R2-11, validate original task specification before touching provider billing.


> **R2-13 checkpoint (2026-10-15):** Previous table/task-order entries above are historical snapshots. Original R2-01..13 are now **13/13 CODE_COMPLETE_TESTED_OFFLINE**; 15/15 R2-13 and 688/688 total test assertions verified. **Release NOT READY**: Vite/Fastify/Windows/GPU/native TTS/real disk-full/long MP4 gates are still open. Next implementation R2-EXT-01. See `docs/R213_INTEGRATION_ACCEPTANCE.md` and `docs/R213_BACKLOG.json`. No R2-EXT task has been silently marked done.


> **Checkpoint R2-EXT-01 (2026-10-15):** Đã triển khai contract không phụ thuộc engine: schema JSON v1, source/asset SHA-256 + revision pins, frame math, draft readiness, explicit publish, SQLite v28 bất biến, authenticated API + SDK. **10/12 focused, 700/700 full offline tests PASS**; R2-EXT-02 là task tiếp theo. Những dòng PLANNED ở trên được giữ lại như bản ghi kế hoạch lịch sử; EXT-03..08 vẫn chưa triển khai. Không nhầm lẫn asset-readiness với đồng bộ voice hoặc video MP4 được render.
