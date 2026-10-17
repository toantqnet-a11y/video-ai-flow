/** R2-04 acceptance: local-only narration, explicit fallback and immutable fencing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,SceneVoiceRepository,AssetManifest,promotePendingQueueAssets} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {ProviderRegistry} from '../../providers/src/index.mjs';
import {createJobHandlers} from '../../../apps/api/src/handlers.mjs';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';

function wav(){
 const b=Buffer.alloc(1644);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);
 b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);
 b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(1600,40);return b;
}
async function fixture({localVoices={piper:'vi_voice',vieneu:'vi_natural'}}={}){
 const dir=await mkdtemp(join(tmpdir(),'contentstudio-r204-')),file=join(dir,'db.sqlite');
 const db=openProjectDb(file),repo=new StudioRepository(db),store=new JobStore({path:file,leaseMs:800,baseBackoffMs:1,maxBackoffMs:10});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
 const ch=repo.createChannel({name:'Local TTS test'}),video=repo.createVideo(ch.id,{title:'Voice'});
 const scenes=repo.replaceScenes(video.id,{rowVersion:1,scenes:[{text:'Xin chào các bạn.',durationMs:5000},{text:'Một câu khác.',durationMs:5000}]});
 const voice=new SceneVoiceRepository(repo,{store,manifest,localVoices});
 const path=join(dir,'out.wav');await writeFile(path,wav());
 const registry=new ProviderRegistry();registry.localVoiceDefaults=localVoices;
 const calls=[];
 const register=(id,impl,location=id==='edge'?'remote':'local')=>registry.register({id,kind:'tts',location,
   costTier:location==='local'?'local':'free_unverified',noChargeConfirmed:true,
   invoke:async(input,opts)=>{calls.push({id,voice:input.voice,allowRemote:opts?.allowRemote});return impl(input,opts);}});
 return {dir,db,repo,store,manifest,video,scenes,voice,path,registry,calls,register,
   async close(){store.close();db.close();await rm(dir,{recursive:true,force:true})}};
}
const ttsProbe=async()=>({durationSec:1.5,codec:'pcm_s16le'});
async function runOne(f){
 const runner=new JobRunner(f.store,createJobHandlers({repo:f.repo,registry:f.registry,dataRoot:f.dir,probeVoice:ttsProbe}),
   {concurrency:1,pollMs:5,heartbeatMs:100});
 runner.start();try{await runner.waitForIdle({timeoutMs:5000});}finally{await runner.stop()}
 return promotePendingQueueAssets(f.manifest);
}

test('migration 22 supports both local providers and preserves v21 edge intents',async()=>{
 const f=await fixture();try{
  assert.ok(f.db.prepare('PRAGMA user_version').get().user_version>=26);
  const edge=await f.voice.queue(f.scenes[0].id,{remoteConsent:true});
  const row=f.db.prepare('SELECT provider_id,fallback_provider_id FROM scene_voice_intents WHERE scene_id=?').get(f.scenes[0].id);
  assert.equal(row.provider_id,'edge');assert.equal(row.fallback_provider_id,null);
  assert(edge.job.id);
  assert.throws(()=>f.db.prepare("UPDATE scene_voice_intents SET provider_id='suspicious' WHERE scene_id=?").run(f.scenes[0].id));
 }finally{await f.close()}
});

test('local direct does not require remote consent; strict configured voice and zero fallback',async()=>{
 const f=await fixture();try{
  const response=await f.voice.queue(f.scenes[0].id,{provider:'piper',voice:'vi_voice',speed:1.15});
  assert.equal(response.state,'queued');
  const job=f.store.get(response.job.id);
  assert.equal(job.payload.providerId,'piper');assert.equal(job.payload.remoteConsent,false);
  assert.equal(job.payload.fallbackProvider,null);
  await assert.rejects(f.voice.queue(f.scenes[0].id,{provider:'piper',voice:'made_up'}),{code:'INVALID_VOICE_ID'});
  await assert.rejects(f.voice.queue(f.scenes[0].id,{provider:'vieneu',fallbackProvider:'piper'}),{code:'INVALID_VOICE_FALLBACK'});
  await assert.rejects(f.voice.queue(f.scenes[0].id,{provider:'edge'}),{code:'REMOTE_CONSENT_REQUIRED'});
  await assert.rejects(f.voice.queue(f.scenes[0].id,{provider:'edge',remoteConsent:true,fallbackProvider:'piper',fallbackVoice:'wrong'}),{code:'INVALID_FALLBACK_VOICE'});
 }finally{await f.close()}
});

test('local provider not configured fails before a queue job exists',async()=>{
 const f=await fixture({localVoices:{}});try{
  await assert.rejects(f.voice.queue(f.scenes[0].id,{provider:'piper'}),{code:'LOCAL_TTS_NOT_CONFIGURED'});
  await assert.rejects(f.voice.queue(f.scenes[0].id,{remoteConsent:true,fallbackProvider:'vieneu'}),{code:'LOCAL_TTS_NOT_CONFIGURED'});
  assert.equal(f.store.countByStatus().total,0);
 }finally{await f.close()}
});

test('local Piper job writes audio with measured duration, provider name and cache reuse',async()=>{
 const f=await fixture();try{
  f.register('piper',async()=>({path:f.path}));
  const first=await f.voice.queue(f.scenes[0].id,{provider:'piper',voice:'vi_voice'});
  const result=await runOne(f);
  assert.equal(result.promoted.length,1);
  assert.equal(f.store.get(first.job.id).status,'succeeded');
  const status=await f.voice.status(f.scenes[0].id);
  assert.equal(status.state,'ready');assert.equal(status.durationMs,1500);
  assert.equal(status.voiceAsset.provider,'piper');assert.equal(status.voiceAsset.fallbackUsed,false);
  assert.equal((await f.voice.audio(f.scenes[0].id)).format,'wav');
  assert.equal((await f.voice.queue(f.scenes[0].id,{provider:'piper',voice:'vi_voice'})).cached,true);
  assert.equal(f.calls.length,1);
  assert.equal(f.repo.getScene(f.scenes[0].id).durationMs,5000);
 }finally{await f.close()}
});

test('Edge upstream outage falls back to Piper only on explicitly pinned consent',async()=>{
 const f=await fixture();try{
  f.register('edge',async()=>{throw Object.assign(new Error('unavailable'),{code:'PROVIDER_UNAVAILABLE',retryable:true})});
  f.register('piper',async()=>({path:f.path}));
  const job=await f.voice.queue(f.scenes[0].id,{provider:'edge',remoteConsent:true,
    fallbackProvider:'piper',fallbackVoice:'vi_voice'});
  assert.equal(f.store.get(job.job.id).payload.fallbackProvider,'piper');
  const promoted=await runOne(f);assert.equal(promoted.promoted.length,1);
  assert.deepEqual(f.calls.map(x=>x.id),['edge','piper']);
  const state=await f.voice.status(f.scenes[0].id);
  assert.equal(state.voiceAsset.provider,'piper');assert.equal(state.voiceAsset.voice,'vi_voice');
  assert.equal(state.voiceAsset.fallbackUsed,true);
  const again=await f.voice.queue(f.scenes[0].id,{provider:'edge',remoteConsent:true,
    fallbackProvider:'piper',fallbackVoice:'vi_voice'});
  assert.equal(again.cached,true);assert.equal(f.calls.length,2);
 }finally{await f.close()}
});

test('Edge error without user opt-in never invokes local provider',async()=>{
 const f=await fixture();try{
  f.register('edge',async()=>{throw Object.assign(new Error('outage'),{code:'PROVIDER_UNAVAILABLE',retryable:true})});
  f.register('piper',async()=>({path:f.path}));
  await f.voice.queue(f.scenes[0].id,{remoteConsent:true});
  await runOne(f);
  assert(f.calls.length>=1);assert(f.calls.every(x=>x.id==='edge'));
  assert.equal(f.repo.getScene(f.scenes[0].id).voiceAssetId,null);
 }finally{await f.close()}
});

test('invalid request and cancelled/paid/invalid input errors never fall back',async()=>{
 const f=await fixture();try{
  f.register('edge',async()=>{throw Object.assign(new Error('denied'),{code:'INVALID_INPUT',retryable:false})});
  f.register('piper',async()=>({path:f.path}));
  const job=(await f.voice.queue(f.scenes[0].id,{remoteConsent:true,fallbackProvider:'piper'})).job;
  const handler=createJobHandlers({repo:f.repo,registry:f.registry,dataRoot:f.dir,probeVoice:ttsProbe})['asset:voice'];
  await assert.rejects(handler(f.store.get(job.id).payload,{jobId:job.id}),{code:'INVALID_INPUT'});
  assert.deepEqual(f.calls.map(x=>x.id),['edge']);
 }finally{await f.close()}
});

test('superseded local voice job cannot call service or activate old audio',async()=>{
 const f=await fixture();try{
  f.register('piper',async()=>({path:f.path}));f.register('vieneu',async()=>({path:f.path}));
  const old=(await f.voice.queue(f.scenes[0].id,{provider:'piper'})).job;
  const current=(await f.voice.queue(f.scenes[0].id,{provider:'vieneu'})).job;
  const handler=createJobHandlers({repo:f.repo,registry:f.registry,dataRoot:f.dir,probeVoice:ttsProbe})['asset:voice'];
  await assert.rejects(handler(f.store.get(old.id).payload,{jobId:old.id}),{code:'STALE_VOICE_JOB'});
  assert.equal(f.calls.length,0);
  const outcome=await handler(f.store.get(current.id).payload,{jobId:current.id});
  assert.equal(outcome.result.providerId,'vieneu');
 }finally{await f.close()}
});

test('batch validates provider, configured voices and scope before enqueue',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.voice.batch(f.video.id,{sceneIds:[f.scenes[0].id,f.scenes[1].id],provider:'piper',voice:'fake'}),{code:'INVALID_VOICE_ID'});
  assert.equal(f.store.countByStatus().total,0);
  const batch=await f.voice.batch(f.video.id,{sceneIds:[f.scenes[0].id,f.scenes[1].id],provider:'piper'});
  assert.equal(batch.items.length,2);assert.equal(f.store.countByStatus().total,2);
 }finally{await f.close()}
});

test('local service cannot be switched to remote endpoint using request-controlled payload',async()=>{
 const f=await fixture();try{
  f.register('piper',async()=>({path:f.path}),'remote');
  const job=(await f.voice.queue(f.scenes[0].id,{provider:'piper',remoteConsent:true})).job;
  const handler=createJobHandlers({repo:f.repo,registry:f.registry,dataRoot:f.dir,probeVoice:ttsProbe})['asset:voice'];
  await assert.rejects(handler(f.store.get(job.id).payload,{jobId:job.id}),/REMOTE_CONSENT_REQUIRED/);
  assert.equal(f.calls.length,0);
 }finally{await f.close()}
});
