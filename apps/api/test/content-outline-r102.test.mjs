import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,ContentBriefRepository,ContentOutlineRepository} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {createOutlineJobHandler,buildOutlinePrompt} from '../src/outline-generation.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {createControllers} from '../src/controllers.mjs';
import {operations} from '../../../packages/contracts/src/catalog.mjs';
const brief=()=>({topic:'Việt Nam',idea:'Lịch sử khoa học',target:{mode:'duration',durationMinutes:35,wordCount:5075,wpm:145,chapterTargetWords:1100},modelIds:['m']});
const proposal=()=>({chapters:Array.from({length:5},(_,i)=>({title:`Chương ${i+1}`,objective:'Tường thuật có bằng chứng',keyPoints:['Ý chính'],targetWords:1000}))});
function fixture(){const db=openProjectDb(),repo=new StudioRepository(db),channel=repo.createChannel({name:'Demo'}),video=repo.createVideo(channel.id,{title:'Test'});
 db.prepare("INSERT INTO provider_accounts(id,provider_id,name,created_at,updated_at) VALUES('a','ollama','Ollama',1,1)").run();
 db.prepare("INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,created_at,updated_at) VALUES('m','a','local-qwen','llm','local','local',1,1)").run();
 new ContentBriefRepository(repo).save(video.id,{expectedRevision:0,brief:brief()});
 const store=new JobStore({path:':memory:',leaseMs:1000,baseBackoffMs:0});const svc=new ContentOutlineRepository(repo,{store});
 return {db,repo,video,store,svc,close(){store.close();db.close()}};
}
const params=(f,body={})=>({params:{id:f.video.id,runId:body.runId,version:body.version},body,log:{warn(){}},query:{}});
async function call(map,f,method,path,body){const rep={status:200,code(n){this.status=n;return this;},send(v){return v;}};const result=await map.get(method+' '+path)(params(f,body),rep);return {status:rep.status,result};}

test('R1-02 route/catalog agreement, request errors safe and no implicit AI calls',async()=>{
 const f=fixture();try{
  const map=new Map(),app={};for(const method of ['get','post','put','patch','delete'])app[method]=(p,h)=>map.set(method+' '+p,h);
  registerStudioRoutes(app,{controllers:createControllers({repo:f.repo,store:f.store,registry:{},manifest:{}}),store:f.store});
  for(const op of operations.filter(x=>x.path.includes('/content/outline')))assert.ok(map.has(op.method.toLowerCase()+' '+op.path),op.id);
  const g=await call(map,f,'get','/api/videos/:id/content/outline');assert.equal(g.result.revision,0);
  const bad=await call(map,f,'post','/api/videos/:id/content/outline/generate',{briefRevision:1,expectedOutlineRevision:0,modelId:'remote',requestKey:'req0'});
  assert.equal(bad.status,409);assert.deepEqual(bad.result,{error:'OUTLINE_LOCAL_MODEL_REQUIRED'});
  const good=await call(map,f,'post','/api/videos/:id/content/outline/generate',{briefRevision:1,expectedOutlineRevision:0,modelId:'m',requestKey:'req1'});
  assert.equal(good.status,202);assert.ok(good.result.jobId);
  assert.ok(!JSON.stringify(good.result).includes('Lịch sử khoa học'));
 }finally{f.close()}
});

test('R1-02 injected local LLM worker, queue fencing and explicit approval',async()=>{
 const f=fixture();let calls=0;try{
  const run=f.svc.requestRun(f.video.id,{briefRevision:1,expectedOutlineRevision:0,modelId:'m',requestKey:'test1'});
  const handler=createOutlineJobHandler({repo:f.repo,store:f.store,generateLocal:async({model,prompt})=>{calls++;assert.equal(model,'local-qwen');assert.match(prompt,/Việt Nam/);return proposal();}});
  const runner=new JobRunner(f.store,{'content:outline':handler},{concurrency:1,pollMs:10,heartbeatMs:100});runner.start();
  await runner.waitForIdle({timeoutMs:4000});await runner.stop();
  assert.equal(calls,1);assert.equal(f.store.get(run.jobId).status,'succeeded');
  const ready=f.svc.getRun(f.video.id,run.id);assert.equal(ready.status,'generated');assert.equal(ready.result.chapters.length,5);
  assert.equal(f.svc.get(f.video.id).revision,0);
  const approved=f.svc.acceptRun(f.video.id,run.id,{expectedRevision:0});assert.equal(approved.revision,1);assert.equal(approved.outline.chapters.length,5);
  assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
  assert.throws(()=>f.svc.acceptRun(f.video.id,run.id,{expectedRevision:0}),e=>e.code==='OUTLINE_VERSION_CONFLICT');
 }finally{f.close()}
});

test('R1-02 generation after concurrent manual editing needs review, never overwrites',async()=>{
 const f=fixture();try{
  const run=f.svc.requestRun(f.video.id,{briefRevision:1,expectedOutlineRevision:0,modelId:'m',requestKey:'test2'});
  const manual={chapters:[{id:'manual',title:'Bản người dùng',objective:'Giữ nguyên',targetWords:600,keyPoints:[]}]};
  f.svc.save(f.video.id,{expectedRevision:0,outline:manual});
  const handler=createOutlineJobHandler({repo:f.repo,store:f.store,generateLocal:async()=>proposal()});
  const runner=new JobRunner(f.store,{'content:outline':handler},{concurrency:1,pollMs:10,heartbeatMs:100});runner.start();await runner.waitForIdle({timeoutMs:4000});await runner.stop();
  assert.equal(f.svc.getRun(f.video.id,run.id).status,'needs_review');
  assert.equal(f.svc.get(f.video.id).outline.chapters[0].title,'Bản người dùng');
  assert.equal(f.svc.acceptRun(f.video.id,run.id,{expectedRevision:1}).revision,2);
 }finally{f.close()}
});

