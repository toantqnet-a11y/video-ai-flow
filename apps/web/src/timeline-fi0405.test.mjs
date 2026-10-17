import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {timelineKeyboardSeek,canEditTimeline,zoomScrollAnchor} from './timeline-ui-fi0405.mjs';
import {TimelinePlaybackR303} from './playback-controller-r303.mjs';
import {moveSceneOrder,orderManifest} from './timeline-model-r302.mjs';
import {safeReport,classifyBrowserEvidence} from '../../../tools/fi0405-browser-acceptance.mjs';
const make=()=>['one','two','three'].map((id,i)=>({id,index:i,startMs:i*3000,endMs:(i+1)*3000,durationMs:3000,voiceAssetId:`v-${id}`}));
class FakeAudio{
 constructor(){this.readyState=1;this.currentTime=0;this.duration=3;this.src='';this.paused=true;this.playCount=0;this.pauseCount=0;}
 pause(){this.paused=true;this.pauseCount++}async play(){this.paused=false;this.playCount++;return true}
 load(){}removeAttribute(k){if(k==='src')this.src=''}
}
test('FI-04-05 keyboard seek clamps negative, overflow, shift and home/end without touching media',()=>{
 assert.equal(timelineKeyboardSeek('ArrowLeft',{positionMs:200,totalDurationMs:8000}),0);
 assert.equal(timelineKeyboardSeek('ArrowRight',{positionMs:7500,totalDurationMs:8000}),8000);
 assert.equal(timelineKeyboardSeek('ArrowRight',{positionMs:2200,totalDurationMs:8000,shiftKey:true}),7200);
 assert.equal(timelineKeyboardSeek('Home',{positionMs:6000,totalDurationMs:8000}),0);
 assert.equal(timelineKeyboardSeek('End',{positionMs:6000,totalDurationMs:8000}),8000);
 assert.equal(timelineKeyboardSeek('Space',{positionMs:100,totalDurationMs:8000}),null);
 assert.equal(timelineKeyboardSeek('End',{positionMs:Infinity,totalDurationMs:8000}),null);
});
test('FI-04-05 editing contracts cannot create an unsavable visual + order dirty state',()=>{
 assert.equal(canEditTimeline({},'reorder'),true);assert.equal(canEditTimeline({},'trim'),true);
 assert.equal(canEditTimeline({trimDirty:true},'reorder'),false);
 assert.equal(canEditTimeline({orderDirty:true},'trim'),false);
 for(const kind of ['reorder','trim']){
  assert.equal(canEditTimeline({busy:true},kind),false);
  assert.equal(canEditTimeline({locked:true},kind),false);
 }
 assert.equal(canEditTimeline({},'unexpected'),false);
});
test('FI-04-05 zoom anchors visible cursor and clamps scroll on 500-scene durations',()=>{
 assert.equal(zoomScrollAnchor({scrollLeft:0,viewportWidth:900,positionMs:30000,oldZoom:40,newZoom:80,totalDurationMs:2100000}),1950);
 assert.equal(zoomScrollAnchor({scrollLeft:100,viewportWidth:900,positionMs:25000,oldZoom:40,newZoom:80,totalDurationMs:2100000}),1100);
 assert.equal(zoomScrollAnchor({scrollLeft:0,viewportWidth:900,positionMs:500,totalDurationMs:1000,newZoom:10}),0);
 assert.throws(()=>zoomScrollAnchor({newZoom:0}),/INVALID_ZOOM_ANCHOR/);
});
test('FI-04-05 unchanged manifest does not interrupt active audio',async()=>{
 const a=new FakeAudio(),revoked=[];
 const p=new TimelinePlaybackR303({audio:a,loadVoice:async()=>({id:'voice'}),createUrl:()=> 'blob:voice',revokeUrl:u=>revoked.push(u)});
 const scenes=make();p.setScenes(scenes);assert.equal(await p.seek(0,{play:true}),true);
 p.setScenes(scenes.map(x=>({...x})));assert.equal(p.playing,true);assert.equal(a.src,'blob:voice');assert.equal(revoked.length,0);
 p.dispose();assert.deepEqual(revoked,['blob:voice']);
});
test('FI-04-05 after scene reorder old authenticated voice blob is never replayed at new timeline position',async()=>{
 const a=new FakeAudio(),revoked=[],updates=[];
 const p=new TimelinePlaybackR303({audio:a,loadVoice:async id=>({id}),createUrl:b=>`blob:${b.id}`,revokeUrl:u=>revoked.push(u),onUpdate:s=>updates.push(s)});
 const scenes=make();p.setScenes(scenes);await p.seek(4000,{play:true});assert.equal(a.src,'blob:two');
 const moved=orderManifest({scenes},moveSceneOrder(scenes.map(x=>x.id),'three','one'));
 p.setScenes(moved.scenes);assert.equal(p.playing,false);assert.equal(a.src,'');assert.equal(p.current,null);
 assert.equal(p.positionMs,0);assert.deepEqual(revoked,['blob:two']);
 await p.play();assert.equal(a.src,'blob:three');assert.equal(updates.at(-1).sceneId,'three');p.dispose();
});
test('FI-04-05 stale asynchronous voice after changed manifest cannot replace current audio',async()=>{
 let resolveOld;const a=new FakeAudio();
 const p=new TimelinePlaybackR303({audio:a,loadVoice:id=>id==='one'?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve({id}),createUrl:b=>`blob:${b.id}`,revokeUrl:()=>{}});
 p.setScenes(make());const pending=p.seek(0,{play:true});p.setScenes(orderManifest({scenes:make()},['two','one','three']).scenes);
 await p.seek(1,{play:true});resolveOld({id:'one'});assert.equal(await pending,false);assert.equal(a.src,'blob:two');p.dispose();
});
test('FI-04-05 operator report is strictly inside evidence directory',()=>{
 assert.match(safeReport('docs/evidence/FI0405_windows_ui.json'),/FI0405_windows_ui.json$/);
 assert.throws(()=>safeReport('docs/WORKLOG.md'),/FI0405_UNSAFE_REPORT_PATH/);
 assert.throws(()=>safeReport('../secrets.json'),/FI0405_UNSAFE_REPORT_PATH/);
});
test('FI-04-05 browser probe cannot turn Linux or DOM-only checks into Windows user acceptance',()=>{
 const probe={browser:'chrome-or-edge',platform:'Win32',timelineVisible:true,keyboardSeek:true,zoomControl:true,undoRedoControls:true,waveformElement:true,sceneCount:500,domClips:100,virtualized:true};
 const r=classifyBrowserEvidence({os:'linux',probe});assert.equal(r.status,'NOT_READY');
 assert.equal(r.gates.browserChromeEdgeWindows.status,'BLOCKED');
 assert.equal(r.gates.reorderDrag.status,'BLOCKED');
 const w=classifyBrowserEvidence({os:'win32',probe});assert.equal(w.status,'NOT_READY');
 assert.equal(w.gates.browserChromeEdgeWindows.status,'PASS');
 assert.equal(w.gates['500SceneViewport'].status,'PASS');assert.equal(w.gates.undoRedo.status,'BLOCKED');
});
test('FI-04-05 inspector prints BLOCKED and rejects non-loopback inputs before any browser probing',()=>{
 const cwd=new URL('../../../',import.meta.url);
 const inspect=spawnSync(process.execPath,['tools/fi0405-browser-acceptance.mjs','--inspect'],{cwd,encoding:'utf8',timeout:12000});
 assert.equal(inspect.status,0,inspect.stderr);assert.equal(JSON.parse(inspect.stdout).status,'NOT_READY');
 const bad=spawnSync(process.execPath,['tools/fi0405-browser-acceptance.mjs','--run','--endpoint=https://example.com'],{cwd,encoding:'utf8',timeout:12000});
 assert.notEqual(bad.status,0);assert.equal(JSON.parse(bad.stdout).status,'NOT_READY');
});
test('FI-04-05 JSX includes keyboard operability, edit cancel, and truthful music indicator',async()=>{
 const s=await readFile(new URL('./TimelineEditorR302.jsx',import.meta.url),'utf8');
 assert.match(s,/onKeyDown=\{keyboardTrack\}/);assert.match(s,/onClick=\{cancelVisual\}/);
 assert.match(s,/editAllowed\('trim'\)/);assert.match(s,/editAllowed\('reorder'\)/);
 assert.match(s,/chọn tại Render Drawer/);assert.doesNotMatch(s,/Chưa có nhạc nền · sẽ bổ sung/);
});
