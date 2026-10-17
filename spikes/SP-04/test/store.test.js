import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobStore } from '../src/store.js';

function fixture(fn) {
  const dir=mkdtempSync(join(tmpdir(),'sp04-store-'));
  let time=1_000_000;
  const path=join(dir,'queue.sqlite');
  const store=new JobStore({path,clock:()=>time,leaseMs:200,baseBackoffMs:50,maxBackoffMs:1000});
  return Promise.resolve().then(()=>fn({store,path,clock:()=>time,tick:n=>time+=n})).finally(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
}
const enqueue = (s,key,opts={})=>s.enqueue({key,kind:'tts',payload:{text:key},...opts}).job;

test('enqueues idempotently without silent payload mutation',()=>fixture(({store})=>{
  const a=enqueue(store,'one');
  const b=store.enqueue({key:'one',kind:'tts',payload:{text:'one'}});
  assert.equal(b.reused,true);
  assert.equal(a.id,b.job.id);
  assert.throws(()=>store.enqueue({key:'one',kind:'tts',payload:{text:'different'}}),/idempotency key conflict/);
  assert.equal(store.countByStatus().total,1);
  assert.equal(store.events().length,1);
}));

test('atomic dependency DAG scheduling and full event replay',()=>fixture(({store})=>{
  const a=enqueue(store,'a'); const b=enqueue(store,'b',{deps:[a.id]});
  const first=store.claim('worker1');
  assert.equal(first.id,a.id);
  assert.equal(store.claim('worker2'),null);
  assert.equal(store.complete(first.id,first.lease_token,{result:{ok:true}}),true);
  const second=store.claim('worker2');
  assert.equal(second.id,b.id);
  assert.equal(store.complete(second.id,second.lease_token,{result:{ok:true}}),true);
  const all=store.events({after:0});
  const firstHalf=store.events({after:0,limit:3});
  const remaining=store.events({after:firstHalf.at(-1).seq});
  assert.deepEqual([...firstHalf,...remaining].map(x=>x.seq),all.map(x=>x.seq));
  assert.deepEqual(all.map(x=>x.type),['queued','queued','started','succeeded','started','succeeded']);
  assert.equal(store.get(b.id).status,'succeeded');
}));

test('claim and stale completion are fenced by expiring lease and token',()=>fixture(({store,tick})=>{
  const a=enqueue(store,'lease');
  const old=store.claim('old');
  tick(201);
  assert.equal(store.heartbeat(old.id,old.lease_token),false);
  assert.equal(store.complete(old.id,old.lease_token,{result:1}),false);
  assert.equal(store.recoverExpired(),1);
  const current=store.claim('new');
  assert.equal(current.id,a.id);
  assert.notEqual(current.lease_token,old.lease_token);
  assert.equal(store.complete(a.id,old.lease_token,{result:1}),false);
  assert.equal(store.complete(a.id,current.lease_token,{result:2}),true);
  assert.equal(store.get(a.id).result,2);
  assert.equal(store.attempts(a.id).length,2);
}));

test('heartbeat renews live lease, outdated lease is rejected',()=>fixture(({store,tick})=>{
  const j=enqueue(store,'heartbeat'); const r=store.claim('worker');
  tick(100);assert.equal(store.heartbeat(j.id,r.lease_token),true);
  tick(150);assert.equal(store.complete(j.id,r.lease_token,{}),true);
  assert.equal(store.heartbeat(j.id,r.lease_token),false);
}));

test('immutable asset revision: stale/competing revision cannot be active',()=>fixture(({store})=>{
  const a=enqueue(store,'asset1');const b=enqueue(store,'asset2');
  const r1=store.claim('one'); const r2=store.claim('two');
  const asset={logicalKey:'project:scene1:image:hashABC',checksum:'a'.repeat(64),filePath:'/tmp/a.png'};
  assert.equal(store.complete(r1.id,r1.lease_token,{asset}),true);
  assert.throws(()=>store.complete(r2.id,r2.lease_token,{asset:{...asset,checksum:'b'.repeat(64)}}),/asset revision conflict/);
  assert.equal(store.get(r2.id).status,'running'); // whole transaction rolled back; claim order is ID-sorted, not enqueue order
  assert.equal(store.getAsset(asset.logicalKey).job_id,r1.id);
  assert.equal(store.complete(r2.id,r2.lease_token,{result:{skipped:true}}),true);
  assert.equal(store.db.prepare('SELECT count(*) n FROM assets').get().n,1);
}));

test('retry bounded exponential and terminal dependency propagation',()=>fixture(({store,tick})=>{
  const p=enqueue(store,'retry',{maxAttempts:3}); const c=enqueue(store,'child',{deps:[p.id]});
  const a=store.claim('w');
  assert.equal(store.fail(p.id,a.lease_token,{retryable:true,errorCode:'RATE_LIMIT'}),true);
  assert.equal(store.get(p.id).status,'pending');
  assert.equal(store.claim('w'),null);
  tick(50);
  const b=store.claim('w');
  assert.equal(store.fail(p.id,b.lease_token,{retryable:true,errorCode:'RATE_LIMIT'}),true);
  tick(100);
  const d=store.claim('w');
  assert.equal(store.fail(p.id,d.lease_token,{retryable:true,errorCode:'RATE_LIMIT'}),true);
  assert.equal(store.get(p.id).status,'failed');
  assert.equal(store.get(c.id).last_error,'DEPENDENCY_FAILED');
  assert.equal(store.attempts(p.id).length,3);
  assert.equal(store.retry(p.id),true);
  const e=store.claim('w');
  assert.equal(e.attempt,4);
  assert.equal(store.complete(p.id,e.lease_token,{}),true);
  assert.equal(store.retry(c.id),true);
  const f=store.claim('w');
  assert.equal(f.id,c.id);
}));

test('pause/resume/cancel invalidate running token and do not allow late commit',()=>fixture(({store})=>{
  const p=enqueue(store,'pausable');const a=store.claim('w');
  assert.equal(store.pause(p.id),true);
  assert.equal(store.complete(p.id,a.lease_token,{result:1}),false);
  assert.equal(store.resume(p.id),true);
  const b=store.claim('w');assert.equal(b.id,p.id);
  assert.equal(store.cancel(p.id),true);
  assert.equal(store.complete(p.id,b.lease_token,{result:2}),false);
  assert.equal(store.get(p.id).status,'cancelled');
}));

test('missing dependencies, duplicated deps and invalid claim rejected',()=>fixture(({store})=>{
  assert.throws(()=>enqueue(store,'x',{deps:['not-here']}),/missing dependency/);
  assert.throws(()=>enqueue(store,'y',{deps:['a','a']}),/invalid dependencies/);
  assert.throws(()=>store.claim(''),/workerId required/);
  assert.equal(store.countByStatus().total,0);
}));

test('outbox and committed job state survive reopening database',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sp04-reopen-'));
  const path=join(dir,'store.sqlite');
  try {
    let s=new JobStore({path,leaseMs:100});
    const j=enqueue(s,'persist');const r=s.claim('worker');
    s.complete(j.id,r.lease_token,{result:{durable:true}});
    const cursor=s.events().at(-1).seq;
    s.close();s=new JobStore({path,leaseMs:100});
    assert.equal(s.get(j.id).result.durable,true);
    assert.equal(s.events({after:cursor-1}).length,1);
    assert.equal(s.countByStatus().succeeded,1);
    s.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('two independent SQLite clients cannot claim same job',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sp04-two-workers-'));
  const path=join(dir,'store.sqlite');
  const s1=new JobStore({path});const s2=new JobStore({path});
  try {
    enqueue(s1,'one-worker-only');
    const one=s1.claim('worker-A');
    const two=s2.claim('worker-B');
    assert.ok(one);
    assert.equal(two,null);
    assert.equal(s2.complete(one.id,one.lease_token,{result:'yes'}),true);
    assert.equal(s1.get(one.id).status,'succeeded');
  } finally {s1.close();s2.close();rmSync(dir,{recursive:true,force:true});}
});
