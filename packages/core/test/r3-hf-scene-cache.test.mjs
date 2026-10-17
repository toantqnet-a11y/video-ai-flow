import test from 'node:test';
import assert from 'node:assert/strict';
import {hyperframesSceneCacheKey} from '../src/render-hf-scene-cache-r308.mjs';
const scene={id:'s-1',startFrame:60,durationFrames:150,mediaType:'image_motion',
 voice:{asset:{sha256:'a'.repeat(64)}},visual:{asset:{sha256:'b'.repeat(64)},motion:'zoom'},
 captions:{cues:[{startFrame:0,endFrame:150,text:'Xin chào'}]}};
const profile={fps:30,width:1280,height:720};
test('R3-08 cache key stable under scene reorder, invalidates relevant visual/voice/geometry/captions',()=>{
 const opts={scene,profile,style:null,subtitlePlan:null,rendererVersion:'0.8.159'};
 const key=hyperframesSceneCacheKey(opts);
 assert.equal(key,hyperframesSceneCacheKey({...opts,scene:{...scene,startFrame:900,index:23}}));
 assert.notEqual(key,hyperframesSceneCacheKey({...opts,profile:{...profile,fps:60}}));
 assert.notEqual(key,hyperframesSceneCacheKey({...opts,rendererVersion:'0.8.160'}));
 assert.notEqual(key,hyperframesSceneCacheKey({...opts,scene:{...scene,visual:{...scene.visual,asset:{sha256:'c'.repeat(64)}}}}));
 assert.notEqual(key,hyperframesSceneCacheKey({...opts,scene:{...scene,captions:{cues:[{startFrame:0,endFrame:150,text:'Khác'}]}}}));
});
