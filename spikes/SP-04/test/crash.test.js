import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JobStore } from '../src/store.js';
import { JobRunner } from '../src/runner.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=n=>createHash('sha256').update(String(n)).digest('hex');

test('real OS kill & restart after partial completion: 100 jobs exactly one committed logical revision, SSE outbox replays',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sp04-crash-'));
  const file=join(dir,'sp04.sqlite');
  const fixture=fileURLToPath(new URL('./fixtures/crash-worker.js',import.meta.url));
  const store=new JobStore({path:file,leaseMs:350,baseBackoffMs:5});
  let child;
  try {
    for(let n=0;n<100;n++) store.enqueue({key:`scene:${n}:voice:v1`,kind:'mock',payload:{n},maxAttempts:4});
    child=spawn(process.execPath,[fixture,file],{stdio:['ignore','pipe','pipe']});
    const deadline=Date.now()+10_000;
    while(Date.now()<deadline){
      const {succeeded=0,running=0}=store.countByStatus();
      if(succeeded>=12&&running>=1) break;
      if(child.exitCode!==null) throw new Error('child stopped before SIGKILL');
      await sleep(15);
    }
    const before=store.countByStatus();
    assert.ok(before.succeeded>=12 && before.succeeded<100 && before.running>0,JSON.stringify(before));
    const cursor=store.events({limit:1000}).at(-1).seq;
    child.kill('SIGKILL');
    await new Promise(resolve=>child.once('exit',resolve));
    const afterKill=store.countByStatus();
    // SIGKILL is asynchronous: a worker may commit one more job between the
    // last observation and actual termination. Assert monotonic durability,
    // then prove deduplication after recovery below.
    assert.ok(afterKill.succeeded>=before.succeeded && afterKill.succeeded<100);
    assert.ok(afterKill.running>=1);
    await sleep(410); // expire abandoned leases in real elapsed time
    assert.ok(store.recoverExpired()>0);
    const eventsAfter=store.events({after:cursor,limit:1000});
    assert.ok(eventsAfter.some(e=>e.type==='lease_recovered'));
    const runner=new JobRunner(store,{mock:async({n})=>({result:{n},asset:{logicalKey:`scene:${n}:voice:v1`,checksum:sha(n),filePath:`staging/${n}.wav`}})},{concurrency:6,pollMs:3,heartbeatMs:50});
    runner.start();
    const counts=await runner.waitForIdle({timeoutMs:15000});
    await runner.stop();
    assert.equal(counts.succeeded,100);
    assert.equal(counts.total,100);
    assert.equal(store.db.prepare('SELECT count(*) n FROM assets').get().n,100);
    const dup=store.db.prepare('SELECT logical_key,count(*) n FROM assets GROUP BY logical_key HAVING n>1').all();
    assert.deepEqual(dup,[]);
    assert.ok(store.db.prepare("SELECT count(*) n FROM attempts WHERE outcome='lease_expired'").get().n>0);
    assert.ok(store.events({after:cursor,limit:1000}).some(e=>e.type==='succeeded'));
    const saved=store.countByStatus().succeeded;
    assert.equal(store.recoverExpired(),0);
    assert.equal(store.countByStatus().succeeded,saved);
    const attemptsBefore=store.db.prepare('SELECT count(*) n FROM attempts').get().n;
    assert.equal(store.claim('no-new-job'),null);
    assert.equal(store.db.prepare('SELECT count(*) n FROM attempts').get().n,attemptsBefore);
  } finally {
    if(child?.exitCode===null) child.kill('SIGKILL');
    store.close();rmSync(dir,{recursive:true,force:true});
  }
});
