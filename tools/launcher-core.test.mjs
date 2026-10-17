/** R0-01 tests require neither npm install nor Windows hardware. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {createServer} from 'node:net';
import {createServer as httpServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseOptions,assertNodeVersion,resolveConfig,assertPortAvailable,acquireLauncherLock,waitForHealth} from './launcher-core.mjs';

const withTemp=async fn=>{const dir=await mkdtemp(join(tmpdir(),'cs-launch-test-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}};
const listen=async(server)=>{await new Promise(done=>server.listen(0,'127.0.0.1',done));return server.address().port;};
const close=async(server)=>new Promise(done=>server.close(done));

test('default command starts production UI+API',()=>{
  assert.deepEqual(parseOptions([]),{mode:'start',skipInstall:false,skipBuild:false,noBrowser:false});
});
test('options and modes are explicit',()=>{
  assert.equal(parseOptions(['start','--skip-install','--no-browser']).skipInstall,true);
  assert.equal(parseOptions(['test']).mode,'test');
  assert.throws(()=>parseOptions(['diagnose','--skip-build']),/INVALID_LAUNCH_ARGUMENT/);
  assert.throws(()=>parseOptions(['start','start']),/INVALID_LAUNCH_ARGUMENT/);
  assert.throws(()=>parseOptions(['--bad']),/INVALID_LAUNCH_ARGUMENT/);
});
test('minimum Node version is enforced (including minor version)',()=>{
  for(const v of ['18.20.0','20.99.0','22.12.9','a'])assert.throws(()=>assertNodeVersion(v),/NODE_22_13_REQUIRED/);
  assert.equal(assertNodeVersion('22.13.0'),'22.13.0');
  assert.equal(assertNodeVersion('23.0.0'),'23.0.0');
});
test('config shares cwd-relative data root and validates port',()=>{
  const r=resolveConfig('/workspace/studio',{CONTENTSTUDIO_DATA_DIR:'storage',CONTENTSTUDIO_PORT:'4432'});
  assert.equal(r.dataDir,'/workspace/studio/storage');
  assert.equal(r.url,'http://127.0.0.1:4432/');
  for(const p of ['0','80','65536','4000/evil','-1','4311?foo'])assert.throws(()=>resolveConfig('/tmp',{CONTENTSTUDIO_PORT:p}),/INVALID_PORT/);
});
test('free port accepted',async()=>{
  const s=createServer();const p=await listen(s);await close(s);
  await assertPortAvailable(p);
});
test('port occupied is rejected without contacting or killing owner',async()=>{
  const server=createServer();const p=await listen(server);
  try{await assert.rejects(assertPortAvailable(p),/LOCAL_PORT_UNAVAILABLE/);}finally{await close(server);}
});
test('lock denies second instance; releasing only owner clears lock',async()=>withTemp(async dir=>{
  const release=await acquireLauncherLock(dir);
  await assert.rejects(acquireLauncherLock(dir),/CONTENTSTUDIO_ALREADY_RUNNING/);
  const before=JSON.parse(await readFile(join(dir,'.contentstudio-launcher.lock'),'utf8'));
  assert.equal(before.pid,process.pid);
  await release();await release();
  await assert.rejects(access(join(dir,'.contentstudio-launcher.lock')), {code:'ENOENT'});
}));
test('stale lock from dead owner is recovered',async()=>withTemp(async dir=>{
  const deadRelease=await acquireLauncherLock(dir,{pid:77777777});
  const replacement=await acquireLauncherLock(dir,{alive:()=>false});
  await deadRelease();
  await access(join(dir,'.contentstudio-launcher.lock'));
  await replacement();
  await assert.rejects(access(join(dir,'.contentstudio-launcher.lock')),{code:'ENOENT'});
}));
test('health validates service identity, not just an arbitrary 200 response',async()=>{
  let valid=false;
  const s=httpServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(valid?{status:'ok',service:'contentstudio'}:{status:'ok',service:'unrelated'}));});
  const p=await listen(s);
  try{
    await assert.rejects(waitForHealth({url:`http://127.0.0.1:${p}`,timeoutMs:100,intervalMs:20}),/API_STARTUP_TIMEOUT/);
    valid=true;
    assert.equal(await waitForHealth({url:`http://127.0.0.1:${p}`,timeoutMs:500,intervalMs:10}),true);
  }finally{await close(s);}
});
test('health fails fast when API child exits, rather than claiming ready',async()=>{
  await assert.rejects(waitForHealth({url:'http://127.0.0.1:4311',isExited:()=>true}),/API_PROCESS_EXITED_EARLY/);
});
