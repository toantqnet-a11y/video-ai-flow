/** R1-05: real SQLite+JobStore, fake local model output only. No AI/paid calls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,ContentBriefRepository,ContentOutlineRepository,
  ChapterGenerationRepository,ContentEvaluationRepository,ContentRetryRepository} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {createChapterJobHandler} from '../src/chapter-generation.mjs';
import {createEvaluationJobHandler} from '../src/content-evaluation.mjs';
import {createContentRetryJobHandler,buildRetryPrompt} from '../src/content-retry.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {createControllers} from '../src/controllers.mjs';
import {migrations} from '../../../packages/core/src/db.mjs';

const rawScore=()=>({criteria:{coherence:{score:8,feedback:'Mạch lạc, dễ theo dõi'},accuracy:{score:7,feedback:'Cần kiểm chứng dữ kiện'},
 style:{score:9,feedback:'Văn phong nhất quán'},engagement:{score:7,feedback:'Cần ví dụ dễ nhớ'},
 completeness:{score:8,feedback:'Đã đủ các ý quan trọng'}},feedback:'Nên thêm ví dụ và chú ý sự chính xác.',
 suggestions:['Thêm ví dụ ở đoạn đầu cho độc giả','Kiểm tra lại dữ kiện bằng nguồn đáng tin cậy']});
const draft=(word='Gốc')=>({text:`${word} – Nội dung chương bằng tiếng Việt có dẫn chứng và câu chuyện. `.repeat(8),summary:'Tóm tắt nội dung cho chương tiếp theo.'});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'studio-r105-')),path=join(dir,'studio.sqlite');
 const db=openProjectDb(path),repo=new StudioRepository(db),channel=repo.createChannel({name:'Kênh nghiên cứu'}),video=repo.createVideo(channel.id,{title:'Video'});
 db.prepare("INSERT INTO provider_accounts(id,provider_id,name,created_at,updated_at) VALUES('a','ollama','Local',1,1)").run();
 db.prepare("INSERT INTO provider_accounts(id,provider_id,name,created_at,updated_at) VALUES('remote','gemini','Remote',1,1)").run();
 for(const [id,account,model,tier,location] of [['local1','a','qwen','local','local'],['local2','a','mistral','local','local'],['paid','remote','gemini-pro','paid','remote']])
   db.prepare(`INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,created_at,updated_at)
    VALUES(?,?,?,'llm',?,?,1,1)`).run(id,account,model,location,tier);
 const store=new JobStore({path,pollMs:1,baseBackoffMs:0,leaseMs:2000});
 const briefs=new ContentBriefRepository(repo),outlines=new ContentOutlineRepository(repo);
 briefs.save(video.id,{expectedRevision:0,brief:{topic:'Cách kể chuyện',idea:'Nghiên cứu',modelIds:['local1','local2'],
  target:{mode:'words',durationMinutes:30,wordCount:800,wpm:140,chapterTargetWords:500}}});
 outlines.save(video.id,{expectedRevision:0,outline:{chapters:[{title:'Phần mở đầu',objective:'Khởi nguồn',targetWords:800,keyPoints:['Nguồn tin']}]}});
 const chapters=new ChapterGenerationRepository(repo,{store}),evals=new ContentEvaluationRepository(repo,{store}),retries=new ContentRetryRepository(repo,{store});
 return {dir,db,repo,store,video,chapters,evals,retries,close(){store.close();db.close();rmSync(dir,{recursive:true,force:true})}};
}
async function drain(f,handlers){const worker=new JobRunner(f.store,handlers,{pollMs:5,heartbeatMs:100,concurrency:2});
 worker.start();await worker.waitForIdle({timeoutMs:8000});await worker.stop();}
async function setup(){const f=fixture();
 const b=f.chapters.requestBatch(f.video.id,{briefRevision:1,outlineRevision:1,modelIds:['local1'],requestKey:'base'});
 await drain(f,{'content:chapter':createChapterJobHandler({repo:f.repo,store:f.store,generateLocal:async()=>draft()})});
 const res=f.chapters.batch(f.video.id,b.id),variantId=res.results[0].variantId;
 const e=f.evals.request(f.video.id,variantId,{evaluatorModelId:'local2',requestKey:'score'});
 await drain(f,{'content:evaluate':createEvaluationJobHandler({repo:f.repo,store:f.store,generateLocal:async()=>rawScore()})});
 assert.equal(f.evals.get(f.video.id,variantId,e.id).status,'succeeded');
 return {...f,variantId,evaluationId:e.id,baseText:res.results[0].text};
}
const submit=(f,overrides={})=>f.retries.request(f.video.id,f.variantId,{evaluationId:f.evaluationId,
 modelId:'local1',feedback:'Bổ sung ví dụ minh họa, cải thiện mạch lạc.',requestKey:'r1',...overrides});

test('R1-05 migration v17 creates lineage with immutable prior schema',()=>{
 const f=fixture();try{assert.ok(migrations.some(m=>m.version===17));
  assert.ok(f.db.prepare('PRAGMA user_version').get().user_version>=17);
  assert.ok(f.db.prepare("SELECT sql FROM sqlite_master WHERE name='content_retry_runs'").get().sql.includes('source_variant_id'));
 }finally{f.close()}
});

test('R1-05 retry creates new variant, source unchanged, can re-score and repeat',async()=>{
 const f=await setup();try{
  const requested=submit(f);assert.equal(requested.status,'pending'); // may already be queued
  const prompt=buildRetryPrompt({source:f.baseText,feedback:requested.feedback,chapterTitle:'Phần mở đầu',targetWords:800});
  assert.ok(prompt.includes('<untrusted_source>')&&prompt.includes('Bổ sung ví dụ'));
  let generated=0;await drain(f,{'content:retry':createContentRetryJobHandler({repo:f.repo,store:f.store,
    generateLocal:async()=>{generated++;return draft('Phiên bản sửa')}})});
  const done=f.retries.get(f.video.id,f.variantId,requested.id);
  assert.equal(done.status,'succeeded');assert.equal(generated,1);assert.ok(done.variantId);
  assert.notEqual(done.variantId,f.variantId);assert.ok(done.text.includes('Phiên bản sửa'));
  assert.equal(f.evals.variant(f.video.id,f.variantId).text,f.baseText);
  const compared=f.retries.compare(f.video.id,f.variantId,requested.id);
  assert.equal(compared.source.text,f.baseText);assert.equal(compared.retry.variantId,done.variantId);
  const regrade=f.evals.request(f.video.id,done.variantId,{evaluatorModelId:'local2',requestKey:'regrade'});
  await drain(f,{'content:evaluate':createEvaluationJobHandler({repo:f.repo,store:f.store,generateLocal:async()=>rawScore()})});
  assert.equal(f.evals.get(f.video.id,done.variantId,regrade.id).status,'succeeded');
  // A new scored revision can itself be improved without overwriting its parent.
  const chained=f.retries.request(f.video.id,done.variantId,{evaluationId:regrade.id,modelId:'local1',
    feedback:'Nêu thêm ví dụ mới, nâng cao sự cuốn hút.',requestKey:'r2'});
  assert.equal(chained.sourceVariantId,done.variantId);
  assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
  assert.equal(f.chapters.batches(f.video.id).length,1,'Private retry batches must stay out of main chapter browser');
 }finally{f.close()}
});

test('R1-05 idempotency, conflicting request and payload validation',async()=>{
 const f=await setup();try{
  const a=submit(f),b=submit(f);assert.equal(a.id,b.id);
  assert.throws(()=>submit(f,{feedback:'Thay nhận xét trong cùng request key'}),e=>e.code==='CONTENT_RETRY_REQUEST_CONFLICT');
  assert.throws(()=>submit(f,{feedback:' '}),e=>e.code==='INVALID_CONTENT_RETRY');
  assert.throws(()=>submit(f,{feedback:'x'.repeat(4001),requestKey:'new'}),e=>e.code==='INVALID_CONTENT_RETRY');
  assert.throws(()=>submit(f,{extra:'untrusted'}),e=>e.code==='INVALID_CONTENT_RETRY');
  assert.equal(f.retries.list(f.video.id,f.variantId).length,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM content_retry_runs').get().n,1);
 }finally{f.close()}
});

test('R1-05 requires completed score and model allowed by brief (no paid)',async()=>{
 const f=await setup();try{
  const v=f.evals.request(f.video.id,f.variantId,{evaluatorModelId:'local2',requestKey:'score_pending'});
  assert.throws(()=>submit(f,{evaluationId:v.id,requestKey:'not_yet'}),e=>e.code==='CONTENT_RETRY_REQUIRES_SCORE');
  assert.throws(()=>submit(f,{modelId:'paid',requestKey:'cost'}),e=>e.code==='CHAPTER_LOCAL_MODEL_REQUIRED');
  assert.throws(()=>submit(f,{modelId:'local2x',requestKey:'unknown'}),e=>e.code==='CHAPTER_LOCAL_MODEL_REQUIRED');
  assert.equal(f.db.prepare('SELECT count(*) n FROM content_retry_runs').get().n,0);
 }finally{f.close()}
});

test('R1-05 malformed model output fails; no fake draft or master write',async()=>{
 const f=await setup();try{
  const run=submit(f);await drain(f,{'content:retry':createContentRetryJobHandler({repo:f.repo,store:f.store,
     generateLocal:async()=>({text:'bad',summary:'short'})})});
  const state=f.retries.get(f.video.id,f.variantId,run.id);
  assert.equal(state.status,'failed');assert.equal(state.variantId,null);
  assert.equal(f.db.prepare(`SELECT count(*) n FROM content_chapter_drafts WHERE batch_id=(SELECT batch_id FROM content_retry_runs WHERE id=?)`).get(run.id).n,0);
  assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
 }finally{f.close()}
});

test('R1-05 failed retry job can resume original pinned inputs',async()=>{
 const f=await setup();try{
  const run=submit(f);await drain(f,{'content:retry':createContentRetryJobHandler({repo:f.repo,store:f.store,
     generateLocal:async()=>{throw Object.assign(new Error('provider down'),{code:'CONTENT_RETRY_PROVIDER_UNAVAILABLE'})}})});
  assert.equal(f.retries.get(f.video.id,f.variantId,run.id).status,'failed');
  f.retries.retryFailed(f.video.id,f.variantId,run.id);
  await drain(f,{'content:retry':createContentRetryJobHandler({repo:f.repo,store:f.store,generateLocal:async()=>draft('Bản phục hồi')})});
  assert.equal(f.retries.get(f.video.id,f.variantId,run.id).status,'succeeded');
  assert.throws(()=>f.retries.retryFailed(f.video.id,f.variantId,run.id),e=>e.code==='CONTENT_RETRY_NOT_RETRYABLE');
 }finally{f.close()}
});

test('R1-05 video scope protects cross-video access, no leakage',async()=>{
 const f=await setup();try{
  const other=f.repo.createVideo(f.db.prepare('SELECT id FROM channels LIMIT 1').get().id,{title:'Other'});
  const run=submit(f);
  assert.throws(()=>f.retries.get(other.id,f.variantId,run.id),e=>e.code==='EVALUATION_VARIANT_NOT_FOUND');
  assert.throws(()=>f.retries.compare(other.id,f.variantId,run.id),e=>e.code==='EVALUATION_VARIANT_NOT_FOUND');
 }finally{f.close()}
});

test('R1-05 API route declarations match canonical contracts and controllers',()=>{
 const registrations=[];const app={};for(const method of ['get','post','put','patch','delete'])app[method]=(path)=>registrations.push(`${method.toUpperCase()} ${path}`);
 const controllers=new Proxy({}, {get:()=>()=>({})});registerStudioRoutes(app,{controllers,store:{},diagnostics:{}});
 for(const [method,path] of [['POST','/api/videos/:id/content/variants/:variantId/retries'],
  ['GET','/api/videos/:id/content/variants/:variantId/retries'],
  ['GET','/api/videos/:id/content/variants/:variantId/retries/:retryId/compare'],
  ['POST','/api/videos/:id/content/variants/:variantId/retries/:retryId/retry-job']])
  assert.ok(registrations.includes(`${method} ${path}`));
});

test('R1-05 interrupted local job survives SQLite reopen and replays once',async()=>{
 const f=await setup();let first;
 try{
  first=submit(f);
  assert.equal(f.retries.get(f.video.id,f.variantId,first.id).variantId,null);
  f.store.close();f.db.close();
  const path=join(f.dir,'studio.sqlite');
  const db=openProjectDb(path),repo=new StudioRepository(db),store=new JobStore({path,pollMs:1,baseBackoffMs:0,leaseMs:2000});
  try{
   const retries=new ContentRetryRepository(repo,{store});
   const same=retries.request(f.video.id,f.variantId,{evaluationId:f.evaluationId,modelId:'local1',
     feedback:'Bổ sung ví dụ minh họa, cải thiện mạch lạc.',requestKey:'r1'});
   assert.equal(same.id,first.id);
   const runner=new JobRunner(store,{'content:retry':createContentRetryJobHandler({repo,store,
     generateLocal:async()=>draft('Sau restart')})},{pollMs:5,heartbeatMs:100});
   runner.start();await runner.waitForIdle({timeoutMs:5000});await runner.stop();
   const final=retries.get(f.video.id,f.variantId,first.id);
   assert.equal(final.status,'succeeded');assert.ok(final.variantId);
   assert.equal(db.prepare('SELECT count(*) n FROM content_retry_runs').get().n,1);
  }finally{store.close();db.close()}
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});

test('R1-05 source fingerprint is checked again during generation',async()=>{
 const f=await setup();try{
  const run=submit(f);
  // Simulate external disk corruption. A stale job cannot regenerate from a
  // different source without an explicit evaluation of that new version.
  f.db.prepare('UPDATE content_retry_runs SET source_hash=? WHERE id=?').run('0'.repeat(64),run.id);
  await drain(f,{'content:retry':createContentRetryJobHandler({repo:f.repo,store:f.store,
    generateLocal:async()=>{throw new Error('Must not invoke AI on stale source')}})});
  const state=f.retries.get(f.video.id,f.variantId,run.id);
  assert.equal(state.status,'failed');assert.equal(state.variantId,null);
  assert.throws(()=>f.retries.retryFailed(f.video.id,f.variantId,run.id),e=>e.code==='CONTENT_RETRY_SOURCE_CHANGED');
 }finally{f.close()}
});
