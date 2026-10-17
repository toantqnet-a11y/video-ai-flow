/** R2-12: authorized read contracts and real remote LLM fallback telemetry. */
import test from 'node:test';import assert from 'node:assert/strict';
import {openProjectDb,ProviderAccountRepository,ProviderMonitorR212} from '../../../packages/core/src/index.mjs';
import {createLlmDispatcher} from '../src/llm-dispatch.mjs';
import {inspectIncomingRequest} from '../src/request-policy.mjs';
import {operationById} from '../../../packages/contracts/src/catalog.mjs';
const request=url=>({method:'GET',url,headers:{host:'127.0.0.1:4311'},rawHeaders:['host','127.0.0.1:4311'],socket:{remoteAddress:'127.0.0.1'}});
const gate={verifyTransport:()=>null};
test('R2-12 only declared GET limit query is allowed, no query credentials',()=>{
 for(const url of ['/api/providers/monitor','/api/providers/monitor?limit=20'])assert.equal(inspectIncomingRequest(request(url),{port:4311,gate}),null);
 for(const url of ['/api/providers/monitor?api_key=SECRET','/api/providers/monitor?billing=true'])assert.notEqual(inspectIncomingRequest(request(url),{port:4311,gate}),null);
 assert.equal(operationById.get('getProviderMonitoring')?.method,'GET');
});
test('successful fallback after retryable 429 logs one verified-equivalent switch; dry-run and paid not implicated',async()=>{
 const db=openProjectDb();try{
  const p=new ProviderAccountRepository(db);const a=p.createAccount({providerId:'groq',name:'primary',credentialId:'test-key-a'}),b=p.createAccount({providerId:'groq',name:'backup',credentialId:'test-key-b'});
  const first=p.createModel(a.id,{modelId:'same-llama',kind:'llm'}),second=p.createModel(b.id,{modelId:'same-llama',kind:'llm'});
  const monitor=new ProviderMonitorR212(db);
  let calls=0;
  const store={get:id=>({id,status:'running',payload:{providerModelId:first.id,providerAccountId:a.id}})};
  const policy={list:()=>[],reserve:()=>{throw Error('no paid calls')}};
  const access={withCredential:async(_ref,cb)=>cb('fake_secret')};
  const fetchImpl=async()=>{calls++;return calls===1?{ok:false,status:429,headers:{get:()=>null}}:
    {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{content:'{"chapters":[]}'}}],usage:{total_tokens:13}})}};
  const dispatcher=createLlmDispatcher({db,store,paidPolicy:policy,credentialAccess:access,fetchImpl,
    allowRemote:true,confirmedFreeModelIds:[first.id,second.id],minIntervalMs:0});
  assert.equal(monitor.snapshot().switches.length,0);
  const dbModel=db.prepare(`SELECT m.*,a.provider_id,a.status account_status FROM provider_models m JOIN provider_accounts a ON m.account_id=a.id WHERE m.id=?`).get(first.id);
  const output=await dispatcher.invoke({model:dbModel,prompt:'Local test no real API',task:'chapter',jobId:'job_0000000001'});
  assert.deepEqual(output,{chapters:[]});assert.equal(calls,2);
  const s=monitor.snapshot().switches;assert.equal(s.length,1);assert.equal(s[0].fromModelId,first.id);
  assert.equal(s[0].toModelId,second.id);assert.equal(s[0].status,'succeeded');
 }finally{db.close()}
});
test('no unapproved provider switch happens with remote opt-out',async()=>{
 const db=openProjectDb();try{
  const p=new ProviderAccountRepository(db),a=p.createAccount({providerId:'groq',name:'primary'}),m=p.createModel(a.id,{modelId:'llama',kind:'llm'});
  const dbModel=db.prepare(`SELECT m.*,a.provider_id,a.status account_status FROM provider_models m JOIN provider_accounts a ON m.account_id=a.id WHERE m.id=?`).get(m.id);
  let fetches=0;const d=createLlmDispatcher({db,store:{get:()=>({status:'running',payload:{providerModelId:m.id,providerAccountId:a.id}})},
    credentialAccess:{withCredential:async(_ref,fn)=>fn('dummy')},paidPolicy:{list:()=>[]},allowRemote:false,
    fetchImpl:async()=>{fetches++;throw Error('should never fetch')}});
  await assert.rejects(d.invoke({model:dbModel,prompt:'P',task:'judge',jobId:'job_0000000001'}),e=>e.code==='REMOTE_CONSENT_REQUIRED');
  assert.equal(fetches,0);assert.equal(new ProviderMonitorR212(db).snapshot().switches.length,0);
 }finally{db.close()}
});
