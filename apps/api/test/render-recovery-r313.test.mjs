import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository} from '../../../packages/core/src/index.mjs';
import {RenderExportService} from '../src/render-export-r2ext0406.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
const voice=new URL('../../../spikes/EXT-03/assets/voice-01.wav',import.meta.url).pathname;
const visual=new URL('../../../spikes/EXT-03/assets/background-01.png',import.meta.url).pathname;

test('R3-13: low disk before click blocks queue, low disk after click blocks worker',{timeout:30000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'r313-api-')),file=join(root,'db.sqlite');let db,store;
 try{
  db=openProjectDb(file);const repo=new StudioRepository(db);store=new JobStore({path:file});
  const c=repo.createChannel({name:'Disk admission fixture'}),v=repo.createVideo(c.id,{title:'Disk check'});
  const scene=repo.replaceScenes(v.id,{rowVersion:1,scenes:[{text:'Đo dung lượng.',durationMs:2500,mediaType:'image_motion'}]})[0];
  const manifest=new AssetManifest({db,repository:repo,dataRoot:root});
  await manifest.importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',inputPath:voice,
   metadata:{queueJobId:'r313',inputHash:sha('r313'),textSha256:sha(scene.text),providerId:'piper'}});
  db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(scene.id,'r313',sha('r313'),sha(scene.text),repo.getVideo(v.id).configRevision,'piper','default',0,Date.now());
  const image=await manifest.importFile({sceneId:scene.id,kind:'image',inputPath:visual});
  db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,image.id,Date.now());
  const compositions=new CompositionRepository({repo,manifest});
  const timed=new TimedCompositionRepository({compositions,manifest});
  const preview=await timed.preview(v.id);assert.equal(preview.readiness.ready,true);
  const published=await timed.publish(v.id,{expectedDigest:preview.digest,expectedVideoRowVersion:preview.source.videoRowVersion});
  let free=false;const diskCheck=async()=>({ready:free,requiredBytes:10000,reserveBytes:1000,availableBytes:free?999999:10,blocker:free?null:'RENDER_DISK_SPACE_LOW'});
  const svc=new RenderExportService({repo,manifest,store,compositions,diskCheck});
  const req={revision:published.revision,engine:'ffmpeg-fastpath'};
  const blocked=await svc.preflight(v.id,req);
  assert.equal(blocked.ready,false);assert.ok(blocked.blockers.includes('RENDER_DISK_SPACE_LOW'));
  assert.equal(store.countByStatus().total,0);
  await assert.rejects(svc.enqueue(v.id,{...req,requestKey:'click1'}),{code:'RENDER_DISK_SPACE_LOW'});
  free=true;const queued=await svc.enqueue(v.id,{...req,requestKey:'click1'});
  assert.equal(store.countByStatus().total,1);
  free=false;
  await assert.rejects(svc.handler('ffmpeg-fastpath')(store.get(queued.job.id).payload,{jobId:queued.job.id}),{code:'RENDER_DISK_SPACE_LOW'});
  assert.equal(store.get(queued.job.id).status,'pending');
 }finally{store?.close();db?.close();await rm(root,{recursive:true,force:true});}
});
