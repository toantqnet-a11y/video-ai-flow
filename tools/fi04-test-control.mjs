/** FI-04-01: deterministic, bounded cross-platform Node test execution.
 * The runner must never hang forever or turn a truncated TAP log into PASS.
 */
import {spawn} from 'node:child_process';

export function tapSummary(output=''){
 const number=k=>Number([...output.matchAll(new RegExp(`^# ${k} (\\d+)$`,'gm'))].at(-1)?.[1]??-1);
 return {tests:number('tests'),pass:number('pass'),fail:number('fail'),cancelled:number('cancelled'),skipped:number('skipped')};
}
export function completedGreen(result,summary){
 return result.exitCode===0&&!result.timedOut&&!result.error&&summary.tests>0&&
  summary.pass===summary.tests&&summary.fail===0&&summary.cancelled===0&&summary.skipped===0&&
  result.completePlan===true;
}
export function testArguments(files,{concurrency=2,perTestTimeoutMs=180000}={}){
 if(![1,2,4,8].includes(Number(concurrency))||!Number.isSafeInteger(perTestTimeoutMs)||perTestTimeoutMs<3000)throw new Error('FI04_INVALID_TEST_LIMITS');
 if(!Array.isArray(files)||!files.length||files.some(x=>typeof x!=='string'||!x.endsWith('.test.mjs')&&!x.endsWith('.test.js')))throw new Error('FI04_INVALID_TEST_FILES');
 return ['--test',`--test-concurrency=${concurrency}`,`--test-timeout=${perTestTimeoutMs}`,...files];
}
/** Capture only TAP in memory; optional live output keeps normal CLI usability.
 * Timeout kills the entire POSIX process group or the Windows process tree.
 * No retry: an unstable/failing test MUST remain visible to the operator.
 */
export async function runTestGroup(files,{cwd,concurrency=2,timeoutMs=600000,perTestTimeoutMs=180000,liveOutput=true}={}){
 const args=testArguments(files,{concurrency,perTestTimeoutMs});
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<3000)throw new Error('FI04_INVALID_WATCHDOG');
 return new Promise(resolve=>{
  const start=Date.now();let child;
  const env={...process.env,CI:'1'};
  // The watchdog has a self-test that starts a fresh child node:test. The
  // parent test worker's internal context must not disable a real child run.
  delete env.NODE_TEST_CONTEXT;
  try{child=spawn(process.execPath,args,{cwd,env,detached:process.platform!=='win32',windowsHide:true,stdio:['ignore','pipe','pipe']});}
  catch(err){return resolve({exitCode:null,error:err.code??'SPAWN_FAILED',timedOut:false,summary:tapSummary(),completePlan:false,durationMs:Date.now()-start});}
  let stdout='',stderr='',error=null,timedOut=false,finished=false;
  const limit=16*1024*1024;
  const accumulate=(stream,v,isError)=>{
   const chunk=String(v);
   if(isError)stderr=(stderr+chunk).slice(-limit);else stdout=(stdout+chunk).slice(-limit);
   if(liveOutput)(isError?process.stderr:process.stdout).write(v);
  };
  child.stdout.on('data',v=>accumulate(child.stdout,v,false));
  child.stderr.on('data',v=>accumulate(child.stderr,v,true));
  function terminate(){
   if(!child.pid)return;
   if(process.platform==='win32'){
    const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    killer.on('error',()=>{});
   }else{try{process.kill(-child.pid,'SIGKILL')}catch{try{child.kill('SIGKILL')}catch{}}}
  }
  const watchdog=setTimeout(()=>{timedOut=true;terminate()},timeoutMs);
  child.on('error',e=>{error=e.code??'PROCESS_ERROR'});
  child.on('close',(code,signal)=>{
   if(finished)return;finished=true;clearTimeout(watchdog);
   const summary=tapSummary(stdout);
   // The final plan and summary both have to exist; a partial TAP stream is not evidence.
   const plans=[...stdout.matchAll(/^1\.\.(\d+)$/gm)];
   const completePlan=plans.length===1&&Number(plans[0][1])===summary.tests;
   const result={exitCode:code,signal:signal??null,error,timedOut,summary,completePlan,durationMs:Date.now()-start};
   result.ok=completedGreen(result,summary);
   if(!result.ok){
    // Diagnostic is test-only; avoid copying all TAP output or any environment vars into reports.
    result.lastSubtest=[...stdout.matchAll(/^# Subtest: (.{1,200})$/gm)].at(-1)?.[1]??null;
    result.stderrTail=stderr.slice(-600);
   }
   resolve(result);
  });
 });
}
