#!/usr/bin/env node
/** FI-04-01: isolate intermittent test stalls. Every batch needs a complete
 * Node TAP summary and zero exit; no retries, no skipped-test greenwashing. */
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {runTestGroup} from './fi04-test-control.mjs';
const app=['packages/core/test','packages/contracts/test','packages/sdk/test','apps/api/test','apps/web/src','packages/providers/testkit','tools'];
const spikes=['SP-01','SP-02','SP-03','SP-04','SP-05','SP-06','SP-VID-01'].map(x=>`spikes/${x}/test`);
const mode=process.argv[2]??'--all';
if(!['--all','--app'].includes(mode)||process.argv.length>3){console.error('Use --all or --app');process.exit(2);}
const files=(mode==='--all'?[...app,...spikes]:app).flatMap(dir=>readdirSync(dir,{withFileTypes:true}).filter(f=>f.isFile()&&/\.test\.(?:js|mjs)$/.test(f.name)).map(f=>join(dir,f.name))).sort();
const size=8,results=[];let total=0;
for(let i=0;i<files.length;i+=size){
 const batch=files.slice(i,i+size);const r=await runTestGroup(batch,{cwd:process.cwd(),concurrency:1,timeoutMs:210000,liveOutput:false});
 results.push({batch:results.length+1,files:batch,tests:r.summary.tests,pass:r.summary.pass,ok:r.ok,durationMs:r.durationMs});
 console.log(`FI04_BATCH_${results.length} ${r.ok?'PASS':'FAIL'} ${r.summary.pass}/${r.summary.tests} in ${r.durationMs}ms`);
 if(!r.ok){console.error('FI04_TEST_BATCH_FAILED',JSON.stringify({files:batch,timeout:r.timedOut,exitCode:r.exitCode,summary:r.summary,failedSubtests:r.failedSubtests,failureCodes:r.failureCodes,lastSubtest:r.lastSubtest}));process.exit(1);}
 total+=r.summary.tests;
}
console.log(JSON.stringify({status:'PASS',files:files.length,batches:results.length,tests:total,failed:0}));
