/**
 * R2-13 / EP05+EP06+EP12 acceptance: cross-module, offline failure/restart
 * regression. All media and provider handlers are local deterministic fakes;
 * these tests cannot certify GPU, Windows, remote billing or MP4 rendering.
 * Real SQLite WAL + SP-04 queue + asset revision filesystem are exercised.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,AssetManifest,AssetDagRepository,
  SceneImageRepository,createAssetDagHandlers,segmentApprovedScript,
  inspectSceneCoverage} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {createJobHandlers} from '../../../apps/api/src/handlers.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const registry={
  imageAdapter:{async loadWorkflow(){return {'10':{inputs:{seed:13,width:512,height:512}}}}},
  list:()=>[{id:'comfyui',kind:'image',location:'local',costTier:'local'}]
};
const voice={provider:'piper',speed:1};
const image={width:512,height:512,seed:13};
const spec=(requestKey,options={})=>({requestKey,voice,image,...options});
const sourceLine=n=>`Cảnh ${n}: Xin chào Việt Nam! Trí tuệ nhân tạo giúp mọi người học tốt hơn. 😊\r\n`;
const fullScript=Array.from({length:110},(_,n)=>sourceLine(n+1)).join('');
// Full-length 1.25s 16kHz mono PCM WAV fixture; no TTS provider process needed.
function silentWave(){
  const pcm=Buffer.alloc(40000);const b=Buffer.alloc(44+pcm.length);
  b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
  b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
  b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);
  b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write('data',36);b.writeUInt32LE(pcm.length,40);pcm.copy(b,44);
  return b;
}
const mockWav=silentWave();

async function fixture({count=3,imageProvider=true}={}){
  const dir=await mkdtemp(join(tmpdir(),'r213-'));
  const dbPath=join(dir,'studio.sqlite');
  const f={dir,dbPath};
  f.db=openProjectDb(dbPath);f.repo=new StudioRepository(f.db);
  f.store=new JobStore({path:dbPath,leaseMs:60000,baseBackoffMs:1,maxBackoffMs:4});
  const channel=f.repo.createChannel({name:'R2-13 regression'});
  f.video=f.repo.createVideo(channel.id,{title:'Offline acceptance'});
  f.scenes=f.repo.replaceScenes(f.video.id,{rowVersion:1,scenes:Array.from({length:count},(_,i)=>({
    text:sourceLine(i+1),durationMs:2500,visualPrompt:`A documentary shot number ${i+1}`,
    mediaType:'image_motion'
  }))});
  f.imageBytes=await readFile('spikes/SP-03/fixtures/sp03-demo.png');
  f.manifest=new AssetManifest({db:f.db,repository:f.repo,dataRoot:dir});
  f.registry=imageProvider?registry:{imageAdapter:null,list:()=>[]};
  f.dag=new AssetDagRepository({repo:f.repo,store:f.store,manifest:f.manifest,registry:f.registry,localVoices:{piper:'vi_mock'}});
  f.imageRepo=new SceneImageRepository(f.repo,{store:f.store,manifest:f.manifest,registry:f.registry});
  f.close=async()=>{
    try{f.store?.close()}catch{}
    try{f.db?.close()}catch{}
    await rm(dir,{recursive:true,force:true});
  };
  f.reopen=()=>{
    f.store.close();f.db.close();
    f.db=openProjectDb(f.dbPath);f.repo=new StudioRepository(f.db);
    f.store=new JobStore({path:f.dbPath,leaseMs:60000,baseBackoffMs:1,maxBackoffMs:4});
    f.manifest=new AssetManifest({db:f.db,repository:f.repo,dataRoot:dir});
    f.dag=new AssetDagRepository({repo:f.repo,store:f.store,manifest:f.manifest,registry:f.registry,localVoices:{piper:'vi_mock'}});
    f.imageRepo=new SceneImageRepository(f.repo,{store:f.store,manifest:f.manifest,registry:f.registry});
  };
  return f;
}

function mockMediaHandler(f,kind,stats,{failFirst=0,failAlways=false,err='RATE_LIMITED'}={}){
  return async (p,{jobId,attempt})=>{
    stats[kind]++;
    if(failAlways||(failFirst>0&&attempt<=failFirst)){
      throw Object.assign(new Error('FAKE_LOCAL_PROVIDER_FAILURE'),{code:err,retryable:!failAlways});
    }
    // Valid PNG/WAV fixture; no remote endpoint, no native model execution.
    const bytes=kind==='image'?f.imageBytes:mockWav;
    const filePath=join(f.dir,'generated',`${jobId}.${kind==='image'?'png':'wav'}`);
    await mkdir(join(f.dir,'generated'),{recursive:true});
    await writeFile(filePath,bytes);
    const result=kind==='image'?{
      sceneId:p.sceneId,kind,providerId:'comfyui',imageInputHash:p.inputHash,
      sourceSha256:p.sourceSha256,configRevision:p.configRevision,workflowHash:p.workflowHash,
      width:p.width,height:p.height,seed:p.seed
    }:{sceneId:p.sceneId,kind,providerId:'piper',voiceInputHash:p.inputHash,
      textSha256:p.textSha256,configRevision:p.configRevision,voice:p.voice,
      rate:p.rate,durationSec:1.25,codec:'pcm_s16le'};
    return {result,asset:{logicalKey:`${kind}:${p.sceneId}:${p.inputHash}`,
      filePath,checksum:hash(bytes)}};
  };
}

async function run(f,stats,options={}){
  const handlers={...createAssetDagHandlers(f),
    'asset:voice':mockMediaHandler(f,'voice',stats,options.voice),
    'asset:image':mockMediaHandler(f,'image',stats,options.image),
    ...options.handlers};
  const runner=new JobRunner(f.store,handlers,{concurrency:8,pollMs:2,heartbeatMs:1000});
  runner.start();
  try{await runner.waitForIdle({timeoutMs:60000});}
  finally{await runner.stop({abort:true});}
}

// G3: the scene source itself must survive unchanged before any provider work.
test('G3 — 110 Vietnamese source paragraphs split losslessly, no surrogate or CRLF loss',()=>{
  const plan=segmentApprovedScript(fullScript,{targetSeconds:5,minSeconds:2,maxSeconds:15,wpm:180});
  assert.ok(plan.scenes.length>=30);
  assert.equal(plan.scenes.map(x=>x.text).join(''),fullScript);
  assert.equal(inspectSceneCoverage(fullScript,plan.scenes).lossless,true);
  assert.equal(plan.scenes.at(-1).sourceEnd,fullScript.length);
  assert.equal(plan.scenes[0].sourceStart,0);
  for(let i=1;i<plan.scenes.length;i++)assert.equal(plan.scenes[i-1].sourceEnd,plan.scenes[i].sourceStart);
});

test('G4 — 106 assets across 53 scenes reach durable healthy revisions with exactly one local dispatch each',async()=>{
  const f=await fixture({count:53});const stats={voice:0,image:0};
  try{
    const initial=await f.dag.preview(f.video.id,spec('preview'));
    assert.equal(initial.sceneCount,53);
    assert.equal(f.store.countByStatus().total,0,'preview must not enqueue');
    const runInfo=await f.dag.submit(f.video.id,spec('batch_106'));
    assert.equal(runInfo.newJobs,160);
    await run(f,stats);
    const result=f.dag.get(f.video.id,runInfo.runId);
    assert.equal(result.status,'succeeded');
    assert.deepEqual(stats,{voice:53,image:53});
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM asset_revisions').get().n,106);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM asset_dag_nodes WHERE run_id=?').get(runInfo.runId).n,159);
    for(const scene of f.scenes){
      assert.equal(f.manifest.listScene(scene.id).length,2);
      for(const asset of f.manifest.listScene(scene.id))assert.equal(await f.manifest.verifyRevision(asset.id),'healthy');
    }
    const before=f.store.countByStatus().total;
    f.reopen();
    const repeat=await f.dag.submit(f.video.id,spec('batch_106'));
    assert.equal(repeat.reused,true);
    const after=await f.dag.submit(f.video.id,spec('batch_106_next'));
    assert.equal(after.newJobs,54,'only gates and final may rerun');
    await run(f,stats);
    assert.equal(f.dag.get(f.video.id,after.runId).status,'succeeded');
    assert.deepEqual(stats,{voice:53,image:53},'completed asset jobs never replay');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM asset_revisions').get().n,106);
    assert.equal(f.store.countByStatus().total,before+54);
  }finally{await f.close();}
});

test('G4 — crash after successful provider commit but before promotion does not redispatch successful job',async()=>{
  const f=await fixture({count:1});const stats={voice:0,image:0};
  try{
    const task=await f.dag.submit(f.video.id,spec('restart_partial'));
    const first=f.store.claim('simulated-worker-crash');
    assert.match(first.kind,/^asset:(voice|image)$/);
    const kind=first.kind.split(':')[1];
    const payload=await mockMediaHandler(f,kind,stats)(first.payload,{jobId:first.id,attempt:1});
    assert.equal(f.store.complete(first.id,first.lease_token,payload),true);
    f.reopen();
    await run(f,stats);
    assert.equal(f.dag.get(f.video.id,task.runId).status,'succeeded');
    assert.deepEqual(stats,{voice:1,image:1},'completed asset never re-dispatched');
    assert.equal(f.store.get(first.id).attempt,1);
    assert.equal(f.manifest.listScene(f.scenes[0].id).length,2);
  }finally{await f.close();}
});

test('G4 — missing local image provider fails before creating 100+ jobs or voice intents',async()=>{
  const f=await fixture({count:53,imageProvider:false});
  try{
    await assert.rejects(f.dag.submit(f.video.id,spec('no_gpu')),{code:'LOCAL_IMAGE_NOT_CONFIGURED'});
    assert.equal(f.store.countByStatus().total,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM scene_voice_intents').get().n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM asset_dag_runs').get().n,0);
  }finally{await f.close();}
});

test('G4 — simulated SQLite write failure rolls back entire >100-asset DAG atomically',async()=>{
  const f=await fixture({count:53});
  try{
    // Inject DB write failure deterministically. This is NOT physical ENOSPC.
    f.db.exec(`CREATE TRIGGER r213_full BEFORE INSERT ON asset_dag_nodes
      BEGIN SELECT RAISE(ABORT,'R213_SIMULATED_STORAGE_FAILURE'); END;`);
    await assert.rejects(f.dag.submit(f.video.id,spec('atomic_disk_failure')),
      /R213_SIMULATED_STORAGE_FAILURE/);
    for(const table of ['jobs','dependencies','asset_dag_runs','asset_dag_nodes','scene_voice_intents','scene_image_intents'])
      assert.equal(f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0,table);
    assert.equal(f.store.events().length,0);
  }finally{await f.close();}
});

test('G4 — corrupted manually pinned image is preserved but never accepted as healthy',async()=>{
  const f=await fixture({count:1});
  try{
    const added=await f.imageRepo.importBase64(f.scenes[0].id,{mimeType:'image/png',dataBase64:f.imageBytes.toString('base64')});
    const original=f.repo.getScene(f.scenes[0].id).visualAssetId;
    const revision=f.manifest.get(added.assetId);
    await writeFile(join(f.dir,revision.relativePath),Buffer.from('CORRUPTED'));
    assert.equal(await f.manifest.verifyRevision(added.assetId),'corrupt');
    await assert.rejects(f.dag.submit(f.video.id,spec('corrupted_manual')),
      {code:'ASSET_DAG_MANUAL_IMAGE_UNHEALTHY'});
    assert.equal(f.repo.getScene(f.scenes[0].id).visualAssetId,original);
    assert.equal(f.store.countByStatus().total,0);
  }finally{await f.close();}
});

test('G5 — local-only simulated 429 is retried within maxAttempts, never switches to paid provider',async()=>{
  const f=await fixture({count:1});const stats={voice:0,image:0};
  try{
    const task=await f.dag.submit(f.video.id,spec('429_local',{image:null}));
    await run(f,stats,{voice:{failFirst:1}});
    assert.equal(f.dag.get(f.video.id,task.runId).status,'succeeded');
    const voiceNode=task.nodes.find(x=>x.stage==='voice');
    assert.equal(f.store.get(voiceNode.jobId).attempt,2);
    assert.equal(stats.voice,2);
    assert.equal(stats.image,0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM jobs WHERE kind='asset:image'").get().n,0);
    assert.equal(f.manifest.listScene(f.scenes[0].id).length,1);
  }finally{await f.close();}
});

test('G5 — exhausted simulated 429 fails downstream; no implicit provider fallback or additional revisions',async()=>{
  const f=await fixture({count:1});const stats={voice:0,image:0};
  try{
    const task=await f.dag.submit(f.video.id,spec('429_exhausted',{image:null}));
    await run(f,stats,{voice:{failFirst:99}});
    assert.equal(f.dag.get(f.video.id,task.runId).status,'failed');
    const voiceNode=task.nodes.find(x=>x.stage==='voice');
    assert.equal(f.store.get(voiceNode.jobId).attempt,3);
    assert.equal(stats.voice,3);
    assert.equal(f.store.get(task.finalJobId).last_error,'DEPENDENCY_FAILED');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM asset_revisions').get().n,0);
    // Failed work stays failed until an explicit authenticated retry action.
    const originalCalls=stats.voice;
    f.reopen();await run(f,stats,{voice:{failFirst:99}});
    assert.equal(stats.voice,originalCalls);
  }finally{await f.close();}
});

test('G5 — remote Edge without opt-in and forged scene IDs are rejected with zero side effects',async()=>{
  const f=await fixture({count:3});
  try{
    await assert.rejects(f.dag.submit(f.video.id,spec('edge_without_consent',{
      voice:{provider:'edge',voice:'vi-VN-HoaiMyNeural',speed:1},image:null
    })),{code:'REMOTE_CONSENT_REQUIRED'});
    await assert.rejects(f.dag.submit(f.video.id,spec('foreign_scene',{
      sceneIds:[f.scenes[0].id,'not_our_scene']
    })),{code:'ASSET_DAG_SCENE_SCOPE_MISMATCH'});
    assert.equal(f.store.countByStatus().total,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM scene_voice_intents').get().n,0);
  }finally{await f.close();}
});

test('G5 — after manual pin, pending generated asset never overrides the new user selection',async()=>{
  const f=await fixture({count:1});const stats={voice:0,image:0};
  try{
    const task=await f.dag.submit(f.video.id,spec('race_manual',{voice:null}));
    const selection=await f.imageRepo.importBase64(f.scenes[0].id,{mimeType:'image/png',dataBase64:f.imageBytes.toString('base64')});
    await run(f,stats);
    assert.equal(f.repo.getScene(f.scenes[0].id).visualAssetId,selection.assetId);
    assert.equal(f.dag.get(f.video.id,task.runId).status,'failed');
    assert.equal(f.manifest.listScene(f.scenes[0].id).length,1);
    assert.equal(stats.image,1,'this deliberately minimal mock bypasses production preflight; gate still rejects promotion');
    let actualInvocations=0;
    const production=createJobHandlers({repo:f.repo,registry:{...f.registry,
      invoke:async()=>{actualInvocations++;throw new Error('provider MUST NOT be called');}},dataRoot:f.dir});
    const pendingImage=task.nodes.find(x=>x.stage==='image');
    await assert.rejects(production['asset:image'](f.store.get(pendingImage.jobId).payload,
      {jobId:pendingImage.jobId,signal:new AbortController().signal}),{code:'STALE_IMAGE_JOB'});
    assert.equal(actualInvocations,0,'production preflight blocks provider dispatch for stale scene');
  }finally{await f.close();}
});

test('G5 — successful asset idempotency never changes scene pointers on replay',async()=>{
  const f=await fixture({count:1});const stats={voice:0,image:0};
  try{
    const first=await f.dag.submit(f.video.id,spec('same_request'));await run(f,stats);
    assert.equal(f.dag.get(f.video.id,first.runId).status,'succeeded');
    const before=f.repo.getScene(f.scenes[0].id);
    const again=await f.dag.submit(f.video.id,spec('same_request'));
    assert.equal(again.reused,true);
    assert.equal(f.repo.getScene(f.scenes[0].id).visualAssetId,before.visualAssetId);
    assert.equal(f.repo.getScene(f.scenes[0].id).voiceAssetId,before.voiceAssetId);
    assert.deepEqual(stats,{voice:1,image:1});
    await assert.rejects(f.dag.submit(f.video.id,spec('same_request',{
      image:{...image,seed:88}
    })),{code:'ASSET_DAG_IDEMPOTENCY_CONFLICT'});
  }finally{await f.close();}
});


test('G4 — actual filesystem directory failure cannot change selected asset pointer',async()=>{
  const f=await fixture({count:1});
  try{
    // A regular file at /assets simulates a broken/unwritable asset mount.
    await writeFile(join(f.dir,'assets'),Buffer.from('occupied'));
    await assert.rejects(f.manifest.importBytes({sceneId:f.scenes[0].id,kind:'image',
      source:'manual_import',bytes:f.imageBytes,extension:'.png'}),
      error=>['ENOTDIR','EEXIST'].includes(error?.code));
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM asset_revisions').get().n,0);
    assert.equal(f.repo.getScene(f.scenes[0].id).visualAssetId,null);
  }finally{await f.close();}
});


test('G4 — one failed image in a 106-asset batch retries selectively without replaying 105 successful assets',async()=>{
  const f=await fixture({count:53});const stats={voice:0,image:0};
  try{
    const runInfo=await f.dag.submit(f.video.id,spec('batch_106_injected_failure'));
    const failedId=f.scenes[17].id;
    const ordinary=mockMediaHandler(f,'image',stats);
    let injected=0;
    await run(f,stats,{handlers:{'asset:image':async(p,context)=>{
      if(p.sceneId===failedId){injected++;throw Object.assign(new Error('SIMULATED_IMAGE_UNAVAILABLE'),{
        code:'PROVIDER_UNAVAILABLE',retryable:false});}
      return ordinary(p,context);
    }}});
    assert.equal(injected,1);
    assert.equal(f.dag.get(f.video.id,runInfo.runId).status,'failed');
    assert.deepEqual(stats,{voice:53,image:52});
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM asset_revisions').get().n,104,
      'successful voice of failed scene stays staged until scene gate can promote both');
    const priorAttempts=f.db.prepare('SELECT SUM(attempt) n FROM jobs WHERE kind LIKE ?').get('asset:%').n;
    f.reopen();
    const retry=f.dag.retry(f.video.id,runInfo.runId,{});
    assert.equal(retry.retried,3,'rearm one provider job, its gate and final');
    await run(f,stats);
    assert.equal(f.dag.get(f.video.id,runInfo.runId).status,'succeeded');
    assert.deepEqual(stats,{voice:53,image:53});
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM asset_revisions').get().n,106);
    assert.equal(f.db.prepare('SELECT SUM(attempt) n FROM jobs WHERE kind LIKE ?').get('asset:%').n,priorAttempts+1);
  }finally{await f.close();}
});
