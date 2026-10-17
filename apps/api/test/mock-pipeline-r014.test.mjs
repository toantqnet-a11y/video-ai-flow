/**
 * R0-14 real SQLite queue + real handlers + mock provider + asset promotion.
 * Covers orchestration end-to-end without external AI/GPU/paid API dependencies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,AssetManifest,promotePendingQueueAssets,SceneVoiceRepository,SceneImageRepository} from '../../../packages/core/src/index.mjs';
import {ProviderRegistry} from '../../../packages/providers/src/index.mjs';
import {registerMockProviders} from '../../../packages/providers/testkit/mock-providers.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {createJobHandlers} from '../src/handlers.mjs';

async function fixture(failFirst={}) {
 const dataRoot=await mkdtemp(join(tmpdir(),'cs-r014-pipeline-'));
 const filename=join(dataRoot,'project.sqlite');
 const db=openProjectDb(filename);const repo=new StudioRepository(db);
 const store=new JobStore({path:filename,leaseMs:900,baseBackoffMs:15,maxBackoffMs:60});
 const registry=new ProviderRegistry();const mock=registerMockProviders(registry,{dataRoot,failFirst});
 const manifest=new AssetManifest({db,repository:repo,dataRoot});
 const c=repo.createChannel({name:'Automated smoke channel'});
 const v=repo.createVideo(c.id,{title:'Automated smoke video'});
 const [s]=repo.replaceScenes(v.id,{rowVersion:1,scenes:[{text:'Một câu thử nghiệm.',durationMs:1000,visualPrompt:'Bình minh'}]});
 // R2-03: run the voice portion through the immutable snapshot/consent fence.
 // The mock adapter generates local PCM WAV; no Edge network occurs.
 registry.register({id:'edge',kind:'tts',location:'remote',costTier:'free_unverified',noChargeConfirmed:true,
   invoke:(input,options)=>registry.invoke('mock-tts',input,{...options,allowRemote:true})});
 registry.imageAdapter={loadWorkflow:async input=>({'10':{inputs:{text:input.prompt,seed:input.seed,width:input.width,height:input.height}}})};
 registry.register({id:'comfyui',kind:'image',location:'local',costTier:'local',
   invoke:(input,options)=>registry.invoke('mock-image',input,{...options,allowRemote:false})});
 const sceneImages=new SceneImageRepository(repo,{store,manifest,registry});
 const sceneVoices=new SceneVoiceRepository(repo,{store,manifest});
 const providerIds={voice:'edge',image:'comfyui',video:'mock-video'};
 const handlers=createJobHandlers({repo,registry,dataRoot,providerIds});
 return {dataRoot,db,repo,store,registry,manifest,mock,scene:s,sceneVoices,sceneImages,handlers,close:async()=>{
   store.close();db.close();await rm(dataRoot,{recursive:true,force:true});
 }};
}
function queue(store,scene,kind,dependencies=[]) {
 const payload={sceneId:scene.id,revisionId:`r014-${kind}`,remoteConsent:false};
 if(kind==='voice')Object.assign(payload,{text:scene.text,voice:'vi-VN-HoaiMyNeural'});
 if(kind==='image')Object.assign(payload,{prompt:scene.visualPrompt,style:'documentary'});
 if(kind==='video')Object.assign(payload,{request:{prompt:scene.visualPrompt,duration:1}});
 return store.enqueue({key:`r014-${kind}-${scene.id}`,kind:`asset:${kind}`,payload,deps:dependencies,maxAttempts:3}).job;
}

test('LLM → 3 asset jobs → SQLite commit → asset promotion, no duplicate revisions',async()=>{
 const f=await fixture({image:1});let runner;
 try {
  const llm=await f.registry.invoke('mock-llm',{prompt:'Kịch bản phim tài liệu'});
  assert.match(llm.text,/MOCK/);
  const voice=f.sceneVoices.enqueueWithoutCache(f.scene.id,{remoteConsent:true}).job,
    image=(await f.sceneImages.queue(f.scene.id,{width:640,height:360})).job;
  const video=queue(f.store,f.scene,'video',[image.id]);
  runner=new JobRunner(f.store,f.handlers,{concurrency:2,pollMs:8,heartbeatMs:120});
  runner.start();await runner.waitForIdle({timeoutMs:12000});
  assert.equal(f.store.countByStatus().succeeded,3);
  assert.equal(f.mock.calls.image,2,'image should retry once');
  assert.equal(f.store.get(video.id).status,'succeeded');
  const promoted=await promotePendingQueueAssets(f.manifest);
  assert.equal(promoted.promoted.length,3);
  assert.equal(promoted.failed.length,0);
  const again=await promotePendingQueueAssets(f.manifest);
  assert.deepEqual(again.promoted,[]);
  const assets=f.manifest.listScene(f.scene.id);
  assert.equal(assets.length,3);
  for(const a of assets){
   const bytes=await readFile(join(f.dataRoot,a.relativePath));
   assert.equal(a.checksum,createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(f.repo.getScene(f.scene.id).voiceAssetId!==null,true);
  assert.equal(f.repo.getScene(f.scene.id).visualAssetId!==null,true);
  assert.equal(f.sceneVoices.enqueueWithoutCache(f.scene.id,{remoteConsent:true}).reused,true);
 }finally{await runner?.stop();await f.close();}
});

test('terminal failure does not promote asset or consume paid quota',async()=>{
 const f=await fixture();let runner;
 try{
  const job=f.store.enqueue({key:'r014-bad-provider',kind:'asset:image',payload:{sceneId:f.scene.id,revisionId:'never',prompt:''},maxAttempts:2}).job;
  runner=new JobRunner(f.store,f.handlers,{concurrency:1,pollMs:8,heartbeatMs:150});
  runner.start();await runner.waitForIdle({timeoutMs:8000});
  assert.equal(f.store.get(job.id).status,'failed');
  assert.equal((await promotePendingQueueAssets(f.manifest)).promoted.length,0);
  assert.equal(f.manifest.listScene(f.scene.id).length,0);
 }finally{await runner?.stop();await f.close();}
});