test('R1-02 disabled provider before dispatch fails closed without inference',async()=>{
 const f=fixture();let called=false;try{
  const run=f.svc.requestRun(f.video.id,{briefRevision:1,expectedOutlineRevision:0,modelId:'m',requestKey:'test3'});
  f.db.prepare("UPDATE provider_models SET status='disabled' WHERE id='m'").run();
  const handler=createOutlineJobHandler({repo:f.repo,store:f.store,generateLocal:async()=>{called=true;return proposal();}});
  const runner=new JobRunner(f.store,{'content:outline':handler},{concurrency:1,pollMs:10,heartbeatMs:100});runner.start();await runner.waitForIdle({timeoutMs:4000});await runner.stop();
  assert.equal(called,false);assert.equal(f.svc.getRun(f.video.id,run.id).status,'failed');
 }finally{f.close()}
});

test('R1-02 model response validation fails without corrupting current outline',async()=>{
 const f=fixture();try{
  const run=f.svc.requestRun(f.video.id,{briefRevision:1,expectedOutlineRevision:0,modelId:'m',requestKey:'test4'});
  const handler=createOutlineJobHandler({repo:f.repo,store:f.store,generateLocal:async()=>({chapters:[{title:'',objective:'broken',targetWords:999}]})});
  const runner=new JobRunner(f.store,{'content:outline':handler},{concurrency:1,pollMs:10,heartbeatMs:100});runner.start();await runner.waitForIdle({timeoutMs:4000});await runner.stop();
  assert.equal(f.svc.getRun(f.video.id,run.id).status,'failed');assert.equal(f.svc.get(f.video.id).revision,0);
 }finally{f.close()}
});

test('R1-02 Ollama client rejects endpoint outside loopback before fetch',async()=>{
 const f=fixture();try{
  const run=f.svc.requestRun(f.video.id,{briefRevision:1,expectedOutlineRevision:0,modelId:'m',requestKey:'test5'});
  let called=false;const handler=createOutlineJobHandler({repo:f.repo,store:f.store,endpoint:'http://example.com',fetchImpl:()=>{called=true}});
  await assert.rejects(handler({runId:run.id}),e=>e.code==='OUTLINE_LOCAL_ENDPOINT_REQUIRED');assert.equal(called,false);
  assert.ok(buildOutlinePrompt(brief(),5).includes('CHỈ JSON'));
 }finally{f.close()}
});

test('R1-02 durable queued outline resumes after database/job-store reopen',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'content-r102-')),file=join(dir,'studio.sqlite');
 let db,store;try{
  db=openProjectDb(file);let repo=new StudioRepository(db),ch=repo.createChannel({name:'Archive'}),video=repo.createVideo(ch.id,{title:'Video'});
  db.prepare("INSERT INTO provider_accounts(id,provider_id,name,created_at,updated_at) VALUES('a','ollama','Ollama',1,1)").run();
  db.prepare("INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,created_at,updated_at) VALUES('m','a','qwen-local','llm','local','local',1,1)").run();
  new ContentBriefRepository(repo).save(video.id,{expectedRevision:0,brief:brief()});
  store=new JobStore({path:file,leaseMs:1000,baseBackoffMs:0});
  const svc=new ContentOutlineRepository(repo,{store});const run=svc.requestRun(video.id,{briefRevision:1,expectedOutlineRevision:0,modelId:'m',requestKey:'restart-1'});
  store.close();db.close();db=null;store=null;
  // Restart creates a new JobStore and domain repository against the same WAL.
  db=openProjectDb(file);repo=new StudioRepository(db);store=new JobStore({path:file,leaseMs:1000,baseBackoffMs:0});
  const resumed=new ContentOutlineRepository(repo,{store});assert.equal(resumed.getRun(video.id,run.id).status,'queued');
  const runner=new JobRunner(store,{'content:outline':createOutlineJobHandler({repo,store,generateLocal:async()=>proposal()})},{pollMs:10,heartbeatMs:100});
  runner.start();await runner.waitForIdle({timeoutMs:4000});await runner.stop();
  assert.equal(resumed.getRun(video.id,run.id).status,'generated');
  assert.equal(resumed.requestRun(video.id,{briefRevision:1,expectedOutlineRevision:0,modelId:'m',requestKey:'restart-1'}).jobId,run.jobId);
  assert.equal(store.list({}).length,1);
 }finally{try{store?.close()}catch{}try{db?.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});

test('R1-02 Ollama adapter JSON-only output uses fixed local URL and propagates abort',async()=>{
 const f=fixture();try{
  const run=f.svc.requestRun(f.video.id,{briefRevision:1,expectedOutlineRevision:0,modelId:'m',requestKey:'test-http'});
  let seen;
  const handler=createOutlineJobHandler({repo:f.repo,store:f.store,endpoint:'http://127.0.0.1:11434',fetchImpl:async(url,opts)=>{
    seen={url,opts};return {ok:true,text:async()=>JSON.stringify({response:JSON.stringify(proposal())})};
  }});
  const result=await handler({runId:run.id});assert.equal(result.result.outline.chapters.length,5);
  assert.equal(seen.url,'http://127.0.0.1:11434/api/generate');
  const body=JSON.parse(seen.opts.body);assert.equal(body.model,'local-qwen');assert.equal(body.stream,false);
  assert.ok(!Object.keys(body).includes('apiKey'));
 }finally{f.close()}
});
