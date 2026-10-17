import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {RELEASE_GATES,gate,releaseSummary,dependencyInstallPlan,freshEvidenceRequired} from './fi02-release-core.mjs';

test('FI-02 blocks release when only full offline suite is PASS',()=>{
 const all=Object.fromEntries(RELEASE_GATES.map(k=>[k,gate('BLOCKED','Not verified')]));
 all.fullOfflineSuite=gate('PASS','Real test run');
 assert.deepEqual(releaseSummary(all),{summary:{pass:1,blocked:RELEASE_GATES.length-1,fail:0},status:'NOT_READY'});
 assert.equal(freshEvidenceRequired(all),false);
});
test('FI-02 a genuine failure cannot be masked by other green gates',()=>{
 const all=Object.fromEntries(RELEASE_GATES.map(k=>[k,gate('PASS','Observed')]));
 assert.equal(releaseSummary(all).status,'READY_FOR_MANUAL_REVIEW');
 all.realHyperframesFinishing=gate('FAIL','actual renderer failed');
 assert.equal(releaseSummary(all).status,'FAILED');
 assert.equal(freshEvidenceRequired(all),false);
});
test('FI-02 rejects missing gates, unknown status and forged arrays',()=>{
 assert.throws(()=>gate('UNKNOWN','bad'),/FI02_INVALID_GATE_STATUS/);
 assert.throws(()=>releaseSummary({}),/FI02_MISSING_REQUIRED_GATE/);
 assert.throws(()=>gate('PASS','x'.repeat(1000)),/FI02_INVALID_GATE_DETAIL/);
});
test('FI-02 Windows launcher refuses unlocked npm install and skip-install bypass',()=>{
 for(const lockStatus of ['BLOCKED','FAIL',null]){
  assert.throws(()=>dependencyInstallPlan({lockStatus,dependenciesPresent:false}),/PACKAGE_LOCK_UNVERIFIED/);
  assert.throws(()=>dependencyInstallPlan({lockStatus,dependenciesPresent:true,skipInstall:true}),/PACKAGE_LOCK_UNVERIFIED/);
 }
 assert.deepEqual(dependencyInstallPlan({lockStatus:'PASS',dependenciesPresent:false}),['ci','--no-audit','--no-fund']);
 assert.throws(()=>dependencyInstallPlan({lockStatus:'PASS',dependenciesPresent:false,skipInstall:true}),/DEPENDENCIES_MISSING_SKIP_INSTALL/);
 assert.equal(dependencyInstallPlan({lockStatus:'PASS',dependenciesPresent:true}),null);
});
test('FI-02 a default release scan never infers HyperFrames render from fake FFmpeg success',()=>{
 const run=spawnSync(process.execPath,['tools/fi02-release.mjs'],{cwd:new URL('../',import.meta.url),
  encoding:'utf8',timeout:25000,maxBuffer:1024*1024});
 assert.equal(run.status,0,run.stderr?.slice(-1000));
 const output=JSON.parse(run.stdout);
 assert.equal(output.status,'NOT_READY');
 assert.ok(output.blocked.includes('realHyperframesFinishing'));
 assert.ok(output.blocked.includes('windowsBrowserUX'));
 assert.ok(output.blocked.includes('real35MinuteRender'));
});
test('FI-02 strict acceptance correctly exits nonzero on blocked requirements',()=>{
 const run=spawnSync(process.execPath,['tools/fi02-release.mjs','--strict'],{cwd:new URL('../',import.meta.url),
  encoding:'utf8',timeout:25000,maxBuffer:1024*1024});
 assert.equal(run.status,1);
 assert.equal(JSON.parse(run.stdout).status,'NOT_READY');
});

test('FI-02 workspace lock rejects missing workspace link, mutated dependency',async()=>{
 const {verifyWorkspaceLock}=await import('./fi02-lock-policy.mjs');
 const root=await mkdtemp(join(tmpdir(),'fi02-ws-'));
 try{
  await mkdir(join(root,'apps','web'),{recursive:true});
  const manifest={name:'studio',workspaces:['apps/*'],devDependencies:{hyperframes:'0.8.159'}};
  const workspace={name:'@studio/web',dependencies:{react:'^19.1.0'}};
  const lock={name:'studio',lockfileVersion:3,packages:{
   '':{devDependencies:{hyperframes:'0.8.159'}},
   'node_modules/hyperframes':{version:'0.8.159'},
   'apps/web':{dependencies:{react:'^19.1.0'}},
   'node_modules/@studio/web':{link:true,resolved:'apps/web'},
  }};
  await writeFile(join(root,'package.json'),JSON.stringify(manifest));
  await writeFile(join(root,'apps','web','package.json'),JSON.stringify(workspace));
  await writeFile(join(root,'package-lock.json'),JSON.stringify(lock));
  assert.deepEqual(await verifyWorkspaceLock(root),{status:'PASS',reason:'All workspace manifests and links match lockfile',verifiedWorkspaces:1});
  lock.packages['node_modules/@studio/web'].resolved='packages/wrong';
  await writeFile(join(root,'package-lock.json'),JSON.stringify(lock));
  assert.equal((await verifyWorkspaceLock(root)).status,'FAIL');
  lock.packages['node_modules/@studio/web'].resolved='apps/web';
  workspace.dependencies.react='^18.0.0';
  await writeFile(join(root,'apps','web','package.json'),JSON.stringify(workspace));
  await writeFile(join(root,'package-lock.json'),JSON.stringify(lock));
  assert.equal((await verifyWorkspaceLock(root)).status,'FAIL');
 }finally{await rm(root,{recursive:true,force:true});}
});
