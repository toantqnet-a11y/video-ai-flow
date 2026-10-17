/** SP-04 demo: a durable offline queue proving 100-job completion without API keys. */
import { resolve } from 'node:path';
import { JobStore } from './store.js';
import { JobRunner } from './runner.js';

const mode = process.argv[2] ?? 'demo';
const file = resolve(process.argv[3] ?? './data/sp04-queue.sqlite');
const store = new JobStore({path:file,leaseMs:800});
if (mode === 'status') {
  console.log(JSON.stringify({status:store.countByStatus(),lastEvents:store.events({after:0,limit:10})},null,2));
  store.close();
} else if (mode==='demo') {
  const ids=[];
  for (let i=0;i<100;i++) ids.push(store.enqueue({key:`demo:${i}`,kind:'mock',payload:{n:i},deps:i%10===9?[ids[i-1]]:[]}).job.id);
  const runner = new JobRunner(store,{mock:async payload => ({result:{number:payload.n}})});
  runner.start();
  await runner.waitForIdle({timeoutMs:30_000});
  await runner.stop();
  console.log(JSON.stringify(store.countByStatus(),null,2));
  store.close();
} else {
  console.error('Usage: node src/cli.js demo|status [db.sqlite]');
  process.exitCode=2;
  store.close();
}
