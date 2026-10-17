/** R3-01: explicit per-scene source edit with server impact preview.
 * A dirty draft never auto-saves; switching scene must be confirmed by parent.
 */
import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api.js';

const FIELDS=['text','visualPrompt','mediaType','durationMs'];
export function SceneInspectorR301({videoId,sceneId,onDirtyChange=()=>{},onSaved=()=>{}}){
 const [source,setSource]=useState(null),[draft,setDraft]=useState(null);
 const [preview,setPreview]=useState(null),[ack,setAck]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const patch=useMemo(()=>source&&draft?Object.fromEntries(FIELDS.filter(k=>draft[k]!==source[k]).map(k=>[k,draft[k]])):{},[source,draft]);
 const dirty=Object.keys(patch).length>0;
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false)},[dirty,onDirtyChange]);
 useEffect(()=>{if(!dirty)return;const onUnload=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',onUnload);return()=>window.removeEventListener('beforeunload',onUnload)},[dirty]);
 useEffect(()=>{let alive=true;setSource(null);setDraft(null);setPreview(null);setError('');setNotice('');setAck(false);
  if(!sceneId)return;
  api(`/videos/${videoId}/scenes`).then(result=>{
    if(!alive)return;const scene=result.items.find(item=>item.id===sceneId);
    if(!scene){setError('SCENE_NOT_FOUND');return;}setSource(scene);setDraft({...scene});
  }).catch(e=>{if(alive)setError(e.code??e.message)});
  return()=>{alive=false};
 },[videoId,sceneId]);
 const change=(field,value)=>{setDraft(d=>({...d,[field]:value}));setPreview(null);setNotice('');setError('');};
 const payload=()=>({expectedRowVersion:source.rowVersion,patch,acknowledgeTextEdit:ack});
 const run=async(commit)=>{
  setBusy(true);setError('');setNotice('');
  try{
   const result=await api(`/scenes/${sceneId}${commit?'':'/impacts'}`,{method:commit?'PATCH':'POST',body:payload()});
   if(commit){setSource(result.scene);setDraft({...result.scene});setPreview(null);setAck(false);
     setNotice('Đã lưu riêng scene này. Chỉ những tài nguyên bị ảnh hưởng cần tạo lại.');await onSaved();}
   else setPreview(result);
  }catch(e){const code=e.code??e.message;
   setError(code==='SCENE_ROW_VERSION_CONFLICT'?'Scene đã bị sửa ở nơi khác (409). Bản nháp chưa bị ghi đè; sao chép thay đổi nếu cần, rồi tải lại.':code);}
  finally{setBusy(false)}
 };
 if(!sceneId)return null;
 return <section className="timeline-scene-inspector" aria-label="Scene Inspector R3-01">
  <h3>✎ Scene Inspector — chỉnh sửa có kiểm soát</h3>
  {!draft?<p>Đang tải scene… {error}</p>:<>
   <p className="muted">Phiên bản scene #{source.rowVersion} · Lưu thủ công · Không tự chạy AI.</p>
   <label>Lời thoại / văn bản<textarea rows={4} maxLength={20000} value={draft.text} onChange={e=>change('text',e.target.value)} aria-label="Lời thoại scene"/></label>
   <label>Prompt minh họa<textarea rows={3} maxLength={4000} value={draft.visualPrompt} onChange={e=>change('visualPrompt',e.target.value)} aria-label="Prompt minh họa"/></label>
   <div className="scene-builder-fields">
    <label>Media<select value={draft.mediaType} onChange={e=>change('mediaType',e.target.value)}>
     <option value="image_motion">Ảnh + motion</option><option value="ai_video">AI Video</option><option value="import_video">Clip nhập</option>
    </select></label>
    <label>Thời lượng ước tính (ms)<input type="number" min={500} max={120000} value={draft.durationMs} onChange={e=>change('durationMs',Number(e.target.value))}/></label>
   </div>
   {source.text!==draft.text&&<label><input type="checkbox" checked={ack} onChange={e=>{setAck(e.target.checked);setPreview(null)}}/>
    Tôi xác nhận sửa lời thoại khác với Master Script đã duyệt. Voice, subtitle và render cần kiểm tra lại.</label>}
   <div className="actions"><button className="btn secondary" disabled={!dirty||busy} onClick={()=>run(false)}>Xem tác động</button>
    <button className="btn" disabled={!dirty||busy||(source.text!==draft.text&&!ack)||!preview||preview.requiresAcknowledgement} onClick={()=>run(true)}>💾 Lưu riêng scene</button>
    <button className="btn secondary" disabled={busy||!dirty} onClick={()=>{setDraft({...source});setPreview(null);setAck(false);setError('')}}>Hủy sửa</button></div>
   {preview&&<div className="info"><b>Tác động (không phát sinh phí):</b>
    {preview.impact.changedFields.join(', ')||'Không đổi'} · Voice {preview.impact.voiceStale?'cần tạo lại':'giữ nguyên'} · Ảnh {preview.impact.imageStale?'cần tạo lại':preview.impact.manualImagePreserved?'ảnh chọn thủ công được giữ':'giữ nguyên'} · Composition {preview.impact.compositionStale?'cần duyệt lại':'giữ nguyên'}.</div>}
   {dirty&&<p className="warn">Có thay đổi chưa lưu. Khi chuyển scene hoặc đóng trang sẽ được hỏi xác nhận.</p>}
   {notice&&<div className="info">{notice}</div>}{error&&<div role="alert" className="error">{error}</div>}
   <p className="muted">Preset hiệu ứng và Brand Kit ở khung Motion phía trên; chọn phiên bản giọng đọc tại Voice/Assets. Đây không phải lệnh tái tạo tài nguyên.</p>
  </>}
 </section>;
}
