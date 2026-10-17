#!/usr/bin/env node
/** FI-02 evidence orchestrator. Executes ONLY locally available checks on
 * explicit flags. No npx, npm installs, provider calls, automatic fallback or
 * fake historical PASS. The report is a reproducible inventory, not a release.
 *
 * Usage: npm run acceptance:fi02 -- --verify-offline --report=docs/evidence/FI02_release.json
 *        npm run acceptance:fi02 -- --verify-runtime --verify-real-hyperframes --strict
 */
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dependencyReproducibility} from './fi01-release-preconditions.mjs';
import {verifyWorkspaceLock} from './fi02-lock-policy.mjs';
import {findHyperframesCli} from '../packages/core/src/render-hyperframes.mjs';
import {RELEASE_GATES,gate,releaseSummary,freshEvidenceRequired} from './fi02-release-core.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const options=process.argv.slice(2),flag=x=>options.includes(x);
const reportArg=options.find(x=>x.startsWith('--report='))?.slice(9);
const runOffline=flag('--verify-offline'),runFocused=flag('--verify-focused')||runOffline,runRuntime=flag('--verify-runtime'),runHyperframes=flag('--verify-real-hyperframes');
const tool=(name,args,timeoutMs=10000)=>{
 const start=performance.now();
 const isNpm=name==='npm';
 const command=isNpm&&process.platform==='win32'?'npm.cmd':name;
 const result=spawnSync(command,args,{cwd:root,timeout:timeoutMs,encoding:'utf8',
  shell:isNpm&&process.platform==='win32',
  maxBuffer:24*1024*1024,windowsHide:true,env:{...process.env,CI:'1'}});
 // Sanitized, bounded evidence; stdout/stderr are NEVER saved in reports.
 const out=result.stdout??'',tail=out.slice(-1200);
 const match=/# tests (\d+)/.exec(tail),fail=/# fail (\d+)/.exec(tail),skipped=/# skipped (\d+)/.exec(tail);
 return {exitCode:result.status??null,signal:result.signal??null,
  errorCode:result.error?.code??null,durationMs:Math.round(performance.now()-start),
  ...(match?{tests:Number(match[1]),failed:Number(fail?.[1]??0),skipped:Number(skipped?.[1]??0)}:{})};
};
const outcome=(result,label,{needsTap=false}={})=>gate(result.exitCode===0&&(!result.failed&&!result.skipped)&&(!needsTap||result.tests>0)?'PASS':'FAIL',label,result);
const gates=Object.fromEntries(RELEASE_GATES.map(k=>[k,gate('BLOCKED','Evidence not collected on this host')]));
gates.node22=gate(Number(process.versions.node.split('.')[0])>=22?'PASS':'FAIL',`Node ${process.versions.node}`);
for(const [id,name] of [['ffmpeg','ffmpeg'],['ffprobe','ffprobe']]){
 const r=tool(name,['-version']);gates[id]=gate(r.exitCode===0?'PASS':'BLOCKED',`${name} local binary`,r);
}
const lock=await dependencyReproducibility(root);
const workspaces=await verifyWorkspaceLock(root);
gates.rendererPinned=gate(lock.rendererPin==='PASS'?'PASS':'FAIL','Exact local HyperFrames version declared');
gates.dependencyLock=gate(workspaces.status,workspaces.reason);
let cliReady=false;
try{
 const cli=await findHyperframesCli();
 const r=tool(cli.binary,[...cli.argvPrefix,'--help'],15000);
 cliReady=r.exitCode===0;
 gates.localHyperframesCli=gate(cliReady?'PASS':'FAIL','Pinned local HyperFrames CLI responds; NOT a rendered MP4',r);
}catch(e){gates.localHyperframesCli=gate('BLOCKED',`Genuine project-local HyperFrames CLI unavailable: ${e.code??'MISSING'}`);}
if(runFocused){
 const checks={
  fi02FocusedTests:['npm',['run','test:fi02'],90000],
  apiContract:['npm',['run','check'],120000],
  sdkTypecheck:['npm',['run','typecheck:sdk'],120000],
  negativeControl:['npm',['run','test:negative-control'],120000],
  ...(runOffline?{fullOfflineSuite:['npm',['run','test:all'],360000]}:{}),
 };
 for(const [id,[command,args,ms]] of Object.entries(checks)){
  const r=tool(command,args,ms);gates[id]=outcome(r,`${id}: command executed locally`,{needsTap:id==='fi02FocusedTests'||id==='fullOfflineSuite'});
 }
}
if(runRuntime){
 // Missing installation is a dependency BLOCKED, NOT a compilation failure.
 if(workspaces.status==='PASS'){
  for(const [id,command,args,ms] of [
   ['frontendBuild','npm',['run','build:web'],180000],
   ['liveHttp','npm',['run','test:live-http'],180000],
   ['dependencySecurityAudit','npm',['audit','--audit-level=high','--json'],120000],
  ]){
   const r=tool(command,args,ms);
   gates[id]=outcome(r,`${id}: real local execution`);
  }
 }else for(const id of ['frontendBuild','liveHttp','dependencySecurityAudit'])
  gates[id]=gate('BLOCKED','Locked dependencies missing; no production runtime claimed');
}
if(runHyperframes){
 if(!cliReady||workspaces.status!=='PASS')gates.realHyperframesFinishing=gate('BLOCKED','Cannot run genuine renderer without verified local CLI and lockfile');
 else{
  const r=tool('npm',['run','acceptance:fi01:hyperframes'],480000);
  gates.realHyperframesFinishing=outcome(r,'Actual queued HyperFrames+subtitle+music render and FFprobe');
 }
}
if(process.platform==='win32')gates.windowsBrowserUX=gate('BLOCKED','Windows host present, but interactive browser usability has NOT been manually verified');
else gates.windowsBrowserUX=gate('BLOCKED','Windows/browser interactive acceptance not performed on this host');
gates.real35MinuteRender=gate('BLOCKED','No actual >=35-minute queued HyperFrames MP4 with frame/codec/CPU/RAM/time measurements');
gates.longRenderRestartRecovery=gate('BLOCKED','No observed Windows forced-restart and genuine long-job recovery proof');
gates.realProvidersWithConsent=gate('BLOCKED','No consented local LLM/TTS/ComfyUI complete production verification');
gates.productionSecurityReview=gate('BLOCKED','No formal live production security/secret-handling review evidence');
const {summary,status}=releaseSummary(gates);
const report={schemaVersion:1,task:'FI-02',timestamp:new Date().toISOString(),platform:process.platform,
 engine:'hyperframes',fallback:'ffmpeg-explicit-only',status,summary,gates,
 freshLiveEvidenceComplete:freshEvidenceRequired(gates),
 note:'Offline PASS != release approval. BLOCKED remains BLOCKED. No provider or paid API was contacted by this orchestrator.'};
if(reportArg){
 const path=resolve(root,reportArg);
 if(!path.startsWith(resolve(root,'docs','evidence')+'/')&&!path.startsWith(resolve(root,'docs','evidence')+'\\')){
  throw new Error('FI02_REPORT_MUST_BE_IN_DOCS_EVIDENCE');
 }
 await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600});
}
console.log(JSON.stringify({task:report.task,status:report.status,summary:report.summary,
 blocked:Object.entries(gates).filter(([,g])=>g.status==='BLOCKED').map(([k])=>k),report:reportArg??null},null,2));
if(flag('--strict')&&status!=='READY_FOR_MANUAL_REVIEW')process.exitCode=1;
