#!/usr/bin/env node
/** LOCALHOST-07: REAL OS worker-kill + SP-04 lease recovery + HyperFrames MP4.
 * No providers, mock renderers, paid services or browser sessions involved.
 * WARNING: this intentionally SIGKILLs an isolated child process group on Linux.
 * Run only on an ephemeral localhost test fixture, never against user projects.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openProjectDb} from '../packages/core/src/index.mjs';
import {JobStore} from '../spikes/SP-04/src/store.js';
import {inspectFi04Hyperframes,prepareFi04QueuedFixture} from './fi04-hyperframes-acceptance.mjs';
import {probeMp4,checkMp4Quality} from '../packages/core/src/render-ffmpeg-r2ext04.mjs';
import {safeGateReportPath} from './fi04-runtime-gates.mjs';

const rootDir=fileURLToPath(new URL('../',import.meta.url));
const sha=data=>createHash('sha256').update(data).digest('hex');
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn,label,timeout=60000){
 const deadline=Date.now()+timeout;let last=null;
 do{try{const value=await fn();if(value)return value}catch(e){last=e}await pause(85)}while(Date.now()<deadline);
 throw Error('LOCAL_RECOVERY_TIMEOUT_'+label+(last?.message?.startsWith('LOCAL_')?'_'+last.message:''));
}
function spawnWorker(root,jobId){
 const child=spawn(process.execPath,[join(rootDir,'tools/local-render-worker-child.mjs'),root,jobId],{
  cwd:rootDir,detached:true,stdio:['ignore','ignore','ignore','ipc'],
  env:{...process.env,CONTENTSTUDIO_REMOTE_LLM_CONSENT:'0',
    CONTENTSTUDIO_CONFIRMED_NO_BILLING_MODEL_IDS:'',NODE_ENV:'production'}
 });
 const states=[];
 child.on('message',m=>{if(['ready','handler_active','stopped'].includes(m?.type))states.push(m.type)});
 return {child,states};
}
async function waitExit(child,timeout=15000){
 if(child.exitCode!==null||child.signalCode!==null)return;
 await Promise.race([
  new Promise(ok=>child.once('exit',ok)),
  pause(timeout).then(()=>{throw Error('LOCAL_RECOVERY_CHILD_EXIT_TIMEOUT')})
 ]);
}
async function destroyWorker(child){
 if(!child)return;
 try{
  // Detached test child starts its own process group. Kill descendants too,
  // so abandoned ffmpeg/chromium processes cannot continue writing to SQLite
  // test-media directories while the new lease owner starts.
  if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');
  else child.kill('SIGKILL');
 }catch(e){if(e?.code!=='ESRCH')throw e}
 await waitExit(child,12000);
}
export async function runLocalhostRenderCrashRecovery(){
 assert.equal(process.platform,'linux','LOCAL_RECOVERY_LINUX_ONLY');
 const inspect=await inspectFi04Hyperframes();
 if(inspect.status!=='PREREQUISITES_PRESENT')return {status:'BLOCKED',
  code:'LOCAL_RECOVERY_PREREQUISITES_MISSING',prerequisites:inspect.status,releaseStatus:'NOT_READY'};
 const home=await mkdtemp(join(tmpdir(),'studio-hf-crash-'));
 const path=join(home,'project.sqlite');
 let db,store,first,second;const started=Date.now();
 try{
  db=openProjectDb(path);
  store=new JobStore({path,leaseMs:3200});
  const {video,queued,doc}=await prepareFi04QueuedFixture({db,store,root:home});
  const id=queued.job.id;
  assert.equal(store.get(id).status,'pending');
  first=spawnWorker(home,id);
  await until(()=>first.states.includes('handler_active')&&store.get(id)?.status==='running',
   'FIRST_REAL_HANDLER',20000);
  const initial=store.get(id),oldToken=initial.lease_token;
  assert.equal(initial.attempt,1);
  // Actual production handler was entered, not a synthetic queue marker.
  // Give local HyperFrames time to start staging/encoding before terminating.
  await pause(900);
  assert.equal(store.get(id).status,'running','first actual render must be interrupted');
  await destroyWorker(first.child);
  const killed=store.get(id);
  assert.equal(killed.status,'running','SIGKILL leaves a durable running lease');
  await until(()=>Date.now()>killed.lease_until+80,'FIRST_LEASE_EXPIRY',10000);
  assert.equal(store.complete(id,oldToken,{result:{fake:'NEVER_ALLOWED'}}),false,
   'expired lease must never commit stale MP4 evidence');
  assert.equal(store.recoverExpired(),1);
  assert.equal(store.get(id).status,'pending');
  assert.equal(store.attempts(id)[0].outcome,'lease_expired');
  const recoveredEvent=store.events({after:0,limit:1000,jobId:id})
   .some(e=>e.type==='lease_recovered');
  assert(recoveredEvent,'lease recovery must be durable in the outbox');
  second=spawnWorker(home,id);
  await until(()=>second.states.includes('handler_active')&&store.get(id)?.attempt===2,
   'SECOND_REAL_HANDLER',20000);
  const restored=await until(()=>{
   const job=store.get(id);
   if(job?.status==='failed')throw Error('LOCAL_RECOVERY_SECOND_RENDER_FAILED');
   return job?.status==='succeeded'?job:null;
  },'HYPERFRAMES_OUTPUT',420000);
  assert.equal(restored.attempt,2,'single recovered retry');
  assert.equal(restored.result?.engine,'hyperframes');
  assert.equal(restored.result?.qa?.passed,true);
  assert.ok(!JSON.stringify(restored.result).includes('NEVER_ALLOWED'));
  const mp4=join(home,restored.result.relativePath),bytes=await readFile(mp4);
  const metadata=await probeMp4(mp4);
  assert.equal(checkMp4Quality(metadata,doc).passed,true);
  assert.equal(metadata.videoCodec,'h264');
  assert.equal(metadata.audioCodec,'aac');
  assert.equal(metadata.frameCount,doc.totalFrames);
  const attempts=store.attempts(id);
  assert.equal(attempts.length,2);
  assert.equal(attempts[0].outcome,'lease_expired');
  assert.equal(attempts[1].outcome,'succeeded');
  assert.equal(store.countByStatus().total,1,'restart cannot duplicate durable render jobs');
  second.child.send({type:'stop'});
  await waitExit(second.child,20000);
  const result={status:'PASS',workflow:'LOCALHOST-07',engine:'hyperframes',origin:'REAL_LOCAL_OS_KILL',
   sceneCount:5,attempts:2,oldLeaseFenced:true,osWorkerKilled:true,expiredLeaseRecovered:true,
   outboxRecoveryVerified:true,jobNotDuplicated:true,output:{codec:'h264/aac',
    frames:metadata.frameCount,durationSeconds:metadata.durationSeconds,bytes:bytes.length,sha256:sha(bytes)},
   elapsedMs:Date.now()-started,providerCalls:0,releaseStatus:'NOT_READY',
   limits:'Short local WAV/PNG fixture only. Not 35-40min, human A/V, CPU/RAM, or GPU provider acceptance.'};
  return result;
 }finally{
  await destroyWorker(first?.child).catch(()=>{});
  await destroyWorker(second?.child).catch(()=>{});
  store?.close();db?.close();
  await rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:150});
 }
}
async function main(){
 const args=process.argv.slice(2);
 if(args.some(x=>!['--run','--strict'].includes(x)&&!x.startsWith('--report='))||
  args.filter(x=>x.startsWith('--report=')).length>1)throw Error('LOCAL_RECOVERY_ARGS_INVALID');
 let result;
 try{result=args.includes('--run')?await runLocalhostRenderCrashRecovery():
  {status:'BLOCKED',reason:'EXPLICIT_REAL_RUN_REQUIRED',releaseStatus:'NOT_READY'}}
 catch(e){
  // Safe error codes only; never publish paths, process arguments, keys or files.
  const code=String(e?.message??'LOCAL_RECOVERY_FAILED');
  result={status:'FAIL',code:/^[A-Z0-9_]{3,100}$/.test(code)?code:'LOCAL_RECOVERY_RUNTIME_FAILURE',
   releaseStatus:'NOT_READY'};
 }
 const report=args.find(x=>x.startsWith('--report='))?.slice(9);
 if(report){
  const to=safeGateReportPath(rootDir,report);
  await mkdir(dirname(to),{recursive:true});
  await writeFile(to,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 }
 console.log('LOCALHOST_REAL_RENDER_RECOVERY '+JSON.stringify(result));
 if(result.status==='FAIL'||(args.includes('--strict')&&result.status!=='PASS'))process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
