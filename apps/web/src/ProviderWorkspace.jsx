/**
 * R0-07 AI Models & Accounts management screen.
 * WHY: accounts, API secrets, models and quota have separate lifecycles; a
 * credential stays in the encrypted vault and never enters channel presets.
 * The routing preview is intentionally read-only and never calls a paid API.
 */
import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {api} from './api.js';
import {PaidApprovalPanel} from './PaidApprovalPanel.jsx';
import {VideoProviderCapabilities} from './VideoProviderCapabilities.jsx';
import {QuotaLedgerPanel} from './QuotaLedgerPanel.jsx';
import {ProviderMonitorPanel} from './ProviderMonitorPanel.jsx';

const badge=(value)=>({active:'Sẵn sàng cấu hình',disabled:'Tắt',local:'Local',remote:'Remote',paid:'Có phí',free_unverified:'Free chưa xác minh',unknown:'Chưa xác định',estimated:'Ước tính',provider_verified:'Provider xác minh'}[value]??value);
const message=e=>e?.code||e?.message||'REQUEST_FAILED';

export function ProviderWorkspace(){
  const [templates,setTemplates]=useState([]),[accounts,setAccounts]=useState([]),[models,setModels]=useState([]),[vault,setVault]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [accountDraft,setAccountDraft]=useState({providerId:'ollama',name:'Ollama local'});
  const [modelDraft,setModelDraft]=useState({accountId:'',kind:'llm',modelId:'',costTier:'',location:'',endpoint:''});
  const [vaultPhrase,setVaultPhrase]=useState(''),[secretDraft,setSecretDraft]=useState({accountId:'',apiKey:''});
  const [kind,setKind]=useState('llm'),[allowRemote,setAllowRemote]=useState(false),[route,setRoute]=useState(null);
  const [quotaDraft,setQuotaDraft]=useState({});
  const [readiness,setReadiness]=useState({});
  const [ledgerModelId,setLedgerModelId]=useState(null);
  const refresh=useCallback(async()=>{
    const [ts,as,ms,vs]=await Promise.all([
      api('/providers/templates'),api('/provider-accounts'),api('/provider-models'),api('/security/vault/status')]);
    setTemplates(ts.items);setAccounts(as.items);setModels(ms.items);setVault(vs);
  },[]);
  useEffect(()=>{refresh().catch(e=>setError(message(e)))},[refresh]);
  async function execute(fn){setBusy(true);setError('');setNotice('');try{await fn();await refresh();setNotice('Đã lưu thay đổi. Không có yêu cầu sinh nội dung hoặc tính phí.')}catch(e){setError(message(e))}finally{setBusy(false)}}
  const chosenTemplate=templates.find(t=>t.id===accountDraft.providerId);
  const selectedAccount=accounts.find(a=>a.id===modelDraft.accountId);
  const selectedTemplate=templates.find(t=>t.id===selectedAccount?.providerId);
  const routeCandidates=route?.candidates??[];
  const allQuota=useMemo(()=>models.map(m=>({...m,remaining:m.quota.limit===null?null:Math.max(0,m.quota.limit-m.quota.used)})),[models]);
  return <section className="providers-workspace">
    <div className="diag-hero"><div><div className="diag-eyebrow">R0-07 · AI RESOURCE CONTROL</div><h2>AI Models & Accounts</h2><p>Cấu hình nhiều tài khoản và model. Ưu tiên local/free; không tự gọi API trả phí.</p></div><button className="btn" disabled={busy} onClick={()=>execute(async()=>{})}>↻ Làm mới</button></div>
    {error&&<div className="warn" role="alert">Không lưu được: {error}</div>}{notice&&<p className="notice" role="status">{notice}</p>}
    <div className="provider-cards"><div className="diag-kpi"><small>Tài khoản</small><strong>{accounts.length}</strong><span>{accounts.filter(a=>a.status==='active').length} đang bật</span></div>
      <div className="diag-kpi"><small>Model</small><strong>{models.length}</strong><span>{models.filter(m=>m.costTier==='local').length} local</span></div>
      <div className="diag-kpi"><small>Quota</small><strong>{models.filter(m=>m.quota.source==='unknown').length}</strong><span>chưa có dữ liệu xác minh</span></div>
      <div className="diag-kpi"><small>Vault</small><strong>{vault?.state??'—'}</strong><span>API key không hiển thị lại</span></div></div>
    <div className="provider-layout">
      <div className="provider-main">
        <div className="provider-box"><h3>1 · Tài khoản AI</h3><p className="muted">Một provider có thể có nhiều tài khoản. Mỗi tài khoản tham chiếu API Key trong Vault; không lưu key tại SQLite.</p>
          <form onSubmit={e=>{e.preventDefault();execute(async()=>{await api('/provider-accounts',{method:'POST',body:{...accountDraft}})})}} className="provider-inline">
            <label>Provider<select value={accountDraft.providerId} onChange={e=>{const t=templates.find(x=>x.id===e.target.value);setAccountDraft({providerId:e.target.value,name:t?.name??''})}}>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>Tên tài khoản<input required maxLength={100} value={accountDraft.name} onChange={e=>setAccountDraft(x=>({...x,name:e.target.value}))}/></label>
            <button className="btn" disabled={busy||!accountDraft.name.trim()}>＋ Thêm</button>
          </form>
          <p className="diag-caption">{chosenTemplate?.location==='remote'?'☁ API từ xa · phải có đồng ý gửi dữ liệu trước khi sử dụng.':'💻 Provider local · không mất phí API nhưng cần phần cứng/phần mềm phù hợp.'}</p>
          <div className="provider-table">{accounts.map(a=><div className="provider-row" key={a.id}><div><b>{a.name}</b><small>{a.providerId} · {a.credentialId?'Đã gắn tham chiếu credential':'Chưa gắn key'} · v{a.rowVersion}</small></div>{readiness[a.id]&&<small className="provider-health">{readiness[a.id].models.map(m=>`${m.modelName}: ${m.state}`).join(' · ')||'Chưa có model'}</small>}
            <span className="badge">{badge(a.status)}</span><button className="btn secondary" disabled={busy} onClick={()=>execute(async()=>{const result=await api(`/provider-accounts/${a.id}/readiness?probe=true`);setReadiness(x=>({...x,[a.id]:result}))})}>Kiểm tra local</button>
            <button className="btn secondary" disabled={busy} onClick={()=>execute(()=>api(`/provider-accounts/${a.id}`,{method:'PATCH',body:{rowVersion:a.rowVersion,status:a.status==='active'?'disabled':'active'}}))}>{a.status==='active'?'Tắt':'Bật'}</button></div>)}{!accounts.length&&<p>Chưa có tài khoản. Thêm provider trước.</p>}</div>
        </div>
        <div className="provider-box"><h3>2 · Model & hạn mức</h3><p className="muted">Hạn mức được nhập thủ công là <b>ước tính</b>, không phải số dư provider xác nhận. Không tự động vượt chính sách quota.</p>
          <form className="provider-inline" onSubmit={e=>{e.preventDefault();execute(async()=>{await api(`/provider-accounts/${modelDraft.accountId}/models`,{method:'POST',body:{modelId:modelDraft.modelId,kind:modelDraft.kind,...(modelDraft.costTier?{costTier:modelDraft.costTier}:{}),...(modelDraft.location?{location:modelDraft.location}:{}),...(modelDraft.endpoint?{endpoint:modelDraft.endpoint}:{})}})})}}>
            <label>Tài khoản<select value={modelDraft.accountId} required onChange={e=>{const a=accounts.find(x=>x.id===e.target.value);const t=templates.find(x=>x.id===a?.providerId);setModelDraft({accountId:e.target.value,kind:t?.kinds[0]??'llm',modelId:'',costTier:'',location:'',endpoint:''})}}><option value="">Chọn tài khoản</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label>Loại<select value={modelDraft.kind} onChange={e=>setModelDraft(x=>({...x,kind:e.target.value}))}>{(selectedTemplate?.kinds??['llm','tts','image','video']).map(k=><option key={k}>{k}</option>)}</select></label>
            <label>ID model<input required value={modelDraft.modelId} placeholder="Ví dụ: llama3.2" onChange={e=>setModelDraft(x=>({...x,modelId:e.target.value}))}/></label>
            {['gemini','custom'].includes(selectedAccount?.providerId)&&<label>Chi phí<select value={modelDraft.costTier} onChange={e=>setModelDraft(x=>({...x,costTier:e.target.value}))}><option value="">Theo provider</option><option value="free_unverified">Free chưa xác minh</option><option value="paid">Có phí</option></select></label>}
            {selectedAccount?.providerId==='custom'&&<><label>Vị trí<select value={modelDraft.location||'remote'} onChange={e=>setModelDraft(x=>({...x,location:e.target.value,costTier:e.target.value==='local'?'local':'free_unverified'}))}><option value="remote">Remote HTTPS</option><option value="local">Local localhost</option></select></label><label>Endpoint<input value={modelDraft.endpoint} placeholder="http://127.0.0.1:8000/tts" onChange={e=>setModelDraft(x=>({...x,endpoint:e.target.value}))}/></label></>}
            <button className="btn" disabled={busy||!modelDraft.accountId||!modelDraft.modelId.trim()}>＋ Thêm model</button>
          </form>
          <div className="provider-table">{allQuota.map(m=>{const a=accounts.find(x=>x.id===m.accountId),q=quotaDraft[m.id]??{source:m.quota.source==='unknown'?'unknown':'estimated',limit:m.quota.limit??0,used:m.quota.used??0};return <div className="provider-row provider-model-row" key={m.id}>
            <div><b>{m.modelId}</b><small>{a?.name??'—'} · {m.kind.toUpperCase()} · {badge(m.location)} · {badge(m.costTier)} · {badge(m.quota.source)}</small><div className="provider-meter">{m.remaining===null?'Quota: chưa xác định':`Chưa trừ giữ chỗ: ${m.remaining}/${m.quota.limit} đơn vị khai báo`}</div></div>
            <div className="provider-mini"><select aria-label={`Quota ${m.modelId}`} value={q.source} onChange={e=>setQuotaDraft(x=>({...x,[m.id]:{...q,source:e.target.value}}))}><option value="unknown">Không xác định</option><option value="estimated">Ước tính</option></select>
              {q.source==='estimated'&&<><input type="number" min="0" aria-label="Giới hạn ước tính" value={q.limit} onChange={e=>setQuotaDraft(x=>({...x,[m.id]:{...q,limit:e.target.value}}))}/><input type="number" min="0" aria-label="Đã dùng ước tính" value={q.used} onChange={e=>setQuotaDraft(x=>({...x,[m.id]:{...q,used:e.target.value}}))}/></>}
              <button className="btn secondary" disabled={busy} onClick={()=>execute(()=>api(`/provider-models/${m.id}/quota`,{method:'PUT',body:{source:q.source,rowVersion:m.rowVersion,...(q.source==='estimated'?{limit:Number(q.limit),used:Number(q.used)}:{})}}))}>Lưu quota</button>
              <button type="button" className="btn secondary" onClick={()=>setLedgerModelId(m.id)} aria-label={`Chi tiết hạn mức ${m.modelId}`}>Sổ quota</button>
              <button className="btn secondary" disabled={busy} onClick={()=>execute(()=>api(`/provider-models/${m.id}`,{method:'PATCH',body:{rowVersion:m.rowVersion,status:m.status==='active'?'disabled':'active'}}))}>{m.status==='active'?'Tắt':'Bật'}</button></div>
          </div>})}{!models.length&&<p>Chưa có model. Hãy thêm model thuộc tài khoản đã cấu hình.</p>}</div>
          {ledgerModelId&&models.find(m=>m.id===ledgerModelId)&&<QuotaLedgerPanel model={models.find(m=>m.id===ledgerModelId)} onClose={()=>setLedgerModelId(null)}/>}
        </div>
      </div>
      <aside className="provider-side">
        <div className="provider-box"><h3>3 · Credential Vault</h3><div className="provider-pill">{vault?.state??'Chưa kết nối'}</div><p className="muted">Mật khẩu vault và API key không được lưu trong localStorage. Chỉ nhập vào form bảo mật local.</p>
          {vault?.state!=='UNLOCKED'&&<form onSubmit={e=>{e.preventDefault();execute(async()=>{await api(vault?.state==='UNINITIALIZED'?'/security/vault/init':'/security/vault/unlock',{method:'POST',body:{passphrase:vaultPhrase}});setVaultPhrase('')})}}><label>Passphrase (tối thiểu 12 ký tự)<input type="password" minLength={12} autoComplete="off" value={vaultPhrase} onChange={e=>setVaultPhrase(e.target.value)}/></label><button className="btn" disabled={busy||vaultPhrase.length<12}>{vault?.state==='UNINITIALIZED'?'Khởi tạo vault':'Mở khóa'}</button></form>}
          {vault?.state==='UNLOCKED'&&<><form onSubmit={e=>{e.preventDefault();execute(async()=>{const a=accounts.find(x=>x.id===secretDraft.accountId);if(!a)throw new Error('CHOOSE_ACCOUNT');const id=`credential-${crypto.randomUUID()}`;await api('/security/credentials',{method:'POST',body:{id,providerId:a.providerId,apiKey:secretDraft.apiKey}});await api(`/provider-accounts/${a.id}`,{method:'PATCH',body:{rowVersion:a.rowVersion,credentialId:id}});setSecretDraft({accountId:'',apiKey:''})})}}>
            <label>Gắn key vào tài khoản<select value={secretDraft.accountId} required onChange={e=>setSecretDraft(x=>({...x,accountId:e.target.value}))}><option value="">Chọn tài khoản</option>{accounts.filter(a=>a.status==='active').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label>API Key<input required type="password" autoComplete="off" value={secretDraft.apiKey} onChange={e=>setSecretDraft(x=>({...x,apiKey:e.target.value}))}/></label><button className="btn" disabled={busy||!secretDraft.accountId||!secretDraft.apiKey}>Mã hóa & gắn key</button></form>
            <button className="btn secondary" disabled={busy} onClick={()=>execute(()=>api('/security/vault/lock',{method:'POST',body:{}}))}>🔒 Khóa vault</button></>}
        </div>
        <div className="provider-box"><h3>4 · Fallback Preview</h3><p className="muted">Xem thứ tự ưu tiên; chỉ mô phỏng, không gửi dữ liệu, không tính phí.</p>
          <label>Tác vụ<select value={kind} onChange={e=>setKind(e.target.value)}><option value="llm">LLM</option><option value="tts">TTS</option><option value="image">Image</option><option value="video">Video</option></select></label>
          <label className="provider-check"><input type="checkbox" checked={allowRemote} onChange={e=>setAllowRemote(e.target.checked)}/> Cho phép xét remote trong mô phỏng</label>
          <button className="btn" disabled={busy} onClick={()=>execute(async()=>{const result=await api('/providers/route-preview',{method:'POST',body:{kind,allowRemote}});setRoute(result)})}>Xem lộ trình</button>
          {route&&<div className="provider-plan"><strong>{route.selected?'Ứng viên: '+route.selected.providerId:'Không có ứng viên đủ điều kiện'}</strong>{routeCandidates.map((c,i)=><p key={c.modelId}>#{i+1} {c.providerId} / {c.kind} — {c.eligible?'Đủ điều kiện chính sách':c.reason}</p>)}<small>{route.message}</small></div>}
        </div>
        <PaidApprovalPanel accounts={accounts} models={models}/><div className="warn"><b>⚠ Cảnh báo chi phí</b><p>Không tự chuyển sang API trả phí. Việc duyệt model trong màn hình này không kích hoạt tính phí. Quota và mức miễn phí có thể thay đổi theo từng tài khoản.</p></div>
      </aside>
    </div>
  <ProviderMonitorPanel/>
  <VideoProviderCapabilities/>
  </section>;
}
