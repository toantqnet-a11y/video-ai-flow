/** R2-VID-04: explicit operator-controlled batch of up to 40 saved scenes.
 * Every request goes through the existing SP-04 DAG and local-only preflight.
 * Never enqueue when the Scene Builder has uncommitted edits.
 */
import React,{useEffect,useState} from 'react';
import {api} from './api.js';
export function BatchVideoClipsR2VID({videoId,enabled=false}){
 const [scenes,setScenes]=useState([]),[selected,setSelected]=useState([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let alive=true;setScenes([]);setSelected([]);setError('');
  if(!enabled)return;
  api(`/videos/${videoId}/scenes`).then(x=>{if(alive){
   setScenes((x.items??[]).filter(s=>s.mediaType==='ai_video').slice(0,100));
  }}).catch(e=>{if(alive)setError(e.code??e.message)});
  return()=>{alive=false};
 },[videoId,enabled]);
 const toggle=(id,checked)=>setSelected(s=>checked?s.includes(id)?s:s.length<40?[...s,id]:s:s.filter(x=>x!==id));
 const queue=async()=>{
  setBusy(true);setError('');setNotice('');
  try{
   if(!selected.length||selected.length>40)throw Error('Chọn từ 1 đến 40 scene.');
   const pre=await Promise.all(selected.map(id=>api(`/scenes/${id}/video/preflight`)));
   const blocked=pre.map((p,i)=>({id:selected[i],...p})).filter(p=>!p.canQueue);
   if(blocked.length)throw Error(`Có ${blocked.length} scene chưa sẵn sàng; mở Scene Inspector để lưu cấu hình và prompt.`);
   const requestKey='clip-batch-'+crypto.randomUUID().replaceAll('-','');
   const r=await api(`/videos/${videoId}/video/jobs`,{method:'POST',
    body:{sceneIds:selected,requestKey}});
   setNotice(`Đã xếp ${r.jobs?.length??0} job theo thứ tự trong SP-04. Chưa xác nhận GPU hay chất lượng clip.`);
  }catch(e){setError(e.code??e.message)}finally{setBusy(false)}
 };
 return <section className="scene-video-batch" aria-label="AI Video batch">
  <h3>AI Video · xử lý hàng loạt</h3>
  <p className="muted">Chọn tối đa 40 scene đã lưu cấu hình AI Video. Tiến trình GPU được xếp tuần tự; không tự gọi API trả phí.</p>
  {!enabled?<p>Hãy lưu Scene Builder trước khi xếp job.</p>:<>
   {scenes.length===0?<p>Chưa có scene AI Video đã lưu.</p>:<>
    <div className="actions"><button type="button" className="btn secondary" disabled={busy}
     onClick={()=>setSelected(scenes.slice(0,40).map(s=>s.id))}>Chọn tối đa 40</button>
     <button type="button" className="btn secondary" disabled={busy} onClick={()=>setSelected([])}>Bỏ chọn</button>
     <button type="button" className="btn" disabled={busy||!selected.length} onClick={queue}>
      Xếp {selected.length} clip vào SP-04</button></div>
    <div className="scene-video-batch-list">{scenes.map((s,i)=><label key={s.id} className="scene-video-batch-row">
     <input type="checkbox" disabled={busy||(!selected.includes(s.id)&&selected.length>=40)}
      checked={selected.includes(s.id)} onChange={e=>toggle(s.id,e.target.checked)}/>
     <span>Scene {s.idx+1||i+1} · {String(s.text??'').slice(0,100)}</span></label>)}</div>
   </>}
  </>}
  {notice&&<p className="info">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
 </section>;
}
