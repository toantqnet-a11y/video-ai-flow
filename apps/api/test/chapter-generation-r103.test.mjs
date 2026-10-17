import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,ContentBriefRepository,ContentOutlineRepository,ChapterGenerationRepository} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {createChapterJobHandler,buildChapterPrompt} from '../src/chapter-generation.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {createControllers} from '../src/controllers.mjs';
import {operations} from '../../../packages/contracts/src/catalog.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

function fixture(path=':memory:'){
 const db=openProjectDb(path),repo=new StudioRepository(db),channel=repo.createChannel({name:'History'}),video=repo.createVideo(channel.id,{title:'AI story'});
 db.prepare("INSERT INTO provider_accounts(id,provider_id,name,created_at,updated_at) VALUES('a','ollama','Local Ollama',1,1)").run();
 for(const [id,name] of [['m1','qwen'],['m2','llama']])db.prepare(`INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,created_at,updated_at)
 VALUES(?,'a',?,'llm','local','local',1,1)`).run(id,name);
 const briefs=new ContentBriefRepository(repo),outlines=new ContentOutlineRepository(repo);
 briefs.save(video.id,{expectedRevision:0,brief:{topic:'Khoa học Việt Nam',idea:'Nội dung liên tục',modelIds:['m1','m2'],target:{mode:'words',durationMinutes:30,wordCount:900,wpm:145,chapterTargetWords:500}}});
 outlines.save(video.id,{expectedRevision:0,outline:{chapters:[0,1,2].map(i=>({id:`chapter_${i}`,title:`Phần ${i+1}`,objective:'Giải thích khoa học',targetWords:300,keyPoints:['Ví dụ']}))}});
 const store=new JobStore({path,leaseMs:1000,baseBackoffMs:0}),svc=new ChapterGenerationRepository(repo,{store});
 return {db,repo,video,store,svc,close(){store.close();db.close()}};
}
const request=(f,key='request_1',modelIds=['m1','m2'])=>f.svc.requestBatch(f.video.id,{briefRevision:1,outlineRevision:1,modelIds,requestKey:key});
const generated=({model,chapterIndex})=>({text:`${model} chương ${chapterIndex}. `+'Nội dung Việt Nam được kể mạch lạc với các dữ kiện minh họa và ví dụ trực quan. '.repeat(4),summary:`Tóm tắt ${model} chương số ${chapterIndex}, đủ ngữ cảnh.`});
async function run(f,generateLocal){const runner=new JobRunner(f.store,{'content:chapter':createChapterJobHandler({repo:f.repo,store:f.store,generateLocal})},{concurrency:3,pollMs:5,heartbeatMs:100});runner.start();await runner.waitForIdle({timeoutMs:8000});await runner.stop();}

test('R1-03 generated chapters use a model-specific DAG and explicit concurrency',async()=>{
 const f=fixture(),calls=[];try{
  const batch=request(f);
  assert.equal(batch.counts.total,6);assert.equal(f.store.list({}).length,6);
  await run(f,async args=>{calls.push({...args});return generated(args)});
  const result=f.svc.batch(f.video.id,batch.id);
  assert.equal(result.counts.succeeded,6);assert.equal(result.complete,true);
  assert.deepEqual(calls.filter(c=>c.model==='qwen').map(c=>c.chapterIndex),[0,1,2]);
  assert.deepEqual(calls.filter(c=>c.model==='llama').map(c=>c.chapterIndex),[0,1,2]);
  assert.match(calls.find(c=>c.model==='qwen'&&c.chapterIndex===1).prompt,/Tóm tắt qwen chương số 0/);
  assert.doesNotMatch(calls.find(c=>c.model==='qwen'&&c.chapterIndex===1).prompt,/Tóm tắt llama/);
  assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
  assert.equal(f.db.prepare('SELECT COUNT(*) as n FROM content_chapter_drafts').get().n,6);
  assert.throws(()=>f.db.prepare('UPDATE content_chapter_drafts SET text=?').run('overwrite'),/CHAPTER_DRAFT_IMMUTABLE/);
 }finally{f.close()}
});

test('R1-03 request idempotency, rejection of stale outline and unsafe provider',()=>{
 const f=fixture();try{
  const batch=request(f);assert.equal(request(f).id,batch.id);
  assert.equal(f.store.list({}).length,6);
  assert.throws(()=>request(f,'request_1',['m1']),e=>e.code==='CHAPTER_BATCH_CONFLICT');
  f.db.prepare("UPDATE provider_models SET location='remote',cost_tier='paid' WHERE id='m2'").run();
  assert.throws(()=>request(f,'request_2',['m2']),e=>e.code==='CHAPTER_LOCAL_MODEL_REQUIRED');
  f.svc.outlines.save(f.video.id,{expectedRevision:1,outline:{chapters:[{title:'Đã đổi',objective:'Có nội dung',targetWords:300,keyPoints:[]}]}});
  assert.throws(()=>request(f,'request_3',['m1']),e=>e.code==='CHAPTER_OUTLINE_VERSION_CONFLICT');
  assert.equal(f.store.list({}).length,6);
 }finally{f.close()}
});

