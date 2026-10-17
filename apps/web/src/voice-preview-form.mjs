/** Pure, user-facing validation; backend remains the source of truth. */
export function validatePreviewDraft(data){
  if(!['edge','piper','vieneu'].includes(data.provider))return 'UNSUPPORTED_TTS_PROVIDER';
  if(typeof data.text!=='string'||!data.text.trim()||data.text.length>350)return 'INVALID_PREVIEW_TEXT';
  if(typeof data.voice!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(data.voice))return 'INVALID_VOICE_ID';
  if(!Number.isFinite(data.speed)||data.speed<0.5||data.speed>2)return 'INVALID_PREVIEW_SPEED';
  if(data.provider==='edge'&&!data.remoteConsent)return 'REMOTE_CONSENT_REQUIRED';
  return null;
}
const MESSAGES={
  INVALID_PREVIEW_TEXT:'Nhập đoạn văn bản có tối đa 350 ký tự để nghe thử.',
  INVALID_VOICE_ID:'Giọng đọc không hợp lệ. Hãy chọn giọng được hỗ trợ.',
  INVALID_PREVIEW_SPEED:'Tốc độ đọc phải nằm trong khoảng 0,5–2.',
  REMOTE_CONSENT_REQUIRED:'Cần đồng ý gửi đoạn mẫu đến Edge TTS để nghe thử.',
  UNSUPPORTED_TTS_PROVIDER:'Provider này chưa hỗ trợ nghe thử trong phiên bản hiện tại.',
  TTS_NOT_CONFIGURED:'Chưa cấu hình endpoint TTS trên máy local.',
  INVALID_LOCAL_TTS_CONFIG:'Đường dẫn endpoint TTS local không hợp lệ.',
  TTS_DEPENDENCY_UNAVAILABLE:'Thiếu thư viện hoặc chương trình TTS cần thiết. Kiểm tra cấu hình môi trường.',
  TTS_PROVIDER_UNAVAILABLE:'Provider TTS chưa phản hồi. Kiểm tra kết nối và thử lại.',
  TTS_PREVIEW_TIMEOUT:'Quá thời gian tạo giọng. Hãy thử lại.',
  TTS_RATE_LIMITED:'Dịch vụ tạm giới hạn yêu cầu. Hãy thử lại sau.',
  VOICE_PREVIEW_BUSY:'Đang có yêu cầu nghe thử khác. Hãy thử lại sau.',
  PAIRING_REQUIRED:'Cần kết nối lại ứng dụng qua mã ghép nối.',
  INVALID_PREVIEW_AUDIO:'Provider trả về dữ liệu âm thanh không hợp lệ.',
  CHANNEL_NOT_FOUND:'Không tìm thấy kênh cần nghe thử.',
  CHANNEL_NOT_ACTIVE:'Kênh đang lưu trữ, chưa thể nghe thử.',
};
export const voicePreviewError=code=>MESSAGES[code]??'Không tạo được giọng đọc. Kiểm tra TTS hoặc thử lại.';
