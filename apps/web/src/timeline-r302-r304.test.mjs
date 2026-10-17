import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneAtTime,visibleTimelineScenes,moveSceneByOffset,moveSceneOrder,orderManifest} from './timeline-model-r302.mjs';
import {TimelinePlaybackR303} from './playback-controller-r303.mjs';
const make=n=>Array.from({length:n},(_,i)=>({id:`s${i}`,index:i,startMs:i*2100,endMs:(i+1)*2100,durationMs:2100,voiceAssetId:`v${i}`,text:`Câu tiếng Việt ${i}`}));
test('R3-02 500 scenes render only viewport + overscan clips and binary seek is bounded',()=>{
 const scenes=make(500);
 for(const scroll of [0,500,9000,18500,36000]){
  const visible=visibleTimelineScenes(scenes,{scrollLeft:scroll,viewportWidth:900,pixelsPerSecond:40,overscanPx:200});
  assert.ok(visible.length>0&&visible.length<25);
  assert.equal(new Set(visible.map(s=>s.id)).size,visible.length);
 }
 assert.equal(sceneAtTime(scenes,0).id,'s0');assert.equal(sceneAtTime(scenes,2100).id,'s1');
 assert.equal(sceneAtTime(scenes,9999999).id,'s499');
});
test('R3-04 move by keyboard and drag keeps a permutation and updates viewport timing',()=>{
 const rows=make(5),order=rows.map(s=>s.id);
 const moved=moveSceneOrder(order,'s4','s1');assert.deepEqual(moved,['s0','s4','s1','s2','s3']);
 assert.deepEqual(moveSceneByOffset(moved,'s4',3),order);
 assert.deepEqual(orderManifest({scenes:rows},moved).scenes.map(s=>s.id),moved);
 assert.throws(()=>moveSceneOrder(order,'s9','s1'),/SCENE_NOT_FOUND/);
});
class FakeAudio{
 constructor(){this.pauseCount=0;this.playCount=0;this.readyState=1;this.duration=2;this.currentTime=0;this.src='';}
 pause(){this.pauseCount++}async play(){this.playCount++;return true;}load(){}
 removeAttribute(name){if(name==='src')this.src='';}
}
test('R3-03 rapid seek fences async old audio and never overlaps playback',async()=>{
 const a=new FakeAudio(),pending=[],revoked=[],states=[];
 const p=new TimelinePlaybackR303({audio:a,loadVoice:id=>new Promise(resolve=>pending.push({id,resolve})),
  createUrl:b=>`blob:${b.name}`,revokeUrl:x=>revoked.push(x),onUpdate:x=>states.push(x)});
 p.setScenes(make(3));
 const one=p.seek(10,{play:true}),two=p.seek(2150,{play:true});
 pending[1].resolve({name:'second'});assert.equal(await two,true);
 pending[0].resolve({name:'first'});assert.equal(await one,false);
 assert.equal(a.src,'blob:second');assert.equal(a.playCount,1);
 assert.equal(states.at(-1).sceneId,'s1');assert.ok(a.pauseCount>=2);
 p.dispose();assert.deepEqual(revoked,['blob:second']);
});
test('R3-03 seeking inside same voice reuses a single authenticated media fetch',async()=>{
 const a=new FakeAudio(),requests=[],revoked=[];
 const p=new TimelinePlaybackR303({audio:a,loadVoice:async id=>{requests.push(id);return {name:id}},
  createUrl:b=>`blob:${b.name}`,revokeUrl:url=>revoked.push(url)});
 p.setScenes(make(2));assert.equal(await p.seek(100,{play:true}),true);
 assert.equal(await p.seek(500,{play:false}),true);
 assert.equal(requests.length,1);assert.equal(a.currentTime,.5);
 p.dispose();assert.deepEqual(revoked,['blob:s0']);
});


test('R3-03 an old pending play resolution must not pause newer playing audio',async()=>{
 class DeferredAudio extends FakeAudio {
  constructor(){super();this.pending=[];}
  play(){this.playCount++;return new Promise(resolve=>this.pending.push(resolve));}
 }
 const audio=new DeferredAudio(),p=new TimelinePlaybackR303({audio,
  loadVoice:async id=>({name:id}),createUrl:b=>`blob:${b.name}`,revokeUrl:()=>{}});
 p.setScenes(make(3));
 const first=p.seek(10,{play:true});
 // Allow the first async media download to reach Audio.play().
 await new Promise(resolve=>setImmediate(resolve));
 const next=p.seek(2200,{play:true});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(audio.pending.length,2);
 const before=audio.pauseCount;
 audio.pending[0]();assert.equal(await first,false);
 assert.equal(audio.pauseCount,before); // stale completion must not stop the new voice.
 audio.pending[1]();assert.equal(await next,true);
 assert.equal(audio.src,'blob:s1');p.dispose();
});

test('R3-03 missing voice does not fake playback',async()=>{
 const a=new FakeAudio(),errors=[];
 const p=new TimelinePlaybackR303({audio:a,loadVoice:()=>{throw Error('should not fetch')},
  createUrl:()=>'',revokeUrl:()=>{},onError:e=>errors.push(e)});
 p.setScenes([{...make(1)[0],voiceAssetId:null}]);
 assert.equal(await p.seek(0,{play:true}),false);assert.equal(a.playCount,0);
 assert.deepEqual(errors,['VOICE_PREVIEW_MISSING']);p.dispose();
});