test('R1-03 failed chapter blocks descendants, targeted retry preserves successes',async()=>{
 const f=fixture();let shouldFail=true;try{
  const batch=request(f,'partial',['m1']);
  await run(f,async args=>{if(args.chapterIndex===1&&shouldFail)throw Object.assign(new Error('unavailable'),{code:'SERVICE_UNAVAILABLE',retryable:false});return generated(args)});
  let res=f.svc.batch(f.video.id,batch.id);
  assert.equal(res.counts.succeeded,1);assert.equal(res.counts.failed,2);
  shouldFail=false;f.svc.retryFailed(f.video.id,batch.id);
  await run(f,async args=>generated(args));
  res=f.svc.batch(f.video.id,batch.id);
  assert.equal(res.counts.succeeded,3);assert.equal(res.complete,true);
  assert.equal(f.store.get(res.results[0].jobId).attempt,1);
 }finally{f.close()}
});

test('R1-03 queue fencing, edited outline isolation, and failed model disable',async()=>{
 const f=fixture();let calls=0;try{
  const batch=request(f,'pinned',['m1']);
  f.svc.outlines.save(f.video.id,{expectedRevision:1,outline:{chapters:[{title:'NEW TITLE',objective:'Changed',targetWords:900,keyPoints:[]}]}});
  await run(f,async args=>{calls++;if(args.chapterIndex===2)f.db.prepare("UPDATE provider_models SET status='disabled' WHERE id='m1'").run();return generated(args)});
  assert.equal(calls,3);
  const response=f.svc.batch(f.video.id,batch.id);
  assert.equal(response.results[0].chapterTitle,'Phần 1');
  assert.equal(response.counts.succeeded,3);
  assert.equal(f.svc.outlines.get(f.video.id).outline.chapters[0].title,'NEW TITLE');
  assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
 }finally{f.close()}
});

test('R1-03 disabled model before worker executes blocks provider calls',async()=>{
 const f=fixture();let called=false;try{
  const batch=request(f,'disabled',['m1']);
  f.db.prepare("UPDATE provider_models SET status='disabled' WHERE id='m1'").run();
  await run(f,async()=>{called=true;return generated({model:'qwen',chapterIndex:0})});
  assert.equal(called,false);assert.equal(f.svc.batch(f.video.id,batch.id).counts.failed,3);
 }finally{f.close()}
});

test('R1-03 HTTP/contract routes include typed batch operations and reject remote URLs',async()=>{
 const f=fixture();try{
  const map=new Map(),app={};for(const method of ['get','post','put','patch','delete'])app[method]=(p,h)=>map.set(method.toUpperCase()+' '+p,h);
  registerStudioRoutes(app,{controllers:createControllers({repo:f.repo,store:f.store,registry:{},manifest:{}}),store:f.store});
  for(const op of operations.filter(o=>o.path.includes('/content/chapters/')))assert.ok(map.has(op.method+' '+op.path),op.id);
  const job=request(f,'reject',['m1']);let invoked=false;
  const handler=createChapterJobHandler({repo:f.repo,store:f.store,endpoint:'http://evil.net:8999',fetchImpl:()=>{invoked=true}});
  await assert.rejects(handler({batchId:job.id,chapterIndex:0,modelId:'m1'}),e=>e.code==='CHAPTER_LOCAL_ENDPOINT_REQUIRED');
  assert.equal(invoked,false);
  assert.match(buildChapterPrompt({brief:{topic:'Khoa học',styleOverrides:{}},outline:{chapters:[{title:'Kiến thức',targetWords:500,objective:'Giải thích',keyPoints:[]}]},chapterIndex:0}),/CHỈ|JSON/i);
 }finally{f.close()}
});

test('R1-03 batch resumes queued jobs from the same SQLite file after restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'r103-')),path=join(dir,'studio.sqlite');
 let f=fixture(path);try{
  const batch=request(f,'restart',['m1']);const videoId=f.video.id;
  f.close();f=null;
  const db=openProjectDb(path),repo=new StudioRepository(db),store=new JobStore({path,leaseMs:1000,baseBackoffMs:0}),svc=new ChapterGenerationRepository(repo,{store});
  try{
   assert.equal(svc.batch(videoId,batch.id).counts.total,3);
   const runner=new JobRunner(store,{'content:chapter':createChapterJobHandler({repo,store,generateLocal:async args=>generated(args)})},{pollMs:5,heartbeatMs:100});
   runner.start();await runner.waitForIdle({timeoutMs:8000});await runner.stop();
   assert.equal(svc.batch(videoId,batch.id).counts.succeeded,3);
   assert.equal(svc.batches(videoId).length,1);
  }finally{store.close();db.close()}
 }finally{try{f?.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});

test('R1-03 two model branches can run at the same time without cross-model dependency',async()=>{
 const f=fixture();try{
  const batch=request(f,'parallel');let firstChapters=0;let release;
  const barrier=new Promise(resolve=>{release=resolve});
  // If first chapters were mistakenly serialized, this test would time out.
  await run(f,async args=>{
    if(args.chapterIndex===0){firstChapters++;if(firstChapters===2)release();await barrier;}
    return generated(args);
  });
  assert.equal(firstChapters,2);assert.equal(f.svc.batch(f.video.id,batch.id).counts.succeeded,6);
 }finally{f.close()}
});

test('R1-03 invalid LLM output never creates a chapter draft or changes master script',async()=>{
 const f=fixture();try{
  const batch=request(f,'bad-response',['m1']);
  await run(f,async()=>({text:'short',summary:'x'}));
  assert.equal(f.svc.batch(f.video.id,batch.id).counts.failed,3);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM content_chapter_drafts').get().n,0);
  assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
 }finally{f.close()}
});
