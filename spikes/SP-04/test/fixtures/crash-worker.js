/** Standalone child process for a real SIGKILL recovery test (not a mock restart). */
import { JobStore } from '../../src/store.js';
import { JobRunner } from '../../src/runner.js';
import { createHash } from 'node:crypto';
const file=process.argv[2];
const store=new JobStore({path:file,leaseMs:350,baseBackoffMs:5});
const runner=new JobRunner(store,{mock:async ({n})=>{
  await new Promise(resolve=>setTimeout(resolve,n%9===0?160:35));
  return {result:{n},asset:{logicalKey:`scene:${n}:voice:v1`,checksum:createHash('sha256').update(String(n)).digest('hex'),filePath:`staging/${n}.wav`}};
}},{concurrency:4,pollMs:5,heartbeatMs:50});
runner.start();
process.stdout.write('READY\n');
