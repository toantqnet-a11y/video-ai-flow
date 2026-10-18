/**
 * R2-01 EP05 / SC01–SC04: editing an explicit proposal cannot mutate a
 * Master Script or trigger paid AI generation. Backend approval and provenance
 * checks are authoritative; this screen only holds transient draft edits.
 */
import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {useStudio} from './store.js';
import {moveDraft,splitDraft,mergeDraft,applyVisualPrompts} from './scene-editor.mjs';
import {BatchVideoClipsR2VID} from './BatchVideoClipsR2VID.jsx';

export function SceneBuilderWorkspace({video,onNext}){
  const [options,setOptions]=useState({targetSeconds:18,minSeconds:4,maxSeconds:45,wpm:145,mediaType:'image_motion'});
  const [draft,setDraft]=useState([]),[state,setState]=useState(null),[history,setHistory]=useState([]);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const [changed,setChanged]=useState(false),[previewPending,setPreviewPending]=useState(false),[ack,setAck]=useState(false),[dragged,setDragged]=useState(null);
  const [approved,setApproved]=useState(false),[page,setPage]=useState(0);
  const [visualModels,setVisualModels]=useState([]),[visualModelId,setVisualModelId]=useState('');
  const [visualRun,setVisualRun]=useState(null),[visualBusy,setVisualBusy]=useState(false);
  // A new auto-split proposal is also unsaved, even before manual edits.
  const unsaved=changed||previewPending;
  useEffect(()=>{useStudio.setState({sceneBuilderDirty:unsaved});return()=>useStudio.setState({sceneBuilderDirty:false})},[unsaved]);
  // Registered local model metadata is NOT proof that Ollama is currently online.
  useEffect(()=>{let active=true;api('/provider-models').then(x=>{if(!active)return;
    const models=(x.items??[]).filter(m=>m.kind==='llm'&&m.location==='local'&&m.costTier==='local'&&m.status==='active');
    setVisualModels(models);setVisualModelId(old=>models.some(m=>m.id===old)?old:models[0]?.id??'');
  }).catch(()=>{});return()=>{active=false}},[video.id]);
  // Job results are only proposals. Poll bounded metadata; no automatic overwrite.
  useEffect(()=>{if(!visualRun||['succeeded','needs_attention'].includes(visualRun.status))return;
    let active=true;const timer=setInterval(()=>api(`/videos/${video.id}/scenes/visual-prompts/runs/${visualRun.id}`)
      .then(r=>{if(active)setVisualRun(r)}).catch(()=>{}),1800);
    return()=>{active=false;clearInterval(timer)};
  },[video.id,visualRun?.id,visualRun?.status]);
  const pageSize=50;
  const pageCount=Math.max(1,Math.ceil(draft.length/pageSize));
  const load=async()=>{
    if(unsaved&&!window.confirm('Bỏ các chỉnh sửa scene chưa lưu?'))return;
    setError('');
    try{const [s,h]=await Promise.all([api(`/videos/${video.id}/scenes/builder`),api(`/videos/${video.id}/scenes/builder/revisions`)]);
      setState(s);setApproved(true);setHistory(h.items??[]);
      // A saved scene plan can be reopened for safe editing, rather than silently regenerating.
      if(s.sceneRevision){const old=await api(`/videos/${video.id}/scenes/builder/revisions/${s.sceneRevision}`);
        setDraft(old.scenes);setPage(0);setChanged(false);setPreviewPending(false);setAck(false);setNotice(`Đang xem bản scene #${s.sceneRevision}.`);
      }
    }catch(e){setApproved(false);setError(e.code??e.message);}
  };
  useEffect(()=>{setDraft([]);setState(null);setChanged(false);setPreviewPending(false);setAck(false);setHistory([]);setVisualRun(null);load();},[video.id]);
  const preview=async()=>{if(unsaved&&!window.confirm('Thay thế bản scene đang sửa bằng đề xuất mới?'))return;
    setBusy(true);setError('');
    try{const p=await api(`/videos/${video.id}/scenes/builder/preview`,{method:'POST',body:{options}});
      setState(p);setDraft(p.scenes);setPage(0);setChanged(false);setPreviewPending(true);setAck(false);setNotice(`Đã chia ${p.scenes.length} scene; nội dung gốc được giữ nguyên 100%.`);
    }catch(e){setError(e.code??e.message);}finally{setBusy(false)}
  };
  const update=(i,patch)=>{setDraft(d=>d.map((s,k)=>k===i?{...s,...patch}:s));setChanged(true);};
  const change=(f)=>{setDraft(d=>f(d));setChanged(true);};
  const save=async()=>{setBusy(true);setError('');
    try{const result=await api(`/videos/${video.id}/scenes/builder`,{method:'PUT',body:{
      approvedMasterRevision:state.approvedMasterRevision,expectedSceneRevision:state.sceneRevision,
      videoRowVersion:state.videoRowVersion,acknowledgeEdits:ack,scenes:draft}});
      setState(result.state);setHistory((await api(`/videos/${video.id}/scenes/builder/revisions`)).items);
      setChanged(false);setPreviewPending(false);setAck(false);setNotice(`Đã lưu revision #${result.revision} (${result.scenes.length} scene).`);
      useStudio.setState({scenes:result.scenes});await useStudio.getState().reloadVideo(video.id);
    }catch(e){setError(e.code??e.message);}finally{setBusy(false)}
  };
  const generateVisual=async(scope='page')=>{
    if(!visualModelId||!state?.sceneRevision){setError('Hãy lưu danh sách scene và chọn model Ollama local trước khi tạo prompt.');return;}
    if(unsaved){setError('Hãy lưu đề xuất hoặc chỉnh sửa scene trước khi chạy AI để bảo đảm đúng phiên bản.');return;}
    const segment=scope==='all'?draft:draft.slice(page*pageSize,(page+1)*pageSize);
    const pending=segment.filter(x=>x.mediaType!=='import_video'&&!x.visualPrompt?.trim());
    if(!pending.length){setNotice('Trang này không có scene thiếu prompt; sẽ không tạo job lãng phí tài nguyên.');return;}
    setVisualBusy(true);setError('');
    try{const run=await api(`/videos/${video.id}/scenes/visual-prompts/generate`,{method:'POST',body:{
      sceneRevision:state.sceneRevision,videoRowVersion:state.videoRowVersion,modelId:visualModelId,
      requestKey:crypto.randomUUID(),indices:(scope==='all'?draft:draft.slice(page*pageSize,(page+1)*pageSize))
        .flatMap((scene,i)=>scene.mediaType==='import_video'||scene.visualPrompt?.trim()?[]:[scope==='all'?i:page*pageSize+i])}});
      setVisualRun(run);setNotice('Đã xếp hàng gợi ý prompt. Chưa ghi đè nội dung scene.');
    }catch(e){setError(e.code??e.message)}finally{setVisualBusy(false)}
  };
  const useVisual=()=>{
    const result=applyVisualPrompts(draft,visualRun);
    if(result.applied){setDraft(result.scenes);setChanged(true);setNotice(`Đã đưa ${result.applied} gợi ý vào bản nháp. Hãy kiểm tra và bấm Lưu Scene.`)}
    else setNotice('Không có prompt trống phù hợp; prompt đã nhập thủ công được giữ nguyên.');
  };
  const estimate=draft.reduce((n,c)=>n+c.durationMs,0);
  return <section className="frame scene-builder"><header className="frame-title"><div><h2>Scene Builder</h2><p>EP05 · Chia nội dung chuẩn thành scene · TTS & media được tạo ở bước sau</p></div><div className="actions"><button className="btn secondary" onClick={load}>Tải lại</button><button className="btn" disabled={busy||!approved} onClick={preview}>✦ Tự động chia scene</button></div></header>
    {!approved&&<div className="info">🔒 Hãy duyệt <b>Bản chuẩn</b> tại tab Nội dung trước khi tạo scene. {error}</div>}
    {approved&&<><div className="scene-builder-settings">
      <label>Scene mục tiêu (giây)<input type="number" min="3" max="90" value={options.targetSeconds} onChange={e=>setOptions(s=>({...s,targetSeconds:Number(e.target.value)}))}/></label>
      <label>Tối đa (giây)<input type="number" min="3" max="120" value={options.maxSeconds} onChange={e=>setOptions(s=>({...s,maxSeconds:Number(e.target.value)}))}/></label>
      <label>Tốc độ đọc (từ/phút)<input type="number" min="70" max="250" value={options.wpm} onChange={e=>setOptions(s=>({...s,wpm:Number(e.target.value)}))}/></label>
      <label>Media mặc định<select value={options.mediaType} onChange={e=>setOptions(s=>({...s,mediaType:e.target.value}))}><option value="image_motion">Image + Motion</option><option value="ai_video">AI Video</option><option value="import_video">Import Video</option></select></label>
    </div>
    <div className="scene-visual-toolbar">
      <label><b>✦ AI Visual Prompts (Ollama local)</b><select value={visualModelId} onChange={e=>setVisualModelId(e.target.value)}>
        {!visualModels.length&&<option value="">Chưa đăng ký model Ollama local</option>}
        {visualModels.map(m=><option key={m.id} value={m.id}>{m.modelId} · {m.accountId}</option>)}
      </select></label>
      <button className="btn" disabled={visualBusy||busy||unsaved||!state?.sceneRevision||!visualModelId||!draft.length} onClick={()=>generateVisual('page')}>✦ Prompt trang này</button>
      <button className="btn secondary" disabled={visualBusy||busy||unsaved||!state?.sceneRevision||!visualModelId||!draft.length} onClick={()=>generateVisual('all')}>✦ Prompt toàn video</button>
      {visualRun&&<><span className="muted">AI: {visualRun.status} · {visualRun.items?.length??0}/{visualRun.sceneCount} gợi ý
        {visualRun.stale?' · ⚠ Đã hết hiệu lực':''}</span>
        <button className="btn secondary" disabled={visualBusy} onClick={async()=>{try{setVisualRun(await api(`/videos/${video.id}/scenes/visual-prompts/runs/${visualRun.id}`))}catch(e){setError(e.code??e.message)}}}>Làm mới tiến độ</button>
        <button className="btn secondary" disabled={visualRun.status!=='succeeded'||visualRun.stale} onClick={useVisual}>Đưa vào prompt trống →</button></>}
      <small>Chỉ đề xuất, không dùng API trả phí · Prompt tự viết không bị thay thế · Media AI Video cần preflight riêng.</small>
    </div>
    {visualRun?.items?.length>0&&<div className="scene-visual-results">{visualRun.items.map(item=><div className="scene-visual-result" key={item.index}>
      <b>Scene #{item.index+1}</b> <small>· Đề xuất {item.mediaType==='ai_video'?'AI Video (chưa xác minh)':'Image Motion'}</small>
      <p>{item.prompt}</p><small>{item.reason}</small>
    </div>)}</div>}
    <BatchVideoClipsR2VID videoId={video.id} enabled={approved&&!unsaved&&!!state?.sceneRevision}/>
    <div className="scene-builder-summary"><span><b>{draft.length}</b> scene</span><span><b>{(estimate/60000).toFixed(1)}</b> phút dự kiến</span><span>Script duyệt #{state?.approvedMasterRevision}</span><span>Bản scene #{state?.sceneRevision??0}</span></div>
    <p className="muted">Thời lượng scene chỉ là ước tính theo từ/phút; thời lượng chính xác lấy từ file voice thực tế. Kéo để đổi thứ tự. Tách/gộp giữ nguyên ký tự gốc.</p>
    {notice&&<div className="info">{notice}</div>}{error&&<div className="error" role="alert">{error}</div>}
    <div className="scene-builder-page"><span>Scene {Math.min(draft.length,page*pageSize+1)}–{Math.min(draft.length,(page+1)*pageSize)} / {draft.length}</span><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>← Trước</button><button disabled={page>=pageCount-1} onClick={()=>setPage(p=>p+1)}>Sau →</button></div>
    <div className="scene-builder-list">{draft.slice(page*pageSize,(page+1)*pageSize).map((s,localIndex)=>{const i=page*pageSize+localIndex;return <article className="scene-builder-item" key={`${s.sourceStart}-${s.sourceEnd}-${i}`} draggable
      onDragStart={()=>setDragged(i)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(dragged!==null)change(items=>moveDraft(items,dragged,i));setDragged(null)}}>
      <div className="scene-builder-index"><b>⋮⋮ &nbsp; Scene {i+1}</b><small>Source {s.sourceStart}–{s.sourceEnd}</small></div>
      <div className="scene-builder-content"><textarea value={s.text} rows="3" aria-label={`Nội dung scene ${i+1}`} onChange={e=>update(i,{text:e.target.value})}/>
        <div className="scene-builder-fields"><label>Thời lượng (ms)<input type="number" min="500" max="120000" value={s.durationMs} onChange={e=>update(i,{durationMs:Number(e.target.value)})}/></label>
          <label>Media<select value={s.mediaType} onChange={e=>update(i,{mediaType:e.target.value})}><option value="image_motion">Ảnh + hiệu ứng</option><option value="ai_video">AI Video</option><option value="import_video">Clip tải lên</option></select></label>
          <label>Prompt minh họa<input value={s.visualPrompt} maxLength={4000} onChange={e=>update(i,{visualPrompt:e.target.value})} placeholder="Sẽ được AI gợi ý ở R2"/></label></div></div>
      <div className="scene-builder-controls"><button onClick={()=>change(d=>moveDraft(d,i,i-1))} disabled={!i} title="Lên">↑</button><button onClick={()=>change(d=>moveDraft(d,i,i+1))} disabled={i===draft.length-1} title="Xuống">↓</button><button onClick={()=>change(d=>splitDraft(d,i,options.wpm))} title="Tách ở khoảng trắng gần giữa">Tách</button><button onClick={()=>change(d=>mergeDraft(d,i,options.wpm))} disabled={i===draft.length-1} title="Gộp 2 scene liền nguồn">Gộp</button></div>
    </article>})}</div>
    {draft.length>0&&<div className="scene-builder-commit"><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> Tôi xác nhận những thay đổi text / thứ tự so với Bản chuẩn (nếu có).</label><button className="btn" disabled={busy||!draft.length} onClick={save}>💾 Lưu Scene & Phiên bản</button><button className="btn secondary" disabled={unsaved||!state?.sceneRevision||busy} onClick={onNext}>Tiếp: Tạo Voice TTS →</button></div>}
    {history.length>0&&<details><summary>Lịch sử scene ({history.length})</summary>{history.map(h=><p key={h.revision}>#{h.revision} · {h.sceneCount} scene · {new Date(h.createdAt).toLocaleString('vi-VN')} {h.coverage.lossless?'· Nguyên bản':'· Có chỉnh sửa được xác nhận'}</p>)}</details>}
    </>}
  </section>;
}
