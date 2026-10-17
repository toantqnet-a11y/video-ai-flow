/**
 * R0-13 explicit paid authorization UX. Separate from the dry-run route panel.
 * WHY: choosing a model or viewing a fallback plan must never authorize money.
 * Human-readable limits and typed confirmation precede each job-scoped grant.
 * Budgets are local estimates only, not guaranteed provider invoices.
 */
import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api.js';

const money=n=>typeof n==='number'?`$${n.toFixed(4)}`:'—';
export function PaidApprovalPanel({accounts=[],models=[]}){
  const [jobs,setJobs]=useState([]),[jobId,setJobId]=useState(''),[modelId,setModelId]=useState('');
  const [maxUsd,setMaxUsd]=useState('1'),[perCallMaxUsd,setPerCallMaxUsd]=useState('0.2');
  const [expiresMinutes,setExpiresMinutes]=useState('30'),[confirmation,setConfirmation]=useState('');
  const [remoteConsent,setRemoteConsent]=useState(false),[history,setHistory]=useState([]),[audit,setAudit]=useState([]);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const selectedModel=models.find(m=>m.id===modelId);
  const account=accounts.find(a=>a.id===selectedModel?.accountId);
  const paidModels=useMemo(()=>models.filter(m=>m.costTier==='paid'&&m.status==='active'&&accounts.some(a=>a.id===m.accountId&&a.status==='active')),[models,accounts]);
  const ready=Boolean(selectedModel&&jobId&&remoteConsent&&confirmation==='AUTHORIZE_PAID_USAGE'&&Number(maxUsd)>0&&Number(perCallMaxUsd)>0&&Number(perCallMaxUsd)<=Number(maxUsd)&&Number(expiresMinutes)>=1&&Number(expiresMinutes)<=1440);
  async function load(){
    const result=await api('/jobs?limit=100');
    setJobs((result.items??[]).filter(j=>['pending','paused','failed'].includes(j.status)&&/^(asset:|llm:|content:)/.test(j.kind)));
  }
  async function loadHistory(id){if(!id){setHistory([]);setAudit([]);return;}
    const [grants,events]=await Promise.all([api(`/jobs/${id}/paid-approvals`),api(`/jobs/${id}/paid-audit`)]);
    setHistory(grants.items??[]);setAudit(events.items??[]);
  }
  useEffect(()=>{load().catch(()=>{})},[]);
  useEffect(()=>{loadHistory(jobId).catch(()=>{setHistory([]);setAudit([])})},[jobId]);
  async function submit(e){
    e.preventDefault();if(!ready)return;
    setBusy(true);setMessage('');
    try{
      await api('/paid/approvals',{method:'POST',body:{jobId,accountId:account.id,modelId,
        maxUsd:Number(maxUsd),perCallMaxUsd:Number(perCallMaxUsd),expiresMinutes:Number(expiresMinutes),confirmation}});
      setConfirmation('');setRemoteConsent(false);await loadHistory(jobId);
      setMessage('Đã ghi nhận phê duyệt cho đúng job và model. Chưa có lời gọi AI nào được thực hiện.');
    }catch(err){setMessage(`Không thể phê duyệt: ${err.code??err.message??'REQUEST_FAILED'}`)}finally{setBusy(false)}
  }
  async function revoke(id){setBusy(true);try{await api(`/paid/approvals/${id}/revoke`,{method:'POST',body:{}});await loadHistory(jobId);setMessage('Đã thu hồi; yêu cầu đang gửi đi có thể vẫn phát sinh chi phí.')}catch(e){setMessage(e.code??e.message)}finally{setBusy(false)}}
  return <section className="provider-box" aria-label="Phê duyệt AI trả phí">
    <h3>5 · Kiểm soát API trả phí</h3>
    <div className="warn"><b>🔐 Mặc định không chi tiền</b><p>Chỉ cấp phép cho một job + tài khoản + model cụ thể. Khoản tiền hiển thị là <b>ước tính</b>; hóa đơn thực tế do provider quyết định. Không tự chuyển sang trả phí khi hết quota.</p></div>
    <form onSubmit={submit}>
      <label>Job cần phê duyệt<select required value={jobId} onChange={e=>setJobId(e.target.value)}><option value="">Chọn job đang chờ</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.kind} · {j.id.slice(0,12)} · {j.status}</option>)}</select></label>
      <label>Model trả phí<select required value={modelId} onChange={e=>setModelId(e.target.value)}><option value="">Chọn model</option>{paidModels.map(m=><option key={m.id} value={m.id}>{m.modelId} · {accounts.find(a=>a.id===m.accountId)?.name}</option>)}</select></label>
      <div className="provider-inline"><label>Ngân sách tối đa (USD)<input type="number" min="0.000001" max="10000" step="0.000001" value={maxUsd} onChange={e=>setMaxUsd(e.target.value)}/></label>
        <label>Trần mỗi request (USD)<input type="number" min="0.000001" max="10000" step="0.000001" value={perCallMaxUsd} onChange={e=>setPerCallMaxUsd(e.target.value)}/></label>
        <label>Hết hạn sau (phút)<input type="number" min="1" max="1440" value={expiresMinutes} onChange={e=>setExpiresMinutes(e.target.value)}/></label></div>
      <p className="muted">Tài khoản: {account?.name??'Chưa chọn'} · Remote: {selectedModel?.location??'—'}. Job phải được lên kế hoạch cho đúng model trước khi phê duyệt.</p>
      <label className="provider-check"><input type="checkbox" checked={remoteConsent} onChange={e=>setRemoteConsent(e.target.checked)}/> Tôi đồng ý gửi dữ liệu cần thiết đến provider và hiểu rằng có thể phát sinh phí.</label>
      <label>Gõ <code>AUTHORIZE_PAID_USAGE</code> để xác nhận<input value={confirmation} autoComplete="off" onChange={e=>setConfirmation(e.target.value)} placeholder="AUTHORIZE_PAID_USAGE"/></label>
      <button className="btn" disabled={busy||!ready}>Xác nhận ngân sách cho job</button>
    </form>
    {message&&<p role="status" className="notice">{message}</p>}
    <h4>Lịch sử phê duyệt</h4>
    {!history.length&&<p className="muted">Chưa có phê duyệt cho job đang chọn.</p>}
    {history.map(g=><div className="provider-row" key={g.id}><span>Ngân sách {money(g.maxUsd)} · Đã giữ {money(g.reservedUsd)} · Còn {money(g.remainingUsd)} · {g.status} · hết hạn {new Date(g.expiresAt).toLocaleString('vi-VN')}</span>{!g.revokedAt&&<button className="btn secondary" type="button" disabled={busy} onClick={()=>revoke(g.id)}>Thu hồi</button>}</div>)}
    <h4>Nhật ký chi phí ước tính</h4>{audit.slice(0,10).map(e=><p className="muted" key={e.seq}>{e.action} · {money(e.estimatedUsd)} · {new Date(e.at).toLocaleString('vi-VN')}</p>)}
  </section>;
}
