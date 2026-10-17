import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueueServer } from '../src/api.js';
import { JobStore } from '../src/store.js';

test('read-only HTTP summary, event replay and SSE Last-Event-ID',async()=>{
  const store=new JobStore();
  const job=store.enqueue({key:'http:test',kind:'mock'}).job;
  const cursor=store.events().at(-1).seq;
  const claim=store.claim('worker');
  store.complete(job.id,claim.lease_token,{result:{ok:true}});
  const server=createQueueServer(store,{pollMs:20});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const status=await (await fetch(`${base}/api/jobs/summary`)).json();
    assert.equal(status.succeeded,1);
    const events=await (await fetch(`${base}/api/events?after=${cursor}`)).json();
    assert.equal(events.events.length,2);
    assert.equal(events.events[0].type,'started');
    const response=await fetch(`${base}/api/events/stream`,{headers:{'Last-Event-ID':String(cursor)}});
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/event-stream/);
    const reader=response.body.getReader();
    const chunk=await reader.read();
    const text=new TextDecoder().decode(chunk.value);
    assert.match(text,/event: started/);
    assert.match(text,/event: succeeded/);
    await reader.cancel();
    assert.equal((await fetch(`${base}/api/jobs`,{method:'POST'})).status,405);
    assert.equal((await fetch(`${base}/api/events?after=abc`)).status,400);
  } finally {server.close();store.close();}
});
