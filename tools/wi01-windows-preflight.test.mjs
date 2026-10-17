import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {classifyWindowsPreflight,windowsBrowserInstalled,parseArgs,inspectWindowsPreflight} from './wi01-windows-preflight.mjs';
const good={platform:'win32',nodeVersion:{major:22,minor:16},arch:'x64',lock:'PASS',vite:'PASS',fastify:'PASS',hyperframes:'PASS',rendererCli:true,rendererPin:'0.8.159',ffmpeg:true,ffprobe:true,browser:true,freeBytes:30*1024**3};
test('WI-01: ready means prerequisites only, NEVER release certification',()=>{
 const r=classifyWindowsPreflight(good);
 assert.equal(r.status,'PREREQUISITES_OK');assert.equal(r.releaseStatus,'NOT_READY');
 assert.equal(r.operatorAcceptanceStatus,'NOT_RUN');assert.equal(r.actions.length,0);
});
test('WI-01: non-Windows host cannot assert Windows readiness',()=>{
 const r=classifyWindowsPreflight({...good,platform:'linux'});
 assert.equal(r.checks.windowsHost.status,'BLOCKED');assert.equal(r.checks.browser.status,'BLOCKED');
 assert.equal(r.releaseStatus,'NOT_READY');assert.equal(r.status,'BLOCKED');
});
test('WI-01: missing workspace packages and lock produce actionable unique remediation',()=>{
 const r=classifyWindowsPreflight({...good,lock:'BLOCKED',vite:'BLOCKED',hyperframes:'BLOCKED',rendererCli:false});
 assert.deepEqual(r.actions.map(a=>a.gate),['npmLock','vite','hyperframes','rendererCli']);
 assert.ok(r.actions.every(a=>/^[A-Z0-9_]+$/.test(a.action)));
});
test('WI-01: invalid lock fails (never treated as missing only)',()=>{
 const r=classifyWindowsPreflight({...good,lock:'FAIL'});
 assert.equal(r.checks.npmLock.status,'FAIL');assert.equal(r.status,'BLOCKED');
});
test('WI-01: disk checks are conservative and fail closed on unknown bytes',()=>{
 assert.equal(classifyWindowsPreflight({...good,freeBytes:null}).checks.disk.status,'BLOCKED');
 assert.equal(classifyWindowsPreflight({...good,freeBytes:19*1024**3}).checks.disk.status,'BLOCKED');
});
test('WI-01: no browser spoof from Linux or environment vars',()=>{
 assert.equal(windowsBrowserInstalled({ProgramFiles:'/tmp'},'linux'),false);
});
test('WI-01: strict CLI inputs and no ambiguous flag duplication',()=>{
 assert.deepEqual(parseArgs(['--inspect','--strict']),{inspect:true,strict:true,report:null});
 assert.throws(()=>parseArgs(['--strict']),/INSPECT_REQUIRED/);
 assert.throws(()=>parseArgs(['--inspect','--inspect']),/UNSUPPORTED/);
 assert.throws(()=>parseArgs(['--inspect','--write-secrets']),/UNSUPPORTED/);
});
test('WI-01: actual inspect is read-only and correctly blocks unsupported host',async()=>{
 const r=await inspectWindowsPreflight();
 assert.equal(r.releaseStatus,'NOT_READY');assert.ok(!JSON.stringify(r).includes('node_modules/'));
 assert.ok(r.checks.ffmpeg.status==='PASS'||r.checks.ffmpeg.status==='BLOCKED');
 if(process.platform!=='win32')assert.equal(r.status,'BLOCKED');
});
test('WI-01: strict CLI exits nonzero on missing Windows prereqs',()=>{
 if(process.platform==='win32')return; // Host may legitimately pass some prerequisites
 const r=spawnSync(process.execPath,['tools/wi01-windows-preflight.mjs','--inspect','--strict'],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:15000});
 assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).releaseStatus,'NOT_READY');
});
