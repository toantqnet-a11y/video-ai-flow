import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {RenderExportService} from '../src/render-export-r2ext0406.mjs';

// Real SQLite, real immutable render snapshots and real queued jobs. No
// renderer, GPU, AI provider or mock completed MP4 is needed to verify reads.
test('render history is bounded, private, ordered, read-only and not a fake MP4 proof',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-render-history-'));
 let db,store;
 try{
  const path=join(dir,'studio.sqlite');db=openProjectDb(path);
  store=new JobStore({path});
  const repo=new StudioRepository(db);
  const one=repo.createChannel({name:'Channel A'});
  const two=repo.createChannel({name:'Channel B'});
  const videoA=repo.createVideo(one.id,{title:'Video A'});
  const videoB=repo.createVideo(two.id,{title:'Video B'});
  const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
  const renderer=new RenderExportService({repo,store,manifest,compositions:new CompositionRepository({repo,manifest})});
  const issue=(video,index,kind='render:hyperframes')=>{
   const {job}=store.enqueue({kind,key:`history-${video.id}-${index}`,
    payload:{projectId:video.id,prompt:'THIS-IS-PRIVATE',credentialId:'secret'}})
   db.prepare(`INSERT INTO render_snapshots
    (job_id,video_id,engine,composition_digest,style_digest,composition_revision,payload_json,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(job.id,video.id,kind==='render:hyperframes'?'hyperframes':'ffmpeg-fastpath',
     'd'+index,null,index,JSON.stringify({resolution:'source'}),Date.now());
   return job;
  };
  const first=issue(videoA,1);
  const second=issue(videoA,2,'render:ffmpeg');
  const foreign=issue(videoB,1);
  const before=store.countByStatus().total;
  const res=renderer.list(videoA.id,{limit:'20'});
  assert.equal(res.items.length,2);
  assert.deepEqual(new Set(res.items.map(x=>x.id)),new Set([first.id,second.id]));
  assert.ok(!res.items.some(x=>x.id===foreign.id));
  assert.deepEqual(res.items.map(x=>x.revision).sort(),[1,2]);
  assert.ok(res.items.every(x=>x.status==='pending'&&x.output===null));
  assert.ok(!JSON.stringify(res).includes('THIS-IS-PRIVATE'));
  assert.ok(!JSON.stringify(res).includes('credentialId'));
  assert.ok(!JSON.stringify(res).includes('payload'));
  assert.equal(renderer.list(videoB.id).items[0].id,foreign.id);
  assert.equal(renderer.list(videoA.id,{limit:1}).items.length,1);
  assert.equal(store.countByStatus().total,before,'history must not dispatch or retry');
  for(const query of [{limit:'0'},{limit:'21'},{limit:'-1'},{limit:'01'},{limit:'1;DROP'},{limit:'2',unknown:'yes'},[]]){
   assert.throws(()=>renderer.list(videoA.id,query),/RENDER_INVALID_HISTORY/);
  }
  assert.throws(()=>renderer.list('no-video'),/RENDER_VIDEO_NOT_FOUND/);
 }finally{
  store?.close();db?.close();
  await rm(dir,{recursive:true,force:true});
 }
});
