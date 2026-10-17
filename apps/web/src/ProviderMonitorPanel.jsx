/** R2-12 operator dashboard: GET-only, on-demand monitoring, no polling or
 * silent route/approval mutations. Existing PaidApprovalPanel handles consent. */
import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {providerMonitorView} from './provider-monitor-r212.mjs';
export function ProviderMonitorPanel(){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
   const controller=new AbortController();let active=true;
   setData(null);setError('');setBusy(true);
   api('/providers/monitor?limit=20',{signal:controller.signal})
     .then(payload=>{const view=providerMonitorView(payload);if(active)setData(view)})
     .catch(e=>{if(active)setError(e?.code??'PROVIDER_MONITOR_UNAVAILABLE')})
     .finally(()=>{if(active)setBusy(false)});
   return ()=>{active=false;controller.abort()};
 },[revision]);
 return <section className="provider-box provider-monitor" aria-label="Giám sát provider">
   <div className="quota-ledger-head"><div><h3>6 · Giám sát quota & chuyển tài khoản</h3><p className="muted">R2-12 · Dữ liệu SQLite tại máy, không kết nối để kiểm tra quota của nhà cung cấp.</p></div>
     <button type="button" className="btn secondary" disabled={busy} onClick={()=>setRevision(n=>n+1)}>↻ Làm mới</button></div>
   {busy&&<p role="status">Đang kiểm tra dữ liệu nội bộ…</p>}
   {error&&<p role="alert" className="warn">Không đọc được trạng thái ({error}); không kết luận còn quota.</p>}
   {data&&<>
    <div className="quota-ledger-stats">
      <div><small>Sắp chạm giới hạn</small><strong>{data.nearCount}</strong></div>
      <div><small>Hết hạn mức khai báo</small><strong>{data.exhaustedCount}</strong></div>
      <div><small>Chưa rõ quota</small><strong>{data.unknownCount}</strong></div>
      <div><small>Model có phí</small><strong>{data.paidCount}</strong></div>
    </div>
    {(data.exhaustedCount>0||data.nearCount>0)&&<p role="status" className="warn">Có model gần/hết hạn mức khai báo. Không tự chuyển sang nhà cung cấp có phí.</p>}
    {data.truncated&&<p className="warn">Danh sách chỉ hiển thị tối đa 100 model. Vui lòng kiểm tra thêm ở Model & hạn mức.</p>}
    <p className="muted">Trạng thái và token dựa trên hạn mức nội bộ, không chứng minh quota hoặc phí từ nhà cung cấp. Model có phí luôn cần phê duyệt đúng job, tài khoản và model ở mục 5.</p>
    <div className="quota-ledger-scroll"><table className="quota-ledger-table"><thead><tr><th>Provider / tài khoản</th><th>Model</th><th>Trạng thái</th><th>Hạn mức còn theo sổ</th><th>Chính sách</th></tr></thead><tbody>
      {data.items.map(m=><tr key={m.id}><td>{m.providerId} · {m.accountName}</td><td>{m.modelId} ({m.kind})</td><td><span className="badge">{m.label}</span></td><td>{m.remainingUnits===null?'Không xác định':m.remainingUnits.toLocaleString('vi-VN')}</td><td>{m.requiresPaidApproval?'Yêu cầu phê duyệt trả phí':'Không suy ra quyền gọi API miễn phí'}</td></tr>)}
    </tbody></table></div>
    <h4>Nhật ký chuyển tài khoản đã hoàn thành (LLM free tương đương)</h4>
    <p className="muted">Chỉ ghi nhận fallback thực sự thành công trong dispatcher LLM từ xa. Không tính xem trước route; TTS/video fallback chưa có telemetry thống nhất.</p>
    {!data.switches.length?<p>Chưa có sự kiện chuyển tài khoản thành công được ghi nhận.</p>:<div className="quota-ledger-scroll"><table className="quota-ledger-table"><thead><tr><th>Thời điểm</th><th>Provider</th><th>Chuyển từ → đến</th><th>Trạng thái / quyền</th></tr></thead><tbody>{data.switches.map(e=><tr key={e.seq}><td>{new Date(e.createdAt).toLocaleString('vi-VN')}</td><td>{e.providerId}</td><td>{e.fromModelId} → {e.toModelId}</td><td>{e.label} · Đã đồng ý remote qua cấu hình runtime</td></tr>)}</tbody></table></div>}
   </>}
 </section>;
}
