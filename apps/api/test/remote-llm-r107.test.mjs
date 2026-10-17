/** R1-07: No paid/remote request may be dispatched without backend policy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,ContentBriefRepository,ContentOutlineRepository,ChapterGenerationRepository,PaidPolicyRepository} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {invokeOfficialLlm,createLlmDispatcher} from '../src/llm-dispatch.mjs';
import {createChapterJobHandler} from '../src/chapter-generation.mjs';

const fakeResponse=(json,status=200)=>({ok:status>=200&&status<300,status,
  headers:{get:()=>null},text:async()=>JSON.stringify(json)});
const jsonText='{"text":"'+'Kiến thức khoa học về Việt Nam, ví dụ trực quan và thực tế phù hợp người xem. '.repeat(4)+'","summary":"Tóm tắt chương trước đã đủ ngữ cảnh cho chương sau."}';
const responseFor=(provider,text=jsonText,usage=71)=>provider==='gemini'
 ?fakeResponse({candidates:[{content:{parts:[{text}]}}],usageMetadata:{totalTokenCount:usage}})
 :fakeResponse({choices:[{message:{content:text}}],usage:{total_tokens:usage}});

const makeFixture=()=>{
 const db=openProjectDb(),repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'Test remote providers'}),video=repo.createVideo(channel.id,{title:'Video thử nghiệm'});
 const models=[];
 function add(providerId,{id,accountId=`account_${id}`,name='test-model',tier='free_unverified',credentialId=`key_${id}`,used=0,limit=null,quotaSource='unknown'}={}){
  db.prepare(`INSERT INTO provider_accounts(id,provider_id,name,credential_id,created_at,updated_at)
    VALUES(?,?,?,?,1,1)`).run(accountId,providerId,`Account ${id}`,credentialId);
  db.prepare(`INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,quota_source,quota_limit,quota_used,
    created_at,updated_at) VALUES(?,?,?,'llm','remote',?,?,?,?,1,1)`)
    .run(id,accountId,name,tier,quotaSource,limit,used);
  const row=db.prepare(`SELECT m.*,a.provider_id,a.status AS account_status FROM provider_models m
      JOIN provider_accounts a ON a.id=m.account_id WHERE m.id=?`).get(id);
  models.push(row);return row;
 }
 const jobs=new Map();
 const store={get:id=>jobs.get(id),add:(model,id='job_123456789')=>{
   const job={id,status:'running',payload:{providerAccountId:model.account_id,providerModelId:model.id}};
   jobs.set(id,job);return job;
 }};
 const credentialCalls=[];
 const credentialAccess={async withCredential(ref,fn){credentialCalls.push(ref);assert.equal(ref.providerId,db.prepare('SELECT provider_id FROM provider_accounts WHERE credential_id=?').get(ref.credentialId)?.provider_id);return fn('TOPSECRET_VAULT_KEY')}};
 const policy=new PaidPolicyRepository(db,{jobLookup:id=>store.get(id)});
 return {db,repo,video,store,policy,add,models,credentialAccess,credentialCalls,close:()=>db.close()};
};

test('R1-07 official Gemini/Groq/OpenRouter endpoints use credential headers only and strict JSON outputs',async()=>{
 for(const provider of ['gemini','groq','openrouter']){
  let url,headers,options;
  const result=await invokeOfficialLlm({providerId:provider,modelId:'test/model:free',prompt:'Kiểm thử JSON',apiKey:'PRIVATE',
    fetchImpl:async(u,o)=>{url=u;headers=o.headers;options=o;return responseFor(provider)}});
  assert.equal(typeof result.result.text,'string');assert.equal(result.units,71);
  assert.equal(new URL(url).protocol,'https:');assert.equal(options.redirect,'error');
  assert.equal(url.includes('PRIVATE'),false);
  assert.equal(provider==='gemini',headers['x-goog-api-key']==='PRIVATE');
  assert.equal(provider!=='gemini',headers.authorization==='Bearer PRIVATE');
  assert.ok(!url.includes('localhost'));
 }
});

test('R1-07 official adapters never follow redirected endpoints or echo upstream auth/errors',async()=>{
 const errors=[];
 for(const status of [401,403,429,502]){
  await assert.rejects(invokeOfficialLlm({providerId:'groq',modelId:'llama',prompt:'P',apiKey:'my_secret',
    fetchImpl:async()=>fakeResponse({error:'my_secret was used'},status)}),e=>{
      errors.push(e.code);return !e.message.includes('my_secret')&&e.retryable===(status===429||status>=500);
    });
 }
 assert.deepEqual(errors,['LLM_UPSTREAM_REJECTED','LLM_UPSTREAM_REJECTED','LLM_RATE_LIMIT','LLM_UPSTREAM_TRANSIENT']);
});

test('R1-07 strict bounded response and no invented successful completion',async()=>{
 await assert.rejects(invokeOfficialLlm({providerId:'gemini',modelId:'gemini-x',prompt:'P',apiKey:'SECRET',
    fetchImpl:async()=>responseFor('gemini','text that is not JSON')}),e=>e.code==='LLM_OUTPUT_INVALID');
 await assert.rejects(invokeOfficialLlm({providerId:'groq',modelId:'groq',prompt:'P',apiKey:'SECRET',
    fetchImpl:async()=>responseFor('groq','x'.repeat(150100))}),e=>e.code==='LLM_RESPONSE_TOO_LARGE');
 await assert.rejects(invokeOfficialLlm({providerId:'evil',modelId:'m',prompt:'P',apiKey:'SECRET',
    fetchImpl:async()=>{throw Error('never')}}),e=>e.code==='LLM_INVOCATION_INVALID');
});

test('R1-07 blocks remote calls without operator opt-in, regardless of model free metadata',async()=>{
 const f=makeFixture();try{
  const model=f.add('groq',{id:'groq_model_001'}),job=f.store.add(model);let calls=0;
  const fetchImpl=async()=>{calls++;return responseFor('groq')};
  const base={db:f.db,store:f.store,credentialAccess:f.credentialAccess,paidPolicy:f.policy,fetchImpl};
  const input={model,prompt:'P',jobId:job.id,task:'chapter'};
  await assert.rejects(createLlmDispatcher({...base,confirmedFreeModelIds:[model.id]}).invoke(input),e=>e.code==='REMOTE_CONSENT_REQUIRED');
  await assert.rejects(createLlmDispatcher({...base,allowRemote:true}).invoke(input),e=>e.code==='FREE_TIER_NOT_VERIFIED');
  assert.equal(calls,0);assert.equal(f.credentialCalls.length,0);
 }finally{f.close()}
});

test('R1-07 successful confirmed-free call records usage with stable idempotency key',async()=>{
 const f=makeFixture();try{
  const model=f.add('gemini',{id:'gemini_model_001',name:'gemini-example',quotaSource:'estimated',limit:1000,used:100});
  const job=f.store.add(model);let calls=0;
  const dispatcher=createLlmDispatcher({db:f.db,store:f.store,credentialAccess:f.credentialAccess,paidPolicy:f.policy,
    allowRemote:true,confirmedFreeModelIds:[model.id],quotaReservationUnitsByModel:{[model.id]:100},minIntervalMs:0,fetchImpl:async()=>{calls++;return responseFor('gemini')}});
  const params={model,prompt:'Kiểm thử',task:'chapter',jobId:job.id};
  assert.equal((await dispatcher.invoke(params)).text.length>100,true);
  // R2-08: a repeated queue attempt cannot trigger a second remote dispatch.
  await assert.rejects(dispatcher.invoke(params),e=>e.code==='QUOTA_INVOCATION_ALREADY_RESERVED');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM provider_usage_events').get().n,1);
  assert.equal(f.db.prepare('SELECT quota_used FROM provider_models WHERE id=?').get(model.id).quota_used,171);
  assert.equal(calls,1);
 }finally{f.close()}
});

test('R1-07 free fallback is same provider+actual model only and requires its own allowlist entry',async()=>{
 const f=makeFixture();try{
  const a=f.add('groq',{id:'groq_model_001',name:'llama-3.3'});
  const b=f.add('groq',{id:'groq_model_002',name:'llama-3.3'});
  f.store.add(a);let calls=0;
  const dispatcher=createLlmDispatcher({db:f.db,store:f.store,credentialAccess:f.credentialAccess,paidPolicy:f.policy,
    allowRemote:true,confirmedFreeModelIds:[a.id,b.id],minIntervalMs:0,
    fetchImpl:async()=>{calls++;return calls===1?fakeResponse({error:'too many'},429):responseFor('groq')}});
  const result=await dispatcher.invoke({model:a,prompt:'P',task:'chapter',jobId:'job_123456789'});
  assert.equal(result.text.length>100,true);assert.equal(calls,2);
  assert.equal(f.db.prepare('SELECT model_id FROM provider_usage_events').get().model_id,b.id);
 }finally{f.close()}
});

test('R1-07 free fallback never crosses provider boundary or invokes model with no verified free access',async()=>{
 const f=makeFixture();try{
  const a=f.add('groq',{id:'groq_model_001',name:'same-model'});
  f.add('openrouter',{id:'other_model_001',name:'same-model'});
  f.add('groq',{id:'groq_model_002',name:'same-model'});
  f.store.add(a);let calls=0;
  const dispatcher=createLlmDispatcher({db:f.db,store:f.store,credentialAccess:f.credentialAccess,paidPolicy:f.policy,
    allowRemote:true,confirmedFreeModelIds:[a.id],minIntervalMs:0,
    fetchImpl:async()=>{calls++;return fakeResponse({error:'429'},429)}});
  await assert.rejects(dispatcher.invoke({model:a,prompt:'P',task:'chapter',jobId:'job_123456789'}),e=>e.code==='LLM_RATE_LIMIT');
  assert.equal(calls,1);
 }finally{f.close()}
});

test('R1-07 paid model requires verified estimate + job-scoped signed approval',async()=>{
 const f=makeFixture();try{
  const m=f.add('gemini',{id:'gemini_paid_001',name:'gemini-paid',tier:'paid'});
  const j=f.store.add(m);let calls=0;
  const base={db:f.db,store:f.store,credentialAccess:f.credentialAccess,paidPolicy:f.policy,
    allowRemote:true,minIntervalMs:0,fetchImpl:async()=>{calls++;return responseFor('gemini')}};
  const request={model:m,prompt:'P',task:'judge',jobId:j.id};
  await assert.rejects(createLlmDispatcher(base).invoke(request),e=>e.code==='LLM_PRICE_NOT_VERIFIED');
  const remote=createLlmDispatcher({...base,verifiedCostCapsMicroUsd:{[m.id]:100000}});
  await assert.rejects(remote.invoke(request),e=>e.code==='PAID_APPROVAL_REQUIRED');
  assert.equal(calls,0);
  const approved=f.policy.approve({jobId:j.id,accountId:m.account_id,modelId:m.id,maxUsd:0.20,
    perCallMaxUsd:0.12,expiresMinutes:5,confirmation:'AUTHORIZE_PAID_USAGE'});
  assert.equal(approved.status,'approved');
  assert.equal((await remote.invoke(request)).text.length>100,true);
  assert.equal(calls,1);
  assert.equal(f.db.prepare('SELECT status FROM paid_invocations').get().status,'settled');
  await assert.rejects(remote.invoke(request),e=>e.code==='PAID_INVOCATION_ALREADY_RESERVED');
  assert.equal(calls,1);
 }finally{f.close()}
});

test('R1-07 paid 429/timeout cannot silently re-dispatch and budget remains reserved',async()=>{
 const f=makeFixture();try{
  const m=f.add('gemini',{id:'gemini_paid_001',name:'gemini-paid',tier:'paid'}),j=f.store.add(m);
  f.policy.approve({jobId:j.id,accountId:m.account_id,modelId:m.id,maxUsd:0.30,perCallMaxUsd:0.20,
    expiresMinutes:5,confirmation:'AUTHORIZE_PAID_USAGE'});
  let calls=0;const dispatcher=createLlmDispatcher({db:f.db,store:f.store,credentialAccess:f.credentialAccess,
    paidPolicy:f.policy,allowRemote:true,minIntervalMs:0,verifiedCostCapsMicroUsd:{[m.id]:150000},
    fetchImpl:async()=>{calls++;return fakeResponse({error:'outage'},502)}});
  const input={model:m,prompt:'P',jobId:j.id,task:'outline'};
  await assert.rejects(dispatcher.invoke(input),e=>e.code==='LLM_UPSTREAM_TRANSIENT');
  assert.equal(f.db.prepare('SELECT status FROM paid_invocations').get().status,'uncertain');
  await assert.rejects(dispatcher.invoke(input),e=>e.code==='PAID_INVOCATION_ALREADY_RESERVED');
  assert.equal(calls,1);
  assert.equal(f.policy.list(j.id)[0].reservedUsd,0.15);
 }finally{f.close()}
});

test('R1-07 paid auth is rejected when queue job account/model does not match metadata',async()=>{
 const f=makeFixture();try{
  const m=f.add('gemini',{id:'gemini_paid_001',tier:'paid'});
  const j=f.store.add(m);j.payload.providerAccountId='different_account';
  const dispatcher=createLlmDispatcher({db:f.db,store:f.store,credentialAccess:f.credentialAccess,paidPolicy:f.policy,
    allowRemote:true,verifiedCostCapsMicroUsd:{[m.id]:10000}});
  await assert.rejects(dispatcher.invoke({model:m,prompt:'P',jobId:j.id,task:'chapter'}),e=>e.code==='LLM_JOB_SCOPE_INVALID');
 }finally{f.close()}
});

test('R1-07 chapter worker runs remote adapter and commits immutable result through SP-04 queue',async()=>{
 // This integration uses the actual chapter worker plus a policy-bound remote
 // dispatcher with stubbed upstream HTTP; no model/network billing is implied.
 const db=openProjectDb(),repo=new StudioRepository(db);
 const ch=repo.createChannel({name:'R1-07'}),v=repo.createVideo(ch.id,{title:'Remote generation'});
 db.prepare("INSERT INTO provider_accounts(id,provider_id,name,credential_id,created_at,updated_at) VALUES('remote_account','groq','Groq','remote_credential',1,1)").run();
 db.prepare("INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,created_at,updated_at) VALUES('remote_model','remote_account','llama-example','llm','remote','free_unverified',1,1)").run();
 const briefs=new ContentBriefRepository(repo),outlines=new ContentOutlineRepository(repo);
 briefs.save(v.id,{expectedRevision:0,brief:{topic:'Công nghệ',idea:'Giải thích',modelIds:['remote_model'],target:{mode:'words',durationMinutes:30,wordCount:600,wpm:145,chapterTargetWords:600}}});
 outlines.save(v.id,{expectedRevision:0,outline:{chapters:[{id:'chapter_001',title:'Chương đầu',objective:'Tìm hiểu kiến thức',targetWords:600,keyPoints:['Giải thích']} ]}});
 const store=new JobStore({path:':memory:',leaseMs:1000,baseBackoffMs:1});
 // Check immutable projection and worker remote delegation with a fake API response.
 try{
  const generation=new ChapterGenerationRepository(repo,{store,allowRemoteModels:true});
  const batch=generation.requestBatch(v.id,{briefRevision:1,outlineRevision:1,modelIds:['remote_model'],requestKey:'remote_gen_01'});
  let requested=0;
  const remoteDispatcher={invoke:async ({model,task,jobId})=>{assert.equal(model.provider_id,'groq');assert.equal(task,'chapter');assert.equal(typeof jobId,'string');requested++;return JSON.parse(jsonText)}};
  const runner=new JobRunner(store,{'content:chapter':createChapterJobHandler({repo,store,remoteDispatcher})},{pollMs:5,heartbeatMs:100});
  runner.start();await runner.waitForIdle({timeoutMs:8000});await runner.stop();
  assert.equal(generation.batch(v.id,batch.id).counts.succeeded,1);assert.equal(requested,1);
 }finally{store.close();db.close()}
});

test('R1-07 quota-exhausted primary skips to confirmed eligible equivalent account',async()=>{
 const f=makeFixture();try{
  const a=f.add('groq',{id:'groq_model_001',name:'same-model',quotaSource:'estimated',used:100,limit:100});
  const b=f.add('groq',{id:'groq_model_002',name:'same-model'});f.store.add(a);let count=0;
  const dispatcher=createLlmDispatcher({db:f.db,store:f.store,credentialAccess:f.credentialAccess,
    paidPolicy:f.policy,allowRemote:true,confirmedFreeModelIds:[a.id,b.id],minIntervalMs:0,
    fetchImpl:async()=>{count++;return responseFor('groq')}});
  const output=await dispatcher.invoke({model:a,prompt:'P',task:'chapter',jobId:'job_123456789'});
  assert.ok(output.text);assert.equal(count,1);
  assert.equal(f.db.prepare('SELECT model_id FROM provider_usage_events').get().model_id,b.id);
 }finally{f.close()}
});

test('R1-07 dispatched job rejects model/account disabled or cost tier rewritten after enqueue',async()=>{
 const f=makeFixture();try{
  const m=f.add('groq',{id:'groq_model_001'}),j=f.store.add(m);
  const broker=createLlmDispatcher({db:f.db,store:f.store,credentialAccess:f.credentialAccess,
    paidPolicy:f.policy,allowRemote:true,confirmedFreeModelIds:[m.id]});
  f.db.prepare("UPDATE provider_models SET cost_tier='paid' WHERE id=?").run(m.id);
  await assert.rejects(broker.invoke({model:m,prompt:'P',task:'judge',jobId:j.id}),e=>e.code==='LLM_MODEL_CHANGED');
 }finally{f.close()}
});

test('R1-07 complete remote-model pipeline: outline -> chapters -> judge -> retry, source immutable',async()=>{
 const {ContentEvaluationRepository,ContentRetryRepository}=await import('../../../packages/core/src/index.mjs');
 const {createOutlineJobHandler}=await import('../src/outline-generation.mjs');
 const {createEvaluationJobHandler}=await import('../src/content-evaluation.mjs');
 const {createContentRetryJobHandler}=await import('../src/content-retry.mjs');
 const db=openProjectDb(),repo=new StudioRepository(db),ch=repo.createChannel({name:'ContentStudio E2E'}),
  video=repo.createVideo(ch.id,{title:'Production rehearsal'});
 const store=new JobStore({path:':memory:',leaseMs:1500,baseBackoffMs:0});
 try{
  db.prepare("INSERT INTO provider_accounts(id,provider_id,name,created_at,updated_at) VALUES('account_remote','groq','Groq',1,1)").run();
  db.prepare("INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,created_at,updated_at) VALUES('model_remote','account_remote','llama-example','llm','remote','free_unverified',1,1)").run();
  const briefs=new ContentBriefRepository(repo),outlines=new ContentOutlineRepository(repo,{store,allowRemoteModels:true}),
    chapters=new ChapterGenerationRepository(repo,{store,allowRemoteModels:true}),
    evaluations=new ContentEvaluationRepository(repo,{store,allowRemoteModels:true}),
    retries=new ContentRetryRepository(repo,{store,allowRemoteModels:true});
  briefs.save(video.id,{expectedRevision:0,brief:{topic:'Sinh học đại cương',idea:'Giải thích cho người mới',
    modelIds:['model_remote'],target:{mode:'words',durationMinutes:30,wordCount:600,wpm:140,chapterTargetWords:600}}});
  const resultFor={
    outline:{chapters:[{title:'Giới thiệu sinh học',objective:'Dễ hiểu',keyPoints:['Vòng đời'],targetWords:600}]},
    chapter:JSON.parse(jsonText),
    judge:{criteria:{
      coherence:{score:8,feedback:'Bố cục khá rõ ràng'},accuracy:{score:7,feedback:'Một số nguồn cần xác minh'},
      style:{score:8,feedback:'Dễ tiếp thu cho người nghe'},engagement:{score:8,feedback:'Cách kể rất thu hút'},
      completeness:{score:8,feedback:'Đề cập đủ các ý chính'}},
      feedback:'Nội dung tương đối tốt, cần bổ sung nhiều ví dụ minh họa.',
      suggestions:['Bổ sung ví dụ sinh học cụ thể để người nghe dễ hình dung']},
    retry:JSON.parse(jsonText)
  };
  const observed=[];
  const remoteDispatcher={invoke:async ({model,prompt,task,jobId,attempt})=>{
    assert.equal(model.provider_id,'groq');assert.equal(typeof jobId,'string');assert.ok(prompt.length>80);
    observed.push({task,jobId,attempt});return resultFor[task];
  }};
  const handlerOptions={repo,store,remoteDispatcher};
  const handlers={
    'content:outline':createOutlineJobHandler(handlerOptions),
    'content:chapter':createChapterJobHandler(handlerOptions),
    'content:evaluate':createEvaluationJobHandler(handlerOptions),
    'content:retry':createContentRetryJobHandler(handlerOptions)
  };
  async function run(){const runner=new JobRunner(store,handlers,{concurrency:2,pollMs:5,heartbeatMs:100});
    runner.start();await runner.waitForIdle({timeoutMs:8000});await runner.stop()}
  const outlineRun=outlines.requestRun(video.id,{briefRevision:1,expectedOutlineRevision:0,
    modelId:'model_remote',requestKey:'outline_remote_001'});
  assert.equal(store.get(outlineRun.jobId).payload.providerAccountId,'account_remote');
  await run();assert.equal(outlines.getRun(video.id,outlineRun.id).status,'generated');
  outlines.acceptRun(video.id,outlineRun.id,{expectedRevision:0});
  const batch=chapters.requestBatch(video.id,{briefRevision:1,outlineRevision:1,
    modelIds:['model_remote'],requestKey:'chapter_remote_001'});
  await run();const variant=chapters.batch(video.id,batch.id).results[0].variantId;
  assert.ok(variant);
  const evalRun=evaluations.request(video.id,variant,{evaluatorModelId:'model_remote',requestKey:'judge_remote_001'});
  await run();assert.equal(evaluations.get(video.id,variant,evalRun.id).result.total>70,true);
  const retryRun=retries.request(video.id,variant,{evaluationId:evalRun.id,modelId:'model_remote',
    requestKey:'retry_remote_001',feedback:'Thêm ví dụ sinh học sinh động cho chương này.'});
  await run();assert.equal(retries.get(video.id,variant,retryRun.id).status,'succeeded');
  assert.equal(repo.getVideo(video.id).masterScript,'');
  assert.deepEqual(observed.map(x=>x.task),['outline','chapter','judge','retry']);
 }finally{store.close();db.close()}
});

test('R1-07 free account cannot be accidentally billed through an editable display label',async()=>{
 const f=makeFixture();try{
  const m=f.add('groq',{id:'groq_model_001',tier:'free_unverified'});const j=f.store.add(m);let calls=0;
  const dispatcher=createLlmDispatcher({db:f.db,store:f.store,credentialAccess:f.credentialAccess,
    paidPolicy:f.policy,allowRemote:true,confirmedFreeModelIds:['another_model'],minIntervalMs:0,
    fetchImpl:async()=>{calls++;return responseFor('groq')}});
  await assert.rejects(dispatcher.invoke({model:m,prompt:'P',task:'outline',jobId:j.id}),e=>e.code==='FREE_TIER_NOT_VERIFIED');
  assert.equal(calls,0);
 }finally{f.close()}
});

test('R1-07 locked Vault fails without reserving paid budget or contacting provider',async()=>{
 const f=makeFixture();try{
  const m=f.add('gemini',{id:'gemini_paid_001',tier:'paid'}),j=f.store.add(m);
  f.policy.approve({jobId:j.id,accountId:m.account_id,modelId:m.id,maxUsd:0.3,perCallMaxUsd:0.15,
    expiresMinutes:5,confirmation:'AUTHORIZE_PAID_USAGE'});
  let calls=0;const dispatcher=createLlmDispatcher({db:f.db,store:f.store,
    credentialAccess:{async withCredential(){throw Object.assign(new Error('VAULT_LOCKED'),{code:'VAULT_LOCKED'})}},
    paidPolicy:f.policy,allowRemote:true,minIntervalMs:0,verifiedCostCapsMicroUsd:{[m.id]:100000},
    fetchImpl:async()=>{calls++;return responseFor('gemini')}});
  await assert.rejects(dispatcher.invoke({model:m,prompt:'P',task:'chapter',jobId:j.id}),e=>e.code==='VAULT_LOCKED');
  assert.equal(calls,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM paid_invocations').get().n,0);
 }finally{f.close()}
});

test('R1-07 provider registry permits marking billed Groq/OpenRouter models as paid explicitly',async()=>{
 const {ProviderAccountRepository}=await import('../../../packages/core/src/provider-accounts.mjs');
 const db=openProjectDb();try{
  const registry=new ProviderAccountRepository(db);
  for(const providerId of ['groq','openrouter']){
    const a=registry.createAccount({providerId,name:`${providerId} paid plan`});
    const m=registry.createModel(a.id,{modelId:'paid-example',kind:'llm',costTier:'paid'});
    assert.equal(m.costTier,'paid');
  }
 }finally{db.close()}
});

test('R1-07 remote chapter jobs survive real SQLite + JobStore reopen before execution',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');
 const {join}=await import('node:path');
 const {tmpdir}=await import('node:os');
 const dir=mkdtempSync(join(tmpdir(),'content-r107-')),path=join(dir,'studio.sqlite');
 let db,store;
 try{
  db=openProjectDb(path);let repo=new StudioRepository(db),channel=repo.createChannel({name:'Long form'}),
    video=repo.createVideo(channel.id,{title:'R1-07 restart'});
  db.prepare("INSERT INTO provider_accounts(id,provider_id,name,credential_id,created_at,updated_at) VALUES('account_001','groq','Groq','cred_001',1,1)").run();
  db.prepare("INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,created_at,updated_at) VALUES('model_001','account_001','llama-example','llm','remote','free_unverified',1,1)").run();
  new ContentBriefRepository(repo).save(video.id,{expectedRevision:0,brief:{topic:'Khám phá',idea:'Kiến thức',modelIds:['model_001'],
    target:{mode:'words',wordCount:600,durationMinutes:30,wpm:145,chapterTargetWords:600}}});
  new ContentOutlineRepository(repo).save(video.id,{expectedRevision:0,outline:{chapters:[{
    title:'Một',objective:'Giới thiệu',keyPoints:['Lịch sử'],targetWords:600}]}});
  store=new JobStore({path,leaseMs:1200,baseBackoffMs:0});
  const service=new ChapterGenerationRepository(repo,{store,allowRemoteModels:true});
  const queued=service.requestBatch(video.id,{briefRevision:1,outlineRevision:1,modelIds:['model_001'],requestKey:'restart_case'});
  const jobId=queued.results[0].jobId;
  store.close();db.close();store=null;db=null;
  db=openProjectDb(path);repo=new StudioRepository(db);store=new JobStore({path,leaseMs:1200,baseBackoffMs:0});
  assert.equal(store.get(jobId).status,'pending');
  let actual=0;
  const handler=createChapterJobHandler({repo,store,remoteDispatcher:{invoke:async()=>{actual++;return JSON.parse(jsonText)}}});
  const runner=new JobRunner(store,{'content:chapter':handler},{pollMs:5,heartbeatMs:100});
  runner.start();await runner.waitForIdle({timeoutMs:5000});await runner.stop();
  const result=new ChapterGenerationRepository(repo,{store,allowRemoteModels:true}).batch(video.id,queued.id);
  assert.equal(result.counts.succeeded,1);assert.equal(actual,1);
  assert.equal(store.get(jobId).status,'succeeded');
 }finally{try{store?.close()}catch{}try{db?.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});
