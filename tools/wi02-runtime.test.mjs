import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {parseWi02Args,classifyWi02,safeRuntimeEnv,probeLocalHttp,runWi02} from './wi02-runtime.mjs';
const ok={checks:Object.fromEntries(['windowsHost','node22','architecture','npmLock','vite','fastify','hyperframes','rendererCli','ffmpeg','ffprobe','browser','disk'].map(k=>[k,{status:'PASS'}]))};

test('WI-02: inspect vs run exactly one, invalid switches and report attempts rejected',()=>{
 assert.deepEqual(parseWi02Args(['--inspect']),{mode:'inspect',strict:false,report:null});
 assert.deepEqual(parseWi02Args(['--run','--strict','--report=docs/evidence/WI02_windows_runtime.json']),{mode:'run',strict:true,report:'docs/evidence/WI02_windows_runtime.json'});
 for(const args of [[],['--inspect','--run'],['--run','--run'],['--verify'],['--inspect','--report=a','--report=b'],['--run','--strict','--strict']])
  assert.throws(()=>parseWi02Args(args),/WI02_/);
});
test('WI-02: passing preflight alone is never live runtime or release signoff',()=>{
 const x=classifyWi02(ok);assert.equal(x.status,'NOT_READY');assert.equal(x.gates.socketHttp.status,'BLOCKED');
 const ready=classifyWi02(ok,{build:'PASS',http:'PASS'});
 assert.equal(ready.status,'RUNTIME_VERIFIED');assert.equal(ready.releaseStatus,'NOT_READY');assert.equal(ready.realHyperframesMedia,'NOT_RUN');
});
test('WI-02: blocked dependency or mismatched lock never triggers build',async()=>{
 let called=false;
 const p={checks:{...ok.checks,npmLock:{status:'FAIL'}}};
 const result=await runWi02({mode:'run',preflight:p,buildFn:()=>{called=true;return {status:'PASS'}}});
 assert.equal(called,false);assert.equal(result.status,'FAIL');
 assert.equal(result.gates.viteBuild.status,'BLOCKED');
});
test('WI-02: build failed skips live HTTP entirely and preserves failure',async()=>{
 let http=false;
 const report=await runWi02({mode:'run',preflight:ok,buildFn:()=>({status:'FAIL'}),httpFn:()=>{http=true;return {status:'PASS'}}});
 assert.equal(http,false);assert.equal(report.gates.socketHttp.status,'BLOCKED');assert.equal(report.status,'FAIL');
});
test('WI-02: only real successive build and HTTP pass promotes runtime status (not release)',async()=>{
 const r=await runWi02({mode:'run',preflight:ok,buildFn:()=>({status:'PASS'}),httpFn:()=>({status:'PASS'})});
 assert.equal(r.status,'RUNTIME_VERIFIED');assert.equal(r.releaseStatus,'NOT_READY');
});
test('WI-02: sanitized worker process env excludes secrets, proxies, remote AI and hooks',()=>{
 const e=safeRuntimeEnv({PATH:'/bin',SystemRoot:'C:\\Windows',OPENAI_API_KEY:'secret',
  HTTPS_PROXY:'https://credential@proxy',CONTENTSTUDIO_REMOTE_LLM_CONSENT:'1',NODE_OPTIONS:'--require malware',
  CONTENTSTUDIO_IMAGE_WORKFLOW:'C:/sensitive.json'});
 assert.equal(e.PATH,'/bin');assert.equal(e.SystemRoot,'C:\\Windows');
 assert(!JSON.stringify(e).includes('secret'));assert(!('OPENAI_API_KEY' in e));assert(!('HTTPS_PROXY' in e));
 assert(!('NODE_OPTIONS' in e));assert(!('CONTENTSTUDIO_REMOTE_LLM_CONSENT' in e));
});
test('WI-02: real loopback HTTP probe detects proper health, auth guard, static UI and headers',async()=>{
 const server=createServer((req,res)=>{
  res.setHeader('x-frame-options','DENY');
  if(req.url==='/health'){res.setHeader('content-type','application/json');res.end(JSON.stringify({service:'contentstudio'}));}
  else if(req.url==='/api/channels'){res.statusCode=401;res.end('');}
  else if(req.url==='/api/wi02-unknown-route'){res.statusCode=401;res.end('');}
  else {res.setHeader('content-type','text/html');res.end('<html><script src="/bundle.js"></script></html>');}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const port=server.address().port;
  const r=await probeLocalHttp(`http://127.0.0.1:${port}`);
  assert.deepEqual(Object.values(r),['PASS','PASS','PASS','PASS','PASS']);
  await assert.rejects(probeLocalHttp(`http://localhost:${port}`),/LOOPBACK_ONLY/);
 }finally{await new Promise(ok=>server.close(ok))}
});
test('WI-02: bad public endpoint auth or missing UI causes fail',async()=>{
 const server=createServer((req,res)=>{
  if(req.url==='/health'){res.setHeader('content-type','application/json');res.end('{"service":"contentstudio"}');}
  else {res.end('<html></html>');}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{await assert.rejects(probeLocalHttp(`http://127.0.0.1:${server.address().port}`),/AUTH_GUARD_FAILED/)}
 finally{await new Promise(ok=>server.close(ok))}
});
test('WI-02: actual Linux inspect truthfully blocks Windows and runtime, strict run exits nonzero',()=>{
 if(process.platform==='win32')return;
 const r=spawnSync(process.execPath,['tools/wi02-runtime.mjs','--inspect'],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:20000});
 assert.equal(r.status,0,r.stderr);const p=JSON.parse(r.stdout);
 assert.equal(p.status,'NOT_READY');assert.equal(p.releaseStatus,'NOT_READY');
 const f=spawnSync(process.execPath,['tools/wi02-runtime.mjs','--run'],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:20000});
 assert.equal(f.status,1,f.stderr);assert.equal(JSON.parse(f.stdout).gates.socketHttp.status,'BLOCKED');
});
test('WI-02: PowerShell phase wrapper is separate, does not silently install or declare release',async()=>{
 const t=await readFile(new URL('./WI02-Windows-Runtime.ps1',import.meta.url),'utf8');
 assert.match(t,/WI02_EXACTLY_ONE_PHASE_REQUIRED/);assert.match(t,/\-ResolveLock/);
 assert.match(t,/\-Install/);assert.match(t,/\-Verify/);
 assert.doesNotMatch(t,/npm\s+install\s+--force/i);
});
