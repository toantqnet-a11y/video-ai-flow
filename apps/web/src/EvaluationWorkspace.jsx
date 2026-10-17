import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api.js';
import {RetryWithFeedback} from './RetryWithFeedback.jsx';

const tips={EVALUATOR_LOCAL_MODEL_REQUIRED:'Chỉ chọn Ollama local đã bật; AI từ xa sẽ tích hợp sau khi kiểm soát quota và chi phí hoàn thiện.',
  EVALUATION_INVALID_OUTPUT:'Giám khảo trả kết quả sai định dạng sau lần sửa. Có thể thử lại.',
  EVALUATION_VARIANT_NOT_FOUND:'Không tìm thấy bản nháp này. Hãy tải lại danh sách.',
  EVALUATION_QUEUE_UNAVAILABLE:'Hàng đợi chưa hoạt động.',EVALUATION_REQUEST_CONFLICT:'Yêu cầu đánh giá đã có cấu hình khác.'};
const message=e=>tips[e?.code]||e?.code||e?.message||'Không thể thực hiện';
const formatScore=n=>typeof n==='number'?`${n.toFixed(1)}/100`:'Chưa chấm';

/**
 * CT04 — per-model/per-chapter scorecards. Read-only draft comparison and
 * permanent evaluation history; results are always derived by the backend.
 * Polling only reloads currently displayed variants and stops when settled.
 */
