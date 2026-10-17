import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api.js';

const describe=e=>({CHAPTER_LOCAL_MODEL_REQUIRED:'Hiện chỉ cho phép Ollama local đã kích hoạt; model trả phí/API ngoài cần bộ kiểm soát ở R1-07.',
  CHAPTER_OUTLINE_VERSION_CONFLICT:'Dàn ý đã được cập nhật. Hãy tải lại trước khi tạo.',
  CHAPTER_MODEL_NOT_IN_BRIEF:'Model phải được chọn ở Brief đã lưu.',
  CHAPTER_QUEUE_UNAVAILABLE:'Job Queue chưa sẵn sàng.',
  CHAPTER_BATCH_CONFLICT:'Mã yêu cầu đã được sử dụng với cấu hình khác.'}[e?.code]||e?.code||e?.message||'Lỗi không xác định');

/**
 * CT03 — one row per chapter, one column per selected model. The UI only
 * schedules work via the backend; browser reloads never lose generation.
 * Drafts are deliberately READ-ONLY until R1-04/05/06 scoring and approval.
 */
export function ChapterGenerationWorkspace({video,onBack}){
  const id=video.id;
  const [brief,setBrief]=useState(null),[outline,setOutline]=useState(null),[models,setModels]=useState([]),
    [selected,setSelected]=useState([]),[batches,setBatches]=useState([]),[active,setActive]=useState(null),
    [chapter,setChapter]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{let live=true;setActive(null);setError('');
    Promise.all([api(`/videos/${id}/content/brief`),api(`/videos/${id}/content/outline`),
      api('/provider-models'),api(`/videos/${id}/content/chapters/batches`)]).then(([b,o,m,list])=>{
      if(!live)return;
      setBrief(b);setOutline(o);
      const compatible=m.items.filter(x=>x.kind==='llm'&&x.location==='local'&&x.costTier==='local'&&x.status==='active'&&b.brief.modelIds.includes(x.id));
      setModels(compatible);setSelected(compatible.slice(0,2).map(x=>x.id));setBatches(list.items);
      if(list.items[0])return api(`/videos/${id}/content/chapters/batches/${list.items[0].id}`).then(x=>{if(live)setActive(x)});
    }).catch(e=>{if(live)setError(describe(e))});return()=>{live=false};
  },[id]);
  const ongoing=active?.results.some(r=>['pending','queued','running','paused'].includes(r.status));
  useEffect(()=>{if(!active?.id||!ongoing)return;
    const poll=setInterval(()=>api(`/videos/${id}/content/chapters/batches/${active.id}`).then(setActive).catch(e=>setError(describe(e))),1600);
    return()=>clearInterval(poll);
  },[id,active?.id,ongoing]);
  const chapterList=outline?.outline.chapters??[];
  const progress=active?Math.round(active.counts.succeeded/Math.max(1,active.counts.total)*100):0;
  const showModels=active?.modelIds??selected;
  const byModel=useMemo(()=>Object.fromEntries(showModels.map(mid=>[mid,active?.results.find(r=>r.modelId===mid&&r.chapterIndex===chapter)])),[active,chapter,showModels.join(',')]);
  function toggle(mid){setSelected(old=>old.includes(mid)?old.filter(m=>m!==mid):old.length>=3?old:[...old,mid]);}
  async function generate(){if(!brief?.revision||!outline?.revision||selected.length===0){setError('Cần lưu Brief, dàn ý và chọn ít nhất một model local.');return;}
    setBusy(true);setError('');try{
      const batch=await api(`/videos/${id}/content/chapters/generate`,{method:'POST',body:{briefRevision:brief.revision,
        outlineRevision:outline.revision,modelIds:selected,requestKey:crypto.randomUUID()}});
      setActive(batch);setChapter(0);setBatches(old=>[batch,...old]);setNotice('Đã xếp hàng. Các model chạy song song, các chương của cùng model chạy tuần tự để giữ mạch nội dung.');
    }catch(e){setError(describe(e))}finally{setBusy(false)}
  }
  async function openBatch(batchId){setError('');try{setActive(await api(`/videos/${id}/content/chapters/batches/${batchId}`));setChapter(0)}catch(e){setError(describe(e))}}
  async function retry(){if(!active)return;setBusy(true);try{setActive(await api(`/videos/${id}/content/chapters/batches/${active.id}/retry`,{method:'POST',body:{}}));setNotice('Chỉ chạy lại các chương lỗi, không tạo lại các chương thành công.')}catch(e){setError(describe(e))}finally{setBusy(false)}}
  return <section className="frame chapter-workspace">
    <header className="frame-title"><div><h2>③ Viết nội dung bằng nhiều AI · {video.title}</h2><p>Chạy 1–3 model, so sánh từng chương, tiếp tục sau restart. Bản nháp chưa phải Bản chuẩn.</p></div>
      <button className="btn secondary" onClick={onBack}>← Dàn ý</button></header>
    {error&&<div className="error" role="alert">{error}</div>}{notice&&<p role="status" className="content-brief-valid">{notice}</p>}
    <div className="chapter-toolbar"><div><strong>Model Ollama từ Brief đã lưu</strong><div className="chapter-models">{models.map(m=><label key={m.id}><input type="checkbox" checked={selected.includes(m.id)} onChange={()=>toggle(m.id)} disabled={busy}/>{m.modelId}</label>)}{!models.length&&<small>Chưa có Ollama local hợp lệ. Hãy cấu hình tài khoản/model rồi chọn trong Brief.</small>}</div>
      <small>Không gọi model remote/trả phí tại R1-03. Khi có nhiều model, hệ thống tạo các nhánh độc lập.</small></div>
      <button className="btn" disabled={busy||!selected.length||!outline?.revision||!chapterList.length} onClick={generate}>✦ Tạo bản nháp nội dung</button></div>
    {active&&<div className="chapter-progress"><div className="actions"><strong>Batch · {active.counts.succeeded}/{active.counts.total} chương/model ({progress}%)</strong>
      {active.counts.failed>0&&<button className="btn secondary" disabled={busy} onClick={retry}>↻ Retry chương lỗi ({active.counts.failed})</button>}
      <span className="badge">{active.complete?'Hoàn thành':'Đang xử lý'}</span></div><div className="progress-track"><div style={{width:`${progress}%`}}/></div></div>}
    <div className="chapter-grid"><aside className="chapter-nav"><h3>Chương · {active?.chapterCount??chapterList.length}</h3>
      {(active?Array.from({length:active.chapterCount},(_,i)=>i):chapterList.map((_,i)=>i)).map(i=><button key={i} className={chapter===i?'active':''} onClick={()=>setChapter(i)}>
        <span>{String(i+1).padStart(2,'0')}</span><span>{chapterList[i]?.title||active?.results.find(r=>r.chapterIndex===i)?.chapterTitle||'Chương'}<small>{active?active.results.filter(r=>r.chapterIndex===i&&r.status==='succeeded').length+'/'+showModels.length+' bản đã xong':''}</small></span>
      </button>)}
      <hr/><label>Lịch sử batch<select value={active?.id??''} onChange={e=>openBatch(e.target.value)}><option value="">Chưa tạo</option>
        {batches.map(x=><option key={x.id} value={x.id}>{new Date(x.createdAt).toLocaleString('vi-VN')} · {x.counts.succeeded}/{x.counts.total}</option>)}</select></label>
    </aside><div className="chapter-results">{!active?<div className="content-brief-panel"><h3>Chưa có bản nháp</h3><p>Chọn model và tạo nội dung. Chương 2 sẽ tham chiếu bản tóm tắt của chương 1 cùng model.</p></div>:
      <div className="chapter-comparison" style={{gridTemplateColumns:`repeat(${Math.max(1,showModels.length)},minmax(260px,1fr))`}}>{showModels.map(mid=>{
        const result=byModel[mid];const model= models.find(m=>m.id===mid);
        return <article className="chapter-output" key={mid}><header><strong>{model?.modelId||mid}</strong><span className="badge">{result?.status??'Chưa xếp hàng'}</span></header>
          <small>Mục tiêu: {result?.targetWords??'—'} từ · Đã tạo: {result?.wordCount??'—'} từ</small>
          {result?.text?<div className="chapter-content"><p>{result.text}</p><hr/><strong>Tóm tắt nối mạch</strong><p>{result.summary}</p></div>:
            <p className="muted">{result?.errorCode?`Lỗi: ${result.errorCode}`:'Đang chờ đến lượt hoặc mô hình xử lý…'}</p>}
          </article>;
      })}</div>}</div></div>
    <p className="muted">Nội dung ở đây là phiên bản nháp theo model/chương, chưa chấm điểm, chưa duyệt và không tự ghi đè kịch bản chuẩn.</p>
  </section>;
}
