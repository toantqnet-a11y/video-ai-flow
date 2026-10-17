import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,AssetManifest} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {createControllers} from '../src/controllers.mjs';
import {operationById} from '../../../packages/contracts/src/catalog.mjs';
const style={schemaVersion:1,presetId:'clean',brand:{title:'',accentColor:'#1E88E5',captionColor:'#FFFFFF',outlineColor:'#131722',captionSize:26,showLowerThird:false},sceneOverrides:[]};
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'r2ext0708-api-'));
 const path=join(dir,'db.sqlite'),db=openProjectDb(path),repo=new StudioRepository(db),store=new JobStore({path});
 const channel=repo.createChannel({name:'Routes'}),video=repo.createVideo(channel.id,{title:'Demo'});
 const scenes=repo.replaceScenes(video.id,{rowVersion:1,scenes:[{text:'Một cảnh tiếng Việt',durationMs:1800,mediaType:'image_motion'}]});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
 const registry={localVoiceDefaults:{},imageAdapter:null};
 const controllers=createControllers({repo,store,registry,manifest,vault:null});
 return {dir,repo,manifest,video,scenes,store,db,controllers,close:async()=>{store.close();db.close();await rm(dir,{recursive:true,force:true})}};
}
test('EXT07/08 new routes are in allowlisted OpenAPI/SDK catalog',()=>{
 for(const id of ['previewVisualCostRoute','listMotionStylePresets','getMotionStyle','getMotionStyleRevision','publishMotionStyle'])
  assert.ok(operationById.has(id),id);
});
test('EXT07 HTTP controller preview is read-only and paid bypass is rejected',async()=>{
 const f=await fixture();try{
  const plan=await f.controllers.visualRoutePreview(f.video.id,{mode:'quality',includePaidCandidates:true});
  assert.equal(plan.scenes[0].action,'import_media');
  assert.equal(plan.scenes[0].paidDispatchAllowed,false);
  assert.equal(plan.summary.paidCallsScheduled,0);
  await assert.rejects(f.controllers.visualRoutePreview(f.video.id,{mode:'quality',approvedPaidUsage:true}),{code:'VISUAL_ROUTE_INVALID_OPTIONS'});
  assert.equal(f.store.countByStatus().total,0);
 }finally{await f.close()}
});
test('EXT08 HTTP motion style state persists versions, refuses forged arbitrary filter',async()=>{
 const f=await fixture();try{
  assert.equal(f.controllers.motionStylePresets().items.length,4);
  assert.equal(f.controllers.motionStyleCurrent(f.video.id).revision,0);
  const saved=f.controllers.motionStylePublish(f.video.id,{expectedRevision:0,style});
  assert.equal(saved.revision,0,'default is a no-op to avoid unnecessary revisions');
  const styled=f.controllers.motionStylePublish(f.video.id,{expectedRevision:0,style:{...style,presetId:'story'}});
  assert.equal(styled.revision,1);
  assert.equal(f.controllers.motionStyleRevision(f.video.id,'1').style.digest,styled.style.digest);
  assert.throws(()=>f.controllers.motionStylePublish(f.video.id,{expectedRevision:1,style:{...style,presetId:'evil',shell:';rm'}}));
  assert.throws(()=>f.controllers.motionStylePublish(f.video.id,{expectedRevision:0,style:{...style,presetId:'gentle'}}),{code:'MOTION_REVISION_CONFLICT'});
  assert.equal(f.store.countByStatus().total,0);
 }finally{await f.close()}
});

import {createHash} from 'node:crypto';
import {TimedCompositionRepository,CompositionRepository} from '../../../packages/core/src/index.mjs';
import {RenderExportService} from '../src/render-export-r2ext0406.mjs';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {spawnSync} from 'node:child_process';
const ffmpegReady=spawnSync('ffmpeg',['-hide_banner','-filters'],{encoding:'utf8'}).stdout.includes('drawtext');
const hash=x=>createHash('sha256').update(x).digest('hex');
const demoWav=new URL('../../../spikes/EXT-03/assets/voice-01.wav',import.meta.url).pathname;
const demoPng=new URL('../../../spikes/EXT-03/assets/background-01.png',import.meta.url).pathname;
test('EXT08 styled queue pins immutable style, rejects key reuse conflict, protects thumbnail download',{skip:!ffmpegReady,timeout:120000},async()=>{
 const f=await fixture();let runner;
 try{
  const scene=f.scenes[0];
  await f.manifest.importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',inputPath:demoWav,
    metadata:{queueJobId:'mock',inputHash:hash('input'),textSha256:hash(scene.text),providerId:'piper'}});
  f.db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(scene.id,'mock',hash('input'),hash(scene.text),f.repo.getVideo(f.video.id).configRevision,'piper','default',0,Date.now());
  const image=await f.manifest.importFile({sceneId:scene.id,kind:'image',source:'manual_import',inputPath:demoPng});
  f.db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,image.id,Date.now());
  const comp=new CompositionRepository({repo:f.repo,manifest:f.manifest});
  const timed=new TimedCompositionRepository({compositions:comp,manifest:f.manifest});
  const preview=await timed.preview(f.video.id),published=await timed.publish(f.video.id,{
    expectedDigest:preview.digest,expectedVideoRowVersion:preview.source.videoRowVersion});
  const brand={...style,presetId:'story',brand:{...style.brand,title:'Tên thương hiệu',showLowerThird:true}};
  const firstStyle=f.controllers.motionStylePublish(f.video.id,{expectedRevision:0,style:brand});
  const svc=new RenderExportService({repo:f.repo,store:f.store,compositions:comp,manifest:f.manifest});
  const body={revision:published.revision,styleRevision:firstStyle.revision,requestKey:'style-one',engine:'ffmpeg-fastpath'};
  const queued=await svc.enqueue(f.video.id,body);
  assert.equal((await svc.enqueue(f.video.id,body)).reused,true);
  const newer=f.controllers.motionStylePublish(f.video.id,{expectedRevision:1,style:{...brand,presetId:'clean'}});
  await assert.rejects(svc.enqueue(f.video.id,{...body,styleRevision:newer.revision}),{code:'RENDER_IDEMPOTENCY_CONFLICT'});
  assert.equal(f.store.countByStatus().total,1);
  runner=new JobRunner(f.store,{'render:ffmpeg':svc.handler()},{concurrency:1,heartbeatMs:100,pollMs:40});
  runner.start();await runner.waitForIdle({timeoutMs:90000});
  const job=svc.job(f.video.id,queued.job.id);
  assert.equal(job.status,'succeeded',JSON.stringify(job));
  assert.ok(job.output.thumbnailUrl.endsWith('/thumbnail'));
  const thumbnail=await svc.thumbnail(f.video.id,queued.job.id);
  assert.ok(thumbnail.size>300);thumbnail.stream.destroy();
  assert.throws(()=>svc.job('other-video',queued.job.id),{code:'RENDER_JOB_NOT_FOUND'});
  await assert.rejects(svc.thumbnail('other-video',queued.job.id),{code:'RENDER_JOB_NOT_FOUND'});
 }finally{if(runner)await runner.stop();await f.close()}
});
