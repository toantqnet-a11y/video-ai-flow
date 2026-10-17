/** R4-05/07 opt-in editor previews. Never imply a subtitle draft is burned
 * into the current MP4; immutable render snapshots remain authoritative.
 */
import React,{useEffect,useState} from 'react';
import {api} from './api.js';
export function SubtitleDraftPanelR405({videoId,compositionRevision,sceneId}){
 const [revision,setRevision]=useState(0),[rows,setRows]=useState([]),[scene,setScene]=useState(null);
 const [srt,setSrt]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setSrt('');setError('');setScene(null);setRows([]);
  if(!videoId||!compositionRevision||!sceneId)return;
  Promise.all([api(`/videos/${videoId}/subtitles/draft`),api(`/videos/${videoId}/composition/revisions/${compositionRevision}`)]).then(([draft,result])=>{
   if(!active)return;
   const doc=result.composition,selected=doc.scenes.find(s=>s.id===sceneId);if(!selected||doc.schemaVersion!==2)throw Error('CAPTION_SOURCE_NOT_READY');
   setScene(selected);setRevision(draft.revision);
   setRows((draft.sourceDigest===doc.digest?draft.overrides.find(x=>x.sceneId===sceneId)?.cues:null)??structuredClone(selected.captions.cues));
  }).catch(e=>{if(active)setError(e.code??e.message)});return()=>{active=false};
 },[videoId,compositionRevision,sceneId]);
 if(!compositionRevision)return <div className="frame"><h3>Phụ đề nâng cao (bản nháp)</h3><p>Phê duyệt Composition v2 trước khi sửa phụ đề riêng.</p></div>;
 const change=(index,field,value)=>setRows(old=>old.map((x,i)=>i===index?{...x,[field]:value}:x));
 const save=async(onlyPreview=false)=>{
  if(!scene||busy)return;setBusy(true);setError('');try{
   const draft=await api(`/videos/${videoId}/subtitles/draft`);
   if(draft.revision!==revision)throw Error('SUBTITLE_DRAFT_CHANGED_REFRESH_REQUIRED');
   const others=draft.overrides.filter(x=>x.sceneId!==scene.id),overrides=[...others,{sceneId:scene.id,cues:rows}];
   const resource=onlyPreview?'/subtitles/preview':'/subtitles/draft';
   const result=await api(`/videos/${videoId}${resource}`,{method:onlyPreview?'POST':'PUT',body:{compositionRevision,
    ...(onlyPreview?{}:{expectedRevision:revision}),overrides}});
   setSrt(result.srt);if(!onlyPreview)setRevision(result.revision);
  }catch(e){setError(e.code??e.message)}finally{setBusy(false)}
 };
 const exportSrt=()=>{const url=URL.createObjectURL(new Blob([srt],{type:'application/x-subrip;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`draft-${videoId}.srt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <section className="frame"><h3>📝 Phụ đề nâng cao — bản nháp</h3>
  <p className="warn">Bản nháp SRT riêng, chưa được đưa vào video MP4. Thao tác này không sửa lời thoại gốc.</p>
  <small>Scene: {scene?.index===undefined?'—':scene.index+1} · {scene?.durationFrames??'—'} frame · Revision {revision}</small>
  {rows.map((row,index)=><div className="job-toolbar" key={index}>
   <label>Text <input maxLength={500} value={row.text} onChange={e=>change(index,'text',e.target.value)} /></label>
   <label>Start frame <input type="number" min="0" value={row.startFrame} onChange={e=>change(index,'startFrame',Number(e.target.value))}/></label>
   <label>End frame <input type="number" min="1" value={row.endFrame} onChange={e=>change(index,'endFrame',Number(e.target.value))}/></label>
   <button className="btn secondary" disabled={busy||rows.length<2} onClick={()=>setRows(old=>old.filter((_,i)=>i!==index))}>Xóa cue</button>
  </div>)}
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="actions"><button className="btn secondary" disabled={busy||!scene||rows.length>=50} onClick={()=>setRows(old=>[...old,{text:'Cue mới',startFrame:old.at(-1)?.endFrame??0,endFrame:scene.durationFrames}])}>+ Cue</button>
   <button className="btn secondary" disabled={busy||!scene} onClick={()=>save(true)}>Xem trước SRT</button>
   <button className="btn" disabled={busy||!scene} onClick={()=>save(false)}>Lưu bản nháp</button>
   {srt&&<button className="btn secondary" onClick={exportSrt}>⬇ Tải SRT nháp</button>}</div>
  {srt&&<pre style={{whiteSpace:'pre-wrap',maxHeight:160,overflow:'auto'}}>{srt.slice(0,4000)}</pre>}
 </section>;
}
export function VisualConsistencyPanelR407({videoId}){
 const [styleToken,setStyleToken]=useState('cinematic'),[character,setCharacter]=useState(''),[report,setReport]=useState(null),[error,setError]=useState('');
 const run=async()=>{setError('');try{setReport(await api(`/videos/${videoId}/visual-consistency/preview`,{method:'POST',body:{styleToken,characterTokens:character.trim()?character.split(',').map(x=>x.trim()).filter(Boolean):[]}}))}catch(e){setError(e.code??e.message)}};
 return <section className="frame"><h3>🎨 Kiểm tra nhất quán nhân vật/phong cách</h3><p className="muted">Kiểm tra từ khóa trong prompt; chưa xác minh được sự giống nhau của nhân vật trong ảnh.</p>
  <div className="job-toolbar"><label>Style token <input value={styleToken} maxLength={64} onChange={e=>setStyleToken(e.target.value)} /></label>
   <label>Character tokens (ngăn cách dấu phẩy) <input maxLength={300} value={character} onChange={e=>setCharacter(e.target.value)} /></label>
   <button className="btn secondary" onClick={run}>Kiểm tra</button></div>
  {error&&<p role="alert" className="error">{error}</p>}{report&&<p>{report.sceneCount} scene · {report.warnings.length} cảnh báo — {report.warnings.slice(0,12).map(x=>`${x.sceneId.slice(0,8)}: ${x.code}`).join('; ')}</p>}
 </section>;
}
