import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository} from '../../../packages/core/src/index.mjs';
import {RenderExportService} from '../src/render-export-r2ext0406.mjs';
import {publicJobEvent} from '../src/job-center.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {operationById} from '../../../packages/contracts/src/catalog.mjs';
async function context(){
 const root=await mkdtemp(join(tmpdir(),'r312-test-')),file=join(root,'db.sqlite');
 const db=openProjectDb(file),repo=new StudioRepository(db),store=new JobStore({path:file});
 const channel=repo.createChannel({name:'Render Drawer test'}),video=repo.createVideo(channel.id,{title:'Preflight'});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:root}),compositions=new CompositionRepository({repo,manifest});
 return {root,db,repo,store,video,svc:new RenderExportService({repo,compositions,manifest,store}),
  close:async()=>{store.close();db.close();await rm(root,{recursive:true,force:true})}};
}
test('R3-12 preflight cannot reserve jobs or accept unapproved revisions',async()=>{
 const f=await context();try{
  assert.ok(operationById.has('previewLocalVideoRender'));
  await assert.rejects(f.svc.preflight(f.video.id,{revision:1}),{code:'COMPOSITION_REVISION_NOT_FOUND'});
  await assert.rejects(f.svc.preflight(f.video.id,{revision:1,resolution:'4k'}),{code:'RENDER_INVALID_REQUEST'});
  await assert.rejects(f.svc.enqueue(f.video.id,{revision:1,requestKey:'test',resolution:'invalid'}),{code:'RENDER_INVALID_REQUEST'});
  assert.equal(f.store.countByStatus().total,0);
 }finally{await f.close()}
});
test('R3-12 rendering events are sanitized to bounded public metadata and stage',()=>{
 const event=publicJobEvent({seq:5,job_id:'job-1',type:'render_progress',created_at:200,
  detail:{stage:'encoding',completedScenes:2,totalScenes:10,prompt:'secret',apiKey:'never',attempt:1}});
 assert.equal(event.detail.stage,'encoding');assert.equal(event.detail.completedScenes,2);
 assert.doesNotMatch(JSON.stringify(event),/secret|never/);
 const spoof=publicJobEvent({seq:6,job_id:'job-1',type:'render_progress',created_at:201,detail:{stage:'admin:credentials',completedScenes:100}});
 assert.equal(spoof.detail.stage,null);
});

import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {TimedCompositionRepository} from '../../../packages/core/src/index.mjs';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
const sha=s=>createHash('sha256').update(s).digest('hex');
const imagePath=new URL('../../../spikes/EXT-03/assets/background-01.png',import.meta.url).pathname;
const voicePath=new URL('../../../spikes/EXT-03/assets/voice-01.wav',import.meta.url).pathname;
const ffmpegReady=spawnSync('ffmpeg',['-hide_banner','-filters'],{encoding:'utf8'}).stdout.includes('subtitles');

test('R3-12 pinned preflight + explicit 720p render, immutable output after source edit', {skip:!ffmpegReady,timeout:120000},async()=>{
 const f=await context();let worker;
 try{
  const scene=f.repo.replaceScenes(f.video.id,{rowVersion:1,scenes:[{text:'Thử nghiệm 720p.',durationMs:2700,mediaType:'image_motion'}]})[0];
  await (new AssetManifest({db:f.db,repository:f.repo,dataRoot:f.root})).importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',inputPath:voicePath,
   metadata:{queueJobId:'r312',inputHash:sha('r312'),textSha256:sha(scene.text),providerId:'piper'}});
  f.db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(scene.id,'r312',sha('r312'),sha(scene.text),f.repo.getVideo(f.video.id).configRevision,'piper','default',0,Date.now());
  const img=await (new AssetManifest({db:f.db,repository:f.repo,dataRoot:f.root})).importFile({sceneId:scene.id,kind:'image',inputPath:imagePath});
  f.db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,img.id,Date.now());
  const publishedRepo=new TimedCompositionRepository({compositions:f.svc.compositions,manifest:f.svc.manifest});
  const preview=await publishedRepo.preview(f.video.id);assert.equal(preview.readiness.ready,true,JSON.stringify(preview.readiness));
  const approved=await publishedRepo.publish(f.video.id,{expectedDigest:preview.digest,expectedVideoRowVersion:preview.source.videoRowVersion});
  const settings={revision:approved.revision,engine:'ffmpeg-fastpath',resolution:'720p'};
  const checked=await f.svc.preflight(f.video.id,settings);
  assert.equal(checked.ready,true);assert.equal(checked.profile.width,1280);
  assert.equal(f.store.countByStatus().total,0,'preflight must never enqueue');
  const queue=await f.svc.enqueue(f.video.id,{...settings,requestKey:'only-clicked-once'});
  assert.equal(f.svc.job(f.video.id,queue.job.id).revision,approved.revision);
  assert.equal(f.svc.job(f.video.id,queue.job.id).sourceCurrent,true);
  worker=new JobRunner(f.store,{'render:ffmpeg':f.svc.handler()},{concurrency:1,heartbeatMs:100,pollMs:30});
  worker.start();await worker.waitForIdle({timeoutMs:90000});
  const job=f.svc.job(f.video.id,queue.job.id);assert.equal(job.status,'succeeded',JSON.stringify(job));
  assert.equal(job.resolution,'720p');
  const info=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',join(f.root,f.store.get(queue.job.id).result.relativePath)],{encoding:'utf8'});
  assert.equal(info.status,0,info.stderr);
  const dimensions=JSON.parse(info.stdout).streams[0];assert.equal(dimensions.width,1280);assert.equal(dimensions.height,720);
  const timeline=f.repo.getTimeline(f.video.id);
  f.repo.updateTimeline(f.video.id,{rowVersion:timeline.rowVersion,document:{...timeline.document,clips:[]}});
  const historic=f.svc.job(f.video.id,queue.job.id);
  assert.equal(historic.sourceCurrent,false,'a previously QA-passed output remains valid, but old');
  assert.equal(historic.output.qa.passed,true);
  const stale=await f.svc.preflight(f.video.id,settings);
  assert.equal(stale.ready,false);assert.ok(stale.blockers.includes('RENDER_STALE_COMPOSITION'));
  assert.equal(f.store.countByStatus().total,1,'no surprise re-queue');
 }finally{if(worker)await worker.stop();await f.close()}
});
