/** R2-05 offline contract and race acceptance: no real GPU/ComfyUI needed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,AssetManifest,SceneImageRepository,
 imageIntentMatches,promoteQueueAsset,promotePendingQueueAssets} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {ProviderRegistry} from '../../providers/src/index.mjs';
import {createJobHandlers} from '../../../apps/api/src/handlers.mjs';

async function fixture({configured=true}={}){
 const dir=await mkdtemp(join(tmpdir(),'cs-r205-')),dbPath=join(dir,'studio.sqlite');
 const db=openProjectDb(dbPath),repo=new StudioRepository(db),store=new JobStore({path:dbPath,leaseMs:700,baseBackoffMs:1,maxBackoffMs:10});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
 const channel=repo.createChannel({name:'Image tests'}),video=repo.createVideo(channel.id,{title:'Scenes'});
 const [scene,other]=repo.replaceScenes(video.id,{rowVersion:1,scenes:[
   {text:'Một câu chuyện',durationMs:4000,visualPrompt:'A quiet city',mediaType:'image_motion'},
   {text:'Khung cảnh mới',durationMs:4000,visualPrompt:'A new country',mediaType:'image_motion'}]});
 const registry=new ProviderRegistry(),bytes=await readFile('spikes/SP-03/fixtures/sp03-demo.png');
 const output=join(dir,'mock-output.png');await writeFile(output,bytes);
 let calls=0;
 if(configured){
   registry.imageAdapter={loadWorkflow:async input=>({'10':{inputs:{text:input.prompt,seed:input.seed,width:input.width,height:input.height}}})};
   registry.register({id:'comfyui',kind:'image',location:'local',costTier:'local',invoke:async()=>{calls++;const path=join(dir,`mock-output-${calls}.png`);await writeFile(path,bytes);return {path}}});
 }
 const service=new SceneImageRepository(repo,{store,manifest,registry});
 const close=async()=>{store.close();db.close();await rm(dir,{recursive:true,force:true})};
 return {dir,db,repo,store,manifest,registry,service,video,scene,other,bytes,close,get calls(){return calls}};
}
async function run(f){const runner=new JobRunner(f.store,createJobHandlers({repo:f.repo,registry:f.registry,dataRoot:f.dir}),
 {concurrency:1,heartbeatMs:100,pollMs:6});
 runner.start();try{await runner.waitForIdle({timeoutMs:5000})}finally{await runner.stop()}
 return promotePendingQueueAssets(f.manifest);
}
const opts={width:640,height:360,seed:1};
test('v23 additive migration keeps old audio revisions and new image intent tables',async()=>{
 const f=await fixture();try{
  assert.ok(f.db.prepare('PRAGMA user_version').get().user_version>=26);
  assert(f.db.prepare('SELECT * FROM scene_image_intents').all());
  assert(f.db.prepare('SELECT * FROM scene_image_manual_selections').all());
  assert(f.db.prepare('SELECT * FROM scene_voice_intents').all());
 }finally{await f.close()}
});
test('no ComfyUI workflow means fail closed; missing committed visual prompt blocked',async()=>{
 const f=await fixture({configured:false});try{
  await assert.rejects(f.service.queue(f.scene.id,opts),{code:'LOCAL_IMAGE_NOT_CONFIGURED'});
  assert.equal(f.store.countByStatus().total,0);
 }finally{await f.close()}
 const g=await fixture();try{
  g.db.prepare('UPDATE scenes SET visual_prompt=? WHERE id=?').run('',g.scene.id);
  await assert.rejects(g.service.queue(g.scene.id,opts),{code:'SCENE_IMAGE_PROMPT_REQUIRED'});
  assert.equal(g.store.countByStatus().total,0);
 }finally{await g.close()}
});
test('reject unexpected body keys, fake remote provider, negative seed and oversized dimensions',async()=>{
 const f=await fixture();try{
  for(const input of [{...opts,providerId:'paid'}, {...opts,prompt:'forged'}, {...opts,remoteConsent:true},
    {...opts,seed:-1},{...opts,width:99999},{...opts,width:8192,height:8192}])
    await assert.rejects(f.service.queue(f.scene.id,input));
  assert.equal(f.store.countByStatus().total,0);
 }finally{await f.close()}
});
test('same scene/prompt/workflow/seed reuses durable queue job',async()=>{
 const f=await fixture();try{
  const one=await f.service.queue(f.scene.id,opts),two=await f.service.queue(f.scene.id,opts);
  assert.equal(one.job.id,two.job.id);assert.equal(two.reused,true);
  assert.equal(f.store.get(one.job.id).payload.remoteConsent,false);
  assert.equal(f.store.countByStatus().total,1);
  const next=await f.service.queue(f.scene.id,{...opts,seed:2});
  assert.notEqual(next.job.id,one.job.id);
  assert.equal(imageIntentMatches(f.repo,f.store.get(one.job.id).payload,one.job.id),false);
 }finally{await f.close()}
});
test('local mock job promotes actual 640x360 image, deterministic metadata and cache',async()=>{
 const f=await fixture();try{
  const id=(await f.service.queue(f.scene.id,opts)).job.id;
  const result=await run(f);
  assert.equal(f.store.get(id).status,'succeeded');assert.equal(result.promoted.length,1);
  const state=await f.service.status(f.scene.id);
  assert.equal(state.state,'ready');assert.equal(state.imageAsset.width,640);
  assert.equal(state.imageAsset.height,360);assert.equal(f.calls,1);
  assert.deepEqual(await f.service.image(f.scene.id),{bytes:f.bytes,format:'png'});
  const a=f.manifest.get(result.promoted[0]);assert.equal(a.metadata.providerId,'comfyui');
  assert.equal((await f.service.queue(f.scene.id,opts)).cached,true);
  assert.equal((await f.service.status(f.scene.id)).state,'ready');
  assert.equal(f.store.countByStatus().total,1);
  assert.equal((await promoteQueueAsset({manifest:f.manifest,jobId:id})).id,a.id);
 }finally{await f.close()}
});
test('stale superseded image is rejected before provider invocation; latest only wins',async()=>{
 const f=await fixture();try{
  const old=(await f.service.queue(f.scene.id,opts)).job;
  const latest=(await f.service.queue(f.scene.id,{...opts,seed:2})).job;
  const result=await run(f);
  assert.equal(f.store.get(old.id).status,'failed');assert.equal(f.store.get(latest.id).status,'succeeded');
  assert.equal(f.calls,1);assert.equal(result.promoted.length,1);
 }finally{await f.close()}
});
test('after a provider finishes, scene prompt change blocks late promotion',async()=>{
 const f=await fixture();try{
  const id=(await f.service.queue(f.scene.id,opts)).job.id;
  const handler=createJobHandlers({repo:f.repo,registry:f.registry,dataRoot:f.dir})['asset:image'];
  const output=await handler(f.store.get(id).payload,{jobId:id,signal:new AbortController().signal});
  f.db.prepare('UPDATE scenes SET visual_prompt=? WHERE id=?').run('Changed visual',f.scene.id);
  assert.equal(imageIntentMatches(f.repo,f.store.get(id).payload,id),false);
  assert.equal((await f.service.status(f.scene.id)).state,'pending');
  assert(output.asset.filePath.endsWith('png'));
 }finally{await f.close()}
});
test('manual import validates binary+MIME, selects image, preserves older generated history',async()=>{
 const f=await fixture();try{
  const old=(await f.service.queue(f.scene.id,opts)).job.id;
  await run(f);
  const imported=await f.service.importBase64(f.scene.id,{mimeType:'image/png',dataBase64:f.bytes.toString('base64')});
  assert.equal(f.manifest.get(imported.assetId).source,'manual_import');
  assert.equal((await f.service.status(f.scene.id)).imageAsset.id,imported.assetId);
  assert.equal(f.manifest.listScene(f.scene.id).filter(a=>a.kind==='image').length,2);
  await assert.rejects(f.service.importBase64(f.scene.id,{mimeType:'image/jpeg',dataBase64:f.bytes.toString('base64')}),{code:'IMAGE_MIME_MISMATCH'});
  await assert.rejects(f.service.importBase64(f.scene.id,{mimeType:'image/png',dataBase64:Buffer.from('<html>').toString('base64')}));
  const generated=f.manifest.listScene(f.scene.id).find(a=>a.source==='comfyui');
  await f.service.select(f.scene.id,{assetId:generated.id,expectedRowVersion:f.repo.getScene(f.scene.id).rowVersion});
  assert.equal((await f.service.status(f.scene.id)).imageAsset.id,generated.id);
 }finally{await f.close()}
});
test('manual selecting previous revision prevents new in-flight job from replacing chosen image',async()=>{
 const f=await fixture();try{
  await f.service.queue(f.scene.id,opts);await run(f);
  const first=f.repo.getScene(f.scene.id).visualAssetId;
  const newJob=(await f.service.queue(f.scene.id,{...opts,seed:7})).job;
  await f.service.select(f.scene.id,{assetId:first,expectedRowVersion:f.repo.getScene(f.scene.id).rowVersion});
  const result=await run(f);
  assert.equal(result.promoted.length,0);assert.equal(f.repo.getScene(f.scene.id).visualAssetId,first);
  assert.equal(f.store.get(newJob.id).status,'failed');
  assert.equal((await f.service.status(f.scene.id)).state,'ready');
 }finally{await f.close()}
});
test('cross-scene image selection and stale scene lock rejected',async()=>{
 const f=await fixture();try{
  await f.service.queue(f.scene.id,opts);await run(f);
  const assetId=f.repo.getScene(f.scene.id).visualAssetId;
  await assert.rejects(f.service.select(f.other.id,{assetId,expectedRowVersion:f.other.rowVersion}),{code:'IMAGE_ASSET_NOT_FOUND'});
  await assert.rejects(f.service.select(f.scene.id,{assetId,expectedRowVersion:999}),{code:'SCENE_ROW_VERSION_CONFLICT'});
 }finally{await f.close()}
});
test('corrupted / missing bytes are not returned as valid image',async()=>{
 const f=await fixture();try{
  await f.service.queue(f.scene.id,opts);await run(f);
  const path=join(f.dir,f.manifest.get(f.repo.getScene(f.scene.id).visualAssetId).relativePath);
  await writeFile(path,Buffer.from('not image'));
  assert.equal((await f.service.status(f.scene.id)).state,'succeeded');
  await assert.rejects(f.service.image(f.scene.id),{code:'IMAGE_NOT_READY'});
 }finally{await f.close()}
});

test('migrating a v22 database through v24 preserves an active manual image',async()=>{
 const f=await fixture();
 const path=join(f.dir,'studio.sqlite');
 try{
   // Set up genuine manifest pointer first, then emulate the last pre-v23 ledger
   // with the v23-only tables absent; no migration checksum is rewritten.
   const imported=await f.service.importBase64(f.scene.id,{mimeType:'image/png',dataBase64:f.bytes.toString('base64')});
   // Emulate a genuine v22 database by removing BOTH later additive schemas.
   f.db.exec(`DROP TRIGGER asset_content_register;
     DROP TRIGGER asset_content_size_guard;
     DROP TRIGGER asset_revision_immutable_fields;
     DROP INDEX idx_asset_content_lookup;
     DROP TABLE asset_content_index;
     DROP TABLE asset_dag_nodes; DROP TABLE asset_dag_runs; DROP TABLE provider_quota_calls; DROP TABLE provider_switch_events; DROP TABLE composition_revisions; DROP TABLE motion_brand_revisions; DROP TABLE timeline_action_stacks; DROP TABLE timeline_revisions; DROP TABLE render_segment_cache; DROP TABLE render_snapshots; DROP TABLE r4_subtitle_drafts;
     DROP TABLE scene_image_manual_selections;
     DROP INDEX idx_scene_image_intents_job;
     DROP TABLE scene_image_intents;`);
   f.db.prepare('DELETE FROM schema_migrations WHERE version>=24').run();
   f.db.prepare('DELETE FROM schema_migrations WHERE version=23').run();
   f.db.exec('PRAGMA user_version=22;');
   f.store.close();f.db.close();
   const upgraded=openProjectDb(path);
   try{
     assert.ok(upgraded.prepare('PRAGMA user_version').get().user_version>=26);
     const row=upgraded.prepare('SELECT asset_id FROM scene_image_manual_selections WHERE scene_id=?').get(f.scene.id);
     assert.equal(row.asset_id,imported.assetId);
     const repo=new StudioRepository(upgraded);
     const manifest=new AssetManifest({db:upgraded,repository:repo,dataRoot:f.dir});
     const store=new JobStore({path});
     try{const service=new SceneImageRepository(repo,{store,manifest,registry:f.registry});
       assert.equal((await service.status(f.scene.id)).imageAsset.id,imported.assetId);
     }finally{store.close()}
   }finally{upgraded.close()}
 }finally{await rm(f.dir,{recursive:true,force:true})}
});

test('two successful generations of one scene create distinct revision/job asset logical keys',async()=>{
 const f=await fixture();try{
   const one=(await f.service.queue(f.scene.id,opts)).job.id;
   await run(f);
   const oneAsset=f.repo.getScene(f.scene.id).visualAssetId;
   const two=(await f.service.queue(f.scene.id,{...opts,seed:2})).job.id;
   const secondResult=await run(f);
   assert.equal(secondResult.failed.length,0);
   const twoAsset=f.repo.getScene(f.scene.id).visualAssetId;
   assert.notEqual(oneAsset,twoAsset);
   assert.equal(f.store.get(one).status,'succeeded');
   assert.equal(f.store.get(two).status,'succeeded');
   assert.equal(f.manifest.listScene(f.scene.id).filter(a=>a.source==='comfyui').length,2);
   assert.equal((await f.service.status(f.scene.id)).imageAsset.id,twoAsset);
 }finally{await f.close()}
});
