/** R2-VID-06 production integration: SQLite/SP-04 must refuse workload
 * over budget BEFORE a real video provider can be invoked. Local only.
 * These tests require the full target repository (not the portable ZIP).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,AssetManifest,SceneClipService,
 normalizeClipPolicy} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';

async function context(resourceLimits){
 const root=await mkdtemp(join(tmpdir(),'r2vid06-'));
 const db=openProjectDb(join(root,'project.sqlite'));
 const repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'Local cost preflight'});
 const video=repo.createVideo(channel.id,{title:'Resource guard'});
 const [scene]=repo.replaceScenes(video.id,{rowVersion:video.rowVersion,
  scenes:[{text:'Vietnamese narration.',durationMs:5000,visualPrompt:'A river at dawn',
   mediaType:'image_motion'}]});
 const store=new JobStore({path:join(root,'project.sqlite'),leaseMs:60000});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:root});
 const calls=[];
 const adapter={generate:async (...args)=>{calls.push(args);throw Error('FORBIDDEN_GPU_DISPATCH')}};
 const clips=new SceneClipService({repo,store,manifest,videoAdapter:adapter,resourceLimits});
 clips.saveScopePolicy('scene',scene.id,{expectedRevision:0,
   policy:normalizeClipPolicy({mediaType:'ai_video',durationSec:4})});
 return {root,db,repo,scene,store,manifest,adapter,calls,clips,
  close:async()=>{store.close();db.close();await rm(root,{recursive:true,force:true});}};
}

test('R2-VID-06 resource preflight blocks single and batch queue with zero jobs',async()=>{
 const x=await context({maxPixelFrames:1_000_000});
 try{
  const p=x.clips.preflight(x.scene.id);
  assert.equal(p.canQueue,false);
  assert.equal(p.resourceEstimate.workload.frames,96);
  assert.deepEqual(p.resourceEstimate.blockers,['VIDEO_PIXEL_FRAME_BUDGET_EXCEEDED']);
  assert.throws(()=>x.clips.queue(x.scene.id,{requestKey:'resource-denied-1',
   expectedPolicyDigest:p.policyDigest}),/VIDEO_PIXEL_FRAME_BUDGET_EXCEEDED/);
  assert.throws(()=>x.clips.enqueueBatch(x.scene.videoId,{sceneIds:[x.scene.id],
   requestKey:'resource-denied-batch'}),/VIDEO_PIXEL_FRAME_BUDGET_EXCEEDED/);
  assert.equal(x.store.countByStatus().total,0);
  assert.equal(x.calls.length,0);
 }finally{await x.close()}
});

test('R2-VID-06 worker rechecks updated operator resource limit before local provider',async()=>{
 const x=await context({maxPixelFrames:250_000_000});let runner;
 try{
  const p=x.clips.preflight(x.scene.id);
  assert.equal(p.canQueue,true);
  const {jobs}=x.clips.queue(x.scene.id,{requestKey:'resource-allowed-first',
   expectedPolicyDigest:p.policyDigest});
  assert.equal(jobs.length,1);
  // Simulate operator tightening runtime limits while one queued job waits.
  const strict=new SceneClipService({repo:x.repo,store:x.store,
    manifest:x.manifest,videoAdapter:x.adapter,
    resourceLimits:{maxPixelFrames:1_000_000}});
  runner=new JobRunner(x.store,{'scene:ai-video':strict.handler()},
   {concurrency:1,heartbeatMs:3000,pollMs:15});
  runner.start();await runner.waitForIdle({timeoutMs:10000});
  await runner.stop({abort:true});runner=null;
  assert.equal(x.store.get(jobs[0].id).status,'failed');
  assert.equal(x.calls.length,0,'no GPU adapter call can occur after budget reduced');
 }finally{if(runner)await runner.stop({abort:true}).catch(()=>{});await x.close()}
});
