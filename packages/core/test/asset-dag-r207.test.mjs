/** R2-07: real SQLite queue/manifest, fake local provider outputs. No billing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,AssetManifest,AssetDagRepository,
  createAssetDagHandlers,SceneImageRepository} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
const voice={provider:'piper',speed:1},image={width:512,height:512,seed:5};
const body=(key,others={})=>({requestKey:key,voice,image,...others});
const adapter={async loadWorkflow(){return {'5':{inputs:{seed:5}}}}};
const registry={imageAdapter:adapter,list:()=>[{id:'comfyui',kind:'image',location:'local',costTier:'local'}]};
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'r207-')),dbFile=join(dir,'studio.sqlite');
  const db=openProjectDb(dbFile),repo=new StudioRepository(db);
  const store=new JobStore({path:dbFile,leaseMs:5_000,baseBackoffMs:0,maxBackoffMs:0});
  const channel=repo.createChannel({name:'Asset DAG'}),video=repo.createVideo(channel.id,{title:'Local only'});
  const scenes=repo.replaceScenes(video.id,{rowVersion:1,scenes:[
    {text:'First narration',visualPrompt:'First forest',durationMs:4000,mediaType:'image_motion'},
    {text:'Second narration',visualPrompt:'Second forest',durationMs:4000,mediaType:'image_motion'},
    {text:'Third narration',visualPrompt:'Third forest',durationMs:4000,mediaType:'image_motion'}
  ]});
  const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
  const dag=new AssetDagRepository({repo,store,manifest,registry,localVoices:{piper:'vi_mock'}});
  const imageRepo=new SceneImageRepository(repo,{store,manifest,registry});
  return {dir,dbFile,db,repo,store,manifest,dag,imageRepo,video,scenes,
    async close(){try{this.store.close()}catch{}try{this.db.close()}catch{}await rm(dir,{recursive:true,force:true});}};
}
async function start(f,handlers={}){
  const assetHandler=kind=>async(p,{jobId})=>{
    const bytes=kind==='voice'?Buffer.from('test local voice data '+jobId):png;
    const path=join(f.dir,'generated',`${jobId}.${kind==='voice'?'wav':'png'}`);
    await mkdir(join(f.dir,'generated'),{recursive:true});await writeFile(path,bytes);
    return {result:kind==='voice'?{sceneId:p.sceneId,kind,providerId:p.providerId,
      voiceInputHash:p.inputHash,textSha256:p.textSha256,configRevision:p.configRevision,
      voice:p.voice,rate:p.rate,durationSec:0.75,codec:'pcm_s16le'}:
      {sceneId:p.sceneId,kind,providerId:'comfyui',imageInputHash:p.inputHash,
        sourceSha256:p.sourceSha256,configRevision:p.configRevision,workflowHash:p.workflowHash,
        width:p.width,height:p.height,seed:p.seed},
      asset:{logicalKey:`${kind}:${p.sceneId}:${p.inputHash}`,filePath:path,checksum:sha(bytes)}};
  };
  const runner=new JobRunner(f.store,{'asset:voice':assetHandler('voice'),
    'asset:image':assetHandler('image'),...createAssetDagHandlers(f),...handlers},
  {concurrency:2,pollMs:5,heartbeatMs:400});
  runner.start();return runner;
}

test('v25 is additive and DAG preview is strictly read only',async()=>{
  const f=await fixture();try{
    assert.ok(f.db.prepare('PRAGMA user_version').get().user_version>=26);
    const preview=await f.dag.preview(f.video.id,body('unused'));
    assert.deepEqual([preview.sceneCount,preview.generateVoice,preview.generateImage],[3,3,3]);
    assert.equal(f.store.countByStatus().total,0);
    assert.equal(f.dag.list(f.video.id).items.length,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM scene_voice_intents').get().c,0);
  }finally{await f.close()}
});

test('explicit local DAG creates dependencies and all media are promoted before final success',async()=>{
  const f=await fixture();let runner;try{
    const r=await f.dag.submit(f.video.id,body('local-dag'));
    assert.equal(r.reused,false);assert.equal(r.newJobs,10);
    assert.equal(r.nodes.length,9);
    const gate=r.nodes.find(n=>n.stage==='gate');
    assert.equal(f.store.dependencies(gate.jobId).length,2);
    assert.equal(f.store.dependencies(r.finalJobId).length,3);
    runner=await start(f);await runner.waitForIdle({timeoutMs:6000});
    const final=f.dag.get(f.video.id,r.runId);
    assert.equal(final.status,'succeeded');
    for(const scene of f.scenes){
      const plan=(await f.manifest.planRecompute(f.video.id)).scenes.find(x=>x.sceneId===scene.id);
      assert.equal(plan.voice,'reuse');assert.equal(plan.visual,'reuse');
      assert.equal(f.manifest.listScene(scene.id).length,2);
    }
    assert.equal(f.store.get(r.finalJobId).result.rendered,false);
    assert.equal(final.timing?.measuredVoiceScenes,3);
    assert.equal(final.timing?.estimatedSceneDurationMs,12000);
    assert.equal(final.timing?.measuredVoiceDurationMs,2250);
    assert.equal(final.timing?.syncPending,true);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM asset_dag_runs').get().c,1);
  }finally{await runner?.stop({abort:true});await f.close()}
});

test('same request key is idempotent; new body with same key is rejected without writes',async()=>{
  const f=await fixture();try{
    const first=await f.dag.submit(f.video.id,body('duplicate'));
    const again=await f.dag.submit(f.video.id,body('duplicate'));
    assert.equal(again.reused,true);assert.equal(again.runId,first.runId);
    assert.equal(f.store.countByStatus().total,10);
    await assert.rejects(f.dag.submit(f.video.id,body('duplicate',{image:{...image,seed:9}})),
      {code:'ASSET_DAG_IDEMPOTENCY_CONFLICT'});
    assert.equal(f.store.countByStatus().total,10);
  }finally{await f.close()}
});

test('no remote Edge dispatch without explicit consent; no partial jobs for bad tail',async()=>{
  const f=await fixture();try{
    await assert.rejects(f.dag.submit(f.video.id,body('consent',{voice:{provider:'edge',speed:1}})),
      {code:'REMOTE_CONSENT_REQUIRED'});
    await assert.rejects(f.dag.submit(f.video.id,body('bad-tail',{sceneIds:[f.scenes[0].id,'foreign-scene']})),
      {code:'ASSET_DAG_SCENE_SCOPE_MISMATCH'});
    assert.equal(f.store.countByStatus().total,0);
  }finally{await f.close()}
});

test('a failing SQLite commit rolls back ALL queue jobs, edges and voice intents',async()=>{
  const f=await fixture();try{
    f.store.db.exec(`CREATE TRIGGER reject_asset_dag BEFORE INSERT ON asset_dag_runs
      BEGIN SELECT RAISE(ABORT,'TEST_ATOMIC_ROLLBACK'); END;`);
    await assert.rejects(f.dag.submit(f.video.id,body('rollback')),/TEST_ATOMIC_ROLLBACK/);
    assert.equal(f.store.countByStatus().total,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM scene_voice_intents').get().c,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM scene_image_intents').get().c,0);
    assert.equal(f.store.events().length,0);
  }finally{await f.close()}
});

test('skip manual pinned image while generating only missing voice; do not touch image pointer',async()=>{
  const f=await fixture();let runner;try{
    const {sceneId,assetId}=await f.imageRepo.importBase64(f.scenes[0].id,{mimeType:'image/png',dataBase64:png.toString('base64')});
    const before=f.repo.getScene(sceneId).visualAssetId;
    const preview=await f.dag.preview(f.video.id,body('manual',{sceneIds:[sceneId]}));
    assert.equal(preview.scenes[0].image,'manual_preserved');
    const run=await f.dag.submit(f.video.id,body('manual',{sceneIds:[sceneId]}));
    assert.equal(run.nodes.filter(n=>n.stage==='image').length,0);
    assert.equal(run.newJobs,3);
    runner=await start(f);await runner.waitForIdle({timeoutMs:4500});
    assert.equal(f.dag.get(f.video.id,run.runId).status,'succeeded');
    assert.equal(f.repo.getScene(sceneId).visualAssetId,before);
    assert.equal(f.manifest.get(assetId).source,'manual_import');
  }finally{await runner?.stop({abort:true});await f.close()}
});

test('image-only and voice-only selections are independent, bounded by sceneIds',async()=>{
  const f=await fixture();try{
    const r=await f.dag.submit(f.video.id,body('image-only',{voice:null,sceneIds:[f.scenes[1].id]}));
    assert.equal(r.newJobs,3);assert.deepEqual(r.nodes.map(n=>n.stage).sort(),['gate','image']);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM scene_voice_intents').get().c,0);
    const v=await f.dag.submit(f.video.id,body('voice-only',{image:null,sceneIds:[f.scenes[2].id]}));
    assert.equal(v.newJobs,3);assert.deepEqual(v.nodes.map(n=>n.stage).sort(),['gate','voice']);
  }finally{await f.close()}
});

test('unhealthy manually selected images fail closed instead of silently generating',async()=>{
  const f=await fixture();try{
    const {assetId}=await f.imageRepo.importBase64(f.scenes[0].id,{mimeType:'image/png',dataBase64:png.toString('base64')});
    const a=f.manifest.get(assetId);await writeFile(join(f.dir,a.relativePath),Buffer.from('corrupted'));
    await assert.rejects(f.dag.submit(f.video.id,body('broken',{sceneIds:[f.scenes[0].id]})),
      {code:'ASSET_DAG_MANUAL_IMAGE_UNHEALTHY'});
    assert.equal(f.store.countByStatus().total,0);
  }finally{await f.close()}
});

test('restart after succeeded provider job but before promotion reconstructs DAG and asset pointers',async()=>{
  const f=await fixture();let runner;try{
    const r=await f.dag.submit(f.video.id,body('restart',{sceneIds:[f.scenes[0].id]}));
    // Simulate crash AFTER worker commit but BEFORE scene gate promotion.
    const claimed=f.store.claim('crash-worker');
    const kind=claimed.kind==='asset:voice'?'voice':'image';
    const outputPath=join(f.dir,'generated',`crash.${kind==='voice'?'wav':'png'}`);
    await mkdir(join(f.dir,'generated'),{recursive:true});
    const bytes=kind==='voice'?Buffer.from('completed but not promoted'):png;
    await writeFile(outputPath,bytes);
    const p=claimed.payload;
    const metadata=kind==='voice'?{voiceInputHash:p.inputHash,textSha256:p.textSha256,configRevision:p.configRevision,
      voice:p.voice,rate:p.rate,durationSec:1,codec:'pcm_s16le'}:
      {imageInputHash:p.inputHash,sourceSha256:p.sourceSha256,configRevision:p.configRevision,
        workflowHash:p.workflowHash,width:p.width,height:p.height,seed:p.seed};
    assert.equal(f.store.complete(claimed.id,claimed.lease_token,{
      result:{sceneId:p.sceneId,kind,providerId:kind==='voice'?'piper':'comfyui',...metadata},
      asset:{logicalKey:`${kind}:${p.sceneId}:${p.inputHash}`,filePath:outputPath,checksum:sha(bytes)}}),true);
    f.store.close();f.db.close();
    f.db=openProjectDb(f.dbFile);f.repo=new StudioRepository(f.db);
    f.store=new JobStore({path:f.dbFile,leaseMs:5_000,baseBackoffMs:0,maxBackoffMs:0});
    f.manifest=new AssetManifest({db:f.db,repository:f.repo,dataRoot:f.dir});
    f.dag=new AssetDagRepository({repo:f.repo,store:f.store,manifest:f.manifest,registry,localVoices:{piper:'vi_mock'}});
    runner=await start(f);await runner.waitForIdle({timeoutMs:4000});
    const final=f.dag.get(f.video.id,r.runId);
    assert.equal(final.status,'succeeded');
    assert.equal(f.manifest.listScene(f.scenes[0].id).length,2);
    assert.equal(f.store.get(r.finalJobId).result.rendered,false);
    assert.equal(final.timing?.measuredVoiceScenes,1);
    assert.equal(final.timing?.estimatedSceneDurationMs,4000);
    assert.equal(final.timing?.measuredVoiceDurationMs,kind==='voice'?1000:750);
    assert.equal(final.timing?.syncPending,true);
  }finally{await runner?.stop({abort:true});await f.close()}
});

test('partial provider failure propagates through DAG and preserves existing pointers',async()=>{
  const f=await fixture();let runner;try{
    const good=await f.manifest.importBytes({sceneId:f.scenes[0].id,kind:'image',source:'manual_import',bytes:png,extension:'.png'});
    const run=await f.dag.submit(f.video.id,body('fail',{sceneIds:[f.scenes[0].id],image:null}));
    runner=await start(f,{'asset:voice':async()=>{throw Object.assign(new Error('no provider'),{retryable:false,code:'PROVIDER_UNAVAILABLE'});}});
    await runner.waitForIdle({timeoutMs:5000});
    assert.equal(f.dag.get(f.video.id,run.runId).status,'failed');
    assert.equal(f.repo.getScene(f.scenes[0].id).visualAssetId,good.id);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM asset_revisions').get().c,1);
    assert.equal(f.store.get(run.finalJobId).last_error,'DEPENDENCY_FAILED');
  }finally{await runner?.stop({abort:true});await f.close()}
});

test('manual selection after enqueue is never overwritten by late generated image',async()=>{
  const f=await fixture();let runner;try{
    const run=await f.dag.submit(f.video.id,body('stale',{voice:null,sceneIds:[f.scenes[0].id]}));
    const manual=await f.imageRepo.importBase64(f.scenes[0].id,{mimeType:'image/png',dataBase64:png.toString('base64')});
    runner=await start(f);await runner.waitForIdle({timeoutMs:4000});
    assert.equal(f.dag.get(f.video.id,run.runId).status,'failed');
    assert.equal(f.repo.getScene(f.scenes[0].id).visualAssetId,manual.assetId);
  }finally{await runner?.stop({abort:true});await f.close()}
});

test('two submitted plans reuse unfinished stage jobs and remap gate dependencies to persisted IDs',async()=>{
  const f=await fixture();let runner;try{
    const one=await f.dag.submit(f.video.id,body('first-workflow'));
    const two=await f.dag.submit(f.video.id,body('second-workflow'));
    assert.equal(two.newJobs,4,'six stage jobs must NOT be generated again');
    for(const n of two.nodes.filter(x=>x.stage==='gate')){
      const deps=f.store.dependencies(n.jobId);
      const stageIds=two.nodes.filter(x=>x.sceneId===n.sceneId&&x.stage!=='gate').map(x=>x.jobId).sort();
      assert.deepEqual(deps,stageIds);
      const payload=f.store.get(n.jobId).payload;
      assert.equal(payload.voiceJobId,stageIds.find(id=>f.store.get(id).kind==='asset:voice'));
      assert.equal(payload.imageJobId,stageIds.find(id=>f.store.get(id).kind==='asset:image'));
      assert.equal(one.nodes.find(x=>x.sceneId===n.sceneId&&x.stage==='voice').jobId,payload.voiceJobId);
    }
    runner=await start(f);await runner.waitForIdle({timeoutMs:5000});
    assert.equal(f.dag.get(f.video.id,one.runId).status,'succeeded');
    assert.equal(f.dag.get(f.video.id,two.runId).status,'succeeded');
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM asset_revisions').get().c,6);
  }finally{await runner?.stop({abort:true});await f.close()}
});

test('repeat workflow after success uses only gate jobs, no model calls or duplicate revisions',async()=>{
  const f=await fixture();let runner;try{
    const one=await f.dag.submit(f.video.id,body('initial',{sceneIds:[f.scenes[0].id]}));
    runner=await start(f);await runner.waitForIdle({timeoutMs:5000});
    await runner.stop({abort:true});runner=null;
    const second=await f.dag.submit(f.video.id,body('again',{sceneIds:[f.scenes[0].id]}));
    assert.equal(second.newJobs,2); // scene gate + final only
    assert.equal(second.nodes.length,1);
    assert.equal(second.nodes[0].stage,'gate');
    runner=await start(f);await runner.waitForIdle({timeoutMs:5000});
    assert.equal(f.dag.get(f.video.id,second.runId).status,'succeeded');
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM asset_revisions').get().c,2);
    assert.equal(f.store.get(one.finalJobId).status,'succeeded');
  }finally{await runner?.stop({abort:true});await f.close()}
});

test('retry failure is explicit, bounded and atomically re-arms failed parent and gates',async()=>{
  const f=await fixture();let runner;try{
    const run=await f.dag.submit(f.video.id,body('retry-local',{sceneIds:[f.scenes[0].id],image:null}));
    runner=await start(f,{'asset:voice':async()=>{throw Object.assign(new Error('provider down'),{
      retryable:false,code:'PROVIDER_UNAVAILABLE'});}});
    await runner.waitForIdle({timeoutMs:5000});await runner.stop({abort:true});runner=null;
    assert.equal(f.dag.get(f.video.id,run.runId).status,'failed');
    const retry=f.dag.retry(f.video.id,run.runId,{});
    assert.equal(retry.retried,3);
    assert.equal(f.dag.retry(f.video.id,run.runId,{}).retried,0,'retry is idempotent while pending');
    runner=await start(f);await runner.waitForIdle({timeoutMs:5000});
    assert.equal(f.dag.get(f.video.id,run.runId).status,'succeeded');
    assert.equal(f.store.get(run.nodes.find(n=>n.stage==='voice').jobId).attempt,2);
  }finally{await runner?.stop({abort:true});await f.close()}
});

test('retry failed Edge job needs renewed remote consent; default is no egress',async()=>{
  const f=await fixture();let runner;try{
    const edge={provider:'edge',voice:'vi-VN-HoaiMyNeural',speed:1,remoteConsent:true};
    const run=await f.dag.submit(f.video.id,body('edge',{voice:edge,image:null,sceneIds:[f.scenes[0].id]}));
    runner=await start(f,{'asset:voice':async()=>{throw Object.assign(new Error('edge down'),{
      retryable:false,code:'PROVIDER_UNAVAILABLE'});}});
    await runner.waitForIdle({timeoutMs:5000});await runner.stop({abort:true});runner=null;
    assert.equal(f.dag.get(f.video.id,run.runId).status,'failed');
    await assert.rejects(Promise.resolve().then(()=>f.dag.retry(f.video.id,run.runId,{})),{code:'REMOTE_CONSENT_REQUIRED'});
    assert.equal(f.dag.retry(f.video.id,run.runId,{confirmRemote:true}).retried,3);
    runner=await start(f);await runner.waitForIdle({timeoutMs:5000});
    assert.equal(f.dag.get(f.video.id,run.runId).status,'succeeded');
  }finally{await runner?.stop({abort:true});await f.close()}
});

test('retry refuses stale image intent changed by operator after job failure',async()=>{
  const f=await fixture();let runner;try{
    const run=await f.dag.submit(f.video.id,body('stale-retry',{voice:null,sceneIds:[f.scenes[0].id]}));
    runner=await start(f,{'asset:image':async()=>{throw Object.assign(new Error('down'),{
      retryable:false,code:'PROVIDER_UNAVAILABLE'});}});
    await runner.waitForIdle({timeoutMs:5000});await runner.stop({abort:true});runner=null;
    const imported=await f.imageRepo.importBase64(f.scenes[0].id,{mimeType:'image/png',dataBase64:png.toString('base64')});
    assert.throws(()=>f.dag.retry(f.video.id,run.runId,{}),{code:'ASSET_DAG_STALE_RETRY'});
    assert.equal(f.repo.getScene(f.scenes[0].id).visualAssetId,imported.assetId);
    assert.equal(f.store.get(run.finalJobId).status,'failed');
  }finally{await runner?.stop({abort:true});await f.close()}
});

test('newer scene prompt during async planning causes entire DAG transaction rollback',async()=>{
  const f=await fixture();try{
    const actual=f.store.enqueueManyAtomic.bind(f.store);
    f.store.enqueueManyAtomic=(jobs,cb)=>{
      f.db.prepare('UPDATE scenes SET visual_prompt=? WHERE id=?').run('changed while planning',f.scenes[0].id);
      return actual(jobs,cb);
    };
    await assert.rejects(f.dag.submit(f.video.id,body('source-conflict')),{code:'ASSET_DAG_SNAPSHOT_CONFLICT'});
    assert.equal(f.store.countByStatus().total,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM asset_dag_runs').get().c,0);
  }finally{await f.close()}
});

test('no job may be promoted by a duplicate failed batch that rolled back after enqueue',async()=>{
  const f=await fixture();try{
    f.store.db.exec(`CREATE TRIGGER stop_gate_nodes BEFORE INSERT ON asset_dag_nodes
      BEGIN SELECT RAISE(ABORT,'NO_HALFDAG'); END;`);
    await assert.rejects(f.dag.submit(f.video.id,body('broken-half')),/NO_HALFDAG/);
    assert.equal(f.store.countByStatus().total,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) c FROM asset_dag_runs').get().c,0);
    assert.equal(f.store.events({limit:100}).length,0);
  }finally{await f.close()}
});

test('lease lost over process restart is re-claimed with new fencing token; stale worker cannot complete',async()=>{
  const f=await fixture();try{
    const run=await f.dag.submit(f.video.id,body('lease',{image:null,sceneIds:[f.scenes[0].id]}));
    let t=Date.now();f.store.clock=()=>t;f.store.leaseMs=1000;
    const first=f.store.claim('worker-before-restart');
    assert.equal(first.kind,'asset:voice');
    const oldToken=first.lease_token;
    f.store.close();
    f.store=new JobStore({path:f.dbFile,clock:()=>t,leaseMs:1000,baseBackoffMs:0});
    f.dag.store=f.store;
    t+=1001;
    assert.equal(f.store.recoverExpired(),1);
    assert.equal(f.store.complete(first.id,oldToken,{result:{fake:true}}),false);
    const reclaimed=f.store.claim('worker-after-restart');
    assert.equal(reclaimed.id,first.id);assert.equal(reclaimed.attempt,2);
    assert.notEqual(reclaimed.lease_token,oldToken);
    assert.equal(f.store.heartbeat(first.id,oldToken),false);
    assert.equal(f.dag.get(f.video.id,run.runId).sceneCount,1);
    assert.equal(f.store.events({limit:50}).some(e=>e.type==='lease_recovered'),true);
  }finally{await f.close()}
});
