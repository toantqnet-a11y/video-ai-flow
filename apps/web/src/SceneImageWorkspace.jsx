/** R2-05 scene imaging. User explicitly generates/imports/selects each image;
 * previews use revocable Blob URLs, never the authenticated image URL directly.
 */
import React,{useEffect,useState} from 'react';
import {api,getSceneImageFile} from './api.js';
import {selectiveBody,assertSourceUnchanged} from './selective-regeneration-view.mjs';

const label=s=>({not_generated:'Chưa tạo',queued:'Chờ xử lý',running:'Đang tạo',succeeded:'Đang lưu',ready:'Sẵn sàng',failed:'Lỗi tạo ảnh',cancelled:'Đã hủy',paused:'Tạm dừng'}[s]??s);
const file64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('FILE_READ_FAILED'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file)});
export function SceneImageWorkspace({video}){
  const [scenes,setScenes]=useState([]),[states,setStates]=useState({}),[options,setOptions]=useState({seed:1,width:1024,height:576});
  const [provider,setProvider]=useState(null),[page,setPage]=useState(0),[busy,setBusy]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [preview,setPreview]=useState({id:null,url:null}),[revisions,setRevisions]=useState({});
  useEffect(()=>()=>{if(preview.url)URL.revokeObjectURL(preview.url)},[preview.url]);
  useEffect(()=>{let on=true;setScenes([]);setStates({});setPage(0);setRevisions({});setPreview({id:null,url:null});
    Promise.all([api(`/videos/${video.id}/scenes`),api('/images/local-provider')]).then(([s,p])=>{if(on){setScenes(s.items??[]);setProvider(p)}})
      .catch(e=>{if(on)setError(e.code??e.message)});return()=>{on=false};
  },[video.id]);
  const shown=scenes.slice(page*25,page*25+25);
  useEffect(()=>{if(!shown.length)return;let on=true;
    const load=()=>Promise.allSettled(shown.map(s=>api(`/scenes/${s.id}/image/status`))).then(results=>{
      if(on)setStates(old=>({...old,...Object.fromEntries(results.flatMap((x,i)=>x.status==='fulfilled'?[[shown[i].id,x.value]]:[]))}));
    });void load();const timer=setInterval(load,4500);return()=>{on=false;clearInterval(timer)};
  },[video.id,page,scenes.map(s=>s.id).join(',')]);
  const refresh=async(id)=>{const [status,list,sceneList]=await Promise.all([
    api(`/scenes/${id}/image/status`),api(`/scenes/${id}/assets`),api(`/videos/${video.id}/scenes`)]);
    setPreview(prev=>prev.id===id?{id:null,url:null}:prev);
    setStates(old=>({...old,[id]:status}));setRevisions(old=>({...old,[id]:(list.items??[]).filter(a=>a.kind==='image')}));setScenes(sceneList.items??[]);
  };
  const call=async(id,fn)=>{setBusy(id);setError('');setNotice('');try{await fn();await refresh(id)}catch(e){setError(e.code??e.message)}finally{setBusy(null)}};
  const openPreview=async(id)=>{setBusy(id);setError('');try{const blob=await getSceneImageFile(id);
    setPreview({id,url:URL.createObjectURL(blob)});
  }catch(e){setError(e.code??e.message)}finally{setBusy(null)}};
  const importImage=async(id,file)=>{if(!file)return;if(file.size>512*1024){setError('Ảnh tải lên hiện giới hạn 512 KiB; hãy nén file trước.');return;}
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('Chỉ hỗ trợ PNG, JPEG và WebP.');return;}
    await call(id,async()=>{const dataBase64=await file64(file);await api(`/scenes/${id}/image/import`,{method:'POST',body:{mimeType:file.type,dataBase64}});
      setNotice('Đã nhập ảnh và chọn làm minh họa cho scene.')});
  };
  return <section className="frame"><header className="frame-title"><div><h2>🖼 Hình ảnh theo Scene</h2>
    <p>ComfyUI nội bộ → ảnh cho từng scene. Chỉ chạy khi bạn bấm tạo, không phát sinh chi phí API.</p></div></header>
    <p className="info">ComfyUI: {provider?.configured?'Đã cấu hình workflow':'Chưa cấu hình workflow'} · {provider?.health??'Không rõ'}.
      <button className="btn secondary" onClick={async()=>{try{setProvider(await api('/images/local-provider?probe=true'))}catch(e){setError(e.code??e.message)}}}>Kiểm tra kết nối</button></p>
    <div className="form-grid"><label>Seed<input type="number" min="0" value={options.seed} onChange={e=>setOptions(p=>({...p,seed:Number(e.target.value)}))}/></label>
      <label>Rộng (px)<input type="number" min="64" max="8192" value={options.width} onChange={e=>setOptions(p=>({...p,width:Number(e.target.value)}))}/></label>
      <label>Cao (px)<input type="number" min="64" max="8192" value={options.height} onChange={e=>setOptions(p=>({...p,height:Number(e.target.value)}))}/></label></div>
    <p className="muted">Chỉ tạo ảnh cho scene Image Motion đã lưu prompt. Nếu sửa prompt khi job đang chạy, kết quả cũ không được kích hoạt. Tải ảnh thủ công tối đa 512 KiB.</p>
    {error&&<p className="error">{error}</p>}{notice&&<p className="info">{notice}</p>}
    <p>Trang {page+1}/{Math.max(1,Math.ceil(scenes.length/25))} · {scenes.length} scene
      {' '}<button className="btn secondary" disabled={!page} onClick={()=>setPage(x=>x-1)}>←</button>
      <button className="btn secondary" disabled={(page+1)*25>=scenes.length} onClick={()=>setPage(x=>x+1)}>→</button></p>
    <div className="scene-list">{shown.map(s=>{const info=states[s.id],assets=revisions[s.id]??[];
      return <article key={s.id} className="scene-card"><div className="scene-card-head"><strong>Scene #{s.index+1}</strong>
        <span>{label(info?.state??'not_generated')}{info?.stale?' · ảnh cũ':''}</span></div>
        <p>{s.text.slice(0,200)}</p><p><small>Visual prompt: {s.visualPrompt?.trim()||'Chưa lưu prompt'}</small></p>
        <div className="toolbar">
          <button className="btn" disabled={busy!==null||!provider?.configured||s.mediaType!=='image_motion'||!s.visualPrompt?.trim()}
            onClick={()=>call(s.id,async()=>{await api(`/scenes/${s.id}/image/jobs`,{method:'POST',body:options});setNotice('Đã xếp job ComfyUI, xem tại Job Center.')})}>✦ Tạo ảnh</button>
          <button className="btn secondary" disabled={busy!==null||!provider?.configured||s.mediaType!=='image_motion'||!s.visualPrompt?.trim()}
            onClick={()=>call(s.id,async()=>{const current=await api(`/videos/${video.id}/scenes`);const scene=current.items.find(x=>x.id===s.id);
              if(!scene)throw Error('SCENE_NOT_FOUND');
              assertSourceUnchanged(s,scene,'image');
              await api(`/scenes/${s.id}/assets/regenerate`,{method:'POST',body:selectiveBody('image',scene.rowVersion,options,crypto.randomUUID())});
              setNotice('Đã yêu cầu tạo phiên bản ảnh MỚI chỉ cho scene này.')})}>↻ Làm lại ảnh (phiên bản mới)</button>
          <button className="btn secondary" disabled={busy!==null||!info?.imageAsset} onClick={()=>openPreview(s.id)}>👁 Xem ảnh</button>
          <label className="btn secondary">↑ Tải ảnh<input type="file" style={{display:'none'}} accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];void importImage(s.id,f);e.target.value=''}}/></label>
          <button className="btn secondary" disabled={busy!==null} onClick={()=>call(s.id,async()=>{const data=await api(`/scenes/${s.id}/assets`);setRevisions(p=>({...p,[s.id]:(data.items??[]).filter(a=>a.kind==='image')}))})}>Ảnh đã lưu</button>
        </div>
        {assets.length>0&&<label>Dùng phiên bản khác<select defaultValue="" onChange={e=>{const assetId=e.target.value;if(!assetId)return;
          void call(s.id,async()=>{await api(`/scenes/${s.id}/image/select`,{method:'POST',body:{assetId,expectedRowVersion:s.rowVersion}});
            setNotice('Đã chọn lại ảnh, job cũ không thể ghi đè.')})}}>
          <option value="">Chọn ảnh cũ ({assets.length})</option>{assets.map(a=><option value={a.id} key={a.id}>{a.source} · {new Date(a.createdAt).toLocaleString('vi-VN')} · {a.id.slice(0,8)}</option>)}</select></label>}
        {preview.id===s.id&&preview.url&&<img alt={`Minh họa scene ${s.index+1}`} src={preview.url} style={{maxWidth:'100%',maxHeight:360,objectFit:'contain'}}/>}
      </article>})}</div>
  </section>;
}
