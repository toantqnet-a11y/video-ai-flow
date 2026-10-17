import React,{useCallback,useEffect,useState} from 'react';
import {api} from './api.js';

const summarizeFeedback=result=>[result?.feedback,...(result?.suggestions??[]).map((v,i)=>`${i+1}. ${v}`)].filter(Boolean).join('\n');
const retryError=error=>({INVALID_CONTENT_RETRY:'Nhận xét phải dài tối thiểu 10 ký tự và tối đa 4.000 ký tự.',
  CONTENT_RETRY_REQUIRES_SCORE:'Chỉ tạo lại nội dung từ bản đã được AI chấm điểm.',
  CONTENT_RETRY_REQUEST_CONFLICT:'Yêu cầu này đã được gửi với nội dung khác.',
  CHAPTER_LOCAL_MODEL_REQUIRED:'Model không phải Ollama local được phép trong Brief.',
  CONTENT_RETRY_QUEUE_UNAVAILABLE:'Hàng đợi đang không khả dụng.'})[error?.code]||error?.code||'Đã xảy ra lỗi. Vui lòng thử lại.';

/**
 * CT04 → Retry panel. Keep per-variant lineage, feedback edits and comparisons
 * local to a single video. The editor NEVER silently regenerates paid assets,
 * changes the master script or submits retry without the user's button press.
 * Poll while jobs run; the next scoring step is separate and explicitly chosen.
 */
