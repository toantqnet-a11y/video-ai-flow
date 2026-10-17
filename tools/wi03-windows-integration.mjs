#!/usr/bin/env node
/** WI-03: evidence-backed Windows hosted smoke, not a release certificate.
 * Verifies the real installed Fastify loopback socket, graceful shutdown, and
 * a freshly launched local Edge/Chrome rendering the *built* React pairing UI.
 * Never reads personal projects, captures pairing codes, or contacts AI APIs.
 */
import {fork,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectWindowsPreflight} from './wi01-windows-preflight.mjs';
import {runSocketHttp,safeRuntimeEnv} from './wi02-runtime.mjs';
import {safeGateReportPath} from './fi04-runtime-gates.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const PASS='PASS',FAIL='FAIL',BLOCKED='BLOCKED';
const wait=(promise,ms)=>new Promise((yes,no)=>{
  const timer=setTimeout(()=>no(Error('WI03_TIMEOUT')),ms);
  Promise.resolve(promise).then(v=>{clearTimeout(timer);yes(v)},e=>{clearTimeout(timer);no(e)});
});
function findBrowser(){
  const env=process.env;
  const roots=[env.ProgramFiles,env['ProgramFiles(x86)'],env.LOCALAPPDATA].filter(Boolean);
  for(const base of roots)for(const rel of [
    ['Microsoft','Edge','Application','msedge.exe'],
    ['Google','Chrome','Application','chrome.exe']
  ]){
    const binary=join(base,...rel);
    if(existsSync(binary))return binary;
  }
  return null;
}
async function availablePort(){
  const server=createServer();
  try{
    await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes)});
    return server.address().port;
  }finally{await new Promise(done=>server.close(done));}
}
/** Same-origin browser probe: UI must be populated by JavaScript, not merely
 * serve the static index. The one-time backend pairing code is suppressed.
 * A disposable browser profile prevents reuse of real authentication state.
 */
