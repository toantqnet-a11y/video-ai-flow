import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {RenderExportService,checkPublishedSource} from '../src/render-export-r2ext0406.mjs';
import {operationById} from '../../../packages/contracts/src/catalog.mjs';
const fixtures=async()=>{
 const dir=await mkdtemp(join(tmpdir(),'render-route-')),path=join(dir,'studio.sqlite');
 const db=openProjectDb(path),repo=new StudioRepository(db),store=new JobStore({path});
 const channel=repo.createChannel({name:'Local render test'}),video=repo.createVideo(channel.id,{title:'Video export'});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:dir}),compositions=new CompositionRepository({repo,manifest});
 return {dir,db,repo,store,manifest,compositions,video,svc:new RenderExportService({repo,compositions,manifest,store}),close:async()=>{store.close();db.close();await rm(dir,{recursive:true,force:true})}};
};
test('EXT-04/06 authenticated endpoints are in the versioned contract',()=>{
 for(const op of ['enqueueLocalVideoRender','getLocalVideoRender','downloadLocalVideoRender'])assert.ok(operationById.has(op));
});
test('EXT-06 invalid, unavailable, or old v1 snapshot cannot queue billable work',async()=>{
 const f=await fixtures();try{
  await assert.rejects(f.svc.enqueue(f.video.id,{revision:1,requestKey:'trial'}),{code:'COMPOSITION_REVISION_NOT_FOUND'});
  await assert.rejects(f.svc.enqueue(f.video.id,{revision:1,requestKey:'trial',paid:true}),{code:'RENDER_INVALID_REQUEST'});
  assert.equal(f.store.countByStatus().total,0);
  assert.throws(()=>f.svc.job(f.video.id,'nonexistent'),{code:'RENDER_JOB_NOT_FOUND'});
 }finally{await f.close()}
});
test('EXT-06 revision pointer fences concurrent changes before dispatch',async()=>{
 const f=await fixtures();try{
  assert.throws(()=>checkPublishedSource(f.repo,f.compositions,{videoId:f.video.id,source:{}}),{code:'COMPOSITION_SCENES_REQUIRED'});
 }finally{await f.close()}
});
import {createHash} from 'node:crypto';
import {TimedCompositionRepository} from '../../../packages/core/src/index.mjs';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {spawnSync} from 'node:child_process';
const sha=x=>createHash('sha256').update(x).digest('hex');
const samplePicture=new URL('../../../spikes/EXT-03/assets/background-01.png',import.meta.url).pathname;
const sampleWav=new URL('../../../spikes/EXT-03/assets/voice-01.wav',import.meta.url).pathname;
const hasFfmpeg=spawnSync('ffmpeg',['-hide_banner','-filters'],{encoding:'utf8'}).stdout.includes('subtitles');
test('EXT04/06 explicit approved v2 → idempotent queue → actual completed export and scoped private stream',{skip:!hasFfmpeg,timeout:180000},async()=>{
 const f=await fixtures();let runner;
 try{
  const scene=f.repo.replaceScenes(f.video.id,{rowVersion:1,scenes:[{text:'Tiếng Việt: Đà Nẵng, Hà Nội.',durationMs:2700,mediaType:'image_motion'}]})[0];
  const voice=await f.manifest.importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',inputPath:sampleWav,metadata:{queueJobId:'a',inputHash:sha('key'),textSha256:sha(scene.text),providerId:'piper'}});
  f.db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(scene.id,'a',sha('key'),sha(scene.text),f.repo.getVideo(f.video.id).configRevision,'piper','default',0,Date.now());
  const img=await f.manifest.importFile({sceneId:scene.id,kind:'image',inputPath:samplePicture});
  f.db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,img.id,Date.now());
  const timed=new TimedCompositionRepository({compositions:f.compositions,manifest:f.manifest});
  const preview=await timed.preview(f.video.id);
  const published=await timed.publish(f.video.id,{expectedDigest:preview.digest,expectedVideoRowVersion:preview.source.videoRowVersion});
  const body={revision:published.revision,requestKey:'same',engine:'ffmpeg-fastpath'};
  const first=await f.svc.enqueue(f.video.id,body),again=await f.svc.enqueue(f.video.id,body);
  assert.equal(again.reused,true);assert.equal(again.job.id,first.job.id);assert.equal(f.store.countByStatus().total,1);
  runner=new JobRunner(f.store,{'render:ffmpeg':f.svc.handler()},{concurrency:1,heartbeatMs:100,pollMs:40});
  runner.start();await runner.waitForIdle({timeoutMs:60000});
  const state=f.svc.job(f.video.id,first.job.id);
  assert.equal(state.status,'succeeded',JSON.stringify(state));assert.equal(state.output.qa.passed,true);
  const file=await f.svc.file(f.video.id,first.job.id);
  assert.ok(file.size>1000);file.stream.destroy();
  assert.throws(()=>f.svc.job('another-video',first.job.id),{code:'RENDER_JOB_NOT_FOUND'});
  assert.equal(voice.id,preview.scenes[0].voice.asset.id);
  // New default engine has a dedicated durable job type; no auto FFmpeg fallback.
  const hf=await f.svc.enqueue(f.video.id,{revision:published.revision,requestKey:'hf-default'});
  assert.equal(hf.job.kind,'render:hyperframes');
  assert.equal((await f.svc.enqueue(f.video.id,{revision:published.revision,requestKey:'hf-default'})).reused,true);
  await assert.rejects(f.svc.enqueue(f.video.id,{revision:published.revision,requestKey:'hf-default',engine:'ffmpeg-fastpath'}),{code:'RENDER_IDEMPOTENCY_CONFLICT'});
 }finally{if(runner)await runner.stop();await f.close()}
});

