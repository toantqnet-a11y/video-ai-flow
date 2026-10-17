/** R0-04 offline tests: no GPU, provider, Windows machine or npm dependencies required. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createDiagnosticsService,evaluateSystem,probeLocalComfy,systemCommand} from '../src/diagnostics.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {installSecurity} from '../src/security.mjs';

const GiB=1024**3;
function setup({commands={},diskFree=20*GiB,comfy=false,clock,ttlMs=30000,providerList=[]}={}) {
  const dir=mkdtempSync(join(tmpdir(),'r004-'));
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode=WAL'); // In-memory SQLite remains "memory", reported warning.
  let count=0,localCalls=0;
  const service=createDiagnosticsService({db,dataRoot:dir,clock:clock??(()=>Date.now()),ttlMs,
    registry:{list:()=>providerList},localComfyConfigured:comfy,
    filesystem:{statfs:()=>({blocks:100n,bsize:BigInt(GiB),bavail:BigInt(diskFree/GiB)})},
    host:{totalmem:()=>16*GiB,freemem:()=>8*GiB,availableParallelism:()=>8},
    command:async(name,args)=>{
      count++;
      const key=name+(args.includes('-encoders')?'_encoders':'');
      if(commands[key] instanceof Error)throw commands[key];
      return commands[key]??({ok:name==='ffmpeg'||name==='ffprobe',text:name==='ffmpeg_encoders'?' V..... libx264\n A..... aac': ''});
    },
    localProbe:async()=>{localCalls++;return {ok:true}}});
  return {service,db,dir,get calls(){return count},get localCalls(){return localCalls},close(){db.close();rmSync(dir,{recursive:true,force:true})}};
}
function sample(overrides={}){return {platform:'linux',arch:'x64',nodeVersion:'v22.16.0',cpuCores:8,
  totalRamBytes:16*GiB,freeRamBytes:8*GiB,diskBytes:100*GiB,diskFreeBytes:40*GiB,sqliteOk:true,sqliteWal:true,
  ffmpeg:{ok:true},ffprobe:{ok:true},encoders:{h264:true,aac:true},gpu:{ok:false,reason:'NOT_INSTALLED'},...overrides}}

test('evaluator reports render capabilities, defers real inference/Windows validation',()=>{
  const r=evaluateSystem(sample());
  assert.equal(r.readiness.render,true);assert.equal(r.readiness.editing,true);
  assert.equal(r.readiness.localAiVideo,false);assert.equal(r.validation.windowsHardware,false);
  assert.equal(r.validation.fullLengthRender,false);
  assert.equal(r.checks.find(c=>c.id==='gpu').state,'missing');
  assert.equal(r.checks.find(c=>c.id==='windows').state,'unconfigured');
});
test('missing ffmpeg cannot be marked render ready even if ffprobe exists',()=>{
  const r=evaluateSystem(sample({ffmpeg:{ok:false,reason:'NOT_INSTALLED'}}));
  assert.equal(r.readiness.render,false);
  assert.equal(r.checks.find(c=>c.id==='ffmpeg').state,'missing');
});
test('missing H.264 codec prevents MP4 readiness, not general SQLite editing',()=>{
  const r=evaluateSystem(sample({encoders:{h264:false,aac:true}}));
  assert.equal(r.readiness.render,false);assert.equal(r.readiness.editing,true);
  assert.equal(r.checks.find(c=>c.id==='ffmpeg').detail,'REQUIRED_ENCODER_MISSING');
});
test('storage less than 2GiB blocks render readiness and shows warning',()=>{
  const r=evaluateSystem(sample({diskFreeBytes:0.5*GiB}));
  assert.equal(r.readiness.render,false);assert.equal(r.checks.find(c=>c.id==='disk').state,'warning');
});
test('SQLite error disables editing even when FFmpeg is present',()=>{
  const r=evaluateSystem(sample({sqliteOk:false}));
  assert.equal(r.readiness.editing,false);assert.equal(r.readiness.render,false);
});
test('sensitive machine data and raw provider URLs never appear in result',()=>{
  const r=evaluateSystem(sample({providers:[{id:'edge',kind:'tts',location:'remote',costTier:'free_unverified',
    url:'https://example.com/token-secret',apiKey:'NEVER_EXPOSE_THIS'}]}));
  const output=JSON.stringify(r);
  assert.ok(!output.includes('NEVER_EXPOSE_THIS')&&!output.includes('example.com'));
  assert.ok(!output.includes('token-secret'));
  assert.equal(r.checks.find(c=>c.id==='provider:edge').state,'unknown');
});
test('configured local endpoint responding does not mean AI inference verified',()=>{
  const r=evaluateSystem(sample({providers:[{id:'comfyui',kind:'image',location:'local',costTier:'local'}],comfyCheck:{ok:true}}));
  const provider=r.checks.find(c=>c.id==='provider:comfyui');
  assert.equal(provider.state,'ready');assert.equal(provider.metrics.inferenceVerified,false);
  assert.equal(r.readiness.localAiVideo,false);
});
test('invalid status and nonallowlisted host fields are normalized',()=>{
  const r=evaluateSystem(sample({platform:'custom-private-platform',arch:'my-username',
    gpu:{ok:false,reason:'x'.repeat(400)}}));
  assert.deepEqual(r.environment,{platform:'other',arch:'other',nodeMajor:22});
  assert.ok(!JSON.stringify(r).includes('my-username'));
});
test('service cache avoids redundant subprocesses and supports explicit refresh',async()=>{
  let now=10000;const x=setup({clock:()=>now,ttlMs:30000});
  try{
    const a=await x.service.get();assert.equal(x.calls,4);
    assert.strictEqual(await x.service.get(),a);assert.equal(x.calls,4);
    now+=40000;const b=await x.service.get();assert.notStrictEqual(a,b);assert.equal(x.calls,8);
    await x.service.get({force:true});assert.equal(x.calls,12);
  }finally{x.close();}
});
test('concurrent dashboard GET and refresh share one active probe',async()=>{
  const x=setup();try{
    const results=await Promise.all([x.service.get(),x.service.get(),x.service.get({force:true})]);
    assert.strictEqual(results[0],results[1]);assert.strictEqual(results[1],results[2]);
    assert.equal(x.calls,4);
  }finally{x.close();}
});
test('unconfigured ComfyUI never triggers an outbound fetch',async()=>{
  const x=setup({providerList:[{id:'edge',kind:'tts',location:'remote',costTier:'free_unverified'}]});
  try{const r=await x.service.get();assert.equal(x.localCalls,0);
    assert.equal(r.checks.find(c=>c.id==='comfyui').state,'unconfigured');}
  finally{x.close();}
});
test('configured ComfyUI pings only explicitly local endpoint',async()=>{
  const x=setup({comfy:true,providerList:[{id:'comfyui',kind:'video',location:'local',costTier:'local'}]});
  try{const r=await x.service.get();assert.equal(x.localCalls,1);
    assert.equal(r.checks.find(c=>c.id==='provider:comfyui').state,'ready');}
  finally{x.close();}
});
test('probe failure is isolated; dashboard still returns bounded error state',async()=>{
  const x=setup({commands:{ffmpeg_encoders:new Error('SECRET_IN_THROWN_MESSAGE'),ffprobe:{ok:false,reason:'TIMEOUT'}}});
  try{const r=await x.service.get();assert.equal(r.readiness.render,false);
    assert.ok(!JSON.stringify(r).includes('SECRET_IN_THROWN_MESSAGE'));
    assert.equal(r.checks.find(c=>c.id==='ffprobe').detail,'TIMEOUT');}
  finally{x.close();}
});
test('SQLite sync query failure safely degrades with no thrown DB paths',async()=>{
  const x=setup();try{x.db.close();const r=await x.service.get();
    assert.equal(r.checks.find(c=>c.id==='sqlite').state,'missing');
  }finally{rmSync(x.dir,{recursive:true,force:true});}
});
test('remote ComfyUI URL is rejected before any fetch',async()=>{
  let fetches=0;
  for(const u of ['https://example.com','http://localhost:8188','http://127.0.0.1:8188/foo',
    'http://user:pass@127.0.0.1:8188','http://127.0.0.1:8188/?key=secret']){
    const r=await probeLocalComfy(u,{fetchImpl:()=>{fetches++;throw Error('Unexpected fetch')}});
    assert.equal(r.reason,'INVALID_LOCAL_ENDPOINT',u);
  }
  assert.equal(fetches,0);
});
test('local ComfyUI probe allows 200, rejects redirect and never follows it',async()=>{
  let observed='';const ok=await probeLocalComfy('http://127.0.0.1:8188',
    {fetchImpl:async(url,opts)=>{observed=url;assert.equal(opts.redirect,'manual');return {ok:true}}});
  assert.deepEqual(ok,{ok:true});assert.equal(observed,'http://127.0.0.1:8188/system_stats');
  const redirected=await probeLocalComfy('http://127.0.0.1:8188',{fetchImpl:async()=>({ok:false,status:302})});
  assert.equal(redirected.ok,false);
});
test('systemCommand reports NOT_INSTALLED without leaking the child error message',async()=>{
  const r=await systemCommand('contentstudio_command_that_does_not_exist_0067',[]);
  assert.deepEqual(r,{ok:false,reason:'NOT_INSTALLED'});
});
test('API route exposes GET and protected POST refresh with no arbitrary input',async()=>{
  const registered=new Map(),app={};
  for(const method of ['get','post','put','patch','delete'])app[method]=(url,cb)=>registered.set(`${method} ${url}`,cb);
  const x=setup();try{
    registerStudioRoutes(app,{controllers:{},store:{},diagnostics:x.service});
    const response={status:200,code(n){this.status=n;return this},send(x){return x}};
    const get=registered.get('get /api/system/diagnostics');
    assert.equal((await get({log:{warn(){}}},response)).schemaVersion,1);
    const refresh=registered.get('post /api/system/diagnostics/refresh');
    assert.equal((await refresh({body:{},log:{warn(){}}},response)).schemaVersion,1);
    assert.equal(x.calls,8);
    const bad=await refresh({body:{command:'rm -rf',apiKey:'secret'},log:{warn(){}}},response);
    assert.deepEqual(bad,{error:'INVALID_DIAGNOSTICS_REQUEST'});
    assert.equal(response.status,400);
  }finally{x.close();}
});
test('global security still guards new /api/system routes',async()=>{
  const hooks=new Map(),app={addHook(name,fn){hooks.set(name,fn)},post(){}};
  installSecurity(app,{port:4311});
  const raw={url:'/api/system/diagnostics',method:'GET',headers:{host:'127.0.0.1:4311'},
    rawHeaders:['host','127.0.0.1:4311'],socket:{remoteAddress:'127.0.0.1'}};
  const reply={code(n){this.status=n;return this},send(payload){this.body=payload;return this}};
  await hooks.get('onRequest')({raw,url:raw.url,method:raw.method},reply);
  assert.equal(reply.status,401);
});
