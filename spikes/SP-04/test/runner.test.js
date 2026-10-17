import test from 'node:test';
import assert from 'node:assert/strict';
import { JobStore } from '../src/store.js';
import { JobRunner } from '../src/runner.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('100 durable jobs finish, concurrency capped, dependencies retained',async()=>{
  const s=new JobStore({leaseMs:900});
  try {
    const ids=[];let running=0;let peak=0;
    for(let i=0;i<100;i++){
      ids.push(s.enqueue({key:`batch:${i}`,kind:'mock',payload:{i},deps:i>=10?[ids[i-10]]:[]}).job.id);
    }
    const runner=new JobRunner(s,{mock:async ({i})=>{
      running++;peak=Math.max(peak,running);
      await sleep(3);running--;
      return {result:{i}};
    }},{concurrency:5,pollMs:2,heartbeatMs:100});
    runner.start();
    const counts=await runner.waitForIdle({timeoutMs:12000});
    await runner.stop();
    assert.equal(counts.succeeded,100);
    assert.ok(peak<=5 && peak>=2,`peak=${peak}`);
    assert.equal(s.db.prepare('SELECT count(*) n FROM attempts').get().n,100);
    assert.equal(s.events({after:0,limit:1000}).length,300);
  } finally {s.close();}
});

test('retry transient worker error without losing other successful jobs',async()=>{
  const s=new JobStore({leaseMs:500,baseBackoffMs:5});
  try {
    for(let i=0;i<10;i++) s.enqueue({key:`retry-batch:${i}`,kind:'sometimes',payload:{i}});
    const runner=new JobRunner(s,{sometimes:async (_payload,{attempt})=>{
      if(attempt===1) throw Object.assign(new Error('temporary'),{code:'TEMPORARY'});
      return {result:{done:true}};
    }},{concurrency:3,pollMs:2,heartbeatMs:60});
    runner.start();
    await runner.waitForIdle({timeoutMs:5000});await runner.stop();
    assert.equal(s.countByStatus().succeeded,10);
    assert.equal(s.db.prepare('SELECT count(*) n FROM attempts').get().n,20);
  } finally{s.close();}
});

test('aborted job is fenced even when handler ignores AbortSignal',async()=>{
  const s=new JobStore({leaseMs:500});
  try {
    const j=s.enqueue({key:'cancelled',kind:'sleep'}).job;
    const runner=new JobRunner(s,{sleep:async()=>{await sleep(120);return {result:'late'};}},{concurrency:1,pollMs:5,heartbeatMs:50});
    runner.start();
    const until=Date.now()+2000;
    while(!s.get(j.id).lease_token && Date.now()<until) await sleep(5);
    assert.equal(s.cancel(j.id),true);
    await runner.stop();
    assert.equal(s.get(j.id).status,'cancelled');
    assert.equal(s.get(j.id).result,null);
  } finally{s.close();}
});
