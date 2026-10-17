import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,AssetManifest,SceneImageRepository} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'ext07-atomic-')),path=join(root,'studio.sqlite');
 const db=openProjectDb(path),repo=new StudioRepository(db),store=new JobStore({path,leaseMs:1000});
 const channel=repo.createChannel({name:'Atomic local image'}),video=repo.createVideo(channel.id,{title:'Three scenes'});
 const scenes=repo.replaceScenes(video.id,{rowVersion:video.rowVersion,scenes:[
  {text:'First',visualPrompt:'A tree',mediaType:'image_motion',durationMs:2000},
  {text:'Second',visualPrompt:'A river',mediaType:'image_motion',durationMs:2000},
  {text:'Third',visualPrompt:'A mountain',mediaType:'image_motion',durationMs:2000}
 ]});
 let workflows=0;
 const registry={imageAdapter:{loadWorkflow:async p=>{workflows++;return {'1':{inputs:{text:p.prompt,seed:p.seed}}};}},
   list:()=>[{id:'comfyui',kind:'image',location:'local',costTier:'local'}]};
 const service=new SceneImageRepository(repo,{store,manifest:new AssetManifest({db,repository:repo,dataRoot:root}),registry});
 return {root,db,repo,store,scenes,registry,service,get workflows(){return workflows},
  async close(){store.close();db.close();await rm(root,{recursive:true,force:true})}};
}
test('EXT-07 atomic batch writes local image jobs and intents in the same queue transaction',async()=>{
 const f=await fixture();
 try{
  const ids=f.scenes.slice(0,2).map(s=>s.id);
  const result=await f.service.queueBatch(ids);
  assert.equal(result.atomic,true);assert.equal(result.queued,2);assert.equal(result.partial,false);
  assert.equal(f.store.countByStatus().total,2);
  for(const x of result.results){
   const job=f.store.get(x.jobId),intent=f.db.prepare('SELECT job_id FROM scene_image_intents WHERE scene_id=?').get(x.sceneId);
   assert.equal(intent.job_id,job.id);
   assert.equal(job.kind,'asset:image');assert.equal(job.payload.remoteConsent,false);
  }
  const again=await f.service.queueBatch(ids);
  assert.deepEqual(again.results.map(x=>x.jobId),result.results.map(x=>x.jobId));
  assert.equal(f.store.countByStatus().total,2);
 }finally{await f.close()}
});
test('EXT-07 invalid last workflow prevents any earlier local job enqueue',async()=>{
 const f=await fixture();
 try{
  f.db.prepare('UPDATE scenes SET visual_prompt=? WHERE id=?').run('',f.scenes[2].id);
  await assert.rejects(f.service.queueBatch(f.scenes.map(s=>s.id)),{code:'SCENE_IMAGE_PROMPT_REQUIRED'});
  assert.equal(f.store.countByStatus().total,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) c FROM scene_image_intents').get().c,0);
 }finally{await f.close()}
});
test('EXT-07 stale input during async workflow preparation rolls back full SQLite batch',async()=>{
 const f=await fixture();
 try{
  let call=0;
  f.registry.imageAdapter.loadWorkflow=async p=>{
   if(++call===2)f.db.prepare('UPDATE scenes SET visual_prompt=? WHERE id=?').run('Changed after snapshot',f.scenes[0].id);
   return {'1':{inputs:{text:p.prompt}}};
  };
  await assert.rejects(f.service.queueBatch(f.scenes.slice(0,2).map(s=>s.id)),
   {code:'LOCAL_IMAGE_BATCH_SOURCE_STALE'});
  assert.equal(f.store.countByStatus().total,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) c FROM scene_image_intents').get().c,0);
 }finally{await f.close()}
});
