/**
 * EXT-07 / EXT-08: route preview is read-only. Brand styles are explicit
 * versioned snapshots; the Render button only uses a SAVED style revision.
 * UI input can never grant paid API approval or inject FFmpeg filter strings.
 */
import React,{useEffect,useState} from 'react';
import {api} from './api.js';

const modes=[['saving','Tiết kiệm'],['balanced','Cân bằng'],['quality','Chất lượng']];
const labels={reuse_verified:'Dùng lại media đã kiểm tra',generate_local_image:'Đề xuất ảnh local',import_media:'Cần nhập ảnh/clip'};
const fallbackStyle={schemaVersion:1,presetId:'clean',brand:{title:'',accentColor:'#1E88E5',captionColor:'#FFFFFF',outlineColor:'#131722',captionSize:26,showLowerThird:false},sceneOverrides:[]};
export function VisualCostMotionPanel({videoId,sceneId,onStyleChange}){
 const [mode,setMode]=useState('saving'),[plan,setPlan]=useState(null),[presets,setPresets]=useState([]);
 const [style,setStyle]=useState(fallbackStyle),[savedRevision,setSavedRevision]=useState(0),[dirty,setDirty]=useState(true);
 const [loading,setLoading]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;onStyleChange(null,true);
  Promise.all([api(`/videos/${videoId}/motion-style`),api('/motion-style/presets')]).then(([latest,all])=>{
   if(!active)return;
   setStyle(latest.style);setSavedRevision(latest.revision);setDirty(false);
   setPresets(all.items);onStyleChange(latest.revision||null,false);
  }).catch(e=>{if(active)setError(e.code??e.message)});
  return()=>{active=false};
 },[videoId]);
 const edit=fn=>{setStyle(previous=>fn(previous));setDirty(true);onStyleChange(null,true);setMessage('Cần lưu phiên bản style trước khi render.');};
 const preview=async()=>{
  setLoading(true);setError('');try{
   const result=await api(`/videos/${videoId}/visual-route/preview`,{method:'POST',body:{mode,includePaidCandidates:mode==='quality'}});
   setPlan(result);
  }catch(e){setError(e.code??e.message)}finally{setLoading(false)}
 };
 const publish=async()=>{
  setLoading(true);setError('');try{
   const next=await api(`/videos/${videoId}/motion-style/revisions`,{method:'POST',body:{expectedRevision:savedRevision,
    style:{schemaVersion:1,presetId:style.presetId,brand:style.brand,sceneOverrides:style.sceneOverrides}}});
   setStyle(next.style);setSavedRevision(next.revision);setDirty(false);
   onStyleChange(next.revision||null,false);
   setMessage(next.unchanged?'Không có thay đổi style.':`Đã lưu style bất biến #${next.revision}.`);
  }catch(e){setError(e.code??e.message)}finally{setLoading(false)}
 };
 const override=style.sceneOverrides.find(x=>x.sceneId===sceneId)?.presetId??'';
 return <section className="cost-motion-panel" aria-label="Chi phí và hiệu ứng video">
  <header><h3>EXT-07 · Smart Visual Router</h3><small>Ưu tiên dùng lại tài nguyên. Không tự gọi AI hay API trả phí.</small></header>
  <div className="cost-motion-fields"><label>Chế độ ưu tiên<select value={mode} onChange={e=>{setMode(e.target.value);setPlan(null)}}>
   {modes.map(([value,label])=><option value={value} key={value}>{label}</option>)}
  </select></label><button className="btn secondary" disabled={loading} onClick={preview}>Xem kế hoạch (không tạo tài nguyên)</button></div>
  {plan&&<div className="cost-route-result" aria-live="polite">
   <p><strong>{plan.summary.reused} scene dùng lại</strong> · {plan.summary.localImageCandidates} ảnh local đề xuất · {plan.summary.manualImportRequired} cần import · {plan.summary.paidCallsScheduled} lượt AI trả phí đã lên lịch</p>
   <div className="cost-route-scenes">{plan.scenes.slice(0,30).map(s=><span key={s.sceneId} title={s.reason}>#{s.sceneIndex+1} {labels[s.action]}</span>)}</div>
   {plan.scenes.length>30&&<small>Hiển thị 30/{plan.scenes.length} scene đầu.</small>}
   <small>Chi phí API khi xem kế hoạch: 0. Chi phí thực tế của tác vụ tiếp theo và điện/GPU local chưa được đo. Tùy chọn clip trả phí (nếu có) vẫn bị khóa.</small>
  </div>}
  <header><h3>EXT-08 · Motion Templates & Brand Kit</h3><small>Template cố định v1, không cho nhập code, URL hay biểu thức FFmpeg.</small></header>
  <div className="cost-motion-fields"><label>Preset chung<select value={style.presetId} onChange={e=>edit(s=>({...s,presetId:e.target.value}))}>
   {presets.map(p=><option key={p.id} value={p.id}>{p.label} · v{p.version}</option>)}
  </select></label>
  <label>Preset riêng của scene hiện tại<select value={override} onChange={e=>edit(s=>({...s,sceneOverrides:[...s.sceneOverrides.filter(x=>x.sceneId!==sceneId),...(e.target.value?[{sceneId,presetId:e.target.value}]:[])]}))}>
   <option value="">Kế thừa preset chung</option>{presets.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
  </select></label></div>
  <div className="cost-motion-fields"><label>Tên thương hiệu<input maxLength="42" value={style.brand.title} onChange={e=>edit(s=>({...s,brand:{...s.brand,title:e.target.value}}))}/></label>
   <label>Màu thương hiệu<input type="color" value={style.brand.accentColor} onChange={e=>edit(s=>({...s,brand:{...s.brand,accentColor:e.target.value}}))}/></label>
   <label>Màu phụ đề<input type="color" value={style.brand.captionColor} onChange={e=>edit(s=>({...s,brand:{...s.brand,captionColor:e.target.value}}))}/></label>
   <label>Viền phụ đề<input type="color" value={style.brand.outlineColor} onChange={e=>edit(s=>({...s,brand:{...s.brand,outlineColor:e.target.value}}))}/></label>
   <label>Cỡ phụ đề (18–42)<input type="number" min="18" max="42" value={style.brand.captionSize} onChange={e=>edit(s=>({...s,brand:{...s.brand,captionSize:Number(e.target.value)}}))}/></label>
   <label className="cost-motion-toggle"><input type="checkbox" checked={style.brand.showLowerThird} onChange={e=>edit(s=>({...s,brand:{...s.brand,showLowerThird:e.target.checked}}))}/> Hiển thị lower-third thương hiệu</label>
  </div>
  <div className="actions"><button className="btn secondary" disabled={loading||!dirty} onClick={publish}>Lưu phiên bản style</button>
    <small>{dirty?'● Có thay đổi chưa lưu':`✓ Style v${savedRevision||'mặc định'} — đã lưu`}</small></div>
  {message&&<p className="info">{message}</p>}{error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
