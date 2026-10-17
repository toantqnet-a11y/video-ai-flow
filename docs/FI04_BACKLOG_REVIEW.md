# Video AI Flow — Backlog hợp nhất FI-04 (17/10/2026)

Nguồn: FI-03 full workspace archive (16/10/2026), 42 task FI-02 `docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json`, roadmap v3 ngày 13/10/2026. Đây là **tracker hợp nhất của backlog FI-02 và nhánh AI Video**, không phải danh mục toàn bộ các task nền tảng R0/R1/R2 từ roadmap v3.

## Tổng số 60 task được theo dõi

- **42** task sẵn có: giữ toàn bộ ID/trạng thái lịch sử, không tự động gắn ACCEPTED_LIVE.
- **14** AI Video task từ roadmap v3: một Spike `SP-VID-01`, một capability registry `R0-VID-01`, 6 task R2-VID, 3 task R3-VID, 3 task R4-VID.
- **4** task FI-04: test stability, dependency reproducibility, frontend/API live runtime, HyperFrames 5-scene acceptance harness.

**Bằng chứng đã có và cần bảo toàn:** `SP-VID-01` có mock ComfyUI protocol/MP4 import + tests (không phải clip Wan thật). `R0-VID-01` có capability metadata, preflight, SQLite/API/UI và tests offline. Các task sau đó có một số UI/media hoặc FFmpeg nền tảng nhưng không có bằng chứng AI video production E2E; vì vậy dùng PARTIAL/UNVERIFIED thay vì NOT_STARTED tuyệt đối.

## Critical path MVP local/free

`FI-04-01` → `FI-04-02` → `FI-04-03` → `FI-04-04` HyperFrames thật với multi-cue + BGM → Windows timeline/browser → 35 phút thực + restart → security/provider E2E. Chỉ xem là `READY` sau bằng chứng riêng cho tất cả release gates.

## Critical path Full AI Video

`SP-VID-01` (GPU) → `R0-VID-01` (đã code metadata) → `R2-VID-01/02/03` (policy, local I2V, import) → `R2-VID-04/05/06` (queue, UI, chi phí) → `R3-VID-01/02/03` (timeline + render Hybrid và E2E 35 phút có clip AI thật). `R4-VID-01/02/03` là tùy chọn sau, không mặc định gọi paid.

## Quy tắc trạng thái

- `CODE_COMPLETE_TESTED_OFFLINE`: code và test offline (không chứng minh tương thích máy Windows).
- `SPIKE_*`: POC/protocol/import, chưa chứng minh production.
- `PARTIAL_*`: đã có phần chức năng nhưng acceptance tương ứng chưa hoàn tất.
- `NOT_VERIFIED_*`: không tìm thấy bằng chứng thực tế hoàn tất, không kết luận không có dòng code.
- `BLOCKED`: cần network/GPU/Windows/real provider.

Tệp JSON máy đọc: `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json`. Chỉnh backlog nguồn, chạy `npm run backlog:merge:fi04`, `npm run backlog:check:fi04`, `npm run test:fi04` để giữ tính nhất quán. Không sửa task ID hoặc tự gán PASS từ mock render.

## FI-04-05 update (17/10/2026)
Backlog hiện mới nhất có **61 task** (42 lịch sử + 14 AI Video + 5 FI04). FI-04-05 đã triển khai hardening timeline và test offline, nhưng kiểm thử browser Windows vẫn BLOCKED. Bản sinh tự động là `docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json`; các con số 60 phía trên là ảnh chụp lịch sử FI-04-04.
