/** R2-08: guarded remote dispatcher with stub HTTP and a REAL SQLite ledger. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,QuotaLedgerRepository} from '../../../packages/core/src/index.mjs';
import {createLlmDispatcher} from '../src/llm-dispatch.mjs';
import {inspectIncomingRequest} from '../src/request-policy.mjs';

const jsonResult='{"chapters":[{"title":"Bài học","text":"Dữ liệu JSON hợp lệ"}]}';
const response=(units=12,status=200)=>({ok:status===200,status,headers:{get:()=>null},
 text:async()=>JSON.stringify({choices:[{message:{content:jsonResult}}],usage:units===null?undefined:{total_tokens:units}})});
const fixture=({used=0,limit=100,quota='estimated'}={})=>{
 const db=openProjectDb(),id='quota_model_01',jobId='quota_job_01';
 db.prepare(`INSERT INTO provider_accounts (id,provider_id,name,credential_id,created_at,updated_at)
  VALUES('quota_account','groq','Quota Test','vault_key_1',1,1)`).run();
 db.prepare(`INSERT INTO provider_models (id,account_id,model_id,kind,location,cost_tier,quota_source,quota_limit,quota_used,created_at,updated_at)
  VALUES (?, 'quota_account','llama-experimental','llm','remote','free_unverified',?,?,?,?,1)`).run(id,quota,quota==='unknown'?null:limit,quota==='unknown'?null:used,1);
 const model=db.prepare(`SELECT m.*,a.provider_id,a.status account_status FROM provider_models m JOIN provider_accounts a ON a.id=m.account_id WHERE m.id=?`).get(id);
 const store={get:()=>({id:jobId,status:'running',payload:{providerModelId:id,providerAccountId:'quota_account'}})};
 const access={withCredential:async (_ref,fn)=>fn('fake_in_memory_secret')};
 const paidPolicy={list:()=>[],reserve:()=>{throw new Error('paid request not allowed')}};
 return {db,id,jobId,model,store,access,paidPolicy,ledger:new QuotaLedgerRepository(db),close:()=>db.close()};
};
function dispatcher(f,fetchImpl,extra={}){
 return createLlmDispatcher({db:f.db,store:f.store,credentialAccess:f.access,paidPolicy:f.paidPolicy,
  allowRemote:true,confirmedFreeModelIds:[f.id],quotaReservationUnitsByModel:{[f.id]:30},
  minIntervalMs:0,fetchImpl,...extra});
}
const input=f=>({model:f.model,prompt:'Xin chào thế giới',task:'chapter',jobId:f.jobId,attempt:1});

test('configured estimated ceiling reserves before HTTP and settles reported usage',async()=>{
 const f=fixture({limit:80,used:10});let usedDuringCall,requests=0;
 try{
  const d=dispatcher(f,async()=>{
    requests++;usedDuringCall=f.ledger.snapshot(f.id);
    return response(12);
  });
  assert.equal((await d.invoke(input(f))).chapters.length,1);
  assert.equal(requests,1);
  assert.equal(usedDuringCall.pendingUnits,30);assert.equal(usedDuringCall.remainingUnits,40);
  assert.equal(f.ledger.snapshot(f.id).pendingUnits,0);
  assert.equal(f.ledger.snapshot(f.id).used,22);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM provider_usage_events').get().n,1);
 }finally{f.close()}
});

test('known limit with no operator-supplied reservation estimate fails before network',async()=>{
 const f=fixture();let requests=0;
 try{
  const d=dispatcher(f,async()=>{requests++;return response()}, {quotaReservationUnitsByModel:{}});
  await assert.rejects(d.invoke(input(f)),e=>e.code==='LLM_QUOTA_ESTIMATE_REQUIRED');
  assert.equal(requests,0);assert.equal(f.ledger.list(f.id).items.length,0);
 }finally{f.close()}
});

test('reservation cannot exceed a locally declared ceiling, provider never called',async()=>{
 const f=fixture({used:70,limit:90});let requests=0;
 try{
  const d=dispatcher(f,async()=>{requests++;return response()});
  await assert.rejects(d.invoke(input(f)),e=>e.code==='QUOTA_EXHAUSTED');
  assert.equal(requests,0);assert.equal(f.ledger.snapshot(f.id).pendingUnits,0);
 }finally{f.close()}
});

test('transport uncertainty retains quota hold and replay never calls remote twice',async()=>{
 const f=fixture({limit:30});let requests=0;
 try{
  const d=dispatcher(f,async()=>{requests++;throw new Error('upstream body could contain secret')});
  await assert.rejects(d.invoke(input(f)),e=>e.code==='LLM_TRANSPORT_UNCERTAIN');
  assert.equal(f.ledger.snapshot(f.id).remainingUnits,0);
  assert.equal(f.ledger.list(f.id).items[0].status,'uncertain');
  await assert.rejects(d.invoke(input(f)),e=>e.code==='LLM_QUOTA_EXHAUSTED');
  assert.equal(requests,1);
 }finally{f.close()}
});

test('success without provider usage count is uncertain and remains reserved',async()=>{
 const f=fixture({limit:40});let requests=0;
 try{
  const d=dispatcher(f,async()=>{requests++;return response(null)});
  assert.equal((await d.invoke(input(f))).chapters.length,1);
  assert.equal(requests,1);
  assert.equal(f.ledger.list(f.id).items[0].status,'uncertain');
  assert.equal(f.ledger.snapshot(f.id).remainingUnits,10);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM provider_usage_events').get().n,0);
 }finally{f.close()}
});

test('retries with distinct attempt ids still account separately if capacity remains',async()=>{
 const f=fixture({limit:100});let requests=0;
 try{
  const d=dispatcher(f,async()=>{requests++;return response(15)});
  await d.invoke(input(f));
  await assert.rejects(d.invoke(input(f)),e=>e.code==='QUOTA_INVOCATION_ALREADY_RESERVED');
  await d.invoke({...input(f),attempt:2});
  assert.equal(requests,2);
  assert.equal(f.ledger.snapshot(f.id).used,30);
  assert.equal(f.ledger.list(f.id).items.length,2);
 }finally{f.close()}
});

test('quota ledger URL security permits only limit and rejects secret query keys',()=>{
 const gate={verifyTransport:()=>null};
 const req=url=>({method:'GET',url,headers:{host:'127.0.0.1:4311'},rawHeaders:['host','127.0.0.1:4311'],socket:{remoteAddress:'127.0.0.1'}});
 assert.equal(inspectIncomingRequest(req('/api/provider-models/quota_model_01/quota-ledger?limit=50'),{port:4311,gate}),null);
 assert.equal(inspectIncomingRequest(req('/api/provider-models/quota_model_01/quota-ledger?api_key=secret'),{port:4311,gate}),'SECRET_IN_QUERY_FORBIDDEN');
 assert.equal(inspectIncomingRequest(req('/api/provider-models/quota_model_01/quota-ledger?other=1'),{port:4311,gate}),'QUERY_NOT_ALLOWED');
});
