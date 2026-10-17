import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {useStudio} from './store.js';
import {summarizeJobsR404,filterPublicJobs} from './job-insights-r404.mjs';

const STATUS_LABELS={pending:'Đang chờ',running:'Đang chạy',paused:'Tạm dừng',succeeded:'Hoàn thành',failed:'Thất bại',cancelled:'Đã hủy'};
const ACTIONS={pending:['pause','cancel'],running:['pause','cancel'],paused:['resume','cancel'],failed:['retry']};
const ACTION_LABELS={pause:'Tạm dừng',resume:'Tiếp tục',cancel:'Hủy',retry:'Thử lại'};

/**
 * R0-06: minimal Job Center on top of a durable SQLite queue.
 * WHY: job details intentionally contain no AI prompt, output file path,
 * key, lease token, provider response or other sensitive payload data.
 * Live changes are reconciled via the existing Shell SSE listener.
 */
export function JobCenter(){
  const queueChange=useStudio(s=>s.jobs);
  const [items,setItems]=useState([]),[counts,setCounts]=useState({}),[status,setStatus]=useState('all');
  const [search,setSearch]=useState(''),[kind,setKind]=useState('all');
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[updated,setUpdated]=useState(null);
  async function refresh(){
    try {
      const query=status==='all'?'':`?status=${encodeURIComponent(status)}`;
      const response=await api(`/jobs${query}`);
      setItems(response.items);setCounts(response.counts);setUpdated(new Date().toLocaleTimeString('vi-VN'));setError('');
    } catch(e){setError(e.message??'Không tải được hàng đợi')}
  }
  // The Shell's authenticated SSE listener refreshes Zustand jobs. Reconcile
  // the current filter whenever it receives a durable queue event.
  useEffect(()=>{void refresh()},[status,queueChange]);
  async function action(job,name){
    // Cancel/running pause can invalidate queued work, and a remote provider
    // may still charge for an already-started call. Require explicit intent.
    if(['cancel','retry'].includes(name)&&!window.confirm(`${ACTION_LABELS[name]} tác vụ ${job.kind}?`))return;
    setBusy(job.id);setError('');
    try {await api(`/jobs/${job.id}/${name}`,{method:'POST',body:{}});await refresh()}
    catch(e){setError(e.message??'Không thể cập nhật tác vụ');await refresh()}
    finally{setBusy('')}
  }
  return <section className="frame job-center"><header className="frame-title"><div>
    <h2>Job Center</h2><p>Trạng thái lấy từ SQLite · Thao tác an toàn từng tác vụ · Không hiển thị prompt/API key.</p>
  </div><button className="btn secondary" onClick={refresh}>↻ Làm mới</button></header>
    <div className="job-kpis">{['pending','running','paused','succeeded','failed'].map(key=><button key={key} className={status===key?'job-stat selected':'job-stat'} onClick={()=>setStatus(old=>old===key?'all':key)}>
      <strong>{counts[key]??0}</strong><span>{STATUS_LABELS[key]}</span></button>)}</div>
    <div className="job-toolbar"><label>Trạng thái <select value={status} onChange={e=>setStatus(e.target.value)}>
      <option value="all">Tất cả</option>{Object.entries(STATUS_LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select></label><small>Hiển thị tối đa 100 tác vụ · Cập nhật: {updated??'Chưa có'}</small></div>
    <div className="job-toolbar"><label>Tìm tác vụ <input aria-label="Tìm tác vụ" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} placeholder="ID, loại hoặc scene" /></label><label>Nhóm tác vụ <select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">Tất cả</option>{[...new Set(items.map(j=>j.kind.split(':')[0]))].map(k=><option key={k} value={k}>{k}</option>)}</select></label></div>
    <div className="job-kpis">{summarizeJobsR404(items).map(group=><span key={group.kind} className="job-stat"><strong>{group.kind}: {group.total}</strong><small>Đang chạy {group.running} · Lỗi {group.failed} · Chờ lâu {group.stale}</small></span>)}</div>
    {error&&<div role="alert" className="job-warning">{error}</div>}
    {filterPublicJobs(items,{search,kind}).length===0?<p className="job-empty">Chưa có tác vụ phù hợp.</p>:<div className="job-rows">
      {filterPublicJobs(items,{search,kind}).map(job=><div key={job.id} className="job-row"><div><strong>{job.kind}</strong><small>ID: {job.id.slice(0,12)} · Lần thử {job.attempt}/{job.maxAttempts}</small>
        {job.lastError&&<small className="job-error">Lỗi: {job.lastError}</small>}</div>
        <span className={'badge '+job.status}>{STATUS_LABELS[job.status]??job.status}</span>
        <div className="job-row-actions">{(ACTIONS[job.status]??[]).map(name=><button key={name} disabled={busy===job.id} onClick={()=>action(job,name)}>{ACTION_LABELS[name]}</button>)}</div></div>)}
    </div>}
    <p className="job-footnote">Tạm dừng/hủy job đang chạy không bảo đảm dừng ngay yêu cầu bên ngoài; trạng thái SQLite ngăn ghi nhận kết quả từ worker đã mất quyền.</p>
  </section>;
}