test('R3-08/10 frozen render job survives later timeline edits and exports private checksum-verified Vietnamese SRT',{skip:!hasFfmpeg,timeout:180000},async()=>{
 const f=await fixtures();let runner;
 try{
  const scene=f.repo.replaceScenes(f.video.id,{rowVersion:1,scenes:[{text:'Xin chào, Đà Nẵng!',durationMs:2700,mediaType:'image_motion'}]})[0];
  await f.manifest.importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',inputPath:sampleWav,metadata:{queueJobId:'r310',inputHash:sha('r310'),textSha256:sha(scene.text),providerId:'piper'}});
  f.db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(scene.id,'r310',sha('r310'),sha(scene.text),f.repo.getVideo(f.video.id).configRevision,'piper','default',0,Date.now());
  const image=await f.manifest.importFile({sceneId:scene.id,kind:'image',inputPath:samplePicture});
  f.db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,image.id,Date.now());
  const timed=new TimedCompositionRepository({compositions:f.compositions,manifest:f.manifest});
  const preview=await timed.preview(f.video.id);
  const published=await timed.publish(f.video.id,{expectedDigest:preview.digest,expectedVideoRowVersion:preview.source.videoRowVersion});
  const request=await f.svc.enqueue(f.video.id,{revision:published.revision,requestKey:'snapshot-before-edit',engine:'ffmpeg-fastpath'});
  const persisted=f.db.prepare('SELECT * FROM render_snapshots WHERE job_id=?').get(request.job.id);
  assert.equal(persisted.composition_digest,published.composition.digest);
  assert.throws(()=>f.db.prepare('UPDATE render_snapshots SET composition_digest=? WHERE job_id=?').run(sha('altered'),request.job.id),/IMMUTABLE/);
  const timeline=f.repo.getTimeline(f.video.id);
  f.repo.updateTimeline(f.video.id,{rowVersion:timeline.rowVersion,document:{...timeline.document,clips:[]}});
  assert.throws(()=>checkPublishedSource(f.repo,f.compositions,published.composition),{code:'RENDER_STALE_COMPOSITION'});
  runner=new JobRunner(f.store,{'render:ffmpeg':f.svc.handler()},{concurrency:1,heartbeatMs:100,pollMs:35});
  runner.start();await runner.waitForIdle({timeoutMs:90000});
  const status=f.svc.job(f.video.id,request.job.id);
  assert.equal(status.status,'succeeded',JSON.stringify(status));
  assert.ok(status.output.subtitleUrl?.endsWith('/srt'));
  const file=await f.svc.subtitle(f.video.id,request.job.id);assert.ok(file.size>20);
  const data=await readFile(join(f.dir,f.store.get(request.job.id).result.subtitles.relativePath),'utf8');
  assert.match(data,/Xin chào, Đà Nẵng!/);
  assert.match(data,/00:00:00,000 --> /);
  assert.throws(()=>f.svc.job('other-video',request.job.id),{code:'RENDER_JOB_NOT_FOUND'});
  await assert.rejects(f.svc.subtitle('other-video',request.job.id),{code:'RENDER_JOB_NOT_FOUND'});
  file.stream.destroy();
  const loc=join(f.dir,f.store.get(request.job.id).result.subtitles.relativePath);
  await (await import('node:fs/promises')).writeFile(loc,'tampered');
  await assert.rejects(f.svc.subtitle(f.video.id,request.job.id),{code:'RENDER_SUBTITLE_CHANGED'});
 }finally{if(runner)await runner.stop();await f.close();}
});
