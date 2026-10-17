#!/usr/bin/env node
/** FI-04-05..10 hosted acceptance boundary: a Windows Server runner can
 * verify runtime/fixtures/security regressions, NEVER Windows 11 signoff.
 * Evidence is from this run only, no arbitrary user-supplied PASS matrix. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {options,reportFile,timestamp} from './fi04-final-gate-core.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export function classifyHostedMatrix(x={}){
 const observed={
  hostedWindows:x.hostedWindows===true,
  frontendAndApi:x.frontendAndApi===true,
  priorRealHyperframesShort:x.media14s===true,
  focusedTests:x.focusedTests===true,
  syntheticRecovery:x.syntheticRecovery===true,
  securityRegression:x.securityRegression===true,
  networkNpmAudit:x.npmAudit===true
 };
 const gates={
  windows11AuthenticatedTimeline:'BLOCKED',manualDragTrimWaveform500Scenes:'BLOCKED',
  longFullHd35Min:'BLOCKED',witnessedLongRenderRecovery:'BLOCKED',
  realAiInference:'BLOCKED',manualAudioVideoApproval:'BLOCKED',
  localGpuResourceProfile:'BLOCKED',humanSecurityReview:'BLOCKED'
 };
 return {hostedTechnicalStatus:Object.values(observed).every(Boolean)?'PASS':'PARTIAL',
   observed,gates,releaseStatus:'NOT_READY',releaseReady:false,productionAcceptance:'BLOCKED'};
}
async function load(name){
 const path=resolve(ROOT,'docs','evidence',name);
 try{return JSON.parse(await readFile(path,'utf8'))}catch{return {}}
}
async function main(){
 const a=options(process.argv.slice(2),['ci'],['report']);
 if(!a.ci||!a.report)throw Error('FI0410_HOSTED_MODE_REQUIRED');
 const [wi03,recovery,providers,security,release]=await Promise.all([
  load('FI0410_wi03.json'),load('FI0410_recovery_sim.json'),
  load('FI0410_provider_inspect.json'),load('FI0410_security.json'),load('FI0410_release.json')]);
 // Each value originates in this disposable workflow, never from a supplied
 // historical report or a generic 'PASS' release flag.
 const report={task:'FI-04-05..10',timestamp:timestamp(),runner:'HOSTED_WINDOWS_SERVER_NOT_USER_WINDOWS11',
  ...classifyHostedMatrix({
   hostedWindows:process.platform==='win32',
   frontendAndApi:wi03.task==='WI-03'&&wi03.status==='HOSTED_WINDOWS_RUNTIME_VERIFIED',
   media14s:false, // Existing FI0404 proof documented; not rerun in this CI.
   focusedTests:true, // The preceding test step must fail the job on error.
   syntheticRecovery:recovery.task==='FI-04-07'&&recovery.syntheticRecovery==='PASS',
   securityRegression:security.task==='FI-04-09'&&security.evidence?.focusedSecurityTests==='PASS',
   npmAudit:false // Network audit and manual security review are independent.
  }),
  sourceRun:process.env.GITHUB_RUN_ID??null,
  note:'FI0404 genuine short MP4 is a separate earlier Actions run; this hosted matrix cannot approve release.'};
 if(providers.task!=='FI-04-08'||release.task!=='FI-04-10'||release.releaseReady!==false)
  throw Error('FI0410_MISSING_FAIL_CLOSED_INVENTORY');
 await reportFile(a.report,report);
 console.log(JSON.stringify(report));
 if(!report.observed.hostedWindows||!report.observed.frontendAndApi||!report.observed.syntheticRecovery||!report.observed.securityRegression)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
