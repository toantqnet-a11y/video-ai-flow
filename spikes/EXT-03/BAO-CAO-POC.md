# POC Video AI Flow: Remotion vs HyperFrames
**Ngày chuẩn bị: 15/10/2026 — Trạng thái: Chưa hoàn tất benchmark hai framework**

## 1. Đã làm và bằng chứng

| Phép thử | Kết quả | Bằng chứng |
|---|---|---|
| Chuẩn hóa dữ liệu đầu vào | PASS | `manifest.json`: 5 cảnh, 459 frame, 1080x1920, 30fps |
| TTS test offline | PASS | 5 file WAV tiếng Anh tạo bằng FFmpeg/flite |
| Kiểm tra độ dài và tài nguyên của cả hai mẫu | PASS | `python scripts/validate-fixture.py` (SHA-256) |
| FFmpeg render smoke test | PASS | `outputs/baseline-ffmpeg.mp4` |
| Thời gian FFmpeg baseline | 10,73 giây | `outputs/baseline-results.json` |
| MP4 baseline | 15,343 giây, 1080x1920, 30fps, H.264 + AAC | ffprobe và file kết quả |
| Remotion render thực tế | CHƯA CHẠY | npm package chưa cài do sandbox không có kết nối npm registry |
| HyperFrames render thực tế | CHƯA CHẠY | npm package chưa cài do sandbox không có kết nối npm registry |
| So sánh RAM/tốc độ/CPU Remotion vs HyperFrames | CHƯA CÓ | Không dùng số đo FFmpeg thay thế |

**Hạn chế bắt buộc:** Video baseline chỉ dùng các ảnh tĩnh với audio; không có animated subtitle và không kiểm tra tính tương đương visual của hai render engine. Vì vậy 10,73 giây *không* đại diện cho tốc độ Remotion hay HyperFrames.

## 2. Năng lực và cân nhắc thương mại

| Tiêu chí | Remotion | HyperFrames |
|---|---|---|
| Đầu vào | Component React/TypeScript | HTML/CSS/JS + data timeline |
| Video/voice/title | Có | Có |
| Seekable motion | Hook frame-based | HTML timing + GSAP timeline paused |
| Timeline editor tích hợp Video AI Flow | Thuận lợi vì React | Cần thêm adapter/editor riêng |
| Giấy phép | Custom Remotion License | Apache-2.0 theo repo |
| Kết luận hiện tại | Ứng viên chính về tiện triển khai | Ứng viên chính về chi phí giấy phép |

Remotion cho phép một số đối tượng nhỏ/cá nhân dùng Free License theo điều kiện, còn tổ chức thương mại không đủ điều kiện cần kiểm tra gói Automators. HyperFrames công bố Apache-2.0; vẫn phải đánh giá giấy phép phụ thuộc và điều kiện của hosted services.

## 3. Khuyến nghị *có điều kiện*

Theo tiêu chí **chi phí → hiệu năng → dễ bảo trì**, thử HyperFrames trước nếu Video AI Flow là SaaS/automation thương mại; giữ Remotion là baseline chuẩn về năng suất phát triển với React. Không quyết định engine chính chỉ từ các mô tả công bố hoặc kết quả FFmpeg baseline.

**Để chốt:** cài npm ở máy có mạng, chạy lệnh trong `README.md`, kiểm tra hai MP4 có đúng audio, phụ đề, hiệu ứng, đo ba lượt chạy trên cùng máy. Nếu HyperFrames chậm hơn >20–30% hoặc yêu cầu chi phí phát triển editor/QA tăng mạnh, cân nhắc Remotion nếu giấy phép phù hợp.

## 4. Handoff cho coding agent

1. Xem `README.md` và `manifest.json`.
2. Thực hiện `npm install` trong mỗi project; chạy `node scripts/setup-hyperframes.mjs`.
3. Chạy `npm run lint` / `npm run check` trong HyperFrames, xử lý lỗi tương thích phiên bản nếu có.
4. Chạy `python scripts/benchmark.py --engine both`; kiểm tra file `benchmark-results.json` và `outputs/*.log`.
5. Chụp các khung hình ở giữa 5 cảnh, kiểm tra word highlight theo audio và đồng nhất font/layout.
6. So sánh đo lặp lại ít nhất 3 lần/mỗi engine trên cùng Windows build machine.
7. Ghi lại phiên bản npm, Node, Chrome, FFmpeg, CPU/GPU/RAM, đầu ra và quyết định vào tài liệu.

**Không được ghi trạng thái hoàn thành POC hai engine nếu một trong hai render thực tế chưa PASS.**
