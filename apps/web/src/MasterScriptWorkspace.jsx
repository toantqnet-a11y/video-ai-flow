import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {useStudio} from './store.js';

const errorMessage=error=>({MASTER_CHAPTER_COVERAGE:'Cần chọn một bản thảo cho từng chương.',
  MASTER_SOURCE_MISMATCH:'Bản thảo thuộc chương, video hoặc phiên bản dàn ý khác.',
  MASTER_OUTLINE_STALE:'Dàn ý đã thay đổi; hãy làm mới trước khi lưu hoặc duyệt.',
  MASTER_WARNINGS_REQUIRE_ACK:'Vui lòng xác nhận các cảnh báo trước khi duyệt.',
  MASTER_VERSION_CONFLICT:'Dữ liệu đã thay đổi tại một tab khác. Hãy tải lại.',
  SCENES_EXIST_REQUIRE_REBUILD:'Video đã có scene: không thể thay bản chuẩn khi chưa xử lý tạo lại scene.'
}[error?.code]||error?.code||error?.message||'Có lỗi xảy ra');

/**
 * CT05 — select one revision per outline chapter, review exact assembled text,
 * then explicitly approve. The Preview/Save buttons NEVER write videos.master_script.
 * A failed source or stale outline check stops the flow rather than inventing text.
 */
