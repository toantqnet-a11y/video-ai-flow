/** R2-VID-01..05 real SQLite/SP-04 integration with genuine tiny FFmpeg MP4.
 * Stubbed GPU adapter is intentionally NOT evidence of Wan/ComfyUI inference.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openProjectDb,StudioRepository,AssetManifest,promotePendingQueueAssets,
 SceneClipService,normalizeClipPolicy} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
const fsRoot=async()=>mkdtemp(join(tmpdir(),'r2vid-integration-'));
async function fixture(root){
 const file=join(root,'source.mp4');
 const args=['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:size=320x240:rate=12',
  '-t','0.5','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',file];
 const p=spawnSync('ffmpeg',args,{timeout:30000});
 if(p.status!==0)throw Error('R2VID_FFMPEG_TEST_FIXTURE_UNAVAILABLE');
 return await readFile(file);
}
function make(root,clip){
 const db=openProjectDb(join(root,'studio.sqlite'));
 const repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'Test Studio'});
 const video=repo.createVideo(channel.id,{title:'Five clip pipeline'});
 const scenes=repo.replaceScenes(video.id,{rowVersion:video.rowVersion,
   scenes:[{text:'Xin chào Việt Nam.',durationMs:3000,mediaType:'image_motion',
    visualPrompt:'A river at dawn'}, {text:'Câu thứ hai.',durationMs:4000,
    mediaType:'image_motion',visualPrompt:'A mountain'}]});
 const store=new JobStore({path:join(root,'studio.sqlite'),leaseMs:60000});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:root});
 const calls=[];
 const adapter={generate:async req=>{calls.push(req);return {bytes:clip,inputHash:'test-gpu-output'}}};
 const svc=new SceneClipService({repo,manifest,store,videoAdapter:adapter});
 return {db,repo,channel,video,scenes,store,manifest,svc,calls,
   close:()=>{store.close();db.close()}};
}
test('R2VID policy strictly validates source, mode, GPU shape and never accepts paid keys',()=>{
 assert.equal(normalizeClipPolicy({}).mediaType,'image_motion');
 for(const val of [{mediaType:'seedance'}, {remoteConsent:true}, {fallback:'auto_paid'},
  {width:5}, {fps:200}, {seed:-1}, {durationSec:0}]){
  assert.throws(()=>normalizeClipPolicy(val),/VIDEO_POLICY_INVALID/);
 }
});
test('R2VID hierarchical policies persist revisions; scene override wins; voice is never invalidated',async()=>{
 const root=await fsRoot();let ctx;
 try{
  await mkdir(join(root,'assets'));ctx=make(root,Buffer.alloc(128));
  const {svc,scenes,video,channel,repo,db}=ctx,sceneId=scenes[0].id;
  const basic=normalizeClipPolicy({mediaType:'ai_video',mode:'text_to_video'});
  assert.equal(svc.saveScopePolicy('channel',channel.id,{expectedRevision:0,policy:basic}).revision,1);
  assert.equal(svc.effective(sceneId).source.scope,'channel');
  assert.equal(svc.saveScopePolicy('video',video.id,{expectedRevision:0,
   policy:{...basic,mediaType:'import_video'}}).revision,1);
  assert.equal(svc.effective(sceneId).policy.mediaType,'import_video');
  assert.equal(svc.saveScopePolicy('scene',sceneId,{expectedRevision:0,policy:basic}).revision,1);
  assert.equal(svc.effective(sceneId).policy.mediaType,'ai_video');
  assert.equal(repo.getScene(sceneId).mediaType,'ai_video');
  assert.equal(repo.getScene(sceneId).voiceAssetId,null);
  assert.deepEqual(svc.history('scene',sceneId).items.map(x=>x.revision),[1]);
  assert.throws(()=>svc.saveScopePolicy('scene',sceneId,{expectedRevision:0,policy:basic}),/VIDEO_POLICY_VERSION_CONFLICT/);
  assert.throws(()=>db.prepare("UPDATE scene_video_policy_revisions SET policy_json='{}'").run(),/VIDEO_POLICY_HISTORY_IMMUTABLE/);
 }finally{ctx?.close();await rm(root,{recursive:true,force:true})}
});
test('R2VID genuine MP4 import verifies ffprobe, persists asset provenance and selection',async()=>{
 const root=await fsRoot();let ctx;
 try{
  const mp4=await fixture(root);ctx=make(root,mp4);
  const {svc,scenes,repo,manifest}=ctx,sceneId=scenes[0].id;
  const policy=normalizeClipPolicy({mediaType:'import_video'});
  svc.saveScopePolicy('scene',sceneId,{expectedRevision:0,policy});
  const before=repo.getScene(sceneId);
  const imported=await svc.importBase64(sceneId,{base64:mp4.toString('base64'),expectedRowVersion:before.rowVersion});
  assert.equal(imported.verified,true);assert.equal(imported.source,'manual_import');
  assert.equal(await manifest.verifyRevision(imported.assetId),'healthy');
  assert.equal(repo.getScene(sceneId).visualAssetId,imported.assetId);
  assert.equal((await svc.activeBytes(sceneId)).bytes.equals(mp4),true);
  const revision=await svc.revisionBytes(sceneId,imported.assetId);
  assert.equal(revision.mime,'video/mp4');
  assert.equal(revision.bytes.equals(mp4),true);
  await assert.rejects(()=>svc.revisionBytes(scenes[1].id,imported.assetId),/VIDEO_ASSET_NOT_FOUND/);
  assert.equal(repo.getScene(sceneId).visualAssetId,imported.assetId,'preview cannot activate or mutate');
  assert.equal((await svc.status(sceneId)).selectedVideoAssetId,imported.assetId);
  await assert.rejects(()=>svc.importBase64(sceneId,{base64:Buffer.from('fake media').toString('base64'),expectedRowVersion:repo.getScene(sceneId).rowVersion}),/VIDEO_IMPORT_INVALID/);
  await assert.rejects(()=>svc.select(sceneId,{assetId:scenes[1].id,expectedRowVersion:repo.getScene(sceneId).rowVersion}),/VIDEO_ASSET_NOT_FOUND/);
 }finally{ctx?.close();await rm(root,{recursive:true,force:true})}
});
test('R2VID two clips use existing durable SP-04 DAG and promote only checked video output',async()=>{
 const root=await fsRoot();let ctx,runner;
 try{
  const mp4=await fixture(root);ctx=make(root,mp4);
  const {svc,scenes,repo,store,manifest,calls,video}=ctx;
  for(const s of scenes)svc.saveScopePolicy('scene',s.id,{expectedRevision:0,
   policy:normalizeClipPolicy({mediaType:'ai_video'})});
  const submitted=svc.enqueueBatch(video.id,{sceneIds:scenes.map(s=>s.id),requestKey:'clip-batch-0001'});
  assert.equal(submitted.jobs.length,2);assert.equal(submitted.reused,false);
  assert.equal(svc.enqueueBatch(video.id,{sceneIds:scenes.map(s=>s.id),requestKey:'clip-batch-0001'}).reused,true);
  assert.throws(()=>svc.enqueueBatch(video.id,{sceneIds:[scenes[0].id],requestKey:'clip-batch-0001'}),/VIDEO_BATCH_KEY_CONFLICT/);
  assert.equal(store.dependencies(submitted.jobs[1].id)[0],submitted.jobs[0].id);
  runner=new JobRunner(store,{'scene:ai-video':svc.handler()},{concurrency:2,heartbeatMs:3000,pollMs:20});
  runner.start();await runner.waitForIdle({timeoutMs:30000});await runner.stop({abort:true});runner=null;
  assert.equal(calls.length,2);assert.equal(store.get(submitted.jobs[1].id).status,'succeeded');
  const promoted=await promotePendingQueueAssets(manifest);
  assert.deepEqual(promoted.failed,[]);
  for(const s of scenes){
   const selected=repo.getScene(s.id).visualAssetId;
   assert.ok(selected);assert.equal(manifest.get(selected).kind,'video');
   assert.equal(await manifest.verifyRevision(selected),'healthy');
   assert.equal((await svc.status(s.id)).selectedVideoAssetId,selected);
  }
 }finally{if(runner)await runner.stop({abort:true}).catch(()=>{});ctx?.close();await rm(root,{recursive:true,force:true})}
});
test('R2VID policy change fences queued inference before it can replace human media',async()=>{
 const root=await fsRoot();let ctx,runner;
 try{
  const mp4=await fixture(root);ctx=make(root,mp4);
  const {svc,scenes,repo,store,manifest,calls}=ctx;
  const id=scenes[0].id;
  const old=svc.saveScopePolicy('scene',id,{expectedRevision:0,
   policy:normalizeClipPolicy({mediaType:'ai_video'})});
  const pre=svc.preflight(id);
  const q=svc.queue(id,{requestKey:'clip-once-0001',expectedPolicyDigest:pre.policyDigest});
  assert.equal(q.jobs.length,1);
  svc.saveScopePolicy('scene',id,{expectedRevision:old.revision,
   policy:normalizeClipPolicy({mediaType:'image_motion'})});
  runner=new JobRunner(store,{'scene:ai-video':svc.handler()},{concurrency:1,heartbeatMs:3000,pollMs:20});
  runner.start();await runner.waitForIdle({timeoutMs:10000});await runner.stop({abort:true});runner=null;
  assert.equal(calls.length,0);assert.equal(store.get(q.jobs[0].id).status,'failed');
  assert.equal(repo.getScene(id).visualAssetId,null);
  assert.equal((await promotePendingQueueAssets(manifest)).promoted.length,0);
 }finally{if(runner)await runner.stop({abort:true}).catch(()=>{});ctx?.close();await rm(root,{recursive:true,force:true})}
});

test('R2VID healthy still-image fallback is an explicit atomic choice and preserves voice',async()=>{
 const root=await fsRoot();let ctx;
 try{
  ctx=make(root,Buffer.alloc(256));
  const {svc,scenes,repo,manifest,db}=ctx,id=scenes[0].id;
  const saved=svc.saveScopePolicy('scene',id,{expectedRevision:0,
   policy:normalizeClipPolicy({mediaType:'ai_video',fallback:'manual_image'})});
  // This fixture is a real minimal PNG, not a GPU-generated image.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YhXJ6wAAAAASUVORK5CYII=','base64');
  const image=await manifest.importBytes({sceneId:id,kind:'image',source:'manual_import',bytes:png,
   extension:'.png',metadata:{origin:'offline_fixture'}});
  const before=repo.getScene(id);
  assert.equal(await manifest.verifyRevision(image.id),'healthy');
  const applied=await svc.fallbackToImage(id,{imageAssetId:image.id,
   expectedRowVersion:before.rowVersion,expectedPolicyRevision:saved.revision});
  assert.equal(applied.status,'FALLBACK_IMAGE_SELECTED');
  const scene=repo.getScene(id);
  assert.equal(scene.mediaType,'image_motion');
  assert.equal(scene.visualAssetId,image.id);
  assert.equal(scene.voiceAssetId,before.voiceAssetId);
  assert.equal(svc.getScopePolicy('scene',id).revision,2);
  assert.equal(db.prepare('SELECT job_id FROM scene_video_intents WHERE scene_id=?').get(id),undefined);
  await assert.rejects(()=>svc.fallbackToImage(id,{imageAssetId:image.id,
   expectedRowVersion:before.rowVersion,expectedPolicyRevision:1}),/SCENE_ROW_VERSION_CONFLICT/);
 }finally{ctx?.close();await rm(root,{recursive:true,force:true})}
});
