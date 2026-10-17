/** FI-04-01: bounded cross-platform test inventory; fails closed on truncated TAP.
 * Stable default concurrency=2 to avoid over-subscribing FFmpeg subprocesses.
 */
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {runTestGroup} from './fi04-test-control.mjs';
const app=['packages/core/test','packages/contracts/test','packages/sdk/test','apps/api/test','apps/web/src','packages/providers/testkit','tools'];
const spikes=['SP-01','SP-02','SP-03','SP-04','SP-05','SP-06','SP-VID-01'].map(x=>`spikes/${x}/test`);
const mode=process.argv[2]??'--app';const optional=process.argv[3];
if(!['--app','--spikes','--all'].includes(mode)||process.argv.length>4||optional&&!/^--concurrency=(1|2|4|8)$/.test(optional)){
 console.error('Usage: node tools/run-tests.mjs --app|--spikes|--all [--concurrency=1|2|4|8]');process.exit(2);
}
const concurrency=optional?Number(optional.split('=')[1]):2;
const directories=mode==='--app'?app:mode==='--spikes'?spikes:[...app,...spikes];
const files=directories.flatMap(folder=>readdirSync(folder,{withFileTypes:true}).filter(f=>f.isFile()&&/\.test\.(?:js|mjs)$/.test(f.name)).map(f=>join(folder,f.name))).sort();
console.log(`FI04_TEST_START files=${files.length} mode=${mode} concurrency=${concurrency}`);
const result=await runTestGroup(files,{cwd:process.cwd(),concurrency,timeoutMs:900000});
if(!result.ok){
 console.error('FI04_TEST_INCOMPLETE_OR_FAILED',JSON.stringify({exitCode:result.exitCode,signal:result.signal,error:result.error,timedOut:result.timedOut,summary:result.summary,lastSubtest:result.lastSubtest,elapsedMs:result.durationMs}));
 process.exitCode=1;
}else console.log(`FI04_TEST_PASS ${result.summary.pass}/${result.summary.tests} files=${files.length} elapsedMs=${result.durationMs}`);
