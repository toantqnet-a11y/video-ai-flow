#!/usr/bin/env node
/** FI-04-10: non-bypassable release summary. Files created by older runs or
 * operator-written JSON cannot independently satisfy live production gates.
 * The final approval needs an external, reviewed Windows acceptance record.
 * This command never installs deps, publishes media, or calls models. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectRuntime} from './fi04-runtime-gates.mjs';
import {inspectFi04Hyperframes} from './fi04-hyperframes-acceptance.mjs';
import {inspectSecurity} from './fi0409-security-performance.mjs';
import {providerInventory} from './fi0408-provider-e2e.mjs';
import {options,reportFile,output,timestamp} from './fi04-final-gate-core.mjs';
const required=['fullGreenSuite','reviewedNpmLock','viteBuildLiveHttp','fiveSceneRealHyperframes','windowsBrowserUx',
 'long35MinRealHyperframes','realOsKillRecovery','actualLocalAiInference','dependencyAndSecurityReview','manualVideoAudioReview'];
export function decideRelease(gates){
 // A missing claim is BLOCKED, and a forged success flag or offline/media-only
 // report does not flip the release verdict; this function only accepts
 // explicit evidentiary classifications from a reviewed external gate runner.
 const values=Object.fromEntries(required.map(k=>[k,gates?.[k]==='PASS'?'PASS':'BLOCKED']));
 const ready=Object.values(values).every(x=>x==='PASS');return {status:ready?'READY_FOR_OPERATOR_SIGNOFF':'NOT_READY',gates:values,blocked:Object.keys(values).filter(x=>values[x]!=='PASS')};
}
export async function releaseInventory(){
 const [runtime,hyperframes,security]=await Promise.all([inspectRuntime(),inspectFi04Hyperframes(),inspectSecurity()]);
 const evidence={runtimePrerequisites:runtime,hyperframesPrerequisites:hyperframes,securityInventory:security.evidence,providers:providerInventory().gates};
 // No passive prerequisite check is permitted to promote a historical/user
 // file into current live proof. Always NOT_READY without witnessed gates.
 return {task:'FI-04-10',timestamp:timestamp(),...decideRelease({}),evidence,releaseReady:false,
  limitation:'Windows interactive checks, actual 35min HyperFrames, crash recovery, provider inference and manual visual/audio approval are not achievable by reading repo history.'};
}
async function main(){const a=options(process.argv.slice(2),['inspect','strict'],['report']);
 if(!a.inspect)throw Error('FI0410_INSPECT_ONLY');const result=await releaseInventory();await reportFile(a.report,result);output(result,!!a.strict);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
