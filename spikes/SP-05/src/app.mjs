/**
 * SP-05 browser UI spike: 4-track virtual timeline for 500 scenes.
 * Deliberately keeps scheduling/timing in engine.mjs so the same engine can be
 * consumed by the approved React/Vite app without carrying this prototype DOM.
 * No AI or production media claims: preview and unset waveforms are illustrative.
 */
import {createDemoScenes, buildTimeline, getVisibleRange, getSceneAtTime,
  reorderScenes, trimScene, updateScene, extractWavePeaks, formatTime, clamp} from './engine.mjs';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'contentstudio-sp05-timeline-v1';
const DEFAULT_SCALE = 18;
const state = {
  scenes: readScenes(), timeline: null, scale: DEFAULT_SCALE, selectedId: 'SC-001',
  timeMs: 0, playing: false, lastTick: 0, raf: 0, undo: [], redo: [],
  dragging: null, trimming: null, audio: new Map(), audioPlayingId: null,
};
state.timeline = buildTimeline(state.scenes);
const timelineScroll = $('timelineScroll');
const timelineCanvas = $('timelineCanvas');
const laneNodes = {media:$('laneMedia'),text:$('laneText'),voice:$('laneVoice'),music:$('laneMusic')};
let saveTimer, toastTimer, renderScheduled = false;