export function RetryWithFeedback({videoId,variantId,evaluation,modelIds,onClose}){
  const [source,setSource]=useState({variantId,evaluation});
  const [feedback,setFeedback]=useState(summarizeFeedback(evaluation.result));
  const [modelId,setModelId]=useState(modelIds[0]||'');
  const [retries,setRetries]=useState([]),[selected,setSelected]=useState(null),[comparison,setComparison]=useState(null);
  const [grade,setGrade]=useState(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const base=`/videos/${videoId}/content/variants/${source.variantId}`;
  const refresh=useCallback(()=>api(`${base}/retries`).then(payload=>setRetries(payload.items)),[base]);

  useEffect(()=>{setFeedback(summarizeFeedback(source.evaluation.result));setSelected(null);setComparison(null);setRetries([]);setGrade(null);
    refresh().catch(e=>setError(retryError(e)));
  },[source.variantId,source.evaluation.id,refresh]);
  useEffect(()=>{if(!retries.some(x=>['pending','queued','running','paused'].includes(x.status)))return;
    const timer=setInterval(()=>refresh().catch(()=>{}),1800);return()=>clearInterval(timer);
  },[retries,refresh]);
  useEffect(()=>{if(!grade||!['pending','queued','running','paused'].includes(grade.status))return;
    const timer=setInterval(()=>api(`/videos/${videoId}/content/variants/${grade.variantId}/evaluations/${grade.id}`)
      .then(setGrade).catch(e=>setError(retryError(e))),1800);
    return()=>clearInterval(timer);
  },[grade?.id,grade?.variantId,grade?.status,videoId]);

  async function submit(){setBusy(true);setError('');setNotice('');
    try{
      const response=await api(`${base}/retries`,{method:'POST',body:{evaluationId:source.evaluation.id,
        modelId,feedback,requestKey:crypto.randomUUID()}});
      setRetries(old=>[response,...old]);setSelected(response);setNotice('Đã đưa một chương vào hàng đợi. Bản cũ được giữ nguyên.');
    }catch(e){setError(retryError(e))}finally{setBusy(false)}
  }
  async function compare(row){setSelected(row);setComparison(null);setError('');
    try{setComparison(await api(`${base}/retries/${row.id}/compare`))}catch(e){setError(retryError(e))}
  }
  async function regrade(row){setBusy(true);setError('');
    try{const result=await api(`/videos/${videoId}/content/variants/${row.variantId}/evaluations`,{
      method:'POST',body:{evaluatorModelId:source.evaluation.evaluatorModelId,requestKey:crypto.randomUUID()}});
      setGrade(result);setNotice('Đã đưa bản mới vào hàng đợi chấm lại.');
    }catch(e){setError(retryError(e))}finally{setBusy(false)}
  }
  async function restart(row){setBusy(true);setError('');try{
    const updated=await api(`${base}/retries/${row.id}/retry-job`,{method:'POST',body:{}});
    setRetries(old=>old.map(x=>x.id===updated.id?updated:x));
    setNotice('Đã gửi lại job lỗi, giữ nguyên feedback và model đã chọn.');
  }catch(e){setError(retryError(e))}finally{setBusy(false)}}
  function useNewScore(){setSource({variantId:grade.variantId,evaluation:grade});setNotice('Có thể tiếp tục Retry từ phiên bản mới được chấm.');setError('')}
  const active=retries.find(x=>x.id===selected?.id)||selected;
  return <section className="retry-workspace" aria-label="Retry với nhận xét AI">
    <header className="frame-title"><div><h3>↻ Retry with Feedback</h3><p>Biên tập nhận xét trước khi tạo lại đúng một chương. Phiên bản cũ và Bản chuẩn không bị thay đổi.</p></div>
      <button className="btn secondary" onClick={onClose}>Đóng</button></header>
    {error&&<div className="error" role="alert">{error}</div>}{notice&&<div role="status">{notice}</div>}
    <div className="retry-grid"><div className="retry-config"><label>AI viết lại (Ollama local)
      <select value={modelId} onChange={e=>setModelId(e.target.value)}>{modelIds.map(x=><option value={x} key={x}>{x}</option>)}</select></label>
      <label>Nhận xét và yêu cầu sửa (có thể chỉnh sửa)
        <textarea value={feedback} maxLength={4000} rows={9} onChange={e=>setFeedback(e.target.value)} />
      </label><div className="muted">{feedback.length}/4.000 ký tự · Chỉ gọi Ollama local · Không tự dùng API trả phí.</div>
      <button className="btn" disabled={busy||!modelId||feedback.trim().length<10} onClick={submit}>
        {busy?'Đang xử lý…':'↻ Tạo phiên bản mới'}</button></div>
      <div className="retry-results"><h4>Lịch sử các lần Retry ({retries.length})</h4>
        {!retries.length&&<p className="muted">Chưa có phiên bản được tạo lại từ bản nháp này.</p>}
        {retries.map(r=><div className="retry-history-row" key={r.id}>
          <b>{r.modelId}</b><small>{new Date(r.createdAt).toLocaleString('vi-VN')} · {r.status}</small>
          {r.wordCount!==null&&<small>{r.wordCount} từ</small>}
          {r.status==='succeeded'&&<><button className="btn secondary" onClick={()=>compare(r)}>So sánh trước / sau</button>
            <button className="btn secondary" disabled={busy} onClick={()=>regrade(r)}>✦ Chấm lại bản mới</button></>}
          {r.status==='failed'&&<button className="btn secondary" disabled={busy} onClick={()=>restart(r)}>Retry job lỗi</button>}
        </div>)}
      </div></div>
    {comparison&&active?.id===comparison.retry.id&&<div className="retry-compare"><div><h4>Phiên bản gốc · {comparison.source.wordCount} từ</h4>
      <div className="retry-text">{comparison.source.text}</div></div><div><h4>Phiên bản mới · {comparison.retry.wordCount} từ</h4>
      <div className="retry-text">{comparison.retry.text}</div></div></div>}
    {grade&&<div className="retry-grade">AI Judge: <strong>{grade.result?`${grade.result.total}/100`:grade.status}</strong>
      {grade.status==='succeeded'&&<button className="btn" onClick={useNewScore}>Tiếp tục Retry với bản vừa chấm ↻</button>}
      {grade.status==='failed'&&<p className="error">Chấm lại thất bại. Có thể chấm lại ở AI Judge.</p>}
    </div>}
  </section>;
}
