/**
 * R0-04 UI presentation vocabulary. All human guidance is mapped from trusted
 * machine-readable codes rather than displaying raw system/provider errors.
 */
export const CHECK_TEXT={
  cpu:['Bộ xử lý (CPU)','Số luồng xử lý có thể dùng'],
  ram:['Bộ nhớ RAM','Dung lượng bộ nhớ hệ thống'],
  disk:['Ổ đĩa lưu trữ','Không hiển thị đường dẫn riêng tư'],
  sqlite:['Cơ sở dữ liệu SQLite','Nơi lưu dự án và hàng đợi'],
  ffmpeg:['FFmpeg / Codec','Xử lý hình ảnh, video và âm thanh'],
  ffprobe:['FFprobe','Kiểm tra file media và thời lượng'],
  gpu:['GPU NVIDIA','Hỗ trợ một số AI model chạy trên máy'],
  windows:['Kiểm thử trên Windows','Xác nhận khi có máy Windows phù hợp'],
  comfyui:['ComfyUI','Workflow tạo ảnh / video local'],
};
export const STATE_LABEL={ready:'Sẵn sàng',warning:'Cần kiểm tra',missing:'Chưa có',unconfigured:'Chưa cấu hình',unknown:'Chưa xác minh'};
export const DETAIL={
  CPU_DETECTED:'Đã phát hiện bộ xử lý.',LOW_AVAILABLE_RAM:'RAM trống thấp, nên đóng bớt ứng dụng khi xử lý video.',
  MEMORY_PROBE_ERROR:'Không đọc được thông tin RAM.',MEMORY_AVAILABLE:'RAM hiện có khả dụng.',LOW_DISK_SPACE:'Dung lượng trống dưới 2 GB. Nên giải phóng bộ nhớ trước khi render.',
  DISK_SPACE_AVAILABLE:'Có dung lượng lưu trữ.',DISK_PROBE_ERROR:'Không truy vấn được dung lượng ổ đĩa.',
  SQLITE_CONNECTED:'Đã kết nối SQLite ở chế độ WAL.',SQLITE_WAL_NOT_ACTIVE:'SQLite hoạt động nhưng WAL chưa được xác nhận.',
  SQLITE_UNAVAILABLE:'Không kết nối được SQLite. Kiểm tra thư mục dữ liệu và quyền truy cập.',
  FFMPEG_RENDER_CODECS_AVAILABLE:'FFmpeg có bộ mã hóa H.264 và AAC. Chưa benchmark render dài.',
  REQUIRED_ENCODER_MISSING:'Thiếu codec H.264/libx264 hoặc AAC. Cần phiên bản FFmpeg phù hợp.',
  NOT_INSTALLED:'Không tìm thấy công cụ trong PATH.',TIMEOUT:'Quá thời gian kiểm tra. Có thể thử lại.',
  PROBE_FAILED:'Công cụ chưa phản hồi như mong đợi.',FFMPEG_NOT_FOUND:'Chưa phát hiện FFmpeg trong PATH.',
  FFPROBE_AVAILABLE:'Đã phát hiện FFprobe.',FFPROBE_NOT_FOUND:'Chưa phát hiện FFprobe trong PATH.',
  NVIDIA_DETECTED:'Đã phát hiện GPU NVIDIA. Chưa chạy thử model AI.',
  NVIDIA_NOT_DETECTED:'Chưa phát hiện NVIDIA qua nvidia-smi. Vẫn có thể tạo video từ ảnh và FFmpeg.',
  GPU_NOT_VERIFIED:'Chưa kiểm chứng GPU. Có thể dùng chức năng không cần GPU.',
  WINDOWS_HARDWARE_TEST_PENDING:'Máy đang chạy Windows, nhưng chưa có kết quả benchmark.',
  WINDOWS_TEST_DEFERRED:'Kiểm thử Windows được PO hoãn. Không chặn phát triển ứng dụng.',
  LOCAL_ENDPOINT_RESPONDING:'Endpoint local có phản hồi. Chưa chứng minh model tạo được video.',
  LOCAL_PROVIDER_NOT_VERIFIED:'Endpoint chưa phản hồi hoặc chưa kiểm chứng.',
  REMOTE_PROVIDER_NOT_PROBED:'Provider có đăng ký, không gọi mạng khi mở dashboard.',
  COMFY_WORKFLOW_NOT_CONFIGURED:'Chưa có workflow ComfyUI. Có thể cấu hình sau hoặc nhập ảnh/video thủ công.',
};
export const shortGiB=value=>typeof value==='number'&&Number.isFinite(value)?`${value.toLocaleString('vi-VN')} GiB`:'—';
export const stateDescription=state=>STATE_LABEL[state]||STATE_LABEL.unknown;
export function viewCheck(check){
  const predefined=CHECK_TEXT[check.id];
  return {id:check.id,state:STATE_LABEL[check.state]?check.state:'unknown',
    title:predefined?.[0]??(check.id.startsWith('provider:')?`AI · ${check.id.slice(9)}`:'Thành phần'),
    subtitle:predefined?.[1]??'Đã đăng ký provider, chưa kiểm chứng khả năng tạo media.',
    description:DETAIL[check.detail]??'Chưa có kết quả xác minh.'};
}
