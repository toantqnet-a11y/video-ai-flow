#!/usr/bin/env node
/** WI-02 reviewed Windows runtime verification. Does NOT install packages or
 * contact paid providers. Verifies a genuine Vite build + real loopback TCP
 * Fastify server, not an app.inject mock. IPC worker never leaks pairing code.
 * Inspect can run offline. Live execution is Windows-only and fail-closed.
 */
import {spawnSync,fork} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectWindowsPreflight} from './wi01-windows-preflight.mjs';
import {safeGateReportPath} from './fi04-runtime-gates.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const BLOCKED='BLOCKED',PASS='PASS',FAIL='FAIL';
export function parseWi02Args(args){
 let mode=null,strict=false,report=null;
 for(const arg of args){
  if(['--inspect','--run'].includes(arg)&&mode===null)mode=arg.slice(2);
  else if(arg==='--strict'&&!strict)strict=true;
  else if(arg.startsWith('--report=')&&report===null&&arg.length>9)report=arg.slice(9);
  else throw Error('WI02_INVALID_ARGUMENT');
 }
 if(!mode)throw Error('WI02_MODE_REQUIRED');
 return {mode,strict,report};
}
export function classifyWi02(preflight,{build=null,http=null}={}){
 const entries=preflight?.checks;
 if(!entries||typeof entries!=='object')throw Error('WI02_INVALID_PREFLIGHT');
 const mandatory=['windowsHost','node22','architecture','npmLock','vite','fastify','hyperframes','rendererCli','ffmpeg','ffprobe','browser','disk'];
 const prerequisites=mandatory.some(k=>entries[k]?.status==='FAIL')?FAIL:
  mandatory.every(k=>entries[k]?.status===PASS)?PASS:BLOCKED;
 const normalize=(x)=>[PASS,BLOCKED,FAIL].includes(x)?x:BLOCKED;
 const gates={prerequisites:{status:prerequisites},viteBuild:{status:normalize(build)},socketHttp:{status:normalize(http)}};
 return {status:Object.values(gates).some(x=>x.status===FAIL)?FAIL:Object.values(gates).every(x=>x.status===PASS)?'RUNTIME_VERIFIED':'NOT_READY',
  gates,releaseStatus:'NOT_READY',browserAcceptance:'NOT_RUN',realHyperframesMedia:'NOT_RUN'};
}
export function safeRuntimeEnv(parent=process.env){
 // Use an explicit allowlist; never inherit cloud credentials/proxies/local AI
 // provider URLs or other secrets into the ephemeral HTTP child.
 const keys=['PATH','Path','SystemRoot','WINDIR','ComSpec','PATHEXT','TMP','TEMP','TMPDIR',
  'HOME','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)',
  'ProgramData','HOMEDRIVE','HOMEPATH','LANG','LC_ALL','TZ'];
 return Object.fromEntries(keys.filter(k=>typeof parent[k]==='string').map(k=>[k,parent[k]]));
}
export function runBuild({cwd=root,timeoutMs=180000}={}){
 const executable=process.platform==='win32'?'npm.cmd':'npm';
 // Windows .cmd is invoked only with constant literal arguments. No user
 // input or untrusted environment appears in a shell command.
 const result=spawnSync(executable,['run','build:web'],{cwd,env:{...safeRuntimeEnv(),CI:'1'},
  encoding:'utf8',stdio:'pipe',timeout:timeoutMs,maxBuffer:1024*1024,windowsHide:true,
  shell:process.platform==='win32'});
 return {status:result.status===0&&!result.error?PASS:FAIL,
  exitCode:result.status??null,errorCode:result.error?.code??null};
}
async function vacantPort(){
 const server=createServer();
 try{
  await new Promise((done,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:0,exclusive:true},done)});
  return server.address().port;
 }finally{await new Promise(ok=>server.close(ok))}
}
function deadline(promise,ms,code){
 let timer;
 return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(code)),ms)})])
  .finally(()=>clearTimeout(timer));
}
/** Test the actual socket rather than Fastify's in-process inject method. */
export async function probeLocalHttp(base,{fetchImpl=fetch}={}){
 if(!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(base))throw Error('WI02_LOOPBACK_ONLY');
 const get=async(url)=>{
  const ac=new AbortController(),id=setTimeout(()=>ac.abort(),5000);
  try{return await fetchImpl(base+url,{signal:ac.signal,redirect:'manual',headers:{accept:'application/json'}})}
  finally{clearTimeout(id)}
 };
 const health=await get('/health');
 if(health.status!==200||(await health.json()).service!=='contentstudio')throw Error('WI02_HEALTH_CHECK_FAILED');
 const unauth=await get('/api/channels');
 if(unauth.status!==401)throw Error('WI02_AUTH_GUARD_FAILED');
 const missing=await get('/api/wi02-unknown-route');
 if(missing.status!==401)throw Error('WI02_UNKNOWN_API_AUTH_FAILED');
 const page=await get('/');
 if(page.status!==200||!String(page.headers.get('content-type')).includes('text/html'))throw Error('WI02_SAME_ORIGIN_UI_FAILED');
 const html=await page.text();
 if(!/<html\b/i.test(html)||!/<script\b/i.test(html))throw Error('WI02_UI_ASSET_MISSING');
 if(page.headers.get('x-frame-options')!=='DENY')throw Error('WI02_SECURITY_HEADER_MISSING');
 return {health:PASS,authGuard:PASS,protectedUnknownApi:PASS,sameOriginHtml:PASS,securityHeaders:PASS};
}
export async function runSocketHttp({cwd=root,timeoutMs=30000}={}){
 const temp=await mkdtemp(join(tmpdir(),'studio-wi02-runtime-'));
 let child=null,stopped=false,port=null;
 const stop=async()=>{
  if(!child)return;
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{child.send({type:'stop'})}catch{}
  try{await deadline(new Promise(done=>child.once('exit',done)),8000,'WI02_STOP_TIMEOUT');stopped=true}
  catch{try{child.kill('SIGKILL')}catch{};
   try{await deadline(new Promise(done=>child.once('exit',done)),3000,'WI02_KILL_TIMEOUT')}catch{}
  }
 };
 try{
  port=await vacantPort();
  const env={...safeRuntimeEnv(),NODE_ENV:'production',CONTENTSTUDIO_REMOTE_LLM_CONSENT:'0',
   CONTENTSTUDIO_PORT:String(port),CONTENTSTUDIO_DATA_DIR:temp};
  child=fork(join(cwd,'tools','wi02-api-child.mjs'),[],{cwd,env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
  await deadline(new Promise((done,reject)=>{
   child.on('message',m=>{if(m?.type==='ready')done();else if(m?.type==='startup_error')reject(Error('WI02_WORKER_START_FAILED'))});
   child.once('error',()=>reject(Error('WI02_WORKER_SPAWN_FAILED')));
   child.once('exit',()=>reject(Error('WI02_WORKER_EXITED_EARLY')));
  }),timeoutMs,'WI02_START_TIMEOUT');
  const checks=await probeLocalHttp(`http://127.0.0.1:${port}`);
  await stop();
  if(!stopped)throw Error('WI02_GRACEFUL_STOP_FAILED');
  // After graceful stop there must be no listener at this port.
  const listener=await new Promise(done=>{
   const socket=createServer();socket.once('error',()=>done(false));
   socket.listen({host:'127.0.0.1',port,exclusive:true},()=>socket.close(()=>done(true)));
  });
  if(!listener)throw Error('WI02_PORT_STILL_OPEN');
  return {status:PASS,checks,gracefulShutdown:PASS,portReleased:PASS};
 }catch(error){return {status:FAIL,errorCode:/^WI02_[A-Z0-9_]+$/.test(error?.message??'')?error.message:'WI02_HTTP_UNEXPECTED_FAILURE'};}
 finally{await stop();await rm(temp,{force:true,recursive:true});}
}
export async function runWi02({mode='inspect',preflight=null,buildFn=runBuild,httpFn=runSocketHttp}={}){
 const starting=new Date().toISOString();
 const p=preflight??await inspectWindowsPreflight();
 let build=null,http=null,buildEvidence=null,httpEvidence=null;
 const sufficient=Object.values(p.checks).every(x=>x.status===PASS);
 if(mode==='run'&&sufficient){
  try{
   const result=await buildFn();build=result.status;
   buildEvidence={status:build,exitCode:result.exitCode??null,errorCode:result.errorCode??null};
  }catch{build=FAIL;buildEvidence={status:FAIL,errorCode:'WI02_BUILD_EXECUTION_FAILED'};}
  if(build===PASS){
   try{const result=await httpFn();http=result.status;
    httpEvidence={status:http,...(result.errorCode?{errorCode:result.errorCode}:{}),
     ...(result.checks?{checks:result.checks}:{}),
     ...(result.gracefulShutdown?{gracefulShutdown:result.gracefulShutdown}:{}),
     ...(result.portReleased?{portReleased:result.portReleased}:{})};
   }catch{http=FAIL;httpEvidence={status:FAIL,errorCode:'WI02_SOCKET_EXECUTION_FAILED'};}
  }
 }
 const result=classifyWi02(p,{build,http});
 return {schemaVersion:1,task:'WI-02',timestamp:starting,mode,hostPlatform:process.platform,
  ...result,actions:p.actions??[],buildEvidence,httpEvidence,prerequisiteCount:{pass:Object.values(p.checks).filter(x=>x.status===PASS).length,
   blocked:Object.values(p.checks).filter(x=>x.status===BLOCKED).length,
   fail:Object.values(p.checks).filter(x=>x.status===FAIL).length},
  detail:'RUNTIME_VERIFIED covers only reviewed dependency prereqs, Vite build and real Fastify loopback socket lifecycle, NOT media render, browser interactions, AI inference or production approval.'};
}
async function main(){
 const args=parseWi02Args(process.argv.slice(2));
 const r=await runWi02({mode:args.mode});
 if(args.report){const target=safeGateReportPath(root,args.report);await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(r,null,2)+'\n',{mode:0o600})}
 console.log(JSON.stringify(r,null,2));
 if((args.strict||args.mode==='run')&&r.status!=='RUNTIME_VERIFIED')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
