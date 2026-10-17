import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,AssetManifest} from '../../../packages/core/src/index.mjs';
import {ProviderRegistry} from '../../../packages/providers/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {createJobHandlers} from '../src/handlers.mjs';
import {createControllers} from '../src/controllers.mjs';
import {createSecurityGate} from '../../../packages/security/src/index.mjs';

async function fixture(){const dir=await mkdtemp(join(tmpdir(),'cs-api-'));const filename=join(dir,'studio.sqlite');const db=openProjectDb(filename);const repo=new StudioRepository(db);const store=new JobStore({path:filename,leaseMs:500});const registry=new ProviderRegistry();const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});const ctl=createControllers({repo,store,registry,manifest});return {dir,db,repo,store,registry,manifest,ctl,async close(){store.close();db.close();await rm(dir,{recursive:true,force:true})}};}
test('shared database for domain and existing SP04 queue',async()=>{const f=await fixture();try{const c=f.ctl.createChannel({name:'K'}),v=f.ctl.createVideo(c.id,{title:'Video'});assert.equal(f.ctl.videos(c.id).items[0].id,v.id);const job=f.ctl.queueDiagnostic({idempotencyKey:'demo'});assert.equal(job.job.kind,'system:diagnostic');assert.equal(f.store.countByStatus().pending,1);}finally{await f.close()}});
test('real handler system:diagnostic is executed by existing queue runner',async()=>{const f=await fixture();let runner;try{const job=f.ctl.queueDiagnostic({idempotencyKey:'run'}).job;runner=new JobRunner(f.store,createJobHandlers({repo:f.repo,registry:f.registry,dataRoot:f.dir}),{concurrency:1,heartbeatMs:100,pollMs:10});runner.start();await runner.waitForIdle({timeoutMs:8000});assert.equal(f.store.get(job.id).status,'succeeded');assert.equal(typeof f.store.get(job.id).result.ffmpegAvailable,'boolean');}finally{await runner?.stop();await f.close()}});
test('controller rejects missing/invalid asset jobs before external calls',async()=>{const f=await fixture();try{const c=f.ctl.createChannel({name:'K'}),v=f.ctl.createVideo(c.id,{title:'V'});const [scene]=f.ctl.replaceScenes(v.id,{rowVersion:1,scenes:[{text:'Xin chào',durationMs:2000}]});assert.throws(()=>f.ctl.queueAsset(scene.id,{kind:'voice',idempotencyKey:'tts'}),{code:'REMOTE_CONSENT_REQUIRED'});const job=f.ctl.queueAsset(scene.id,{kind:'voice',idempotencyKey:'tts',remoteConsent:true});assert.equal(job.job.kind,'asset:voice');}finally{await f.close()}});
test('token gate denies fake origins and writes without CSRF',()=>{const s=createSecurityGate({port:4311});const code=s.pairingCodeForTerminal();assert.equal(s.verifyTransport({host:'evil.com',origin:null,peer:'127.0.0.1'}),'BAD_HOST');assert.equal(s.verifyTransport({host:'127.0.0.1:4311',origin:'http://evil.com',peer:'127.0.0.1'}),'INVALID_ORIGIN');const p=s.pair(code);assert.ok(p.bearer);assert.equal(s.pair(code).error,'ALREADY_PAIRED');assert.equal(s.authorize({authorization:`Bearer ${p.bearer}`,method:'POST'}),'CSRF_REQUIRED');assert.equal(s.authorize({authorization:`Bearer ${p.bearer}`,csrfHeader:p.csrf,method:'POST'}),null);});
test('provider registry never auto-escalates local to remote or paid',async()=>{const reg=new ProviderRegistry();let calls=0;reg.register({id:'cloud',kind:'tts',location:'remote',costTier:'paid',estimateCostMicroUsd:()=>250000,invoke:async()=>++calls});await assert.rejects(reg.invoke('cloud',{},{}),/REMOTE_CONSENT_REQUIRED/);await assert.rejects(reg.invoke('cloud',{}, {allowRemote:true}),/PAID_APPROVAL_REQUIRED/);assert.equal(calls,0);await assert.rejects(reg.invoke('cloud',{}, {allowRemote:true,paidApproval:{providerId:'cloud',approved:true,maxUsd:1}}),/PAID_APPROVAL_REQUIRED/);assert.equal(calls,0);});
test('auth pairing locks after repeated wrong codes',()=>{const gate=createSecurityGate();for(let i=0;i<5;i++)assert.equal(gate.pair('wrong').error,'INVALID_PAIR_CODE');assert.equal(gate.pair(gate.pairingCodeForTerminal()).error,'PAIRING_LOCKED');});

test('R2-05 true queued ComfyUI image snapshots promote only matching scene',async()=>{
 const f=await fixture();let runner;
 try{
  const {writeFile,readFile}=await import('node:fs/promises');
  const c=f.repo.createChannel({name:'A'}),v=f.repo.createVideo(c.id,{title:'B'});
  const [scene]=f.repo.replaceScenes(v.id,{rowVersion:1,scenes:[{text:'Hello',durationMs:1000,visualPrompt:'An illustration'}]});
  const output=join(f.dir,'result.png');await writeFile(output,await readFile('spikes/SP-03/fixtures/sp03-demo.png'));
  f.registry.imageAdapter={loadWorkflow:async input=>({'10':{inputs:{text:input.prompt}}})};
  f.registry.register({id:'comfyui',kind:'image',location:'local',costTier:'local',invoke:async()=>({path:output})});
  const queued=await f.ctl.queueSceneImage(scene.id,{width:640,height:360});
  runner=new JobRunner(f.store,createJobHandlers({repo:f.repo,registry:f.registry,dataRoot:f.dir}),{concurrency:1,heartbeatMs:100,pollMs:10});
  runner.start();await runner.waitForIdle({timeoutMs:5000});
  assert.equal(f.store.get(queued.job.id).status,'succeeded');
  const {promotePendingQueueAssets}=await import('../../../packages/core/src/index.mjs');
  const result=await promotePendingQueueAssets(f.manifest);
  assert.equal(result.promoted.length,1);
  assert.equal(f.repo.getScene(scene.id).visualAssetId,result.promoted[0]);
 }finally{await runner?.stop();await f.close()}
});