export function EvaluationWorkspace({video,onBack}){
  const id=video.id;
  const [batches,setBatches]=useState([]),[batchId,setBatchId]=useState(''),[batch,setBatch]=useState(null),
    [chapter,setChapter]=useState(0),[rubric,setRubric]=useState(null),[judges,setJudges]=useState([]),
    [judge,setJudge]=useState(''),[history,setHistory]=useState({}),[loading,setLoading]=useState(false),
    [busyId,setBusyId]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),
    [retryTarget,setRetryTarget]=useState(null);

  useEffect(()=>{let live=true;setHistory({});setError('');setRetryTarget(null);
    Promise.all([api(`/videos/${id}/content/chapters/batches`),api('/provider-models'),api('/content/evaluation-rubric')])
      .then(async([list,models,r])=>{if(!live)return;
        const compatible=models.items.filter(m=>m.kind==='llm'&&m.location==='local'&&m.costTier==='local'&&m.status==='active');
        setRubric(r);setJudges(compatible);setJudge(compatible[0]?.id||'');setBatches(list.items);setBatchId(list.items[0]?.id||'');
        if(list.items[0])setBatch(await api(`/videos/${id}/content/chapters/batches/${list.items[0].id}`));
      }).catch(e=>{if(live)setError(message(e))});
    return()=>{live=false};
  },[id]);

  useEffect(()=>{if(!batch?.results?.length)return;let live=true;
    const rows=batch.results.filter(r=>r.chapterIndex===chapter&&r.variantId);
    const refresh=async()=>{
      const outcomes=await Promise.all(rows.map(async r=>[r.variantId,(await api(`/videos/${id}/content/variants/${r.variantId}/evaluations`)).items]));
      if(live)setHistory(old=>({...old,...Object.fromEntries(outcomes)}));
    };
    refresh().catch(e=>{if(live)setError(message(e))});
    // Bounded refresh avoids polling completed histories indefinitely.
    const timer=setInterval(()=>{
      if(!live)return;
      if(rows.some(r=>(history[r.variantId]??[]).some(x=>['pending','running','queued','paused'].includes(x.status))))
        refresh().catch(e=>{if(live)setError(message(e))});
    },1800);
    return()=>{live=false;clearInterval(timer)};
  },[id,batch?.id,chapter,JSON.stringify(batch?.results?.map(r=>r.variantId)),JSON.stringify(Object.values(history).flat().map(x=>[x.id,x.status]))]);

  // If a generation batch is still running, newly completed chapter drafts
  // become scoreable without requiring the author to leave the Judge tab.
  useEffect(()=>{if(!batch?.id||batch.complete)return;
    let live=true;const timer=setInterval(()=>api(`/videos/${id}/content/chapters/batches/${batch.id}`)
      .then(value=>{if(live)setBatch(value)}).catch(()=>{}),2500);
    return()=>{live=false;clearInterval(timer)};
  },[id,batch?.id,batch?.complete]);

  const versions=batch?.results.filter(r=>r.chapterIndex===chapter)??[];
  const scored=useMemo(()=>versions.map(v=>({draft:v,ratings:history[v.variantId]??[],latest:(history[v.variantId]??[])[0]})),[versions,history]);
  const sorted=[...scored].filter(x=>x.latest?.result).sort((a,b)=>b.latest.result.total-a.latest.result.total);

  async function chooseBatch(value){setBatchId(value);setChapter(0);setHistory({});setLoading(true);setError('');
    try{setBatch(await api(`/videos/${id}/content/chapters/batches/${value}`))}catch(e){setError(message(e))}finally{setLoading(false)}
  }
  async function grade(v){if(!judge||!v.variantId)return;
    setBusyId(v.variantId);setError('');setNotice('');try{
      const run=await api(`/videos/${id}/content/variants/${v.variantId}/evaluations`,{method:'POST',
        body:{evaluatorModelId:judge,requestKey:crypto.randomUUID()}});
      setHistory(old=>({...old,[v.variantId]:[run,...(old[v.variantId]??[])]}));
      setNotice('Đã thêm tác vụ chấm điểm. Nội dung gốc không thay đổi.');
    }catch(e){setError(message(e))}finally{setBusyId('')}
  }
  async function retry(v,run){setBusyId(v.variantId);setError('');try{
    const revised=await api(`/videos/${id}/content/variants/${v.variantId}/evaluations/${run.id}/retry`,{method:'POST',body:{}});
    setHistory(old=>({...old,[v.variantId]:(old[v.variantId]??[]).map(x=>x.id===run.id?revised:x)}));
  }catch(e){setError(message(e))}finally{setBusyId('')}}
  return <section className="frame eval-workspace">
    <header className="frame-title"><div><h2>④ AI Judge · Chấm điểm nội dung</h2><p>Chấm từng bản thảo theo rubric cố định. Giữ toàn bộ lịch sử và nhận xét để dùng cho Retry with Feedback.</p></div>
      <button className="btn secondary" onClick={onBack}>← Viết nội dung</button></header>
    {error&&<div className="error" role="alert">{error}</div>}{notice&&<p role="status">{notice}</p>}
    <div className="eval-toolbar"><label>Đợt tạo nội dung
      <select value={batchId} disabled={loading} onChange={e=>chooseBatch(e.target.value)}>
        {batches.map(x=><option key={x.id} value={x.id}>{new Date(x.createdAt).toLocaleString('vi-VN')} · {x.counts.succeeded}/{x.counts.total}</option>)}
      </select></label><label>Giám khảo Ollama
      <select value={judge} onChange={e=>setJudge(e.target.value)}><option value="">Chọn AI Judge</option>
        {judges.map(m=><option key={m.id} value={m.id}>{m.modelId}</option>)}
      </select></label><span className="badge">Rubric v{rubric?.version??'—'} · Tổng 100</span></div>
    {rubric&&<div className="eval-rubric">{rubric.criteria.map(c=><span key={c.id}><b>{c.label}</b> · {c.weight}%</span>)}</div>}
    {!judges.length&&<p className="muted">Cần kích hoạt ít nhất một model Ollama local trong AI Models & Quota. Không tự gọi AI trả phí.</p>}
    {batch&&<div className="eval-chapter-list">{Array.from({length:batch.chapterCount},(_,idx)=><button key={idx}
      className={chapter===idx?'active':''} onClick={()=>setChapter(idx)}>Chương {idx+1}</button>)}</div>}
    {!batch?<div className="eval-empty">Chưa có bản thảo. Hãy tạo nội dung theo chương trước khi chấm.</div>:
      <><div className="eval-cards">{scored.map(({draft,ratings,latest})=><article key={draft.modelId} className="eval-card">
        <header><h3>{draft.modelId}</h3><span className="badge">{draft.status}</span></header>
        <p className="muted">{draft.chapterTitle} · {draft.wordCount??'—'} từ</p>
        <div className="eval-score">{latest?.result?formatScore(latest.result.total):'—'}<small>{latest?.status==='failed'?'Lỗi chấm điểm':latest?.result?'Kết quả AI tham khảo':latest?.status??'Chưa đánh giá'}</small></div>
        <button className="btn" disabled={!draft.variantId||!judge||busyId===draft.variantId} onClick={()=>grade(draft)}>
          {busyId===draft.variantId?'Đang gửi…':ratings.length?'✦ Chấm lại & lưu lịch sử':'✦ Chấm bản này'}</button>
        {latest?.status==='failed'&&<div className="error">{latest.errorCode}<button className="btn secondary" disabled={!!busyId} onClick={()=>retry(draft,latest)}>Thử lại job lỗi</button></div>}
        {latest?.result&&<button className="btn secondary" onClick={()=>setRetryTarget({variantId:draft.variantId,evaluation:latest})}>↻ Retry with Feedback</button>}
        {latest?.result&&<div className="eval-criteria">{rubric?.criteria.map(c=><div key={c.id}>
          <div className="eval-criterion-title"><span>{c.label}</span><b>{latest.result.criteria[c.id]?.score}/10</b></div>
          <div className="eval-bar"><span style={{width:`${(latest.result.criteria[c.id]?.score??0)*10}%`}}/></div>
          <p>{latest.result.criteria[c.id]?.feedback}</p></div>)}</div>}
        {latest?.result&&<div className="eval-summary"><strong>Nhận xét tổng quan</strong><p>{latest.result.feedback}</p>
          <strong>Gợi ý cải thiện</strong><ol>{latest.result.suggestions.map((v,i)=><li key={i}>{v}</li>)}</ol></div>}
        <details className="eval-history"><summary>Lịch sử chấm ({ratings.length})</summary>
          {ratings.map(r=><div key={r.id}>{new Date(r.createdAt).toLocaleString('vi-VN')} · {r.evaluatorModelId} · {r.result?formatScore(r.result.total):r.status}</div>)}
        </details>
      </article>)}</div>
      {retryTarget&&<RetryWithFeedback key={`${retryTarget.variantId}:${retryTarget.evaluation.id}`} videoId={id}
        variantId={retryTarget.variantId} evaluation={retryTarget.evaluation} modelIds={batch.modelIds}
        onClose={()=>setRetryTarget(null)}/>}
      {sorted.length>1&&<p className="eval-compare">Điểm tham khảo cao nhất chương này: <strong>{sorted[0].draft.modelId}</strong> · {formatScore(sorted[0].latest.result.total)}. Chấm AI có tính chủ quan; cần biên tập/kiểm chứng trước khi xuất bản.</p>}
      </>}
    <p className="muted">Chấm điểm không làm thay đổi bản thảo gốc hoặc Bản chuẩn. Các nhận xét được lưu để phục vụ R1-05 – Retry with Feedback.</p>
  </section>;
}