export function MasterScriptWorkspace({video,onBack,onApproved,onOpenSceneBuilder}){
  const id=video.id;
  const [outline,setOutline]=useState(null),[variants,setVariants]=useState([]),[selected,setSelected]=useState({}),
    [status,setStatus]=useState(null),[history,setHistory]=useState([]),[candidate,setCandidate]=useState(null),
    [text,setText]=useState(''),[dirty,setDirty]=useState(false),[approvedWarnings,setApprovedWarnings]=useState(false),
    [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),
    [mode,setMode]=useState('ai');
  // Warn when leaving an unsaved Master Script draft; this is independent of
  // Brief/Outline dirty state and must not dispatch AI or scene mutations.
  useEffect(()=>{useStudio.setState({masterScriptDirty:dirty});return()=>useStudio.setState({masterScriptDirty:false})},[dirty]);
  async function load(){
    setError('');const [o,master,batches]=await Promise.all([
      api(`/videos/${id}/content/outline`),api(`/videos/${id}/content/master/revisions`),
      api(`/videos/${id}/content/chapters/batches`)]);
    const result=[];
    for(const item of batches.items.slice(0,20)){
      if(item.outlineRevision!==o.revision)continue;
      const details=await api(`/videos/${id}/content/chapters/batches/${item.id}`);
      for(const draft of details.results.filter(r=>r.status==='succeeded'&&r.variantId)){
        result.push({...draft,label:`${draft.modelId} · ${new Date(item.createdAt).toLocaleDateString('vi-VN')}`});
        // Follow re-scored retry chains (R1-05 supports Retry -> Score -> Retry).
        // Bounded traversal prevents a pathological history from locking the UI.
        const visited=new Set([draft.variantId]);let frontier=[draft.variantId];
        for(let depth=1;depth<=8&&frontier.length&&visited.size<120;depth++){
          const next=[];
          for(const sourceId of frontier){
            const retries=await api(`/videos/${id}/content/variants/${sourceId}/retries`);
            for(const retry of retries.items??[])if(retry.status==='succeeded'&&retry.variantId&&!visited.has(retry.variantId)){
              visited.add(retry.variantId);next.push(retry.variantId);
              result.push({...draft,variantId:retry.variantId,text:retry.text,
                wordCount:retry.wordCount,label:`↻ Retry lần ${depth} · ${draft.modelId}`});
              if(visited.size>=120)break;
            }
          }
          frontier=next;
        }
      }
    }
    setOutline(o);setVariants(result);setStatus(master.state);setHistory(master.items);
    if(master.state.revision){
      const r=await api(`/videos/${id}/content/master/revisions/${master.state.revision}`);
      setCandidate(r);setText(r.text);setDirty(false);setMode(r.outlineRevision===0?'manual':'ai');
      setSelected(Object.fromEntries(r.sources.map(x=>[x.chapterIndex,x.variantId])));
    }else{
      setSelected(Object.fromEntries(o.outline.chapters.map((c,i)=>[i,result.find(v=>v.chapterIndex===i)?.variantId??''])));
      setCandidate(null);setText(video.masterScript??'');setDirty(false);setMode(video.masterScript?'manual':'ai');
    }
    setApprovedWarnings(false);
  }
  useEffect(()=>{let active=true;load().catch(e=>{if(active)setError(errorMessage(e))});return()=>{active=false}},[id]);
  // Server load fills mode/text from persisted state. Do not allow typing
  // before it resolves or a delayed response can overwrite real draft edits.
  const choices=(outline?.outline.chapters??[]).map((chapter,index)=>({chapter,index,
    options:variants.filter(v=>v.chapterIndex===index)}));
  const selection=()=>choices.map(x=>({chapterIndex:x.index,variantId:selected[x.index]}));
  const allChosen=choices.length>0&&choices.every(x=>selected[x.index]);
  function selectVariant(index,variantId){setSelected(old=>({...old,[index]:variantId}));setCandidate(null);setText('');setDirty(true);setNotice('');setApprovedWarnings(false)}
  async function perform(fn){setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}}
  const base=()=>mode==='manual'?{outlineRevision:0,selections:[],editedText:text}:
    {outlineRevision:outline.revision,selections:selection()};
  const ready=mode==='manual'?!!text.trim():allChosen;
  function changeMode(next){if(mode===next)return;
    if(dirty&&!window.confirm('Bỏ thay đổi chưa lưu để chuyển cách tạo bản chuẩn?'))return;
    setMode(next);setCandidate(null);setText('');setDirty(next==='manual');setApprovedWarnings(false);setNotice('');
  }
  async function preview(){await perform(async()=>{
    const r=await api(`/videos/${id}/content/master/preview`,{method:'POST',body:base()});
    setText(r.text);setCandidate(null);setDirty(true);setNotice(mode==='manual'?'Kịch bản nhập tay hợp lệ. Hãy lưu ứng viên để duyệt.':`Đã ghép ${r.sources.length} chương. Hãy đọc và biên tập trước khi lưu.`);
  })}
  async function save(){await perform(async()=>{
    const r=await api(`/videos/${id}/content/master`,{method:'PUT',body:{...base(),editedText:text,expectedRevision:status.revision}});
    setCandidate(r);setDirty(false);setStatus(s=>({...s,revision:r.revision}));setHistory(old=>[{
      revision:r.revision,outlineRevision:r.outlineRevision,wordCount:r.wordCount,warnings:r.warnings,
      sha256:r.sha256,approved:false,createdAt:r.createdAt},...old]);
    setApprovedWarnings(false);setNotice('Đã lưu bản ứng viên. Chưa được duyệt; không thay đổi Master Script.');
  })}
  async function approve(){await perform(async()=>{
    const outcome=await api(`/videos/${id}/content/master/approve`,{method:'POST',body:{
      revision:candidate.revision,expectedRevision:status.revision,videoRowVersion:status.currentVideoRowVersion,
      acknowledgeWarnings:approvedWarnings}});
    setStatus(outcome.state);setCandidate(outcome.revision);
    setHistory(old=>old.map(r=>r.revision===outcome.revision.revision?{...r,approved:true}:r));
    setNotice('✓ Đã chốt Bản chuẩn. Có thể chuyển sang tách scene.');onApproved?.();
  })}
  async function openVersion(revision){
    if(dirty&&!window.confirm('Bản biên tập có thay đổi chưa lưu. Bỏ thay đổi để xem lịch sử?'))return;
    await perform(async()=>{
    const r=await api(`/videos/${id}/content/master/revisions/${revision}`);
    setCandidate(r);setText(r.text);setDirty(false);setApprovedWarnings(false);setMode(r.outlineRevision===0?'manual':'ai');
    setSelected(Object.fromEntries(r.sources.map(x=>[x.chapterIndex,x.variantId])));
    setNotice(`Đang xem phiên bản ${revision}. Chỉ phiên bản mới nhất có thể được duyệt.`);
  })}
  // Export is read-only and takes the approved revision from server; edited
  // draft text in the textarea is never smuggled into a render-ready JSON.
  async function exportApprovedJson(){await perform(async()=>{
    const body={approvedRevision:status.approvedRevision};
    const data=await api(`/videos/${id}/content/script-skills/export`,{method:'POST',body});
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    try{const a=document.createElement('a');a.href=url;a.download=`script-${id}-v${body.approvedRevision}.json`;a.click();}
    finally{setTimeout(()=>URL.revokeObjectURL(url),1000)}
    setNotice(`Đã xuất ${data.segments.length} đoạn kịch bản. Thời lượng chỉ là ước tính cho đến khi tạo voice.`);
  })}
  const canApprove=!!candidate&&!dirty&&candidate.revision===status?.revision;
  return <section className="frame master-workspace"><header className="frame-title"><div>
    <h2>⑤ Bản chuẩn · Master Script</h2><p>Chọn một bản thảo mỗi chương → ghép → biên tập → lưu phiên bản → duyệt thủ công. Không có tự động phê duyệt bởi AI.</p>
    </div><button className="btn secondary" onClick={onBack}>← AI Judge</button></header>
    {error&&<div className="error" role="alert">{error}</div>}{notice&&<p role="status" className="content-brief-valid">{notice}</p>}
    <div className="master-stats"><span>Dàn ý v{outline?.revision??'–'}</span><span>Ứng viên v{status?.revision??0}</span>
      <span>{status?.approvedRevision?`✓ Đã duyệt v${status.approvedRevision}`:'Chưa duyệt'}</span>
      <span>{text.trim().split(/\s+/).filter(Boolean).length.toLocaleString('vi-VN')} từ</span></div>
    <div className="master-mode"><button className={mode==='ai'?'selected':''} disabled={busy||!outline||!status} onClick={()=>changeMode('ai')}>Từ các bản thảo AI</button>
      <button className={mode==='manual'?'selected':''} disabled={busy||!outline||!status} onClick={()=>changeMode('manual')}>Nhập kịch bản thủ công</button></div>
    <div className="master-columns"><div className="content-brief-panel"><h3>{mode==='manual'?'Kịch bản nhập tay':'Chọn bản thảo cho từng chương'}</h3>
      {mode==='manual'&&<p className="muted">Dán nội dung bên phải. Kịch bản thủ công cũng phải lưu phiên bản và bấm duyệt rõ ràng trước khi tạo scene.</p>}
      {mode==='ai'&&<>

      {choices.map(({chapter,index,options})=><label key={chapter.id??index}>Chương {index+1}: {chapter.title}
        <select value={selected[index]||''} disabled={busy} onChange={e=>selectVariant(index,e.target.value)}>
          <option value="">— Chọn bản thảo đã tạo —</option>{options.map(x=><option key={x.variantId} value={x.variantId}>
            {x.label} · {x.wordCount} từ</option>)}
        </select>{!options.length&&<small>Chưa có bản thành công trong phiên bản dàn ý này.</small>}</label>)}
      </>}
      <button className="btn secondary" disabled={busy||!outline||!status||!ready} onClick={preview}>
        {mode==='manual'?'Kiểm tra kịch bản':'Ghép & xem trước'}</button>
      {mode==='ai'&&<small>Mỗi bản thảo gắn với video, chương và phiên bản dàn ý; không dùng lẫn nội dung.</small>}
      <h3>Lịch sử Bản chuẩn</h3><div className="master-history">{history.map(h=><button key={h.revision} onClick={()=>openVersion(h.revision)}>
        v{h.revision} · {h.wordCount} từ {h.approved?'✓ Đã duyệt':''}</button>)}
        {!history.length&&<p>Chưa có phiên bản.</p>}</div>
    </div><div className="content-brief-panel"><h3>Biên tập kịch bản cuối cùng</h3>
      <textarea className="master-text" aria-label="Nội dung Master Script" value={text} disabled={busy||!outline||!status}
        onChange={e=>{setText(e.target.value);setDirty(true);setApprovedWarnings(false)}}
        placeholder={mode==='manual'?'Dán hoặc soạn toàn bộ kịch bản tại đây.':'Bấm Ghép & xem trước để chọn nội dung từ từng chương.'}/>
      {!!candidate?.warnings?.length&&<div className="master-warning">Cảnh báo:
        {candidate.warnings.map(w=><p key={w}>⚠ {w==='WORD_COUNT_OUTSIDE_TARGET'?'Độ dài chênh quá 20% so với mục tiêu':
          w==='DUPLICATE_LONG_PARAGRAPH'?'Có đoạn dài trùng lặp':w}</p>)}
        <label className="master-ack"><input type="checkbox" checked={approvedWarnings} onChange={e=>setApprovedWarnings(e.target.checked)}/>
          Tôi đã kiểm tra và chấp nhận các cảnh báo này.</label></div>}
      <div className="actions"><button className="btn secondary" disabled={busy||!ready||!dirty||!text.trim()} onClick={save}>
        Lưu phiên bản chưa duyệt</button><button className="btn" disabled={busy||!canApprove||!!candidate.warnings?.length&&!approvedWarnings} onClick={approve}>
        ✓ Duyệt Bản chuẩn</button>
        {status?.approvedRevision&&status?.hasApprovedScript&&<button className="btn secondary"
          disabled={busy||dirty} onClick={exportApprovedJson}>⇩ Xuất JSON kịch bản đã duyệt</button>}
        {candidate?.revision===status?.approvedRevision&&status?.hasApprovedScript&&<button className="btn secondary"
          disabled={busy||dirty} onClick={()=>perform(()=>onOpenSceneBuilder?.())}>Mở Scene Builder →</button>}
        </div>
      <p className="muted">Chỉ nút “Duyệt Bản chuẩn” mới cập nhật kịch bản chính của video. Sau khi đã có scene, không thể thay Bản chuẩn mà chưa xử lý tác động đến scene.</p>
    </div></div>
  </section>;
}
