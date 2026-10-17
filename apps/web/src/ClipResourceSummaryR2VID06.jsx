/** R2-VID-06 read-only human-facing explanation of estimated vs measured.
 * Do not display an unknown GPU or energy cost as a verified zero.
 */
import React from 'react';

const fmt=(value,suffix='')=>value===null||value===undefined?'Chưa xác định':`${value}${suffix}`;
export function ClipResourceSummary({estimate}){
 if(!estimate)return null;
 const {workload,gpu,runtime,price,limit,blockers=[],warnings=[]}=estimate;
 return <aside className="scene-video-resource" aria-label="Dự toán tài nguyên AI Video">
  <h4>📊 Dự toán AI Video — không chạy model</h4>
  <p>Khối lượng: {workload.frames.toLocaleString('vi-VN')} frame ·
   {workload.megapixelFrames.toLocaleString('vi-VN')} triệu pixel-frame ·
   trần an toàn: {(limit.maxPixelFrames/1e6).toLocaleString('vi-VN')} triệu.</p>
  <p>VRAM khả dụng / yêu cầu tối thiểu (khai báo): {fmt(gpu.availableVramGb,' GB')} / {fmt(gpu.minimumModelVramGb,' GB')}.
   <strong> Chưa đo GPU thực tế.</strong></p>
  <p>Thời gian ước tính: {fmt(runtime.projectedSeconds,' giây')}
   {runtime.likelySecondsRange?` (biên tham khảo ${runtime.likelySecondsRange[0]}–${runtime.likelySecondsRange[1]} giây)`:''}.
   {runtime.source==='NOT_CALIBRATED'?' Cần benchmark trên máy thật.':' Suy từ benchmark do người vận hành khai báo.'}</p>
  <p>Phí gọi API tạo clip: 0 USD (chỉ ComfyUI cục bộ); chi phí điện/phần cứng: chưa ước tính.
   Raw RGBA tương đương {workload.rgbaFrameEquivalentGiB} GiB, <em>không phải VRAM hoặc dung lượng đĩa dự kiến</em>.</p>
  {blockers.length>0?<p role="alert" className="error">Chặn tạo clip: {blockers.join(' · ')}</p>:
   <p className="muted">Chỉ đạt giới hạn đã cấu hình — không bảo đảm model/GPU chạy được.</p>}
  {warnings.length>0&&<p className="muted">Chưa xác minh: {warnings.join(' · ')}</p>}
 </aside>;
}
export function ClipBatchResourceSummary({summary}){
 if(!summary)return null;
 return <aside className="scene-video-resource" aria-label="Dự toán hàng loạt AI Video">
  <h4>📊 Dự toán {summary.scenes} scene — chỉ đọc</h4>
  <p>Tổng: {summary.totalMegapixelFrames.toLocaleString('vi-VN')} triệu pixel-frame.
   VRAM tối thiểu khai báo: {fmt(summary.declaredMinimumVramGb,' GB')} (không cộng dồn vì hàng đợi chạy lần lượt).</p>
  <p>Thời gian tổng tham khảo: {fmt(summary.projectedTotalSeconds,' giây')}.
   Không bao gồm hàng đợi, tải model, retry hoặc chuyển cảnh.</p>
  {summary.blockers.length>0&&<p role="alert" className="error">Chặn: {summary.blockers.join(' · ')}</p>}
  <p className="muted">Chưa có benchmark GPU hoặc ước tính chi phí điện; không gọi API trả phí.</p>
 </aside>;
}
