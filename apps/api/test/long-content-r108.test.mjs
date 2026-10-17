/**
 * R1-08 regression acceptance. No live AI or paid provider requests.
 * Real queue+repositories, mock generation. Hardware/browser inference cannot
 * be inferred from this test passing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runLongFormRehearsal} from '../../../tools/r108-long-form-rehearsal.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {createLlmDispatcher} from '../src/llm-dispatch.mjs';
import {openProjectDb,PaidPolicyRepository} from '../../../packages/core/src/index.mjs';

test('R1-08: 35m/5 chapters/3 model DAG finishes with retry, stored draft and explicit master approval',async()=>{
 const report=await runLongFormRehearsal();
 assert.equal(report.jobCount,15);assert.equal(report.successfulJobs,15);
 assert.equal(report.failedJobs,0);assert.equal(report.totalAttempts,16);
 assert.equal(report.transientFailureInjected,true);
 assert.ok(report.maxObservedConcurrentCalls>=2&&report.maxObservedConcurrentCalls<=3);
 assert.equal(report.master.wordCount,5075);
 assert.equal(report.master.approvalRecorded,true);
 assert.equal(report.repeatedRequestCreatedJobs,false);
 assert.equal(report.contentAudit.models.length,3);
 for(const m of report.contentAudit.models){assert.equal(m.readiness,'METRIC_CHECKS_PASS');assert.equal(m.estimatedMinutes,35)}
 assert.equal(report.providerCalls.paid,0);
 assert.equal(report.providerCalls.external,0);
 assert.equal(report.contentAudit.semanticQualityVerified,false);
 assert.equal(report.contentAudit.ttsDurationVerified,false);
});

test('R1-08 same 15-job pipeline completes without fault injection or duplicate work',async()=>{
 const r=await runLongFormRehearsal({injectTransientError:false});
 assert.equal(r.totalAttempts,15);assert.equal(r.jobCount,15);
 assert.equal(r.transientFailureInjected,false);
});

test('R1-08 target 30 and 40 minutes use 4,350 and 5,800 words, respectively',async()=>{
 for(const minutes of [30,40]){
  const r=await runLongFormRehearsal({durationMinutes:minutes,injectTransientError:false});
  assert.equal(r.simulatedVideoMinutes,minutes);
  assert.equal(r.master.wordCount,minutes*145);
  assert.ok(r.contentAudit.models.every(m=>m.estimatedMinutes===minutes));
 }
 await assert.rejects(runLongFormRehearsal({durationMinutes:0}),/REHEARSAL_DURATION_UNSUPPORTED/);
});

test('R1-08 persistent job recovery fences a crashed lease across database reopen',()=>{
 const dir=mkdtempSync(join(tmpdir(),'r108-')),path=join(dir,'queue.db');
 let instant=100000;
 try{
  let q=new JobStore({path,clock:()=>instant,leaseMs:200,baseBackoffMs:0});
  const completed=q.enqueue({key:'immutable',kind:'content:chapter',payload:{model:'mock'}}).job;
  let claimed=q.claim('worker-before-restart');
  assert.equal(claimed.id,completed.id);
  assert.equal(q.complete(claimed.id,claimed.lease_token,{result:{text:'committed'}}),true);
  const abandoned=q.enqueue({key:'recoverable',kind:'content:chapter',payload:{model:'mock',chapterIndex:1},deps:[completed.id]}).job;
  claimed=q.claim('dead-worker');assert.equal(claimed.id,abandoned.id);
  const staleToken=claimed.lease_token;q.close();
  instant+=201;
  q=new JobStore({path,clock:()=>instant,leaseMs:200,baseBackoffMs:0});
  try{
   assert.equal(q.recoverExpired(),1);
   const recovered=q.claim('worker-after-restart');
   assert.equal(recovered.id,abandoned.id);
   assert.equal(q.complete(abandoned.id,staleToken,{result:{text:'should reject'}}),false);
   assert.equal(q.complete(recovered.id,recovered.lease_token,{result:{text:'committed after restart'}}),true);
   assert.equal(q.get(completed.id).attempt,1);
   assert.equal(q.get(abandoned.id).attempt,2);
   assert.equal(q.countByStatus().succeeded,2);
   assert.equal(q.list({}).length,2);
  }finally{q.close()}
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('R1-08 replay regression: free quota exhausted and no eligible fallback performs zero HTTP calls',async()=>{
 const db=openProjectDb();let calls=0;
 try{
  db.prepare("INSERT INTO provider_accounts(id,provider_id,name,credential_id,created_at,updated_at) VALUES('a','groq','free acct','cred_a',1,1)").run();
  db.prepare(`INSERT INTO provider_models (id,account_id,model_id,kind,location,cost_tier,quota_source,quota_limit,quota_used,created_at,updated_at)
     VALUES('m','a','mock-model','llm','remote','free_unverified','estimated',100,100,1,1)`).run();
  const model=db.prepare(`SELECT m.*,a.provider_id,a.status account_status FROM provider_models m JOIN provider_accounts a ON a.id=m.account_id WHERE m.id='m'`).get();
  const job={id:'r108_test_job',status:'running',payload:{providerModelId:'m',providerAccountId:'a'}};
  const store={get:id=>id===job.id?job:null};
  const paidPolicy=new PaidPolicyRepository(db,{jobLookup:id=>store.get(id)});
  const dispatcher=createLlmDispatcher({db,store,paidPolicy,allowRemote:true,confirmedFreeModelIds:['m'],
    credentialAccess:{withCredential:async()=>{throw new Error('must not request key')}},
    fetchImpl:async()=>{calls++;throw new Error('must not fetch')},minIntervalMs:0});
  await assert.rejects(dispatcher.invoke({model,prompt:'Synthetic',task:'chapter',jobId:job.id}),e=>e.code==='LLM_QUOTA_EXHAUSTED');
  assert.equal(calls,0);
 }finally{db.close()}
});

test('R1-08 cost policy regression: paid selected but no approval = no HTTP or credential access',async()=>{
 const db=openProjectDb();let calls=0,keys=0;
 try{
  db.prepare("INSERT INTO provider_accounts(id,provider_id,name,credential_id,created_at,updated_at) VALUES('a','groq','paid acct','cred_a',1,1)").run();
  db.prepare(`INSERT INTO provider_models (id,account_id,model_id,kind,location,cost_tier,created_at,updated_at)
     VALUES('m','a','mock-model','llm','remote','paid',1,1)`).run();
  const model=db.prepare(`SELECT m.*,a.provider_id,a.status account_status FROM provider_models m JOIN provider_accounts a ON a.id=m.account_id WHERE m.id='m'`).get();
  const job={id:'r108_paid_job',status:'running',payload:{providerModelId:'m',providerAccountId:'a'}};
  const store={get:id=>id===job.id?job:null};
  const dispatcher=createLlmDispatcher({db,store,allowRemote:true,
    paidPolicy:new PaidPolicyRepository(db,{jobLookup:id=>store.get(id)}),
    verifiedCostCapsMicroUsd:{m:25000},
    credentialAccess:{async withCredential(_ref,fn){keys++;return fn('SAFE_MOCK_KEY')}},
    fetchImpl:async()=>{calls++;throw new Error('unapproved upstream call')},minIntervalMs:0});
  await assert.rejects(dispatcher.invoke({model,prompt:'Synthetic',task:'judge',jobId:job.id}),e=>e.code==='PAID_APPROVAL_REQUIRED');
  assert.equal(calls,0);assert.equal(keys,1);
 }finally{db.close()}
});
