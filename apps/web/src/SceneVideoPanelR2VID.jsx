/** R2-VID-01..05 scene clip workspace. Explicit operator choices only:
 * no automatic paid API, no AI call on mount, no browser-stored bearer tokens.
 */
import React,{useEffect,useState} from 'react';
import {api,getSceneClipRevisionFile} from './api.js';
import {ClipResourceSummary} from './ClipResourceSummaryR2VID06.jsx';
const blank={mediaType:'image_motion',mode:'text_to_video',fallback:'manual_image',
 durationSec:4,width:768,height:432,fps:24,seed:1};
const human={image_motion:'Ảnh + chuyển động',ai_video:'Clip AI cục bộ',import_video:'Clip có sẵn'};
const newKey=()=>('clip-'+crypto.randomUUID().replaceAll('-',''));
export function SceneVideoPanel({sceneId,onUpdated=()=>{},disabled=false}){
 const [status,setStatus]=useState(null),[scope,setScope]=useState(null);
 const [draft,setDraft]=useState({...blank}),[preflight,setPreflight]=useState(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [videoUrl,setVideoUrl]=useState(''),[previewAssetId,setPreviewAssetId]=useState(null);
 const refresh=async()=>{
  if(!sceneId)return;
  const [s,p]=await Promise.all([api(`/scenes/${sceneId}/video/status`),api(`/video-media/policy/scene/${sceneId}`)]);
  setStatus(s);setScope(p);setDraft(p.policy??s.policy??{...blank});
 };
 useEffect(()=>{let alive=true;setStatus(null);setScope(null);setVideoUrl('');setPreviewAssetId(null);setPreflight(null);
  if(!sceneId)return;
  Promise.all([api(`/scenes/${sceneId}/video/status`),api(`/video-media/policy/scene/${sceneId}`)])
   .then(([s,p])=>{if(alive){setStatus(s);setScope(p);setDraft(p.policy??s.policy??{...blank})}})
   .catch(e=>{if(alive)setError(e.code??e.message)});
  return()=>{alive=false};
 },[sceneId]);
 const currentPreview=previewAssetId??status?.selectedVideoAssetId;
 useEffect(()=>{if(!sceneId||!currentPreview){setVideoUrl('');return;}
  let alive=true,url='';setVideoUrl('');
  getSceneClipRevisionFile(sceneId,currentPreview).then(blob=>{
   url=URL.createObjectURL(blob);if(alive)setVideoUrl(url);else URL.revokeObjectURL(url);
  }).catch(e=>{if(alive)setError(e.code??e.message)});
  return()=>{alive=false;if(url)URL.revokeObjectURL(url)};
 },[sceneId,currentPreview]);
 if(!sceneId)return null;
 const mutate=async(cb)=>{setBusy(true);setError('');setNotice('');
  try{const msg=await cb();await refresh();if(msg)setNotice(msg);await onUpdated()}
  catch(e){setError(e.code??e.message)}finally{setBusy(false)}};
 const save=()=>mutate(async()=>{
  await api(`/video-media/policy/scene/${sceneId}`,{method:'PUT',body:{
   expectedRevision:scope.revision,policy:draft}});
  setPreflight(null);return 'Đã lưu media policy, không chạy AI.'});
 const runPreflight=async()=>{setBusy(true);setError('');
  try{setPreflight(await api(`/scenes/${sceneId}/video/preflight`))}
  catch(e){setError(e.code??e.message)}finally{setBusy(false)}};
 const queue=()=>mutate(async()=>{
  const p=await api(`/scenes/${sceneId}/video/preflight`);
  if(!p.canQueue){setPreflight(p);throw Error(p.blockers.join(', '))}
  const q=await api(`/scenes/${sceneId}/video/jobs`,{method:'POST',body:{
   requestKey:newKey(),expectedPolicyDigest:p.policyDigest}});
  return `Đã xếp ${q.jobs?.length??0} clip vào hàng đợi SP-04. Chưa đồng nghĩa GPU hoạt động.`;
 });
 const readBase64=(file)=>new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onerror=()=>reject(Error('VIDEO_FILE_READ_FAILED'));
  reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);
 });
 const importClip=file=>mutate(async()=>{
  if(!file)return;
  if(file.size<100||file.size>8*1024*1024)throw Error('Chỉ nhận MP4/MOV tối đa 8 MiB ở màn hình này.');
  const container=/\.mov$/i.test(file.name)?'mov':/\.mp4$/i.test(file.name)?'mp4':null;
  if(!container)throw Error('Chỉ nhận .mp4 hoặc .mov; định dạng thật được FFprobe kiểm tra.');
  if(draft.mediaType!=='import_video'||scope.policy?.mediaType!=='import_video')
   throw Error('Hãy lưu policy Import Video trước.');
  const base64=await readBase64(file);
  await api(`/scenes/${sceneId}/video/import`,{method:'POST',body:{
   base64,container,expectedRowVersion:status.sceneRowVersion}});
  return 'Clip đã được FFprobe xác thực, lưu thành revision riêng và kích hoạt.'});
 const fallback=id=>mutate(async()=>{
  await api(`/scenes/${sceneId}/video/fallback`,{method:'POST',body:{
   imageAssetId:id,expectedRowVersion:status.sceneRowVersion,expectedPolicyRevision:scope.revision}});
  return 'Đã chọn ảnh cũ, ngắt intent AI Video chưa chạy và giữ nguyên voice.';
 });
 const activate=id=>mutate(async()=>{
  await api(`/scenes/${sceneId}/video/select`,{method:'POST',body:{
   assetId:id,expectedRowVersion:status.sceneRowVersion}});
  return 'Đã chọn phiên bản clip, voice được giữ nguyên.'});
 const dirty=JSON.stringify(draft)!==JSON.stringify(scope?.policy??status?.policy??blank);
 return <section className="frame scene-video-panel" aria-label="AI Video Clips">
  <h3>🎞 Clip AI / clip nhập · R2-VID-01–05</h3>
  <p className="muted">Cấu hình theo scene, có lịch sử revision. Clip AI chỉ gửi tới ComfyUI loopback khi bạn bấm Tạo.</p>
  {!status?<p>Đang tải clip…</p>:<>
   <div className="scene-builder-fields">
    <label>Loại media<select disabled={busy||disabled} value={draft.mediaType} onChange={e=>setDraft(p=>({...p,mediaType:e.target.value}))}>
     {Object.entries(human).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    <label>Chế độ AI<select disabled={busy||disabled} value={draft.mode} onChange={e=>setDraft(p=>({...p,mode:e.target.value}))}>
     <option value="text_to_video">Text → Video</option><option value="image_to_video">Image → Video</option></select></label>
    <label>Fallback<select disabled={busy||disabled} value={draft.fallback} onChange={e=>setDraft(p=>({...p,fallback:e.target.value}))}>
     <option value="manual_image">Cho phép chọn ảnh thủ công</option><option value="none">Không fallback</option></select></label>
    <label>Giây<input type="number" min="1" max="300" disabled={busy||disabled} value={draft.durationSec} onChange={e=>setDraft(p=>({...p,durationSec:Number(e.target.value)}))}/></label>
    <label>Rộng<input type="number" min="128" max="4096" disabled={busy||disabled} value={draft.width} onChange={e=>setDraft(p=>({...p,width:Number(e.target.value)}))}/></label>
    <label>Cao<input type="number" min="128" max="4096" disabled={busy||disabled} value={draft.height} onChange={e=>setDraft(p=>({...p,height:Number(e.target.value)}))}/></label>
    <label>FPS<input type="number" min="1" max="120" disabled={busy||disabled} value={draft.fps} onChange={e=>setDraft(p=>({...p,fps:Number(e.target.value)}))}/></label>
    <label>Seed<input type="number" min="0" max="2147483647" disabled={busy||disabled} value={draft.seed} onChange={e=>setDraft(p=>({...p,seed:Number(e.target.value)}))}/></label>
   </div>
   <div className="actions">
    <button className="btn secondary" disabled={!dirty||busy||disabled} onClick={save}>💾 Lưu cấu hình</button>
    <button className="btn secondary" disabled={busy||dirty||disabled} onClick={runPreflight}>Kiểm tra AI local</button>
    <button className="btn" disabled={busy||dirty||disabled||draft.mediaType!=='ai_video'||!status.localConfigured} onClick={queue}>Tạo clip (SP-04)</button>
    <button className="btn secondary" disabled={busy} onClick={()=>refresh().catch(e=>setError(e.code??e.message))}>Làm mới</button>
   </div>
   {dirty&&<p className="warn">Hãy lưu cấu hình trước khi nhập hoặc tạo clip.</p>}
   {preflight&&<p className={preflight.canQueue?'info':'warn'}>
    {preflight.canQueue?'Đạt giới hạn cấu hình cục bộ (GPU chưa kiểm chứng)':'Chưa sẵn sàng: '+preflight.blockers.join(', ')}</p>}
   {preflight?.resourceEstimate&&<ClipResourceSummary estimate={preflight.resourceEstimate}/>}
   {draft.mediaType==='import_video'&&<label>Nhập MP4/MOV từ máy (≤8 MiB, FFprobe bắt buộc; MOV chuyển H.264 MP4 local)
    <input aria-label="Chọn MP4" type="file" accept=".mp4,.mov,video/mp4,video/quicktime" disabled={busy||disabled||dirty}
     onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)importClip(file)}}/></label>}
   <p className="muted">Policy revision #{scope?.revision??0} · Job {status.job?.status??'chưa có'} ·
    ComfyUI {status.localConfigured?'đã cấu hình (chưa xác minh GPU)':'chưa cấu hình'}.</p>
   {status.assets.length>0&&<div><h4>Phiên bản clip ({status.assets.length})</h4>
    {status.assets.map(a=><div className="actions" key={a.id}>
     <span>{a.id.slice(0,8)} · {a.source} · {a.health} · {a.metadata?.durationMs??'—'} ms</span>
     <button className="btn secondary" disabled={busy||a.health!=='healthy'}
      onClick={()=>setPreviewAssetId(a.id)}>{currentPreview===a.id?'Đang xem':'Xem thử'}</button>
     <button className="btn secondary" disabled={busy||disabled||dirty||a.health!=='healthy'||status.selectedVideoAssetId===a.id}
      onClick={()=>activate(a.id)}>{status.selectedVideoAssetId===a.id?'✓ Đang dùng':'Chọn phiên bản'}</button>
    </div>)}</div>}
   {draft.fallback==='manual_image'&&status.imageFallbacks?.filter(a=>a.health==='healthy').length>0&&
    <div className="scene-video-fallback"><p>Ảnh dự phòng đã xác minh:</p>
     {status.imageFallbacks.filter(a=>a.health==='healthy').map(a=>
      <button key={a.id} className="btn secondary" disabled={busy||disabled||dirty}
       onClick={()=>fallback(a.id)}>Dùng ảnh {a.id.slice(0,8)}</button>)}
    </div>}
   {previewAssetId&&previewAssetId!==status.selectedVideoAssetId&&
    <p className="muted">Đang xem thử clip chưa chọn cho render; bấm Chọn phiên bản khi hài lòng.</p>}
   {videoUrl&&<video src={videoUrl} controls preload="metadata" style={{maxWidth:'100%',maxHeight:280}} aria-label="Clip đã chọn"/>}
   {!status.assets.length&&<p className="muted">Chưa có clip. Có thể tiếp tục dùng ảnh + chuyển động.</p>}
  </>}
  {notice&&<p className="info">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
 </section>;
}