function readScenes() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(stored) || stored.length !== 500) return createDemoScenes();
    if (new Set(stored.map(s => s.id)).size !== 500) throw Error('duplicate IDs');
    buildTimeline(stored); // Invalid serialized data must not break editor startup.
    return stored;
  } catch { return createDemoScenes(); }
}
function notify(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2700);
}
function markSaved() {
  $('saveStatus').textContent = '● Đang lưu…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scenes));
      $('saveStatus').textContent = '● Đã lưu local';
    } catch { $('saveStatus').textContent = '● Lỗi lưu'; notify('Bộ nhớ trình duyệt đã đầy, chưa thể lưu.'); }
  }, 280);
}
function selectedIndex() {return Math.max(0, state.scenes.findIndex(scene => scene.id === state.selectedId));}
function sceneAtIndex(index) {return state.scenes[clamp(index, 0, state.scenes.length - 1)];}
function resetLayout() {
  state.timeline = buildTimeline(state.scenes);
  timelineCanvas.style.width = `${Math.max(timelineScroll.clientWidth, state.timeline.totalMs * state.scale / 1000)}px`;
  $('totalTime').textContent = formatTime(state.timeline.totalMs);
  $('sceneCount').textContent = `${state.scenes.length} scenes`;
  state.timeMs = clamp(state.timeMs, 0, state.timeline.totalMs);
  requestRender();
}
function captureEdit() {
  state.undo.push(state.scenes);
  if (state.undo.length > 25) state.undo.shift();
  state.redo.length = 0;
  syncUndoButtons();
}
function syncUndoButtons() { $('undoBtn').disabled = !state.undo.length; $('redoBtn').disabled = !state.redo.length; }
function applyScenes(next, {snapshot = true} = {}) {
  if (next === state.scenes) return;
  if (snapshot) captureEdit();
  state.scenes = next;
  resetLayout(); syncInspector(); markSaved();
}
function undo() {
  if (!state.undo.length) return;
  state.redo.push(state.scenes); state.scenes = state.undo.pop();
  syncUndoButtons(); resetLayout(); syncInspector(); markSaved(); notify('Đã hoàn tác');
}
function redo() {
  if (!state.redo.length) return;
  state.undo.push(state.scenes); state.scenes = state.redo.pop();
  syncUndoButtons(); resetLayout(); syncInspector(); markSaved(); notify('Đã làm lại');
}
function chooseScene(id, {seek = false, scroll = false} = {}) {
  const index = state.scenes.findIndex(s => s.id === id);
  if (index < 0) return;
  state.selectedId = id;
  if (seek) setTime(state.timeline.startsMs[index]);
  if (scroll) timelineScroll.scrollLeft = Math.max(0, state.timeline.startsMs[index] * state.scale / 1000 - 70);
  syncInspector(); requestRender();
}
function setTime(ms) {
  state.timeMs = clamp(Math.round(ms), 0, state.timeline.totalMs);
  $('currentTime').textContent = formatTime(state.timeMs, true);
  const id = sceneAtIndex(getSceneAtTime(state.scenes, state.timeline, state.timeMs)).id;
  // Seeking and playback both keep preview/inspector aligned with playhead.
  const sceneChanged = state.selectedId !== id;
  if (sceneChanged) {state.selectedId = id; syncInspector();}
  syncAudio();
  // Move the playhead without rebuilding wave canvases every animation frame.
  $('playhead').style.left = `${state.timeMs * state.scale / 1000}px`;
  if (sceneChanged) requestRender();
}
function syncInspector() {
  const scene = state.scenes[selectedIndex()];
  $('sceneHeading').textContent = scene.id;
  $('sceneDuration').textContent = `${(scene.durationMs / 1000).toFixed(1)}s`;
  $('sceneKind').textContent = scene.mediaKind;
  if (document.activeElement !== $('scriptInput')) $('scriptInput').value = scene.text;
  if (document.activeElement !== $('promptInput')) $('promptInput').value = scene.imagePrompt;
  $('charsCount').textContent = `${scene.text.length} ký tự`;
  $('screenTitle').textContent = scene.title;
  $('screenCaption').textContent = scene.text;
  $('screen').style.background = `linear-gradient(135deg, ${scene.color}44, #1e2e4e 48%, #121a31)`;
  $('audioLabel').textContent = state.audio.has(scene.id) ? `Đã tải: ${state.audio.get(scene.id).name}` : 'Chưa có voice thật';
  const dirty = scene.voiceState === 'needs-regen' || scene.imageState === 'needs-regen';
  document.querySelector('.status-badge').textContent = dirty ? '● CẦN TẠO LẠI' : '● DEMO';
}
/** Rendering is bounded by the viewport; no 500-scene * 3-track DOM explosion. */
function requestRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {renderScheduled = false; renderViewport();});
}
function viewportRange() {
  return getVisibleRange(state.scenes, state.timeline, timelineScroll.scrollLeft, timelineScroll.clientWidth, state.scale);
}
function addClip(parent, kind, scene, i, x, w) {
  const el = document.createElement('div');
  el.className = `clip ${kind}${scene.id === state.selectedId ? ' selected' : ''}`;
  el.style.left = `${x + 1}px`; el.style.width = `${Math.max(4, w - 2)}px`;
  el.dataset.sceneId = scene.id; el.dataset.index = String(i); el.dataset.kind = kind;
  el.setAttribute('role', 'button'); el.setAttribute('tabindex', '-1');
  el.setAttribute('aria-label', `${kind}, ${scene.id}, ${(scene.durationMs/1000).toFixed(1)} giây`);
  if (kind === 'media') {
    el.style.setProperty('--scene-color', scene.color);
    el.draggable = true;
    const icon = document.createElement('span'); icon.className='clip-symbol'; icon.textContent=scene.mediaKind==='AI VIDEO'?'▶':'▧';el.append(icon);
    if (w > 62) {const name = document.createElement('span');name.className='clip-name';name.textContent=scene.id;el.append(name);}
    if (w > 117) {const kindLabel=document.createElement('small');kindLabel.textContent=scene.mediaKind;el.append(kindLabel);}
    const trim = document.createElement('span');trim.className='trim-handle';trim.dataset.trim='true';trim.title='Kéo để đổi thời lượng (1–30s)';el.append(trim);
  } else if (kind === 'text') {
    el.textContent = w > 50 ? `▤ ${scene.id} · ${scene.title}` : '▤';
  } else if (kind === 'voice') {
    const canvas = document.createElement('canvas');
    canvas.className='wave';canvas.width=Math.max(12,Math.min(240, Math.floor(w - 10))); canvas.height=30;
    canvas.title=state.audio.has(scene.id)?'Waveform từ audio thật':'Waveform minh họa (chưa có audio)';
    el.append(canvas); drawWave(canvas, state.audio.get(scene.id)?.peaks ?? demoPeaks(i), Boolean(state.audio.has(scene.id)));
  }
  parent.append(el);
}
const waveCache = new Map();
function demoPeaks(index) {
  if (waveCache.has(index)) return waveCache.get(index);
  // Stable demo signal, intentionally not claimed to be real synthesized speech.
  const peaks = Array.from({length:96}, (_, j) => 0.14 + .74 * Math.abs(Math.sin((j + index*13)*0.29) * Math.cos((j + index)*0.12)));
  waveCache.set(index, peaks); return peaks;
}
function drawWave(canvas, peaks, actual) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = actual ? '#92f9e4' : '#51b9a5';
  const bins = Math.min(peaks.length, Math.max(8, Math.floor(canvas.width/3)));
  for (let i=0;i<bins;i++) {
    const v = peaks[Math.floor(i * peaks.length / bins)];const h = Math.max(2, Math.round(v*24));
    ctx.fillRect(i*canvas.width/bins, (canvas.height-h)/2, Math.max(1, canvas.width/bins-1), h);
  }
}
function renderRuler(leftPx, rightPx) {
  const ruler = $('ruler');ruler.replaceChildren();
  // Timestamp tick generation is proportional to visible width, never 35 minutes.
  const intervalS = state.scale < 10 ? 30 : state.scale < 22 ? 15 : 5;
  let t = Math.floor(leftPx / state.scale / intervalS) * intervalS;
  for (; t*state.scale <= rightPx + 50; t += intervalS) {
    if (t < 0) continue;
    const tick=document.createElement('div');tick.className='tick';tick.style.left=`${t*state.scale}px`;
    const label=document.createElement('span');label.textContent=formatTime(t*1000);tick.append(label);ruler.append(tick);
  }
}
function renderViewport() {
  const begin = performance.now();
  const {first,end,count} = viewportRange();
  for (const node of [laneNodes.media,laneNodes.text,laneNodes.voice]) node.replaceChildren();
  for (let i=first;i<end;i++) {
    const scene=state.scenes[i];const x=state.timeline.startsMs[i]*state.scale/1000;const w=scene.durationMs*state.scale/1000;
    addClip(laneNodes.media,'media',scene,i,x,w);
    addClip(laneNodes.text,'text',scene,i,x,w);
    addClip(laneNodes.voice,'voice',scene,i,x,w);
  }
  // A single music lane spanning the whole video is not 500 redundant nodes.
  if (!laneNodes.music.childElementCount) {
    const music=document.createElement('div');music.className='clip music';music.style.left='0';music.style.width='100%';
    laneNodes.music.append(music);
  }
  const left=timelineScroll.scrollLeft;
  renderRuler(left-100, left+timelineScroll.clientWidth+100);
  $('playhead').style.left=`${state.timeMs * state.scale/1000}px`;
  $('viewportLabel').textContent=`Scenes ${first+1}–${end} / ${state.scenes.length}`;
  $('perfLabel').textContent=`${count} scene DOM • ${(performance.now()-begin).toFixed(1)} ms`;
  document.documentElement.dataset.renderedScenes = String(count);
}
function handleDragStart(event) {
  const clip=event.target.closest('.clip.media');
  if (!clip || event.target.closest('.trim-handle')) {event.preventDefault();return;}
  state.dragging = {id:clip.dataset.sceneId};
  event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',state.dragging.id);
  clip.classList.add('dragging');
}
function handleDrop(event) {
  const target=event.target.closest('.clip.media');
  if (!state.dragging || !target) return;
  event.preventDefault();
  const from=state.scenes.findIndex(s => s.id===state.dragging.id);
  const to=state.scenes.findIndex(s => s.id===target.dataset.sceneId);
  const id=state.dragging.id;state.dragging=null;
  if (from !== to) {applyScenes(reorderScenes(state.scenes,from,to));chooseScene(id,{seek:true});notify(`Đã chuyển ${id} từ vị trí ${from+1} → ${to+1}`);}
}
function beginTrim(event) {
  const handle=event.target.closest('.trim-handle');if (!handle) return false;
  const clip=handle.closest('.clip');const idx=state.scenes.findIndex(s=>s.id===clip.dataset.sceneId);
  if (idx<0) return false;
  event.preventDefault();event.stopPropagation();
  state.trimming={id:clip.dataset.sceneId,startX:event.clientX,originalMs:state.scenes[idx].durationMs,snapshot:state.scenes};
  document.addEventListener('pointermove',onTrimMove);
  document.addEventListener('pointerup',endTrim,{once:true});
  return true;
}
function onTrimMove(event) {
  if (!state.trimming) return;
  const index=state.scenes.findIndex(s=>s.id===state.trimming.id);
  const delta=(event.clientX-state.trimming.startX)/state.scale*1000;
  const duration=state.trimming.originalMs+delta;
  state.scenes=trimScene(state.trimming.snapshot,index,duration);
  resetLayout();syncInspector();
}
function endTrim() {
  document.removeEventListener('pointermove',onTrimMove);
  if (!state.trimming) return;
  const prior=state.trimming.snapshot;
  const index=prior.findIndex(s=>s.id===state.trimming.id);
  const changed=prior[index].durationMs!==state.scenes[index].durationMs;
  if (changed) {state.undo.push(prior);if(state.undo.length>25)state.undo.shift();state.redo=[];syncUndoButtons();markSaved();notify('Đã thay đổi thời lượng clip');}
  state.trimming=null;
}
function syncAudio() {
  // The editor only plays clips with an actual uploaded browser audio object.
  // Silence for demo scenes is deliberate and must not be represented as AI TTS.
  const index=getSceneAtTime(state.scenes,state.timeline,state.timeMs);
  if (index<0) return;
  const id=state.scenes[index].id;
  if (state.audioPlayingId && state.audioPlayingId!==id) state.audio.get(state.audioPlayingId)?.element.pause();
  state.audioPlayingId=id;
  const audio=state.audio.get(id)?.element;
  if (audio) {
    const offset=(state.timeMs-state.timeline.startsMs[index])/1000;
    if (Math.abs(audio.currentTime-offset)>.35 && Number.isFinite(audio.duration)) {try {audio.currentTime=Math.min(offset,audio.duration);} catch {}}
    if (state.playing && audio.paused) audio.play().catch(()=>{});
    if (!state.playing && !audio.paused) audio.pause();
  }
}
function setPlaying(on) {
  if (on && state.timeMs>=state.timeline.totalMs) setTime(0);
  state.playing=on;
  $('playBtn').textContent=on?'❚❚':'▶';
  state.lastTick=performance.now();
  if (on) state.raf=requestAnimationFrame(tick); else cancelAnimationFrame(state.raf);
  syncAudio();
}
function tick(now) {
  if (!state.playing) return;
  // requestAnimationFrame delta, rather than adding fixed frame intervals, avoids drift.
  const delta=Math.min(now-state.lastTick,150);state.lastTick=now;
  setTime(state.timeMs+delta);
  const x=state.timeMs*state.scale/1000;
  if (x>timelineScroll.scrollLeft+timelineScroll.clientWidth-50 || x<timelineScroll.scrollLeft) timelineScroll.scrollLeft=Math.max(0,x-90);
  if (state.timeMs>=state.timeline.totalMs) return setPlaying(false);
  state.raf=requestAnimationFrame(tick);
}
function saveText(field,prop) {
  let editingId;
  field.addEventListener('focus',()=>{editingId=state.selectedId;});
  field.addEventListener('input',()=>{if(prop==='text')$('charsCount').textContent=`${field.value.length} ký tự`;});
  field.addEventListener('blur',()=>{
    const idx=state.scenes.findIndex(s=>s.id===editingId);if(idx<0) return;
    if(field.value===state.scenes[idx][prop])return;
    applyScenes(updateScene(state.scenes,idx,{[prop]:field.value}));notify(prop==='text'?'Đã lưu text, voice cần tạo lại':'Đã lưu prompt, ảnh cần tạo lại');
  });
}
function bindEvents() {
  timelineScroll.addEventListener('scroll',requestRender,{passive:true});
  window.addEventListener('resize',resetLayout);
  $('ruler').addEventListener('pointerdown',(event)=>{
    if(event.button!==0)return;
    const rect=timelineCanvas.getBoundingClientRect();
    setTime((event.clientX-rect.left)*1000/state.scale);
  });
  for (const key of ['media','text','voice']) {
    laneNodes[key].addEventListener('click',(event)=>{
      if (state.trimming || event.target.closest('.trim-handle'))return;
      const clip=event.target.closest('.clip');if(!clip)return;
      chooseScene(clip.dataset.sceneId,{seek:true});
    });
  }
  laneNodes.media.addEventListener('pointerdown',beginTrim);
  laneNodes.media.addEventListener('dragstart',handleDragStart);
  laneNodes.media.addEventListener('dragover',(event)=>{if(state.dragging){event.preventDefault();event.dataTransfer.dropEffect='move';}});
  laneNodes.media.addEventListener('drop',handleDrop);
  laneNodes.media.addEventListener('dragend',()=>{state.dragging=null;requestRender();});
  $('playBtn').addEventListener('click',()=>setPlaying(!state.playing));
  $('prevBtn').addEventListener('click',()=>chooseScene(sceneAtIndex(selectedIndex()-1).id,{seek:true,scroll:true}));
  $('nextBtn').addEventListener('click',()=>chooseScene(sceneAtIndex(selectedIndex()+1).id,{seek:true,scroll:true}));
  $('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);
  $('zoomRange').addEventListener('input',(event)=>setZoom(Number(event.target.value)));
  $('zoomOut').addEventListener('click',()=>setZoom(state.scale-3));
  $('zoomIn').addEventListener('click',()=>setZoom(state.scale+3));
  $('fitBtn').addEventListener('click',()=>setZoom(6));
  $('renderBtn').addEventListener('click',()=>notify('SP-05 kiểm thử timeline; render MP4 thuộc EP08/SP-01.'));
  saveText($('scriptInput'),'text');saveText($('promptInput'),'imagePrompt');
  $('audioInput').addEventListener('change',handleAudioInput);
  window.addEventListener('keydown',(event)=>{
    if(['TEXTAREA','INPUT'].includes(document.activeElement?.tagName))return;
    if(event.code==='Space'){event.preventDefault();setPlaying(!state.playing);}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){
      event.preventDefault();if(event.shiftKey)redo();else undo();
    }
  });
}
function setZoom(scale) {
  const centerSec=(timelineScroll.scrollLeft + timelineScroll.clientWidth/2)/state.scale;
  state.scale=clamp(scale,6,44);$('zoomRange').value=String(state.scale);
  $('zoomValue').textContent=`${state.scale} px/s`;
  resetLayout();timelineScroll.scrollLeft=Math.max(0, centerSec*state.scale-timelineScroll.clientWidth/2);
}
async function handleAudioInput(event) {
  const file=event.target.files?.[0]; if(!file)return;
  const id=state.selectedId;
  if(!file.type.startsWith('audio/') && !/\.(wav|mp3|ogg)$/i.test(file.name)) return notify('Chỉ hỗ trợ file audio');
  try {
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const decoded=await ctx.decodeAudioData(await file.arrayBuffer());
    const peaks=extractWavePeaks(decoded.getChannelData(0),96);
    await ctx.close();
    state.audio.get(id)?.element.pause();
    if(state.audio.has(id)) URL.revokeObjectURL(state.audio.get(id).url);
    const url=URL.createObjectURL(file);const element=new Audio(url);
    state.audio.set(id,{peaks,url,element,name:file.name});
    syncInspector();requestRender();notify(`Đã tải audio thật cho ${id} (chỉ lưu trong phiên này)`);
  } catch {notify('Không giải mã được file audio này.');}
  finally {event.target.value='';}
}

bindEvents(); resetLayout(); syncInspector(); syncUndoButtons();setTime(0);
// A small white-box hook for reproducible headless performance and interaction tests.
// Never exposes private provider keys or any external network capability.
window.__SP05__ = {getMetrics(){const range=viewportRange();return {sceneCount:state.scenes.length,totalMs:state.timeline.totalMs,renderedSceneCount:range.count,mediaClipNodes:laneNodes.media.childElementCount,scrollLeft:timelineScroll.scrollLeft,scale:state.scale,selectedId:state.selectedId,sceneIds:state.scenes.map(s=>s.id),durations:state.scenes.map(s=>s.durationMs),timeMs:state.timeMs};}, select:(id)=>chooseScene(id,{seek:true,scroll:true}),seek:setTime,zoom:setZoom};
