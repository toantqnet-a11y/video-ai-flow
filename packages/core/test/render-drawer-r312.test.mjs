import test from 'node:test';
import assert from 'node:assert/strict';
import {compositionDigest,validateComposition} from '../src/composition-r2ext01.mjs';
import {renderProfileVariant,renderDrawerProgress} from '../src/render-drawer-r312.mjs';
import {validateTimedComposition} from '../src/composition-timing-r2ext02.mjs';
import {createHash} from 'node:crypto';
// The scene uses a measured-voice v2 schema; no real assets or renderer needed.
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(aspectRatio='16:9'){
 const text='Xin chào Việt Nam';
 const profile={width:aspectRatio==='16:9'?1920:aspectRatio==='9:16'?1080:1080,
  height:aspectRatio==='16:9'?1080:aspectRatio==='9:16'?1920:1080,fps:30,aspectRatio,codec:'h264'};
 const doc={schemaVersion:2,videoId:'video-1',source:{videoRowVersion:1,configRevision:1,sceneRevision:1,timelineRowVersion:1,scriptSha256:hash('script')},profile,
 scenes:[{id:'scene-1',index:0,sceneRowVersion:1,text,textSha256:hash(text),mediaType:'image_motion',startFrame:0,endFrame:90,
  durationMs:3000,durationFrames:90,durationBasis:'manual_locked',voice:{asset:{id:'voice-1',kind:'voice',sha256:hash('voice'),bytes:300,relativePath:'assets/voice.wav'},measuredDurationMs:2000},
  visual:{kind:'image',motion:'none',asset:null},timing:{mode:'manual_locked',audioFrames:60,audioMs:2000,paddingFrames:30,tailPaddingMs:1000},
  captions:{mode:'manual_locked',source:'timeline_locked',cues:[{text,startFrame:0,endFrame:60}]}}],
 totalFrames:90,readiness:{ready:false,blockers:[{sceneId:'scene-1',code:'VISUAL_MISSING'}]}};
 doc.digest=compositionDigest(doc);validateTimedComposition(doc);return doc;
}
test('R3-12 render resolution creates separate hashed derivative without changing timing/source',()=>{
 for(const ratio of ['16:9','9:16']){
  const src=fixture(ratio),hashBefore=src.digest;
  const down=renderProfileVariant(src,'720p');
  assert.deepEqual([down.profile.width,down.profile.height],ratio==='16:9'?[1280,720]:[720,1280]);
  assert.equal(down.totalFrames,src.totalFrames);assert.equal(down.scenes[0].durationFrames,90);
  assert.notEqual(down.digest,src.digest);validateTimedComposition(down);
  assert.equal(src.digest,hashBefore);assert.equal(src.profile.width,ratio==='16:9'?1920:1080);
  const up=renderProfileVariant(down,'1080p');assert.equal(up.digest,src.digest);
  assert.strictEqual(renderProfileVariant(src,'source'),src);
 }
});
test('R3-12 invalid resolution and unsupported square 720p fail closed',()=>{
 assert.throws(()=>renderProfileVariant(fixture(),'free-form'),{code:'RENDER_INVALID_RESOLUTION'});
 assert.throws(()=>renderProfileVariant(fixture('1:1'),'720p'),{code:'RENDER_RESOLUTION_UNSUPPORTED'});
 assert.equal(renderProfileVariant(fixture('1:1'),'1080p').profile.width,1080);
});
test('R3-12 visible stage is measured, not optimistic 100% encoding ETA',()=>{
 assert.deepEqual(renderDrawerProgress({status:'pending'}),{stage:'queued',completedScenes:null,totalScenes:null,sceneFraction:null,completed:false});
 const active=renderDrawerProgress({status:'running',progress:{stage:'encoding',completedScenes:2,totalScenes:4}});
 assert.equal(active.sceneFraction,.5);assert.equal(active.completed,false);
 const mux=renderDrawerProgress({status:'running',progress:{stage:'finalizing',completedScenes:4,totalScenes:4}});
 assert.equal(mux.sceneFraction,1);assert.equal(mux.completed,false);
 assert.equal(renderDrawerProgress({status:'succeeded',progress:{stage:'verifying'}}).completed,true);
 assert.equal(renderDrawerProgress({status:'failed'}).stage,'failed');
 assert.equal(renderDrawerProgress({status:'running',progress:{stage:'encoding',completedScenes:5,totalScenes:4}}).sceneFraction,null);
});
