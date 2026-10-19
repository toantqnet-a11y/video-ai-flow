/**
 * EXT-05: light read-only scene/media playback + explicit locked-timing edits.
 * EXT-06: explicit measured Composition approval → existing SP-04 render queue.
 * No AI request, automatic paid fallback, or fake live MP4 preview.
 */
import React,{useEffect,useRef,useState} from 'react';
import {api,downloadLocalVideoRender,downloadLocalVideoThumbnail,downloadLocalVideoSubtitle,saveLocalVideoRender,downloadProjectZip,saveProjectZip} from './api.js';
import {useStudio} from './store.js';
import {VisualCostMotionPanel} from './VisualCostMotionPanel.jsx';
import {SceneInspectorR301} from './SceneInspectorR301.jsx';
import {TimelineEditorR302} from './TimelineEditorR302.jsx';
import {RenderDrawerR312} from './RenderDrawerR312.jsx';
import {keepCurrentRenderJob,hydrateRenderHistory} from './render-job-sync.mjs';
import {SubtitleDraftPanelR405,VisualConsistencyPanelR407} from './SubtitleAndStyleR4.jsx';
const seconds=n=>(n/1000).toFixed(2);
export function TimelineRenderWorkspace(){
 const video=useStudio(s=>s.currentVideo),renderFocusToken=useStudio(s=>s.renderFocusToken),[snapshot,setSnapshot]=useState(null),[sceneId,setSceneId]=useState(null);
 const renderSectionRef=useRef(null);
 const [timeline,setTimeline]=useState(null);
 const [duration,setDuration]=useState(1500),[capStart,setCapStart]=useState(0),[capEnd,setCapEnd]=useState(1200);
 const [styleRevision,setStyleRevision]=useState(null),[styleDirty,setStyleDirty]=useState(true);
 const [engine,setEngine]=useState('hyperframes');
 const [inspectorDirty,setInspectorDirty]=useState(false),[timelineDirty,setTimelineDirty]=useState(false),[timelineRefresh,setTimelineRefresh]=useState(0);
 const [revision,setRevision]=useState(null),[durableRevision,setDurableRevision]=useState(null),[render,setRender]=useState(null),[renderHistory,setRenderHistory]=useState([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const scene=snapshot?.scenes?.find(s=>s.id===sceneId)??snapshot?.scenes?.[0];
 const approvedRevision=revision??durableRevision;
 // Newly queued/completed jobs refresh the select list without submitting a
 // second job. Also preserves older successful exports after source changes.
 useEffect(()=>{if(!video?.id||!render?.id)return;let active=true;
  api(`/videos/${video.id}/renders?limit=10`).then(result=>{
   if(active)setRenderHistory(result.items??[]);
  }).catch(()=>{});
  return()=>{active=false};
 },[video?.id,render?.id,render?.status]);

 // Dirty scene/timeline edits must be guarded even when leaving via sidebar.
 useEffect(()=>{useStudio.setState({timelineWorkspaceDirty:inspectorDirty||timelineDirty});
  return()=>useStudio.setState({timelineWorkspaceDirty:false});},[inspectorDirty,timelineDirty]);
 // A guided 'Render' click lands on the *existing* secured drawer, not a
 // second route or an automatic render. Wait until the async snapshot mounts.
 useEffect(()=>{if(!renderFocusToken||!snapshot)return;
  const raf=requestAnimationFrame(()=>renderSectionRef.current?.scrollIntoView({block:'start',behavior:'smooth'}));
  return()=>cancelAnimationFrame(raf);
 },[renderFocusToken,!!snapshot,video?.id]);

 // A read-only refresh must never discard approved Composition. Actual
 // scene/timing saves invalidate it; server preflight independently rejects
 // stale sources or pins, including edits made in other browser tabs.
 const refresh=async({invalidateApproval=false}={})=>{
  const [t,s]=await Promise.all([api(`/videos/${video.id}/timeline`),api(`/videos/${video.id}/composition/timing/preview`,{method:'POST',body:{tailPaddingMs:250}})]);
  setTimeline(t);setSnapshot(s);if(invalidateApproval){setRevision(null);setDurableRevision(null);}
  setTimelineRefresh(k=>k+1);if(!s.scenes.some(x=>x.id===sceneId))setSceneId(s.scenes[0]?.id??null);
  // A completed output remains downloadable but must show a stale revision
  // badge immediately after another scene/timeline edit is saved.
  if(render?.id)try{
    const updated=await api(`/videos/${video.id}/renders/${render.id}`);
    setRender(current=>keepCurrentRenderJob(current,updated,render.id));
   }catch{};
 };
 useEffect(()=>{let live=true;setSnapshot(null);setSceneId(null);setRender(null);setRenderHistory([]);setDurableRevision(null);
  if(video){
   // Browser refresh and re-pair lose UI memory, not SQLite/SP-04 results.
   // Restore read-only history; NEVER enqueue or retry an existing render.
   void Promise.allSettled([refresh(),api(`/videos/${video.id}/renders?limit=10`)])
    .then(([timeline,history])=>{
      if(!live)return;
      if(timeline.status==='rejected')setError(timeline.reason?.code??'TIMELINE_REFRESH_FAILED');
      if(history.status==='fulfilled'){
       const items=history.value.items??[];
       setRenderHistory(items);
       setRender(current=>hydrateRenderHistory(current,items));
      }else setError(history.reason?.code??'RENDER_HISTORY_FAILED');
    });
  }
  return()=>{live=false};
 },[video?.id]);
 // Approval is persisted server-side. Recover only an EXACT healthy v2 digest
 // after reload/re-pair; stale edits never become authorized render sources.
 useEffect(()=>{if(!video?.id||!snapshot?.digest||!snapshot.readiness?.ready||approvedRevision)return;
  let active=true;
  api(`/videos/${video.id}/composition/revisions`).then(out=>{
   const same=(out.items??[]).find(item=>item.digest===snapshot.digest);
   if(!same)return;
   return api(`/videos/${video.id}/composition/revisions/${same.revision}`).then(detail=>{
    if(active&&detail?.composition?.schemaVersion===2&&detail.composition.digest===snapshot.digest)
     setDurableRevision(existing=>existing??same.revision);
   });
  }).catch(()=>{});
  return()=>{active=false};
 },[video?.id,snapshot?.digest,snapshot?.readiness?.ready,approvedRevision]);
 useEffect(()=>{if(!scene)return;const cue=scene.captions.cues[0],fps=snapshot.profile.fps;
  setDuration(scene.durationMs);setCapStart(Math.round(cue.startFrame*1000/fps));setCapEnd(Math.round(cue.endFrame*1000/fps));
 },[scene?.id,snapshot?.digest]);
 useEffect(()=>{
  if(!video?.id||!render?.id||['succeeded','failed','cancelled'].includes(render.status))return;
  let active=true;
  const watchedId=render.id;
  const abort=new AbortController();
  const poll=async()=>{
   try{
    const out=await api(`/videos/${video.id}/renders/${watchedId}`,{signal:abort.signal});
    if(active)setRender(current=>keepCurrentRenderJob(current,out,watchedId));
   }catch(e){if(active&&e?.name!=='AbortError')setError(e.code??e.message)}
  };
  // Browser background tabs throttle timers; refresh immediately when the
  // user comes back instead of requiring an extra manual history click.
  const onVisible=()=>{if(document.visibilityState==='visible')void poll()};
  const timer=setInterval(poll,1700);
  document.addEventListener('visibilitychange',onVisible);
  window.addEventListener('focus',onVisible);
  void poll();
  return()=>{
   active=false;abort.abort();clearInterval(timer);
   document.removeEventListener('visibilitychange',onVisible);
   window.removeEventListener('focus',onVisible);
  };
 },[render?.id,render?.status,video?.id]);
 const act=async(fn)=>{setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError(e.code??e.message)}finally{setBusy(false)}};
 const save=()=>act(async()=>{
  if(!scene||!timeline)throw Error('SCENE_REQUIRED');
  if(!Number.isSafeInteger(duration)||duration<500||duration>120000||!Number.isSafeInteger(capStart)||capStart<0||
    !Number.isSafeInteger(capEnd)||capEnd>duration||capEnd<=capStart)throw Error('INVALID_TIMING_RANGE');
  const clips=(timeline.document?.clips??[]).filter(c=>c.sceneId!==scene.id);
  clips.push({sceneId:scene.id,startMs:Math.round(scene.startFrame*1000/snapshot.profile.fps),durationMs:duration,
    timingLocked:true,captionStartMs:capStart,captionEndMs:capEnd});
  // Preserve all other user-created tracks/clips; one selected scene changes.
  const saved=await api(`/videos/${video.id}/timeline`,{method:'PUT',body:{rowVersion:timeline.rowVersion,
    document:{...timeline.document,tracks:timeline.document?.tracks??['media','text','voice','music'],clips}}});
  setTimeline(saved);await refresh({invalidateApproval:true});setNotice('Đã lưu khóa thời gian. Kiểm tra lại readiness trước khi xuất.');
 });
 const approve=()=>act(async()=>{
  const snap=await api(`/videos/${video.id}/composition/timing/preview`,{method:'POST',body:{tailPaddingMs:250}});
  setSnapshot(snap);
  if(!snap.readiness.ready)throw Error('ASSET_OR_TIMING_BLOCKED');
  const out=await api(`/videos/${video.id}/composition/timing/revisions`,{method:'POST',body:{expectedDigest:snap.digest,
    expectedVideoRowVersion:snap.source.videoRowVersion,tailPaddingMs:250}});
  setRevision(out.revision);setDurableRevision(out.revision);
  setNotice(`Đã phê duyệt Composition v2 #${out.revision}.`);
 });
 const download=()=>act(async()=>{
  if(render.status!=='succeeded')return;
  if(typeof window.showSaveFilePicker==='function'){
    const handle=await window.showSaveFilePicker({suggestedName:`video-${video.id}.mp4`,types:[{description:'MP4 video',accept:{'video/mp4':['.mp4']}}]});
    const saved=await saveLocalVideoRender(video.id,render.id,handle);
    setNotice(`Đã lưu ${saved.bytes} bytes MP4 trực tiếp vào máy.`);return;
  }
  const blob=await downloadLocalVideoRender(video.id,render.id);
  const url=URL.createObjectURL(blob);
  try{const anchor=document.createElement('a');anchor.href=url;anchor.download=`video-${video.id}.mp4`;anchor.click();}
  finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 });
 const projectExport=()=>act(async()=>{
  if(!approvedRevision)throw Error('PUBLISH_TIMING_FIRST');
  if(inspectorDirty||timelineDirty)throw Error('SAVE_TIMELINE_FIRST');
  if(typeof window.showSaveFilePicker==='function'){
    const handle=await window.showSaveFilePicker({suggestedName:`ContentStudio-${video.id}-r${approvedRevision}.zip`,
      types:[{description:'ZIP project archive',accept:{'application/zip':['.zip']}}]});
    const saved=await saveProjectZip(video.id,approvedRevision,handle);
    setNotice(`Đã lưu project ZIP (${saved.bytes} bytes), gồm media, SRT và timeline.json.`);return;
  }
  const blob=await downloadProjectZip(video.id,approvedRevision);
  const url=URL.createObjectURL(blob);
  try{const a=document.createElement('a');a.href=url;a.download=`ContentStudio-${video.id}-r${approvedRevision}.zip`;a.click();}
  finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  setNotice('Đã tải ZIP dự án; trình duyệt này giới hạn file 100MB.');
 });
 const subtitleDownload=()=>act(async()=>{
  if(render?.status!=='succeeded'||!render.output?.subtitleUrl)throw Error('SUBTITLE_NOT_READY');
  const file=await downloadLocalVideoSubtitle(video.id,render.id);
  const url=URL.createObjectURL(file);
  try{const a=document.createElement('a');a.href=url;a.download=`subtitles-${video.id}.srt`;a.click();}
  finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 });
 const thumbnail=()=>act(async()=>{
  if(render?.status!=='succeeded'||!render.output?.thumbnailUrl)throw Error('THUMBNAIL_NOT_READY');
  const file=await downloadLocalVideoThumbnail(video.id,render.id);
  const url=URL.createObjectURL(file);
  try{const a=document.createElement('a');a.href=url;a.download=`thumbnail-${video.id}.jpg`;a.click();}
  finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 });
 const selectScene=(id)=>{if(id===scene?.id)return true;if(inspectorDirty&&!window.confirm('Bỏ những chỉnh sửa scene chưa lưu?'))return false;
  // Selecting another scene is read-only. Only a real saved content/timing
  // mutation may invalidate the immutable Composition approval; clearing it
  // here disabled Render after keyboard/playback selection without any edit.
  setSceneId(id);return true};
 const max=Math.max(1,snapshot?.totalFrames??1);const fps=snapshot?.profile.fps??30;
 return <section className="frame"><header className="frame-title"><div><h2>▤ Timeline & MP4</h2>
  <p>EXT-05/06 · Preview ảnh/giọng thật (nếu đã tạo) · HyperFrames là engine mặc định (local), FFmpeg là fallback thủ công; không dùng AI trả phí.</p></div>
  <button className="btn secondary" disabled={busy||!approvedRevision||inspectorDirty||timelineDirty} onClick={projectExport}>↓ Export Project ZIP</button>
  <button className="btn secondary" disabled={busy||timelineDirty} onClick={()=>{if(inspectorDirty&&!window.confirm('Bỏ chỉnh sửa chưa lưu và cập nhật?'))return;act(refresh)}}>↻ Cập nhật</button></header>
  {error&&<div role="alert" className="error">{error}</div>}{notice&&<div className="info">{notice}</div>}
  {!snapshot?<p>Đang lấy timeline…</p>:<>
   <div className="video-library-meta"><span>{snapshot.scenes.length} scenes</span>
    <span>{snapshot.profile.width}×{snapshot.profile.height} · {fps} fps</span>
    <span>{seconds(Math.round(snapshot.totalFrames*1000/fps))} giây</span>
    <span>{snapshot.readiness.ready?'✅ Đủ tài nguyên':'⚠ Còn blocker'}</span></div>
   {snapshot.readiness.blockers.length>0&&<div className="warn">{snapshot.readiness.blockers.slice(0,12).map((b,i)=><p key={i}>{b.sceneId}: {b.code}</p>)}
    {snapshot.readiness.blockers.length>12&&<p>… còn {snapshot.readiness.blockers.length-12} blocker</p>}</div>}
   <TimelineEditorR302 videoId={video.id} selectedSceneId={scene?.id} reloadKey={timelineRefresh} locked={inspectorDirty}
      onDirtyChange={setTimelineDirty} onSelect={selectScene} onSaved={()=>refresh({invalidateApproval:true})}/>
   <VisualCostMotionPanel key={video.id} videoId={video.id} sceneId={scene?.id} onStyleChange={(rev,dirty)=>{setStyleRevision(rev);setStyleDirty(dirty)}}/>
   <div className="timeline-render-layout"><div className="scene-nav"><h3>SCENES</h3>
    {snapshot.scenes.filter(s=>Math.abs(s.index-(scene?.index??0))<9).map((s)=><button key={s.id} className={s.id===scene?.id?'scene-nav-item active':'scene-nav-item'}
      onClick={()=>selectScene(s.id)}>#{s.index+1} · {(s.durationFrames/fps).toFixed(2)}s · {s.text.slice(0,42)}</button>)}
    </div><div className="timeline-render-main">
    <p className="muted">Hình ảnh, phụ đề và phát voice nằm trong Timeline 4 Tracks; phần này chỉ giữ Inspector và khóa timing.</p>
    <div className="timeline-render-inspector"><h3>Timing Lock · Scene {scene?.index+1}</h3>
      <label>Độ dài (ms) <input type="number" min="500" max="120000" value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label>
      <label>Bắt đầu subtitle (ms) <input type="number" min="0" value={capStart} onChange={e=>setCapStart(Number(e.target.value))}/></label>
      <label>Kết thúc subtitle (ms) <input type="number" min="1" value={capEnd} onChange={e=>setCapEnd(Number(e.target.value))}/></label>
      <button className="btn secondary" disabled={busy||inspectorDirty||timelineDirty} onClick={save}>🔒 Lưu timing tùy chỉnh</button>
      {scene?.visualWindow&&<small>🎞 Visual window sẽ xuất MP4: giữ khung hình đầu đến frame {scene.visualWindow.inFrame}, phát chuyển động đến frame {scene.visualWindow.outFrame}, sau đó giữ khung hình cuối. Voice và phụ đề không bị cắt.</small>}
      <small>Đổi thứ tự trình chiếu bằng track Media. Master Script giữ nguyên thứ tự nguồn. Voice dài hơn scene hoặc khoảng visual vượt thời lượng đo thực tế sẽ chặn xuất.</small>
    </div>
    <SceneInspectorR301 key={`${video.id}:${scene?.id}`} videoId={video.id} sceneId={scene?.id}
     onDirtyChange={setInspectorDirty} onSaved={()=>refresh({invalidateApproval:true})}/>
    </div></div>
    <div className="actions"><button className="btn" disabled={!snapshot.readiness.ready||busy||inspectorDirty||timelineDirty} onClick={approve}>✓ Phê duyệt timing</button></div>
    <SubtitleDraftPanelR405 key={`${video.id}:${approvedRevision}:${scene?.id}`} videoId={video.id} compositionRevision={approvedRevision} sceneId={scene?.id}/>
    <VisualConsistencyPanelR407 videoId={video.id}/>
    <div ref={renderSectionRef} id="render-export" className="production-render-section" aria-label="Xuất MP4 local">
    <div className="actions">
      <label>Render đã lưu (SQLite · không tự chạy lại)
       <select aria-label="Lịch sử xuất MP4" value={render?.id??''}
        onChange={e=>{
         const selected=renderHistory.find(item=>item.id===e.target.value);
         if(selected)setRender(selected);
        }}>
        <option value="">Chưa có bản xuất</option>
        {renderHistory.map(item=><option key={item.id} value={item.id}>
          {item.status==='succeeded'?'✓ ':item.status==='failed'?'! ':'… '}
          #{item.revision??'?'} · {item.status} · {item.id.slice(0,8)}
        </option>)}
       </select>
      </label>
      <button type="button" className="btn secondary" disabled={busy} onClick={()=>act(async()=>{
       const result=await api(`/videos/${video.id}/renders?limit=10`);
       setRenderHistory(result.items??[]);
       setRender(old=>(result.items??[]).find(x=>x.id===old?.id)??result.items?.[0]??null);
      })}>↻ Cập nhật bản xuất</button>
    </div>
    <RenderDrawerR312 videoId={video.id} revision={approvedRevision} styleRevision={styleRevision} styleDirty={styleDirty}
      editorDirty={inspectorDirty||timelineDirty} engine={engine} setEngine={setEngine} busy={busy}
      render={render} setRender={setRender} onMessage={setNotice} onError={setError}/>
    <div className="actions">
      {render?.status==='succeeded'&&<button className="btn" disabled={busy} onClick={download}>⬇ Lưu MP4</button>}
      {render?.output?.subtitleUrl&&<button className="btn secondary" disabled={busy} onClick={subtitleDownload}>⬇ Tải phụ đề SRT</button>}
      {render?.output?.thumbnailUrl&&<button className="btn secondary" disabled={busy} onClick={thumbnail}>⬇ Tải thumbnail JPG</button>}
    </div>
    {render?.output&&<p className={render.output.qa?.passed?'info':'warn'}>QA MP4: {render.output.qa?.passed?'PASS':'FAILED'} · {render.output.bytes} bytes · {render.output.engine}</p>}
    </div>
    <p className="muted">Preview chỉ phát file gốc theo scene; không phải video đã render. MP4 sẽ đốt phụ đề vào hình, có giọng và khoảng đệm. Chrome/Edge hỗ trợ lưu trực tiếp video dài qua File System Access. Trình duyệt không hỗ trợ chỉ tải Blob đến 100MB.</p>
  </>}
 </section>;
}
