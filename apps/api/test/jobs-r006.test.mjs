/** R0-06: real SQLite-backed queue API tests without external npm dependencies. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {createJobCenter,publicJob,publicJobEvent,jobEventFrame,validCursor} from '../src/job-center.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {createControllers} from '../src/controllers.mjs';
import {openProjectDb,StudioRepository} from '../../../packages/core/src/index.mjs';
import {inspectIncomingRequest} from '../src/request-policy.mjs';
import {operationById} from '../../../packages/contracts/src/catalog.mjs';

const SECRET='SUPER_SECRET_DO_NOT_LEAK';
function fixture(){
  const store=new JobStore();
  const jobCenter=createJobCenter(store);
  return {store,jobCenter,close:()=>store.close()};
}
function submitted(store,key='job-1'){
  return store.enqueue({key,kind:'asset:image',payload:{projectId:'project-1',sceneId:'scene-1',prompt:SECRET,
    token:SECRET,nested:{authorization:SECRET}},maxAttempts:2}).job;
}

test('safe projection strips payload, result, leases, worker and provider secrets',()=>{
  const f=fixture();try {
    const job=submitted(f.store);
    const claimed=f.store.claim('worker-secret');
    const body=JSON.stringify(f.jobCenter.get(job.id));
    assert(!body.includes(SECRET));assert(!body.includes('worker-secret'));
    assert(!body.includes('lease_token'));assert(!body.includes('payload'));
    assert.equal(f.jobCenter.get(job.id).sceneId,'scene-1');
    f.store.complete(claimed.id,claimed.lease_token,{result:{token:SECRET,content:SECRET}});
    assert(!JSON.stringify(f.jobCenter.get(job.id)).includes(SECRET));
  }finally{f.close()}
});

test('filter and limit are strict; status totals are durable',()=>{
  const f=fixture();try{
    submitted(f.store,'one');submitted(f.store,'two');
    assert.equal(f.jobCenter.list({status:'pending',limit:'1'}).items.length,1);
    assert.equal(f.jobCenter.list().counts.pending,2);
    for(const q of [{status:'secret'},{limit:'-1'},{limit:'10000'},{limit:'1.5'},{unsafe:'key'}])
      assert.throws(()=>f.jobCenter.list(q));
    assert.throws(()=>f.jobCenter.get('../unsafe'));
  }finally{f.close()}
});

test('state machine pause/resume/cancel and safe conflict',()=>{
  const f=fixture();try{
    const a=submitted(f.store,'alpha'),b=submitted(f.store,'beta');
    assert.equal(f.jobCenter.transition(a.id,'pause').status,'paused');
    assert.equal(f.jobCenter.transition(a.id,'resume').status,'pending');
    assert.equal(f.jobCenter.transition(a.id,'cancel').status,'cancelled');
    assert.throws(()=>f.jobCenter.transition(a.id,'retry'),e=>e.code==='JOB_STATE_CONFLICT');
    assert.throws(()=>f.jobCenter.transition('missing-id','cancel'),e=>e.code==='JOB_NOT_FOUND');
    assert.equal(f.jobCenter.get(b.id).status,'pending');
  }finally{f.close()}
});

test('events replay from durable cursor, sanitize detail, no duplicate cursor',()=>{
  const f=fixture();try{
    const a=submitted(f.store);
    const initial=f.jobCenter.events('0');assert.equal(initial.length,1);
    assert.equal(initial[0].jobId,a.id);
    f.store.emit(a.id,'payload',{errorCode:SECRET,accessToken:SECRET,attempt:5});
    const events=f.jobCenter.events(String(initial[0].seq));
    assert.equal(events.length,1);
    assert.deepEqual(events[0].detail,{attempt:5,errorCode:null});
    assert(!JSON.stringify(events).includes(SECRET));
    assert(!jobEventFrame(f.store.events({after:0})[1]).includes(SECRET));
    assert.equal(f.jobCenter.events(String(events[0].seq)).length,0);
    for(const input of ['-1','1e5','NaN','01',String(Number.MAX_SAFE_INTEGER+1)])
      assert.throws(()=>validCursor(input));
  }finally{f.close()}
});

test('HTTP adapter registers control/history routes, does not return prompt',async()=>{
  const db=openProjectDb(),repo=new StudioRepository(db),store=new JobStore();
  const controllers=createControllers({repo,store,registry:{list:()=>[]},manifest:{},vault:{list:async()=>[]}});
  const handlers=new Map();const app={};
  for(const verb of ['get','post','put','patch','delete'])app[verb]=(route,fn)=>handlers.set(`${verb} ${route}`,fn);
  registerStudioRoutes(app,{controllers,store});
  const invoke=async(verb,path,{params={},body,query,headers={}}={})=>{
    const reply={status:200,code(n){this.status=n;return this},send(v){return {status:this.status,body:v}}};
    const value=await handlers.get(`${verb} ${path}`)({params,body,query,headers,log:{warn(){}}},reply);
    return value?.status!==undefined&&value?.body!==undefined?value:{status:reply.status,body:value};
  };
  try {
    const job=submitted(store),id=job.id;
    const listing=await invoke('get','/api/jobs');
    assert.equal(listing.body.items.length,1);
    assert(!JSON.stringify(listing).includes(SECRET));
    const pause=await invoke('post','/api/jobs/:id/pause',{params:{id},body:{}});
    assert.equal(pause.body.status,'paused');
    const invalid=await invoke('post','/api/jobs/:id/resume',{params:{id},body:{arbitrary:SECRET}});
    assert.equal(invalid.status,400);
    assert.equal((await invoke('post','/api/jobs/:id/resume',{params:{id},body:{}})).body.status,'pending');
    const hist=await invoke('get','/api/jobs/events/history',{query:{after:'0',limit:'4'}});
    assert(hist.body.items.length>=2);
    assert(!JSON.stringify(hist).includes(SECRET));
  }finally{store.close();db.close()}
});

test('HTTP request policy allows only explicit job filter/cursor keys',()=>{
  const gate={verifyTransport:()=>null};
  function inspect(method,url){return inspectIncomingRequest({method,url,headers:{host:'127.0.0.1:4311'},rawHeaders:['Host','127.0.0.1:4311'],socket:{remoteAddress:'127.0.0.1'}},{port:4311,gate});}
  assert.equal(inspect('GET','/api/jobs?status=failed&limit=50'),null);
  assert.equal(inspect('GET','/api/jobs/events/history?after=12&limit=100'),null);
  assert.equal(inspect('GET','/api/jobs?token=SECRET'),'SECRET_IN_QUERY_FORBIDDEN');
  assert.equal(inspect('GET','/api/jobs?payload=x'),'QUERY_NOT_ALLOWED');
  assert.equal(inspect('GET','/api/jobs/events?after=20'),'QUERY_NOT_ALLOWED');
});

test('OpenAPI operations expose only safe public DTO and explicitly list writes',()=>{
  for(const op of ['listJobs','getJob','pauseJob','resumeJob','cancelJob','retryJob','listJobEvents','streamJobEvents'])
    assert(operationById.has(op),`missing operation ${op}`);
  const jobSchema=operationById.get('getJob').response.$ref;
  assert.match(jobSchema,/Job$/);
  assert(!JSON.stringify(operationById.get('getJob')).includes('apiKey'));
});

test('same durable SQLite queue resumes status and outbox cursor after reopen',async()=>{
  const {mkdtempSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'r006-queue-'));
  const path=join(dir,'studio.sqlite');
  let first=new JobStore({path});
  try{
    const job=submitted(first,'persistent');
    const before=createJobCenter(first).events('0');
    assert.equal(before.length,1);
    const cursor=before[0].seq;
    first.close();first=null;
    const second=new JobStore({path});
    try{
      assert.equal(createJobCenter(second).get(job.id).status,'pending');
      assert.equal(createJobCenter(second).events(String(cursor)).length,0);
      createJobCenter(second).transition(job.id,'pause');
      assert.equal(createJobCenter(second).events(String(cursor)).length,1);
    }finally{second.close()}
  }finally{if(first)first.close();rmSync(dir,{recursive:true,force:true})}
});

test('enqueue response is sanitized even when a scene contains confidential script',()=>{
  const db=openProjectDb(),repo=new StudioRepository(db),store=new JobStore();
  const controllers=createControllers({repo,store,registry:{list:()=>[]},manifest:{}});
  try{
    const channel=repo.createChannel({name:'Safe queue'});
    const video=repo.createVideo(channel.id,{title:'Script'});
    const scene=repo.replaceScenes(video.id,{rowVersion:video.rowVersion,scenes:[{text:SECRET,durationMs:2000}]})[0];
    const queued=controllers.queueAsset(scene.id,{kind:'voice',remoteConsent:true,idempotencyKey:'safetest'});
    assert.equal(queued.job.kind,'asset:voice');
    assert(!JSON.stringify(queued).includes(SECRET));
    assert.equal(store.get(queued.job.id).payload.text,SECRET); // private, server-side only
  }finally{store.close();db.close()}
});
