/** R2-VID-01: channel/video AI-clip policy editor, independent of the
 * immutable content preset. Scene policy overrides video then channel.
 * Save never invokes ComfyUI or schedules any media generation.
 */
import React,{useEffect,useState} from 'react';
import {api} from './api.js';
const defaults={mediaType:'image_motion',mode:'text_to_video',fallback:'manual_image',
 durationSec:4,width:768,height:432,fps:24,seed:1};
export function VideoMediaScopePolicy({scope,id}){
 const [record,setRecord]=useState(null),[draft,setDraft]=useState({...defaults});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [history,setHistory]=useState([]);
 useEffect(()=>{let alive=true;setRecord(null);setDraft({...defaults});setError('');
  if(!id||!['channel','video'].includes(scope))return;
  Promise.all([api(`/video-media/policy/${scope}/${id}`),
    api(`/video-media/policy/${scope}/${id}/history`)])
   .then(([r,h])=>{if(alive){setRecord(r);setDraft(r.policy??{...defaults});setHistory(h.items??[])}})
   .catch(e=>{if(alive)setError(e.code??e.message)});
  return()=>{alive=false};
 },[id,scope]);
 if(!id||!['channel','video'].includes(scope))return null;
 const field=(key,value)=>setDraft(d=>({...d,[key]:value}));
 const dirty=record&&JSON.stringify(draft)!==JSON.stringify(record.policy??defaults);
 const save=async()=>{
  setBusy(true);setError('');setNotice('');
  try{
   const saved=await api(`/video-media/policy/${scope}/${id}`,{method:'PUT',body:{
    expectedRevision:record.revision,policy:draft}});
   setRecord(saved);setDraft(saved.policy);
   const h=await api(`/video-media/policy/${scope}/${id}/history`);
   setHistory(h.items??[]);setNotice('Đã lưu AI Video policy; không khởi chạy GPU.');
  }catch(e){setError(e.code??e.message)}finally{setBusy(false)}
 };
 return <section className="scene-video-scope" aria-label={scope==='channel'?'AI Video policy của kênh':'AI Video policy của video'}>
  <h3>🎞 AI Video policy · {scope==='channel'?'Mặc định của kênh':'Riêng video'}</h3>
  <p className="muted">Độ ưu tiên: Scene → Video → Kênh. Cấu hình này riêng với preset xuất video;
   thay đổi không tạo lại clip đã có hoặc gọi AI. Scene có cấu hình riêng sẽ được ưu tiên.</p>
  {!record?<p>Đang tải cấu hình…</p>:<>
   <div className="field-grid">
    <label>Loại media<select value={draft.mediaType} disabled={busy}
     onChange={e=>field('mediaType',e.target.value)}>
     <option value="image_motion">Ảnh có chuyển động</option>
     <option value="ai_video">Clip AI local</option>
     <option value="import_video">Clip nhập từ máy</option></select></label>
    <label>AI mode<select value={draft.mode} disabled={busy} onChange={e=>field('mode',e.target.value)}>
     <option value="text_to_video">Text → Video</option>
     <option value="image_to_video">Image → Video</option></select></label>
    <label>Fallback<select value={draft.fallback} disabled={busy} onChange={e=>field('fallback',e.target.value)}>
     <option value="manual_image">Cho phép chọn ảnh thủ công</option>
     <option value="none">Không fallback</option></select></label>
    {[['durationSec','Thời lượng (giây)',1,300],['width','Rộng (px)',128,4096],
      ['height','Cao (px)',128,4096],['fps','FPS',1,120],['seed','Seed',0,2147483647]].map(([key,label,min,max])=>
     <label key={key}>{label}<input type="number" min={min} max={max} disabled={busy}
      value={draft[key]} onChange={e=>field(key,Number(e.target.value))}/></label>)}
   </div>
   <div className="actions"><button className="btn" type="button" disabled={busy||!dirty}
    onClick={save}>Lưu AI Video policy #{record.revision+1}</button>
    <span className="muted">Revision hiện tại #{record.revision} · Lịch sử {history.length} lần lưu</span>
   </div>
   {dirty&&<p className="warn">Các thay đổi này chưa được lưu; không ảnh hưởng clip hiện có.</p>}
  </>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
 </section>;
}