export async function probeWindowsBrowser({browser=findBrowser()}={}){
  if(process.platform!=='win32')return {status:BLOCKED,reason:'WI03_WINDOWS_REQUIRED'};
  if(!browser)return {status:BLOCKED,reason:'WI03_CHROME_EDGE_NOT_INSTALLED'};
  const disposable=await mkdtemp(join(tmpdir(),'studio-wi03-'));
  const profile=join(disposable,'browser');
  const port=await availablePort();
  const env={...safeRuntimeEnv(),NODE_ENV:'production',
    CONTENTSTUDIO_REMOTE_LLM_CONSENT:'0',CONTENTSTUDIO_PORT:String(port),
    CONTENTSTUDIO_DATA_DIR:join(disposable,'data')};
  let child,stopped=false;
  try{
    child=fork(join(root,'tools','wi02-api-child.mjs'),[],{
      cwd:root,env,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']
    });
    await wait(new Promise((yes,no)=>{
      child.on('message',m=>{
        if(m?.type==='ready')yes();
        if(m?.type==='startup_error')no(Error('WI03_API_START_FAILED'));
      });
      child.once('exit',()=>no(Error('WI03_API_EXITED')));
      child.once('error',()=>no(Error('WI03_API_SPAWN_FAILED')));
    }),30000);
    const args=['--headless=new','--disable-gpu','--disable-extensions',
      '--disable-background-networking','--no-first-run','--no-default-browser-check',
      '--no-sandbox','--virtual-time-budget=6000',
      '--user-data-dir='+profile,'--dump-dom','http://127.0.0.1:'+port+'/'];
    // The separate API child can still answer while the headless browser runs.
    // Never log DOM, stderr, cookies, startup code or the ephemeral port.
    const result=spawnSync(browser,args,{cwd:root,env:safeRuntimeEnv(),
      windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],
      timeout:50000,maxBuffer:3*1024*1024});
    if(result.error||result.status!==0)return {status:FAIL,reason:result.error?.code==='ETIMEDOUT'?'WI03_BROWSER_TIMEOUT':'WI03_BROWSER_PROCESS_FAILED'};
    const dom=String(result.stdout??'');
    // The pairing card is added by React; an index.html-only check is invalid.
    if(!/<main[^>]+class=["']pairing["']/i.test(dom)||!dom.includes('ContentStudio')){
      return {status:FAIL,reason:'WI03_REACT_PAIRING_NOT_RENDERED'};
    }
    return {status:PASS,realBrowserDom:true,isolatedProfile:true,loopbackOnly:true};
  }catch(e){
    return {status:FAIL,reason:/^WI03_[A-Z_]+$/.test(e?.message??'')?e.message:'WI03_BROWSER_SMOKE_FAILED'};
  }finally{
    if(child&&child.exitCode===null){
      try{child.send({type:'stop'})}catch{}
      try{await wait(new Promise(done=>child.once('exit',done)),8000);stopped=true}catch{
        try{child.kill('SIGKILL')}catch{}
        try{await wait(new Promise(done=>child.once('exit',done)),4000)}catch{}
      }
    }
    await rm(disposable,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
  }
}
export function evaluateWi03({platform,frontendBuild,realSocket,browser}={}){
  const gates={
    windowsHost:{status:platform==='win32'?PASS:BLOCKED},
    frontendBuild:{status:frontendBuild?PASS:FAIL},
    fastifyRealSocket:{status:realSocket?.status===PASS?PASS:FAIL},
    chromeEdgeReactDom:{status:browser?.status===PASS?PASS:browser?.status===BLOCKED?BLOCKED:FAIL}
  };
  return {status:Object.values(gates).every(g=>g.status===PASS)?'HOSTED_WINDOWS_RUNTIME_VERIFIED':
    Object.values(gates).some(g=>g.status===FAIL)?FAIL:BLOCKED,
    gates,productionRelease:'NOT_READY'};
}
async function main(){
  const argv=process.argv.slice(2);
  if(argv.length>1||argv.length===1&&!/^--report=docs\/evidence\/[a-zA-Z0-9_-]+\.json$/.test(argv[0])){
    throw Error('WI03_INVALID_ARGUMENTS');
  }
  const preflight=await inspectWindowsPreflight();
  const frontendBuild=existsSync(join(root,'apps','web','dist','index.html'));
  const socket=await runSocketHttp();
  const browser=frontendBuild?await probeWindowsBrowser():{status:BLOCKED,reason:'WI03_FRONTEND_NOT_BUILT'};
  const verified=evaluateWi03({platform:process.platform,frontendBuild,realSocket:socket,browser});
  const report={schemaVersion:1,task:'WI-03',timestamp:new Date().toISOString(),
    hostPlatform:process.platform,platformLabel:'HOSTED_WINDOWS_RUNNER_NOT_WINDOWS_11_DESKTOP',
    ...verified,preflight:{status:preflight.status,
      gates:Object.fromEntries(Object.entries(preflight.checks).map(([k,v])=>[k,v.status]))},
    browser:{status:browser.status,...(browser.reason?{errorCode:browser.reason}:{}),
      ...(browser.realBrowserDom?{realBrowserDom:true}:{} )},
    socket:{status:socket.status,...(socket.errorCode?{errorCode:socket.errorCode}:{}),
      ...(socket.gracefulShutdown?{gracefulShutdown:socket.gracefulShutdown}:{}),
      ...(socket.portReleased?{portReleased:socket.portReleased}:{})},
    boundaries:'Does not verify authenticated Timeline/drag, real HyperFrames render, local GPU or 35+ minute jobs. No AI provider contacted.'};
  const name=argv[0]?.slice('--report='.length)??'docs/evidence/WI03_hosted_windows.json';
  const target=safeGateReportPath(root,name);
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log('WI03_HOSTED_WINDOWS_REPORT '+JSON.stringify(report));
  if(verified.status!=='HOSTED_WINDOWS_RUNTIME_VERIFIED')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
