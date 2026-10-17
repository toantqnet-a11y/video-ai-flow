import test from 'node:test';
import assert from 'node:assert/strict';
import {hyperframesSceneCacheKey} from '../src/render-hf-scene-cache-r308.mjs';
const digest='a'.repeat(64);
const scene={
 id:'scene-1',mediaType:'image_motion',durationFrames:120,durationBasis:'voice_measured',
 voice:{asset:{sha256:digest},measuredDurationMs:3400},
 visual:{kind:'image',motion:'zoom',asset:{sha256:'b'.repeat(64)}},
 timing:{mode:'voice_measured',audioFrames:102,audioMs:3400,paddingFrames:18},
 captions:{cues:[{startFrame:0,endFrame:102,text:'Xin chào'}]}
};
const data=scene=>({scene,profile:{fps:30,width:1920,height:1080},style:null,subtitlePlan:null,rendererVersion:'0.8.159'});
test('R3-08 cache key invalidates on voice window changes even with identical voice bytes',()=>{
 const original=hyperframesSceneCacheKey(data(scene));
 const change=structuredClone(scene);change.timing.audioFrames=90;change.timing.audioMs=3000;
 assert.notEqual(hyperframesSceneCacheKey(data(change)),original);
 const duration=structuredClone(scene);duration.voice.measuredDurationMs=3100;
 assert.notEqual(hyperframesSceneCacheKey(data(duration)),original);
 const visual=structuredClone(scene);visual.visual.kind='video';
 assert.notEqual(hyperframesSceneCacheKey(data(visual)),original);
});
test('R3-08 key is scene-relative, not invalidated by absolute timeline position',()=>{
 const key=hyperframesSceneCacheKey(data(scene));
 const moved={...structuredClone(scene),startFrame:600,endFrame:720,index:4};
 assert.equal(hyperframesSceneCacheKey(data(moved)),key);
});
