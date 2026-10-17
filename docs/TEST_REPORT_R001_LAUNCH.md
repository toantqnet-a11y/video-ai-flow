# R0-01 — Windows One-Command Launcher · Test Report

**Ngày:** 2026-10-14  
**Backlog:** R0-01 / EP09 US-9.1 · **Kết quả:** CODE_COMPLETE + TESTED_OFFLINE. **Windows acceptance: PENDING.**

## Chức năng bàn giao

- `Run-Windows.ps1` mặc định `-Mode start`; đồng thời giữ `test`, `diagnose`, `api`, `web` để tương thích.
- `Start-ContentStudio.cmd` để chạy bằng nhấp đúp, không yêu cầu thay đổi Execution Policy toàn hệ thống.
- `tools/launch.mjs` tự phát hiện Node >=22.13, validate port và data root, báo FFmpeg/FFprobe readiness, auto `npm ci` nếu có lockfile hoặc `npm install` nếu thiếu dependencies, build UI React rồi chạy **một backend Fastify** phục vụ UI build same-origin trên `127.0.0.1`.
- Khi backend `/health` trả service chính xác thì mở browser trên Windows và để người dùng nhập mã pairing trong terminal. Không truyền pairing code qua URL/file hoặc ghi file log.
- Lock file theo PID/ngẫu nhiên trong thư mục data; reject instance song song, giải phóng trên shutdown và có kiểm tra stale owner sau crash. Detect cổng bị chiếm mà không giết tiến trình lạ.
- Dừng launcher không xóa dữ liệu SQLite, media hoặc API Vault. Thiếu FFmpeg hiện cảnh báo chứ không giả vờ đã render.
- `node tools/launch.mjs diagnose` chạy không cần npm dependencies. `tools/run-tests.mjs` nhận thêm tests trong `tools/` để CI Windows/Linux đều thấy.

## Test chạy thực tế (Linux Node.js 22.16)

| Lệnh | Kết quả | Evidence |
|---|---|---|
| `node --test tools/launcher-core.test.mjs` | **10/10 PASS** | stdout tại phiên phát triển |
| `npm run test:all` | **360/360 PASS** (214 app + 146 spike) | `docs/evidence/R001_LAUNCH_test_all.txt` |
| `npm run check` | **PASS** | `docs/evidence/R001_LAUNCH_check.txt` |
| `npm run typecheck:sdk` | **PASS** | `docs/evidence/R001_LAUNCH_typecheck.txt` |
| `node tools/launch.mjs diagnose` | **PASS**; FFmpeg/ffprobe có, npm deps/React build thiếu | stdout tại phiên phát triển |
| `node tools/launch.mjs start --skip-install --skip-build --no-browser` | **REJECTS AS DESIGNED** với `DEPENDENCIES_MISSING_SKIP_INSTALL`, không chạy backend | stdout tại phiên phát triển |
| `npm run build:web` | **BLOCKED**: `vite: not found` | `docs/evidence/R001_LAUNCH_build.txt` |

## Tiêu chí chưa nghiệm thu

- Chưa chạy `Run-Windows.ps1` trên Windows PowerShell 5.1/7, Windows host CI chưa thực thi.
- Chưa cài npm dependencies, chưa xác minh Fastify live, React browser, UI một-cổng, Ctrl+C cleanup trên Windows.
- Chưa có khóa package-lock: cài lần đầu chưa hoàn toàn reproducible; CI hiện dùng `npm install`.
- GPU, ComfyUI, Edge TTS và render Windows vẫn thuộc pending hardware/provider validation.

**PO blocker:** Không. Tiếp theo **R0-10 Channel Voice Preview**, sau đó hosted CI/Windows smoke/production gates.
