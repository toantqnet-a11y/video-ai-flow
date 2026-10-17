/** R3-12 render controls live beside the timeline, not in the generic Job Center.
 * Every preflight is read-only; actual rendering needs explicit confirmation.
 * Scene completion is not an overall encode ETA (final mux/QA still run). */
import React,{useEffect,useRef,useState} from 'react';
import {api,streamJobs} from './api.js';
const labels={queued:'Đang chờ',preparing:'Chuẩn bị media',encoding:'Đang render scene',
 finalizing:'Đang ghép và xuất',verifying:'Đang kiểm tra đầu ra',completed:'Hoàn thành',failed:'Thất bại'};
export function RenderDrawerR312({videoId,revision,styleRevision,styleDirty,editorDirty,engine,setEngine,render,setRender,onMessage,onError,busy=false}){
 const [resolution,setResolution]=useState('source'),[preflight,setPreflight]=useState(null),
  [checking,setChecking]=useState(false),[submitting,setSubmitting]=useState(false);
 const [subtitleDraft,setSubtitleDraft]=useState(null),[applySubtitleDraft,setApplySubtitleDraft]=useState(false);
 const [musicTrack,setMusicTrack]=useState(null),[musicLibrary,setMusicLibrary]=useState([]),[musicEnabled,setMusicEnabled]=useState(false),
  [musicRights,setMusicRights]=useState(false),[musicUploading,setMusicUploading]=useState(false),[musicError,setMusicError]=useState(''),
  [musicSettings,setMusicSettings]=useState({volume:0.15,fadeInSeconds:0.5,fadeOutSeconds:1,loop:true,ducking:false});
 const refreshSubtitle=async()=>{setMusicError('');try{setSubtitleDraft(await api(`/videos/${videoId}/subtitles/draft`))}catch(e){setMusicError(e.code??e.message)}};
 useEffect(()=>{setSubtitleDraft(null);setApplySubtitleDraft(false);if(videoId&&revision)void refreshSubtitle()},[videoId,revision]);
 const refreshMusic=async()=>{try{const found=await api(`/videos/${videoId}/music`);setMusicLibrary(found.items??[])}
  catch(e){setMusicError(e.code??e.message)}};
 useEffect(()=>{setMusicTrack(null);setMusicEnabled(false);setMusicRights(false);setMusicLibrary([]);
  if(videoId)void refreshMusic();},[videoId]);
 const importMusic=async(file)=>{
  if(!file)return;setMusicError('');setMusicUploading(true);
  try{
   const extension=file.name.split('.').at(-1)?.toLowerCase();
   if(!['mp3','wav','m4a'].includes(extension)||file.size>640*1024)throw Error('Chỉ hỗ trợ MP3/WAV/M4A tối đa 640 KiB trong phiên bản này.');
   const buffer=new Uint8Array(await file.arrayBuffer());let raw='';
   for(let i=0;i<buffer.length;i+=8192)raw+=String.fromCharCode(...buffer.subarray(i,i+8192));
   const response=await api(`/videos/${videoId}/music/import`,{method:'POST',body:{extension,base64:btoa(raw)}});
   setMusicTrack(response);setMusicEnabled(true);setMusicRights(false);await refreshMusic();
  }catch(e){setMusicError(e.code??e.message)}finally{setMusicUploading(false)}
 };
 const refreshInFlight=useRef(false);
 const canPreview=!!revision&&!editorDirty&&!styleDirty&&!busy&&!musicUploading&&(!musicEnabled||musicRights);
 const params=revision?{revision,engine,resolution,...(styleRevision?{styleRevision}:{}),
   ...(applySubtitleDraft&&subtitleDraft?.revision>0?{subtitleDraftRevision:subtitleDraft.revision}:{}),
   ...(musicEnabled&&musicTrack?{music:{pin:musicTrack.pin,settings:musicSettings}}:{})}:null;
 const fingerprint=JSON.stringify({videoId,params,canPreview});
 useEffect(()=>{setPreflight(null);if(!canPreview)return;let valid=true;
  const timer=setTimeout(async()=>{setChecking(true);try{
   const result=await api(`/videos/${videoId}/renders/preflight`,{method:'POST',body:params});
   if(valid)setPreflight(result);
  }catch(e){if(valid)setPreflight({ready:false,blockers:[e.code??'RENDER_PREFLIGHT_FAILED']})}
   finally{if(valid)setChecking(false)}},250);
  return()=>{valid=false;clearTimeout(timer)};
 },[fingerprint]);
 // Authenticated durable SSE is shared with Job Center. Only the matching job
 // triggers a GET status refresh; slower polling handles SSE outages/reconnects.
 useEffect(()=>{if(!render?.id||['succeeded','failed','cancelled'].includes(render.status))return;
  const abort=new AbortController();let valid=true;
  const refresh=async()=>{if(refreshInFlight.current||!valid)return;refreshInFlight.current=true;
   try{const out=await api(`/videos/${videoId}/renders/${render.id}`);if(valid)setRender(out)}
   catch(e){if(valid)onError(e.code??e.message)}finally{refreshInFlight.current=false}};
  const timer=setInterval(refresh,7000);
  streamJobs(event=>{if(event.jobId===render.id)void refresh()},{signal:abort.signal,retries:1}).catch(()=>{});
  void refresh();return()=>{valid=false;clearInterval(timer);abort.abort()};
 },[videoId,render?.id,render?.status]);
 const launch=async()=>{if(!canPreview||!preflight?.ready||submitting)return;
  setSubmitting(true);onError('');try{
   // A new idempotency key on *user click* only; no automatic retry after fail.
   const result=await api(`/videos/${videoId}/renders`,{method:'POST',body:{...params,requestKey:crypto.randomUUID()}});
   setRender(result.job);onMessage(`Render #${revision} đã vào hàng đợi ${engine}, ${resolution}.`);
  }catch(e){onError(e.code??e.message)}finally{setSubmitting(false)};
 };
 const stage=render?.drawer?.stage??(render?.status==='running'?'preparing':'queued');
 const done=render?.drawer?.completedScenes,total=render?.drawer?.totalScenes;
 const sceneFraction=render?.drawer?.sceneFraction;
 const current=render?.sourceCurrent!==false;
 return <div className="render-drawer-r312" aria-label="Render MP4" data-testid="render-drawer-r312">
  <h3>Render Drawer · R3-12</h3>
  <div className="render-drawer-settings">
   <label>Engine <select disabled={busy||submitting} value={engine} onChange={e=>setEngine(e.target.value)}>
    <option value="hyperframes">HyperFrames (chính)</option><option value="ffmpeg-fastpath">FFmpeg (chọn thủ công)</option>
   </select></label>
   <label>Độ phân giải <select disabled={busy||submitting} value={resolution} onChange={e=>setResolution(e.target.value)}>
    <option value="source">Theo dự án</option><option value="720p">720p</option><option value="1080p">1080p</option>
   </select></label>
  </div>
  <fieldset className="frame" style={{margin:'12px 0',padding:'12px'}}><legend>Phụ đề và nhạc nền · R4-05/06</legend>
   <div className="actions"><label><input type="checkbox" checked={applySubtitleDraft} disabled={!subtitleDraft?.revision} onChange={e=>setApplySubtitleDraft(e.target.checked)}/> Áp dụng phụ đề nháp {subtitleDraft?.revision?`#${subtitleDraft.revision}`:'(chưa lưu)'}</label>
    <button className="btn secondary" onClick={refreshSubtitle} type="button">↻ Cập nhật bản nháp</button></div>
   <small>Chỉ khi chọn, bản nháp đã lưu mới được đóng băng vào job render và burn-in trong MP4; SRT riêng dùng cùng cues.</small>
   <div><label>Nhạc nền (MP3, WAV hoặc M4A ≤ 640 KiB; local, lặp theo video)
    <input type="file" accept=".mp3,.wav,.m4a,audio/*" disabled={musicUploading} onChange={e=>void importMusic(e.target.files?.[0])}/></label></div>
   {musicLibrary.length>0&&<label>Chọn nhạc đã tải lên
    <select value={musicTrack?.pin?.relativePath??''} onChange={e=>{
     const selected=musicLibrary.find(x=>x.pin.relativePath===e.target.value);setMusicTrack(selected??null);setMusicEnabled(!!selected);setMusicRights(false);
    }}><option value="">Không chọn</option>{musicLibrary.map((item,index)=><option key={item.pin.sha256} value={item.pin.relativePath}>{`Nhạc ${index+1} · ${item.codec} · ${Math.round(item.durationSeconds)} giây`}</option>)}</select></label>}
   {musicTrack&&<><label><input type="checkbox" checked={musicEnabled} onChange={e=>setMusicEnabled(e.target.checked)}/> Trộn nhạc nền đã nhập ({Math.round(musicTrack.durationSeconds)} giây)</label>
    <label>Âm lượng nhạc (tối đa 0.6) <input type="number" min="0" max="0.6" step="0.05" value={musicSettings.volume} onChange={e=>setMusicSettings(x=>({...x,volume:Number(e.target.value)}))}/></label>
    <label>Fade in (giây) <input type="number" min="0" max="15" step="0.5" value={musicSettings.fadeInSeconds} onChange={e=>setMusicSettings(x=>({...x,fadeInSeconds:Number(e.target.value)}))}/></label>
    <label>Fade out (giây) <input type="number" min="0" max="15" step="0.5" value={musicSettings.fadeOutSeconds} onChange={e=>setMusicSettings(x=>({...x,fadeOutSeconds:Number(e.target.value)}))}/></label>
    <label><input type="checkbox" checked={musicSettings.ducking===true} onChange={e=>setMusicSettings(x=>({...x,ducking:e.target.checked}))}/> Tự hạ âm lượng nhạc khi có giọng nói (sidechain local)</label>
    {musicEnabled&&<label><input type="checkbox" checked={musicRights} onChange={e=>setMusicRights(e.target.checked)}/> Tôi xác nhận có quyền sử dụng file nhạc này.</label>}</>}
   {musicError&&<p role="alert" className="error">{musicError}</p>}
   {musicEnabled&&!musicRights&&<p className="warn">Cần xác nhận quyền sử dụng nhạc trước khi render.</p>}
  </fieldset>
  {revision?<p className="muted">Nguồn xuất: Composition đã duyệt <strong>#{revision}</strong> · {engine}. Các file media được kiểm tra SHA-256 trước khi tạo job.</p>
   :<p className="warn">Cần lưu thay đổi và phê duyệt Composition mới trước khi render.</p>}
  {checking&&<p role="status">Đang kiểm tra tài nguyên…</p>}
  {preflight&&!checking&&<div className={preflight.ready?'info':'warn'} role="status">
   {preflight.ready?`Preflight đạt: ${preflight.sceneCount} scene · ${preflight.profile.width}×${preflight.profile.height} · phụ đề nháp ${preflight.subtitleDraftRevision??'không'} · nhạc ${preflight.musicEnabled?'có':'không'}.`:
    `Không thể render: ${preflight.blockers.join(', ')}`}
   {preflight.disk&&<small> · Dung lượng dự trù: {Math.ceil(preflight.disk.requiredBytes/1048576)} MB + {Math.ceil(preflight.disk.reserveBytes/1048576)} MB dự phòng; còn {Math.floor(preflight.disk.availableBytes/1048576)} MB (ước tính, không cam kết).</small>}
   {preflight.ready&&engine==='hyperframes'&&<small> · HyperFrames CLI chưa được xác minh tại bước này; có thể lỗi khi worker khởi động.</small>}
   {!preflight.ready&&<small> · {preflight.blockers.includes('RENDER_DISK_SPACE_LOW')?'Không đủ dung lượng: giải phóng ổ đĩa trước khi render.':'Kiểm tra tài nguyên ở Asset Library và phê duyệt lại Composition.'}</small>}
  </div>}
  <button className="btn" disabled={!canPreview||checking||!preflight?.ready||submitting} onClick={launch}>
   {submitting?'Đang gửi…':render?.status==='failed'?'↻ Tạo job thử lại (thủ công)':'▶ Render MP4 local'}
  </button>
  {render&&<div className="render-drawer-progress" aria-live="polite">
   <p><strong>Job {render.id.slice(0,10)}</strong> · <span className="badge">{labels[stage]??render.status}</span></p>
   <p><strong>Output revision #{render.revision??'?'}</strong> · {render.resolution??'source'} · {current?'Nguồn còn hiện hành':'⚠ Đã có chỉnh sửa sau bản xuất; MP4 cũ vẫn được giữ'}.</p>
   {typeof sceneFraction==='number'&&<><progress max="1" value={sceneFraction} aria-label="Tỷ lệ scene đã hoàn thành"/>
     <small>Scene hoàn thành: {done}/{total}. Đây không phải % tổng thời gian render.</small></>}
   {render.status==='running'&&sceneFraction===null&&<small>Đang xử lý. Engine chưa cung cấp tỷ lệ scene đo được.</small>}
   {render.status==='failed'&&<p role="alert" className="warn">Job thất bại: {render.lastError??'WORKER_ERROR'}; không tự đổi engine hay retry.</p>}
   {render.status==='succeeded'&&<p className="info">Đã hoàn thành kiểm tra QA: {render.output?.qa?.passed?'PASS':'Chưa xác minh'}; giữ bản MP4 này ngay cả khi Timeline thay đổi.</p>}
  </div>}
 </div>;
}
