import React,{useEffect,useMemo,useRef,useState} from 'react';
import {api} from './api.js';
import {useStudio} from './store.js';
import {moveChapter,outlineClientErrors,outlineStats} from './outline-form.mjs';
const newChapter=()=>({id:crypto.randomUUID(),title:'Chương mới',objective:'Nội dung chính cần truyền tải',keyPoints:[],targetWords:800});
const explain=e=>({OUTLINE_VERSION_CONFLICT:'Dàn ý đã thay đổi ở một phiên khác. Tải lại để tránh ghi đè.',
  OUTLINE_LOCAL_MODEL_REQUIRED:'Bước này chỉ hỗ trợ Ollama local đã bật. Các API từ xa sẽ được tích hợp với phê duyệt ở R1-03.',
  OUTLINE_MODEL_NOT_IN_BRIEF:'Model phải được chọn trong phiên bản Brief đã lưu.',
  OUTLINE_QUEUE_UNAVAILABLE:'Hàng đợi chưa sẵn sàng.'}[e?.code]||e?.code||e?.message||'Có lỗi xảy ra.');
/** CT02. Human approval remains separate from AI suggestions and final script. */
export function ContentOutlineWorkspace({video,onBack}){
  const id=video.id;
  const [outline,setOutline]=useState(null),[draft,setDraft]=useState(null),[brief,setBrief]=useState(null),[history,setHistory]=useState([]),
    [runs,setRuns]=useState([]),[selectedRun,setSelectedRun]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [modelId,setModelId]=useState(''),[availableModels,setAvailableModels]=useState([]);
  const revision=useRef(0),lastSaved=useRef(''),seq=useRef(0),saving=useRef(false);
  const source=JSON.stringify(draft?.chapters??[]),dirty=Boolean(draft&&source!==lastSaved.current);
  useEffect(()=>{useStudio.setState({contentBriefDirty:dirty});return()=>useStudio.setState({contentBriefDirty:false})},[dirty]);
  useEffect(()=>{if(!dirty)return;const f=e=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',f);return()=>window.removeEventListener('beforeunload',f)},[dirty]);
  useEffect(()=>{
    const token=++seq.current;setDraft(null);setBrief(null);setError('');setNotice('');setSelectedRun(null);
    Promise.all([api(`/videos/${id}/content/outline`),api(`/videos/${id}/content/brief`),
      api(`/videos/${id}/content/outline/revisions`),api(`/videos/${id}/content/outline/runs`),api('/provider-models')])
      .then(([o,b,h,r,models])=>{if(token!==seq.current)return;
        setOutline(o);setDraft(o.outline);revision.current=o.revision;lastSaved.current=JSON.stringify(o.outline.chapters);
        const compatible=models.items.filter(m=>m.kind==='llm'&&m.location==='local'&&m.costTier==='local'&&m.status==='active'&&b.brief.modelIds.includes(m.id));
        setBrief(b);setHistory(h.items);setRuns(r.items);setAvailableModels(compatible);setModelId(compatible[0]?.id||'');})
      .catch(e=>{if(token===seq.current)setError(explain(e))});
    return()=>{seq.current++};
  },[id]);
  const estimate=brief?.estimate;
  const stats=useMemo(()=>outlineStats(draft?.chapters,brief?.brief.target.wpm??145,estimate?.targetWords??0),[source,brief]);
  async function reload(){
    if(dirty&&!window.confirm('Tải lại sẽ bỏ thay đổi dàn ý chưa lưu. Tiếp tục?'))return;
    try{const o=await api(`/videos/${id}/content/outline`);revision.current=o.revision;
      setOutline(o);setDraft(o.outline);lastSaved.current=JSON.stringify(o.outline.chapters);
      setError('');setNotice('Đã tải lại dàn ý');
    }catch(e){setError(explain(e))}
  }
  async function save(){if(saving.current||!draft||!dirty)return false;
    const errs=outlineClientErrors(draft.chapters);if(errs.length){setError(errs.join(' '));return false;}
    saving.current=true;setBusy(true);setError('');
    const copy=JSON.stringify(draft.chapters),request={expectedRevision:revision.current,outline:draft};
    try{
      const result=await api(`/videos/${id}/content/outline`,{method:'PUT',body:request});
      revision.current=result.revision;lastSaved.current=copy;setOutline(result);setHistory(old=>[{revision:result.revision,createdAt:Date.now()},...old.filter(x=>x.revision!==result.revision)].slice(0,100));setNotice(`Đã lưu dàn ý v${result.revision}`);return true;
    }catch(e){setError(explain(e));return false}finally{saving.current=false;setBusy(false)}
  }
  useEffect(()=>{if(!draft||!dirty||error||busy)return;const timer=setTimeout(()=>{void save()},850);return()=>clearTimeout(timer)},[source,dirty,error,busy,id]);
  function edit(index,key,value){setNotice('');setError('');setDraft(p=>({...p,chapters:p.chapters.map((c,i)=>i===index?{...c,[key]:value}:c)}));}
  function reorder(from,to){setNotice('');setDraft(p=>({...p,chapters:moveChapter(p.chapters,from,to)}));}
  async function refreshRuns(){try{const r=await api(`/videos/${id}/content/outline/runs`);setRuns(r.items);if(selectedRun)setSelectedRun(r.items.find(x=>x.id===selectedRun.id)??null)}catch(e){setError(explain(e))}}
  useEffect(()=>{if(!runs.some(r=>['pending','queued','running'].includes(r.status)))return;const timer=setInterval(refreshRuns,1800);return()=>clearInterval(timer)},[runs.map(r=>r.status).join('|'),id,selectedRun?.id]);
  async function generate(){if(!brief?.revision||!modelId){setError('Cần lưu Brief và chọn Ollama local trong Brief trước.');return;}
    if(dirty){const ok=await save();if(!ok)return;}
    setBusy(true);setError('');try{
      const run=await api(`/videos/${id}/content/outline/generate`,{method:'POST',body:{briefRevision:brief.revision,
        expectedOutlineRevision:revision.current,modelId,requestKey:crypto.randomUUID()}});
      setRuns(old=>[run,...old]);setSelectedRun(run);setNotice('Đã đưa vào Job Queue. Không gửi yêu cầu tới AI trả phí.');
    }catch(e){setError(explain(e))}finally{setBusy(false)}
  }
  async function accept(run){if(dirty){setError('Lưu hoặc tải lại các sửa đổi chưa lưu trước khi áp dụng đề xuất AI.');return;}
    setBusy(true);try{const accepted=await api(`/videos/${id}/content/outline/runs/${run.id}/accept`,{method:'POST',body:{expectedRevision:revision.current}});
      revision.current=accepted.revision;setOutline(accepted);setDraft(accepted.outline);lastSaved.current=JSON.stringify(accepted.outline.chapters);
      setNotice('Đã chấp nhận đề xuất AI thành phiên bản dàn ý mới. Chưa sinh nội dung chương.');setError('');
      const h=await api(`/videos/${id}/content/outline/revisions`);setHistory(h.items);
    }catch(e){setError(explain(e))}finally{setBusy(false)}
  }
  if(!draft||!brief)return <section className="frame"><h2>Dàn ý chương</h2>{error?<div className="error">{error}</div>:<p>Đang tải dàn ý…</p>}</section>;
  return <section className="frame outline-workspace"><header className="frame-title"><div><h2>② Dàn ý video · {video.title}</h2><p>Chia chương, sắp xếp kéo thả, phân bổ từ · AI tạo đề xuất, người dùng duyệt.</p></div><div className="actions"><button className="btn secondary" onClick={()=>{if(dirty&&!window.confirm('Dàn ý có thay đổi chưa lưu. Quay lại Brief?'))return;onBack?.()}}>← Brief</button><button className="btn secondary" onClick={reload} disabled={busy}>Tải lại</button><button className="btn secondary" onClick={save} disabled={!dirty||busy}>Lưu dàn ý</button></div></header>
    {error&&<div className="error" role="alert">{error}</div>}{notice&&<div className="content-brief-valid" role="status">{notice}</div>}
    <div className="outline-stats"><span><strong>{stats.count}</strong> chương</span><span><strong>{stats.words.toLocaleString('vi-VN')}</strong> / {estimate?.targetWords.toLocaleString('vi-VN')} từ</span><span><strong>{stats.minutes}</strong> phút ước tính</span><span className={Math.abs(stats.delta)>estimate.targetWords*0.15?'warn':''}>Lệch {stats.delta>0?'+':''}{stats.delta.toLocaleString('vi-VN')} từ</span></div>
    <div className="content-brief-grid"><div><div className="outline-list">
      {draft.chapters.map((c,i)=><article className="outline-chapter" key={c.id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',String(i))} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain'));reorder(from,i)}}>
        <header><strong>☷ Chương {i+1}</strong><div className="actions"><button aria-label="Lên" disabled={i===0} onClick={()=>reorder(i,i-1)}>↑</button><button aria-label="Xuống" disabled={i===draft.chapters.length-1} onClick={()=>reorder(i,i+1)}>↓</button><button aria-label="Xóa chương" onClick={()=>setDraft(p=>({...p,chapters:p.chapters.filter(x=>x.id!==c.id)}))}>✕</button></div></header>
        <label>Tiêu đề<input value={c.title} maxLength={180} onChange={e=>edit(i,'title',e.target.value)}/></label>
        <label>Mục tiêu chương<textarea rows={2} maxLength={1000} value={c.objective} onChange={e=>edit(i,'objective',e.target.value)}/></label>
        <label>Ý chính (mỗi dòng một ý)<textarea rows={2} value={c.keyPoints.join('\n')} onChange={e=>edit(i,'keyPoints',e.target.value.split('\n').filter(x=>x.trim()).slice(0,8))}/></label>
        <label>Từ dự kiến<input type="number" min={50} max={5000} value={c.targetWords} onChange={e=>edit(i,'targetWords',Number(e.target.value))}/></label>
      </article>)}
      <button className="btn secondary" onClick={()=>setDraft(p=>({...p,chapters:[...p.chapters,newChapter()]}))} disabled={draft.chapters.length>=50}>+ Thêm chương thủ công</button>
    </div></div><aside className="content-brief-aside">
      <div className="content-brief-panel"><h3>AI đề xuất dàn ý</h3><p>Chỉ hỗ trợ Ollama local ở R1-02; không âm thầm sử dụng tài khoản trả phí.</p>
      <label>Model từ Brief<select value={modelId} onChange={e=>setModelId(e.target.value)}><option value="">Chưa có model Ollama hợp lệ</option>{availableModels.map(m=><option key={m.id} value={m.id}>{m.modelId}</option>)}</select></label>
      <button className="btn" disabled={busy||!modelId||!brief.revision} onClick={generate}>✦ Tạo / Tạo lại dàn ý</button><small>Job dùng snapshot Brief v{brief.revision}; đổi Brief sau đó không thay đổi Job đang chạy.</small></div>
      <div className="content-brief-panel"><h3>Job đề xuất</h3>{runs.length===0?<p>Chưa chạy AI.</p>:runs.map(r=><div key={r.id} className="outline-run"><strong>{r.status}</strong> · {r.modelId}<br/><small>Brief v{r.briefRevision} · base v{r.baseOutlineRevision}</small><div className="actions"><button onClick={()=>setSelectedRun(selectedRun?.id===r.id?null:r)}>Xem</button>{r.result&&<button className="btn secondary" disabled={busy} onClick={()=>accept(r)}>Duyệt & áp dụng</button>}</div>{selectedRun?.id===r.id&&r.result&&<div className="outline-proposal">{r.result.chapters.map((c,i)=><p key={c.id}>{i+1}. {c.title} · {c.targetWords} từ</p>)}</div>}</div>)}</div>
      <div className="content-brief-panel"><h3>Phiên bản dàn ý</h3>{history.slice(0,10).map(x=><p key={x.revision}>v{x.revision} · {new Date(x.createdAt).toLocaleString('vi-VN')}</p>)}<small>Chỉ lưu dàn ý; không thay đổi Bản chuẩn, Scene hay Asset.</small></div>
      <div className="content-brief-panel"><h3>Bước tiếp theo</h3><p>③ Tạo nội dung từng chương (R1-03) → Chấm điểm → Duyệt Bản chuẩn.</p></div>
    </aside></div>
  </section>;
}
