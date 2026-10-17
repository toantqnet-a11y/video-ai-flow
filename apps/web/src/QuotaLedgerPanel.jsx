/** R2-10: read-only, on-demand quota inspection for one configured model.
 * No polling, credentials, quota mutations, usage reconciliation or billing
 * assertions. Abort + mounted check protect against stale model selection.
 */
import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {quotaLedgerView,quotaCallLabels,quotaTimeLabel,quotaUnitLabel,QUOTA_LEDGER_PAGE_LIMIT} from './quota-ledger-view.mjs';

export function QuotaLedgerPanel({model,onClose}){
  const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();let mounted=true;
    setData(null);setError('');setBusy(true);
    api(`/provider-models/${encodeURIComponent(model.id)}/quota-ledger?limit=${QUOTA_LEDGER_PAGE_LIMIT}`,{signal:abort.signal})
      .then(payload=>{const safe=quotaLedgerView(payload,model.id);if(mounted)setData(safe)})
      .catch(e=>{if(mounted)setError(e?.code??'QUOTA_LEDGER_READ_FAILED')})
      .finally(()=>{if(mounted)setBusy(false)});
    return()=>{mounted=false;abort.abort()};
  },[model.id,revision]);
  return <section className="quota-ledger-panel" aria-label={`Sổ hạn mức ${model.modelId}`}>
    <header className="quota-ledger-head"><div><h3>Chi tiết hạn mức · {model.modelId}</h3>
      <p>R2-10 · Chỉ đọc SQLite, không truy vấn tài khoản nhà cung cấp, không thực hiện gọi AI.</p></div>
      <div className="toolbar"><button type="button" className="btn secondary" onClick={()=>setRevision(n=>n+1)} disabled={busy}>↻ Cập nhật</button>
      <button type="button" className="btn secondary" onClick={onClose}>Đóng</button></div></header>
    {busy&&<p role="status">Đang đọc sổ hạn mức nội bộ…</p>}
    {error&&<p role="alert" className="error">Không đọc được sổ hạn mức ({error}). Không thể kết luận quota còn lại.</p>}
    {data&&<>
      <p className="warn" role="note"><strong>Lưu ý nguồn dữ liệu:</strong> {data.sourceNotice}</p>
      <p className="muted">{data.admissionNotice}</p>
      <div className="quota-ledger-stats">
        <div><small>Giới hạn khai báo</small><strong>{quotaUnitLabel(data.limit)}</strong></div>
        <div><small>Đã ghi nhận cục bộ</small><strong>{quotaUnitLabel(data.used)}</strong></div>
        <div><small>Đang giữ / chưa xác định</small><strong>{data.known?quotaUnitLabel(data.pending):'Không xác định'}</strong><small>{data.pendingCalls} lượt chờ/không chắc chắn</small></div>
        <div><small>Còn theo sổ nội bộ</small><strong>{quotaUnitLabel(data.remaining)}</strong></div>
      </div>
      {data.known&&<div className="quota-ledger-meter" role="img" aria-label={`Dùng ${data.percentUsed}%, giữ chỗ ${data.percentHeld}% theo giới hạn khai báo`}>
        <div className="quota-ledger-used" style={{width:`${data.percentUsed}%`}}/>
        <div className="quota-ledger-pending" style={{width:`${Math.min(data.percentHeld,100-data.percentUsed)}%`}}/>
      </div>}
      <h3>Lịch sử gần nhất (tối đa {QUOTA_LEDGER_PAGE_LIMIT} lượt)</h3>
      {data.uncertainCount>0&&<p className="warn" role="status">Có {data.uncertainCount} lượt chưa xác định trong trang đang xem. Hạn mức vẫn bị giữ, không tự hoàn trả hoặc retry.</p>}
      {!data.items.length?<p className="muted">Chưa ghi nhận lượt gọi trong sổ nội bộ.</p>
        :<div className="quota-ledger-scroll"><table className="quota-ledger-table"><thead><tr><th>Thời điểm</th><th>Trạng thái</th><th>Giữ trước</th><th>Đã ghi nhận</th></tr></thead>
        <tbody>{data.items.map((c,i)=><tr key={`${i}-${c.createdAt}`}><td>{quotaTimeLabel(c.createdAt)}</td><td>{quotaCallLabels[c.status]}</td><td>{quotaUnitLabel(c.reservedUnits)}</td><td>{quotaUnitLabel(c.actualUnits)}</td></tr>)}</tbody></table></div>}
      <p className="muted">Chỉ hiển thị metadata an toàn; không hiển thị prompt, API key, nội dung hoặc chi phí ước đoán. Đối soát giao dịch chưa xác định cần chứng từ từ nhà cung cấp.</p>
    </>}
  </section>;
}
