#!/usr/bin/env node
/** FI-04-07: real child-process kill / durable-SP04 SQLite lease recovery
 * smoke (synthetic handler only) plus conservative real-job evidence audit.
 * Never certifies long HyperFrames recovery without a witnessed Windows test.
 */
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JobStore} from '../spikes/SP-04/src/store.js';
import {JobRunner} from '../spikes/SP-04/src/runner.js';
import {options,reportFile,output,sanitizeError,timestamp} from './fi04-final-gate-core.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function verifyRecoveredJob({job,attempts,events}={}){
 const distinct=attempts?.length>=2&&attempts.some(x=>x.outcome==='lease_expired')&&attempts.at(-1).outcome==='succeeded';
 const event=events?.some(x=>x.type==='lease_recovered');
 return {status:job?.kind==='render:hyperframes'&&job?.status==='succeeded'&&distinct&&event?'PASS':'NOT_READY',
  checks:{succeeded:job?.status==='succeeded',multipleAttempts:!!distinct,leaseRecoveryEvent:!!event}};
}
export async function simulateProcessDeath(){
 const root=await mkdtemp(join(tmpdir(),'fi0407-'));
 const db=join(root,'job.sqlite');let parent=null;
 try{
  const store=new JobStore({path:db,leaseMs:500,baseBackoffMs:0});
  const original=store.enqueue({kind:'render:hyperframes',key:'fi0407-synthetic-disposable',payload:{source:'FI0407_SYNTHETIC_NO_MEDIA'},maxAttempts:2}).job;
  parent=spawn(process.execPath,[fileURLToPath(new URL('fi0407-recovery-worker.mjs',import.meta.url)),db],{stdio:'ignore',windowsHide:true});
  let claimed=false;
  for(let i=0;i<150;i++){if(store.get(original.id)?.status==='running'){claimed=true;break;}if(parent.exitCode!==null)break;await sleep(30);}
  if(!claimed)throw Object.assign(Error('child did not claim'),{code:'FI0407_CHILD_NOT_CLAIMED'});
  const stale=store.get(original.id);parent.kill('SIGKILL');await Promise.race([once(parent,'close'),sleep(4000).then(()=>{throw Error('FI0407_CHILD_KILL_TIMEOUT')})]);parent=null;
  // The former lease must expire; a dead renderer must NOT publish results.
  await sleep(550);const recovered=store.recoverExpired();
  const rejected=store.complete(original.id,stale.lease_token,{result:{unexpected:'stale must be fenced'}})===false;
  if(recovered!==1||!rejected||store.get(original.id).status!=='pending')throw Error('FI0407_FENCING_BROKEN');
  const runner=new JobRunner(store,{'render:hyperframes':async()=>({result:{proof:'SYNTHETIC_ONLY',noMp4:true}})},{pollMs:20,heartbeatMs:100});
  try{runner.start();await runner.waitForIdle({timeoutMs:3000})}finally{await runner.stop({abort:true})}
  const actual=store.get(original.id),attempts=store.attempts(original.id),events=store.events({jobId:original.id,limit:100});
  const validated=verifyRecoveredJob({job:actual,attempts,events});store.close();
  return {task:'FI-04-07',status:validated.status,checks:{...validated.checks,staleLeaseCannotCommit:rejected},
   syntheticOsProcessKilled:true,recoveredLeases:recovered,attempts:attempts.length,provesActualLongRender:false,
   realWindowsRecovery:'BLOCKED',releaseGateSatisfied:false};
 }finally{if(parent){parent.kill('SIGKILL');await Promise.race([once(parent,'close'),sleep(1000)]).catch(()=>{})}await rm(root,{recursive:true,force:true});}
}
async function main(){const a=options(process.argv.slice(2),['inspect','simulate','verify'],['data-root','job-id','report']);
 if([a.inspect,a.simulate,a.verify].filter(Boolean).length!==1)throw Error('FI0407_INVALID_MODE');
 let r={task:'FI-04-07',timestamp:timestamp(),status:'NOT_READY',releaseGateSatisfied:false,
  reason:'Real Windows >=35min HyperFrames interrupted while encoding and recovered output not verified'};
 try{
  if(a.simulate)r={...r,...await simulateProcessDeath(),status:'NOT_READY',syntheticRecovery:'PASS'};
  if(a.verify){
   // Verification reads actual SP-04 attempts/outbox and cannot be used to
   // fabricate a user-witnessed OS-kill or proof of valid MP4 by itself.
   if(!a['data-root']||!a['job-id'])throw Error('FI0407_JOB_IDENTIFIERS_REQUIRED');
   const root=resolve(a['data-root']);if(!(await stat(join(root,'project.sqlite'))).isFile())throw Error('FI0407_EXISTING_DB_REQUIRED');
   const store=new JobStore({path:join(root,'project.sqlite')});
   try{const id=a['job-id'];const evidence=verifyRecoveredJob({job:store.get(id),attempts:store.attempts(id),events:store.events({jobId:id,limit:1000})});
    r={...r,technicalRecovery:evidence,manualWinKillAndMediaProof:'BLOCKED'};
   }finally{store.close()}
  }
 }catch(e){r={...r,status:'BLOCKED_OR_FAILED',code:sanitizeError(e)}}
 await reportFile(a.report,r);output(r,!a.inspect);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
