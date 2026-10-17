/** R3-02/R3-03/R3-04 — actual four-lane editor with viewport virtualization,
 * one authenticated audio playback clock, and explicit optimistic reorder.
 * No provider/AI dispatch, silent media impersonation, or automatic render.
 */
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {api,getSceneImageFile,getSceneVoiceAudio} from './api.js';
import {formatTimelineTime,visibleTimelineScenes,sceneAtTime,moveSceneByOffset,moveSceneOrder,orderManifest} from './timeline-model-r302.mjs';
import {TimelinePlaybackR303} from './playback-controller-r303.mjs';
import {snapVisualWindow} from '../../../packages/core/src/timeline-visual-r305.mjs';
import {waveformSvgPath} from './waveform-model-r306.mjs';
import {canEditTimeline,timelineKeyboardSeek,zoomScrollAnchor} from './timeline-ui-fi0405.mjs';
const LANES=[['media','🖼 Media'],['text','📝 Text'],['voice','🎙 Voice'],['music','🎵 Music']];
export function TimelineEditorR302({videoId,selectedSceneId,onSelect=()=>{},onSaved=()=>{},onDirtyChange=()=>{},reloadKey=0,locked=false}){
 const [canonical,setCanonical]=useState(null),[draftOrder,setDraftOrder]=useState([]),[selected,setSelected]=useState(null);
 const [zoom,setZoom]=useState(42),[scroll,setScroll]=useState(0),[viewport,setViewport]=useState(950);
 const [position,setPosition]=useState(0),[playing,setPlaying]=useState(false),[imageUrl,setImageUrl]=useState(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [visualDraft,setVisualDraft]=useState(null),[waveforms,setWaveforms]=useState({});
 const [history,setHistory]=useState(null);
 const waveCache=useRef(new Map());
 const trimDirtyRef=useRef(false);
 const trackRef=useRef(null),audioRef=useRef(null),playerRef=useRef(null),changeRef=useRef(onSelect),lastNotified=useRef(null),zoomAnchorRef=useRef(null);
 changeRef.current=onSelect;
 const orderDirty=!!canonical&&draftOrder.join('|')!==canonical.scenes.map(s=>s.id).join('|');
 const canonicalVisual=canonical?.scenes.find(s=>s.id===selected);
 const trimDirty=!!visualDraft&&!!canonicalVisual&&
  (visualDraft.inMs!==canonicalVisual.visualInMs||visualDraft.outMs!==canonicalVisual.visualOutMs);
 const dirty=orderDirty||trimDirty;
 trimDirtyRef.current=trimDirty;
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false)},[dirty,onDirtyChange]);
 useEffect(()=>{if(!dirty)return;const handler=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[dirty]);
 const manifest=useMemo(()=>canonical?orderManifest(canonical,draftOrder):null,[canonical,draftOrder]);
 const scenes=manifest?.scenes??[];const active=sceneAtTime(scenes,position);
 useEffect(()=>{let live=true;setCanonical(null);setDraftOrder([]);setError('');setNotice('');
  waveCache.current.clear();setWaveforms({});setVisualDraft(null);lastNotified.current=null;
  Promise.all([api(`/videos/${videoId}/timeline/manifest`),api(`/videos/${videoId}/timeline/history`)]).then(([result,history])=>{if(!live)return;
   setCanonical(result);setHistory(history);setDraftOrder(result.scenes.map(x=>x.id));setSelected(result.scenes[0]?.id??null);
  }).catch(e=>{if(live)setError(e.code??e.message)});return()=>{live=false};
 },[videoId,reloadKey]);
 useEffect(()=>{if(!trackRef.current)return;
  const el=trackRef.current;
  const resize=()=>setViewport(el.clientWidth||950);
  resize();if(!globalThis.ResizeObserver)return;
  const observer=new ResizeObserver(resize);observer.observe(el);return()=>observer.disconnect();
 },[!!manifest]);
 useEffect(()=>{if(!manifest||!selectedSceneId)return;
  const s=manifest.scenes.find(x=>x.id===selectedSceneId);if(s&&!trimDirtyRef.current)setSelected(s.id);
 },[selectedSceneId,canonical?.rowVersion]);
 useEffect(()=>{
  const scene=canonical?.scenes.find(s=>s.id===selected);
  setVisualDraft(scene?{inMs:scene.visualInMs,outMs:scene.visualOutMs}:null);
 },[selected,canonical?.rowVersion]);
 // Use one Audio element and one playback controller across the entire editor.
 useEffect(()=>{if(!audioRef.current)return;
  const p=new TimelinePlaybackR303({audio:audioRef.current,loadVoice:getSceneVoiceAudio,
   onUpdate:status=>{setPosition(status.positionMs);setPlaying(status.playing);
    if(!trimDirtyRef.current&&status.sceneId&&status.sceneId!==lastNotified.current){lastNotified.current=status.sceneId;setSelected(status.sceneId);changeRef.current(status.sceneId);}},
   onError:code=>setError(code)});
  playerRef.current=p;return()=>{p.dispose();playerRef.current=null};
 },[videoId,!!manifest]);
 useEffect(()=>{if(!manifest)return;
  // A reorder changes scene boundaries: invalidate old voice/clock *before*
  // allowing another playback or dispatching a different selected scene.
  playerRef.current?.setScenes(manifest.scenes);lastNotified.current=null;
  if(dirty)playerRef.current?.pause();
 },[manifest,dirty]);
 useEffect(()=>{if(locked)playerRef.current?.pause()},[locked]);
 useEffect(()=>{if(trimDirty)playerRef.current?.pause()},[trimDirty]);
 const seek=(ms,play=false)=>{if(locked||!Number.isFinite(ms))return;setError('');return playerRef.current?.seek(ms,{play})};
 const pickScene=s=>{if(locked||trimDirty)return;setSelected(s.id);changeRef.current(s.id);seek(s.startMs,false)};
 useEffect(()=>{setImageUrl(null);if(!active?.id||active.mediaType!=='image_motion'||!active.visualAssetId)return;
  let live=true;const controller=new AbortController();let url=null;
  getSceneImageFile(active.id,{signal:controller.signal}).then(blob=>{
   if(!live)return;url=URL.createObjectURL(blob);setImageUrl(url);
  }).catch(()=>{if(live)setImageUrl(null)});
  return()=>{live=false;controller.abort();if(url)URL.revokeObjectURL(url)};
 },[active?.id,active?.visualAssetId]);
 // Visible scene count is O(viewport width), independent of 500+ total scenes.
 const visible=useMemo(()=>visibleTimelineScenes(scenes,{scrollLeft:scroll,viewportWidth:viewport,pixelsPerSecond:zoom}),[scenes,scroll,viewport,zoom]);
 // R3-06: load only visible voice clips, cap concurrency to avoid 500 audio
 // decodes/requests after a quick scroll. The service caches by audio SHA256.
 useEffect(()=>{let alive=true;const controller=new AbortController();
  const candidates=visible.filter(s=>s.voiceAssetId&&!waveCache.current.has(`${s.id}:${s.voiceAssetId}`)).slice(0,16);
  (async()=>{let cursor=0;const worker=async()=>{
   while(alive&&cursor<candidates.length){const scene=candidates[cursor++],key=`${scene.id}:${scene.voiceAssetId}`;
    waveCache.current.set(key,null);try{
     const wave=await api(`/scenes/${scene.id}/voice/waveform?bins=96`,{signal:controller.signal});
     if(alive){waveCache.current.set(key,wave);setWaveforms(old=>({...old,[key]:wave}));}
    }catch{if(alive){waveCache.current.delete(key);}}
   }
  };await Promise.all(Array.from({length:Math.min(3,candidates.length)},worker));})();
  return()=>{alive=false;controller.abort();for(const s of candidates){const key=`${s.id}:${s.voiceAssetId}`;
   if(waveCache.current.get(key)===null)waveCache.current.delete(key);}};
 },[visible.map(s=>`${s.id}:${s.voiceAssetId}`).join('|')]);
 const scale=zoom/1000,width=Math.max(viewport,Math.ceil((manifest?.totalDurationMs??0)*scale)+2);
 const changeZoom=(newZoom)=>{if(!manifest)return;const el=trackRef.current;
  if(el)zoomAnchorRef.current=zoomScrollAnchor({scrollLeft:el.scrollLeft,viewportWidth:el.clientWidth||viewport,positionMs:position,oldZoom:zoom,newZoom,totalDurationMs:manifest.totalDurationMs});
  setZoom(newZoom);
 };
 useLayoutEffect(()=>{if(zoomAnchorRef.current===null||!trackRef.current)return;
  trackRef.current.scrollLeft=zoomAnchorRef.current;setScroll(trackRef.current.scrollLeft);zoomAnchorRef.current=null;
 },[zoom]);
 const keyboardTrack=(e)=>{if(e.target!==e.currentTarget||locked||busy)return;
  const target=timelineKeyboardSeek(e.key,{positionMs:position,totalDurationMs:manifest?.totalDurationMs??0,shiftKey:e.shiftKey});
  if(target!==null){e.preventDefault();void seek(target,false);return;}
  if(e.key===' '){e.preventDefault();if(playing)playerRef.current?.pause();else void playerRef.current?.play();}
 };
 const editAllowed=kind=>canEditTimeline({locked,busy,orderDirty,trimDirty},kind);
 const move=(id,delta)=>{if(!editAllowed('reorder'))return;setDraftOrder(prev=>moveSceneByOffset(prev,id,delta));setNotice('Thứ tự mới chưa lưu; cần xác nhận để lưu.');};
 const drop=(e,target)=>{e.preventDefault();if(!editAllowed('reorder'))return;const id=e.dataTransfer.getData('application/x-contentstudio-scene');
  if(!id||id===target)return;try{setDraftOrder(prev=>moveSceneOrder(prev,id,target));setNotice('Thứ tự mới chưa lưu.');}catch{};
 };
 const save=async()=>{
  if(!orderDirty||!editAllowed('reorder'))return;
  if(!window.confirm('Lưu thứ tự trình chiếu mới? Master Script và asset không thay đổi. Composition/render cũ cần duyệt lại.'))return;
  setBusy(true);setError('');try{
   const result=await api(`/videos/${videoId}/timeline/order`,{method:'PATCH',body:{expectedRowVersion:canonical.rowVersion,sceneOrder:draftOrder}});
   setCanonical(result);setDraftOrder(result.scenes.map(x=>x.id));setNotice('Đã lưu thứ tự (optimistic lock). Cần duyệt lại Composition trước khi render.');
   playerRef.current?.pause();await onSaved();
  }catch(e){setError((e.status===409?'Xung đột phiên bản: tải lại và kiểm tra trước khi lưu. ':'')+(e.code??e.message))}
  finally{setBusy(false)};
 };
 const cancel=()=>{if(!canonical||!editAllowed('reorder'))return;setDraftOrder(canonical.scenes.map(s=>s.id));setNotice('Đã khôi phục thứ tự đã lưu.');};
 const cancelVisual=()=>{if(!canonicalVisual||!editAllowed('trim'))return;setVisualDraft({inMs:canonicalVisual.visualInMs,outMs:canonicalVisual.visualOutMs});setNotice('Đã hủy chỉnh sửa Visual chưa lưu.');};
 const saveVisual=async()=>{
  if(!trimDirty||!editAllowed('trim'))return;
  if(!window.confirm('Lưu cửa sổ hiển thị visual? Voice, text và độ dài scene sẽ giữ nguyên.'))return;
  setBusy(true);setError('');try{
   const result=await api(`/videos/${videoId}/timeline/visual-window`,{method:'PATCH',body:{expectedRowVersion:canonical.rowVersion,
    sceneId:selected,inMs:visualDraft.inMs,outMs:visualDraft.outMs}});
   setCanonical(result);setDraftOrder(result.scenes.map(s=>s.id));setNotice('Đã lưu visual window; cần duyệt Composition mới trước khi render.');
   playerRef.current?.pause();await onSaved();
  }catch(e){setError(e.status===409?'Có xung đột phiên bản, tải lại trước khi lưu.':(e.code??e.message));}
  finally{setBusy(false)}
 };
 const travelHistory=async(direction)=>{
  if(dirty||busy||locked||!history?.[direction==='undo'?'canUndo':'canRedo'])return;
  setBusy(true);setError('');try{
   const result=await api(`/videos/${videoId}/timeline/history`,{method:'POST',body:{expectedRowVersion:canonical.rowVersion,direction}});
   playerRef.current?.pause();setCanonical(result.manifest);setHistory(result);
   setDraftOrder(result.manifest.scenes.map(x=>x.id));setNotice(direction==='undo'?'Đã hoàn tác một chỉnh sửa.':'Đã làm lại một chỉnh sửa.');
   await onSaved(); // Published Composition becomes stale until explicitly approved.
  }catch(e){setError(e.status===409?'Phiên bản Timeline đã thay đổi, cần tải lại.':(e.code??e.message));}
  finally{setBusy(false);}
 };
 useEffect(()=>{
  const handle=e=>{
   if(!(e.ctrlKey||e.metaKey)||e.altKey||e.isComposing||
      e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
   const key=e.key?.toLowerCase();
   const direction=key==='y'||(key==='z'&&e.shiftKey)?'redo':key==='z'?'undo':null;
   if(direction&&!dirty&&!busy&&!locked&&history?.[direction==='undo'?'canUndo':'canRedo']){
    e.preventDefault();void travelHistory(direction);
   }
  };
  window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);
 },[history,canonical?.rowVersion,dirty,busy,locked,videoId]);
 const changeVisual=(key,value)=>{
  if(!editAllowed('trim')||!selectedScene||!Number.isFinite(value))return;
  const snapped=snapVisualWindow(value,{durationMs:selectedScene.durationMs,fps:manifest?.fps??30,
   markers:[selectedScene.captionStartMs,selectedScene.captionEndMs],thresholdMs:90});
  setVisualDraft(draft=>{
   const next={...draft,[key]:snapped};
   if(next.outMs-next.inMs<200)return draft;
   return next;
  });
 };
 const rulerStep=zoom<26?30000:zoom<65?10000:5000;
 const firstTick=Math.max(0,Math.floor((scroll/scale)/rulerStep)*rulerStep);
 const lastTick=Math.min(manifest?.totalDurationMs??0,Math.ceil(((scroll+viewport)/scale)/rulerStep)*rulerStep);
 const ticks=[];for(let t=firstTick;t<=lastTick&&ticks.length<90;t+=rulerStep)ticks.push(t);
 const selectedScene=scenes.find(s=>s.id===selected),selectionIndex=selectedScene?.index??-1;
 return <section className="timeline-r302" aria-label="Timeline R3-02 bốn track">
  <header className="timeline-r302-head"><div><h3>Timeline Editor · 4 Tracks</h3><small>R3-02/03/04/05/06 · Media / Text / Voice / Music · chỉ tải media được chọn · Preview âm thanh thực</small></div>
  <div className="timeline-r302-actions"><label>Zoom <input type="range" min="10" max="180" step="2" value={zoom} aria-label="Zoom timeline" onChange={e=>changeZoom(+e.target.value)}/></label>
   <button className="btn secondary" onClick={()=>travelHistory('undo')} disabled={busy||dirty||locked||!history?.canUndo} title="Ctrl+Z / Cmd+Z">↶ Undo</button>
   <button className="btn secondary" onClick={()=>travelHistory('redo')} disabled={busy||dirty||locked||!history?.canRedo} title="Ctrl+Y / Ctrl+Shift+Z">↷ Redo</button>
   <button className="btn secondary" onClick={cancel} disabled={!orderDirty||!editAllowed('reorder')}>↶ Hoàn tác thứ tự</button>
   <button className="btn" onClick={save} disabled={!orderDirty||!editAllowed('reorder')}>💾 Lưu thứ tự</button></div></header>
  {error&&<p role="alert" className="error">{error}</p>}{notice&&<p className="info">{notice}</p>}
  <audio ref={audioRef} hidden preload="metadata" aria-hidden="true" />
  {!manifest?<p>Đang tải timeline…</p>:<>
   <div className="timeline-r302-info"><span>{scenes.length} scenes · {formatTimelineTime(manifest.totalDurationMs)}</span>
    <span>Timeline revision #{manifest.rowVersion} {dirty?' · ● chưa lưu':''}</span><span>Nhạc nền cấu hình tại Render Drawer; chưa có preview nhạc trong timeline.</span></div>
   <div className="timeline-r302-stage"><div className="timeline-r302-view" aria-label="Xem trước scene">
     {imageUrl&&active?.mediaType==='image_motion'?<img src={imageUrl} alt="Hình minh họa của scene đang phát"/>:<div className="timeline-r302-placeholder">{active?.mediaType==='image_motion'?'Chưa có ảnh khả dụng':'Chưa hỗ trợ preview clip trong trình duyệt'}</div>}
     {active&&position>=active.startMs+(active.captionStartMs??0)&&position<active.startMs+(active.captionEndMs??active.durationMs)&&<div className="timeline-r302-subtitle">{active.captionText}</div>}
    </div><div className="timeline-r302-side"><h4>Scene {active?active.index+1:'—'}</h4>
     <p>{active?.text??'Chưa có scene'}</p><p className="muted">{active?.timingSource==='scene_estimate'?'Thời lượng đang ước tính từ scene. Không phải word-alignment.':'Thời lượng đã khóa thủ công.'}</p>
     <div className="timeline-r302-playbar"><button onClick={()=>seek(Math.max(0,position-5000),playing)}>⏮ 5s</button>
       <button disabled={locked} onClick={()=>playing?playerRef.current?.pause():playerRef.current?.play()} aria-label={playing?'Dừng preview':'Phát preview'}>{playing?'❚❚ Tạm dừng':'▶ Phát'}</button>
       <button onClick={()=>seek(Math.min(manifest.totalDurationMs,position+5000),playing)}>5s ⏭</button></div>
     <strong>{formatTimelineTime(position)} / {formatTimelineTime(manifest.totalDurationMs)}</strong><small>Voice được phát bằng một Audio duy nhất. Nếu thiếu voice, sẽ báo lỗi, không giả lập tiếng.</small>
    </div></div>
   <div className="timeline-r302-move"><label>Đi tới scene <select disabled={locked} value={selected??''} onChange={e=>{const s=scenes.find(s=>s.id===e.target.value);if(s)pickScene(s)}}>
     {scenes.map(s=><option key={s.id} value={s.id}>#{s.index+1} — {s.text.slice(0,44)}</option>)}</select></label>
    <button disabled={!editAllowed('reorder')||selectionIndex<=0} onClick={()=>move(selected,-1)}>← Dời trái</button>
    <button disabled={!editAllowed('reorder')||selectionIndex<0||selectionIndex===scenes.length-1} onClick={()=>move(selected,1)}>Dời phải →</button>
    <small>Kéo scene trong track Media hoặc dùng hai nút này (hỗ trợ bàn phím). Không chỉnh sửa Master Script gốc.</small></div>
   {selectedScene&&visualDraft&&<div className="timeline-r305-controls" aria-label="R3-05 visual trim không cắt voice">
    <strong>✂ Visual window · Scene {selectedScene.index+1}</strong>
    <label>In (ms) <input type="number" min="0" max={selectedScene.durationMs-200} step="33"
     value={visualDraft.inMs} disabled={!editAllowed('trim')} onChange={e=>changeVisual('inMs',+e.target.value)}/></label>
    <label>Out (ms) <input type="number" min={visualDraft.inMs+200} max={selectedScene.durationMs} step="33"
     value={visualDraft.outMs} disabled={!editAllowed('trim')} onChange={e=>changeVisual('outMs',+e.target.value)}/></label>
    <button onClick={()=>setVisualDraft({inMs:0,outMs:selectedScene.durationMs})} disabled={!editAllowed('trim')}>Đặt toàn bộ</button>
    <button onClick={cancelVisual} disabled={!trimDirty||!editAllowed('trim')}>Bỏ sửa Visual</button>
    <button className="btn" onClick={saveVisual} disabled={!trimDirty||!editAllowed('trim')}>💾 Lưu Visual</button>
    <small>Snap {manifest?.fps??30}fps/đầu-cuối caption; đoạn ngoài khung giữ nguyên timeline/voice. Render xuất đúng visual window đã lưu (nghiệm thu engine thật còn chờ).</small>
   </div>}
   <div className="timeline-r302-outer"><div className="timeline-r302-tracklabels"><div>Thời gian</div>{LANES.map(([id,title])=><div key={id}>{title}</div>)}</div>
    <div className="timeline-r302-scroll" ref={trackRef} onScroll={e=>setScroll(e.currentTarget.scrollLeft)} onKeyDown={keyboardTrack} tabIndex={0} role="region" aria-label="Vùng cuộn timeline" aria-describedby="fi0405-timeline-keyhelp">
     <div style={{width,position:'relative'}}><div className="timeline-r302-ruler" onClick={e=>seek(Math.round((e.clientX-e.currentTarget.getBoundingClientRect().left)/scale))}>
      {ticks.map(t=><span key={t} className="timeline-r302-tick" style={{left:t*scale}}>{formatTimelineTime(t)}</span>)}</div>
      {LANES.map(([lane])=><div key={lane} className="timeline-r302-trackrow">
       {lane==='music'?<span className="timeline-r302-music">Nhạc nền: chọn tại Render Drawer · không preview trong Timeline</span>:
        visible.map(s=><button key={`${lane}:${s.id}`} title={`${s.index+1} · ${s.text.slice(0,80)}`} type="button"
         draggable={lane==='media'&&editAllowed('reorder')} onDragStart={e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-contentstudio-scene',s.id)}}
         onDragOver={lane==='media'&&editAllowed('reorder')?e=>e.preventDefault():undefined} onDrop={lane==='media'?e=>drop(e,s.id):undefined}
         onClick={()=>pickScene(s)} className={`timeline-r302-clip lane-${lane} ${active?.id===s.id?'active':''}`}
         style={{left:s.startMs*scale,width:Math.max(1,s.durationMs*scale-2)}}>
          {lane==='media'?<><span>#{s.index+1} {s.mediaType==='image_motion'?'▣':'▤'}</span><span className="timeline-r305-window" style={{left:`${s.visualInMs/s.durationMs*100}%`,width:`${(s.visualOutMs-s.visualInMs)/s.durationMs*100}%`}}/></>
           :lane==='voice'?(s.voiceAssetId?<><span>Audio</span>{waveforms[`${s.id}:${s.voiceAssetId}`]&&<svg className="timeline-r306-wave" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true" style={{width:`${Math.min(100,waveforms[`${s.id}:${s.voiceAssetId}`].durationMs/s.durationMs*100)}%`}}><path d={waveformSvgPath(waveforms[`${s.id}:${s.voiceAssetId}`].peaks)}/></svg>}</>:'⚠ Chưa có voice')
           :s.text.slice(0,40)}
         </button>)}
      </div>)}<div className="timeline-r302-playhead" style={{left:position*scale}} aria-hidden="true"/></div>
    </div></div>
   <p className="muted" id="fi0405-timeline-keyhelp">Focus vùng Timeline: ←/→ dịch 1 giây (Shift = 5 giây), Home/End về đầu/cuối, Space phát/dừng. Kéo media hoặc dùng các nút Dời để đổi thứ tự.</p>
   <p className="muted">Chỉ các clip nằm trong viewport (+ overscan) được render. Reorder và visual window lưu trong timeline riêng, không đụng đến voice, độ dài scene hoặc Master Script. Waveform lấy từ audio thật đã kiểm tra checksum. Visual window được đưa vào Composition và cả hai render adapter.</p>
  </>}
 </section>;
}
