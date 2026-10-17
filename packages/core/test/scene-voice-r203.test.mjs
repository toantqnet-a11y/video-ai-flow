import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,SceneVoiceRepository,AssetManifest,promoteQueueAsset,promotePendingQueueAssets} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {ProviderRegistry} from '../../providers/src/index.mjs';
import {createJobHandlers} from '../../../apps/api/src/handlers.mjs';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';

async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'cs-voice-r203-')),file=join(dir,'db.sqlite'),db=openProjectDb(file),
    repo=new StudioRepository(db),store=new JobStore({path:file,leaseMs:600,baseBackoffMs:1,maxBackoffMs:10});
  const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
  const channel=repo.createChannel({name:'Voice testing'}),video=repo.createVideo(channel.id,{title:'Video'});
  const [scene,second]=repo.replaceScenes(video.id,{rowVersion:1,scenes:[
    {text:'Xin chào Việt Nam, chúc các bạn một ngày tốt lành.',durationMs:9000},
    {text:'Đây là đoạn lời thoại tiếp theo.',durationMs:9000}]});
  const service=new SceneVoiceRepository(repo,{store,manifest});
  return {dir,db,repo,store,manifest,service,video,scene,second,
    async close(){store.close();db.close();await rm(dir,{force:true,recursive:true})}};
}
function wave(){
  // 0.1 s mono 16-bit PCM @ 8000 Hz, deliberately tiny but valid WAV.
  const bytes=Buffer.alloc(44+1600);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);
  bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);
  bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(1600,40);return bytes;
}
const accepted={remoteConsent:true};
test('v21 migration, consent, voice allowlist, rate and scene text limits',async()=>{
 const f=await fixture();try{
  assert.ok(f.db.prepare('PRAGMA user_version').get().user_version>=26);
  await assert.rejects(f.service.queue(f.scene.id,{}),{code:'REMOTE_CONSENT_REQUIRED'});
  await assert.rejects(f.service.queue(f.scene.id,{...accepted,voice:'other'}),{code:'INVALID_VOICE_ID'});
  await assert.rejects(f.service.queue(f.scene.id,{...accepted,provider:'paid'}),{code:'UNSUPPORTED_VOICE_PROVIDER'});
  await assert.rejects(f.service.queue(f.scene.id,{...accepted,speed:2.4}),{code:'INVALID_VOICE_SPEED'});
  await assert.rejects(f.service.queue(f.scene.id,{...accepted,foo:'secret'}),{code:'INVALID_VOICE_REQUEST'});
  f.db.prepare('UPDATE scenes SET text=? WHERE id=?').run('a'.repeat(4001),f.scene.id);
  await assert.rejects(f.service.queue(f.scene.id,accepted),{code:'INVALID_SCENE_VOICE_TEXT'});
 }finally{await f.close()}
});

test('idempotent scene jobs, newest intent supersedes old voice, batch scope is enforced',async()=>{
 const f=await fixture();try{
  const first=await f.service.queue(f.scene.id,accepted),repeat=await f.service.queue(f.scene.id,accepted);
  assert.equal(repeat.job.id,first.job.id);assert.equal(repeat.reused,true);
  const next=await f.service.queue(f.scene.id,{...accepted,voice:'vi-VN-NamMinhNeural'});
  assert.notEqual(next.job.id,first.job.id);
  assert.equal(f.db.prepare('SELECT job_id FROM scene_voice_intents WHERE scene_id=?').get(f.scene.id).job_id,next.job.id);
  await assert.rejects(f.service.batch('wrong',{sceneIds:[f.scene.id],...accepted}),{code:'VIDEO_NOT_FOUND'});
  await assert.rejects(f.service.batch(f.video.id,{sceneIds:[f.scene.id,f.scene.id],...accepted}),{code:'INVALID_VOICE_BATCH'});
  const result=await f.service.batch(f.video.id,{sceneIds:[f.scene.id,f.second.id],...accepted});
  assert.equal(result.items.length,2);
  assert.equal(f.store.countByStatus().total,3);
 }finally{await f.close()}
});

test('real queue stores ffprobe-measured duration, promotes only latest and caches without new calls',async()=>{
 const f=await fixture();let runner;try{
  const output=join(f.dir,'fixture.wav');await writeFile(output,wave());
  const registry=new ProviderRegistry();let calls=0;
  registry.register({id:'edge',kind:'tts',location:'remote',costTier:'free_unverified',noChargeConfirmed:true,
    invoke:async()=>{calls++;return {path:output}}});
  const job=(await f.service.queue(f.scene.id,accepted)).job;
  runner=new JobRunner(f.store,createJobHandlers({repo:f.repo,registry,dataRoot:f.dir,
    probeVoice:async()=>({durationSec:2.75,codec:'pcm_s16le'})}),{concurrency:1,pollMs:10,heartbeatMs:100});
  runner.start();await runner.waitForIdle({timeoutMs:5000});
  assert.equal(f.store.get(job.id).status,'succeeded');
  const promoted=await promotePendingQueueAssets(f.manifest);
  assert.equal(promoted.promoted.length,1);assert.equal(promoted.failed.length,0);
  const state=await f.service.status(f.scene.id);
  assert.equal(state.state,'ready');assert.equal(state.durationMs,2750);
  assert.equal(f.repo.getScene(f.scene.id).durationMs,9000,'estimated scene timing remains untouched');
  assert.equal((await f.service.audio(f.scene.id)).format,'wav');
  assert.equal((await f.service.queue(f.scene.id,accepted)).cached,true);
  assert.equal(f.store.countByStatus().total,1);assert.equal(calls,1);
  const again=await promoteQueueAsset({manifest:f.manifest,jobId:job.id});assert.equal(again.id,promoted.promoted[0]);
  assert.equal(f.manifest.get(again.id).metadata.codec,'pcm_s16le');
 }finally{await runner?.stop();await f.close()}
});

test('superseded job never invokes Edge; only newest voice is promoted',async()=>{
 const f=await fixture();let runner;try{
  const output=join(f.dir,'voice.wav');await writeFile(output,wave());let calls=0;
  const registry=new ProviderRegistry().register({id:'edge',kind:'tts',location:'remote',costTier:'free_unverified',noChargeConfirmed:true,
    invoke:async()=>{calls++;return {path:output}}});
  const old=(await f.service.queue(f.scene.id,accepted)).job;
  const current=(await f.service.queue(f.scene.id,{...accepted,voice:'vi-VN-NamMinhNeural'})).job;
  runner=new JobRunner(f.store,createJobHandlers({repo:f.repo,registry,dataRoot:f.dir,
    probeVoice:async()=>({durationSec:1.2,codec:'pcm_s16le'})}),{concurrency:1,pollMs:10,heartbeatMs:100});
  runner.start();await runner.waitForIdle({timeoutMs:5000});
  assert.equal(f.store.get(old.id).status,'failed');assert.equal(f.store.get(current.id).status,'succeeded');
  assert.equal(calls,1);
  const promotion=await promotePendingQueueAssets(f.manifest);assert.equal(promotion.promoted.length,1);
  assert.equal(f.manifest.get(promotion.promoted[0]).metadata.voice,'vi-VN-NamMinhNeural');
 }finally{await runner?.stop();await f.close()}
});

test('post-inference scene text changes fence DB activation, playback and stale status',async()=>{
 const f=await fixture();try{
  const output=join(f.dir,'voice.wav');await writeFile(output,wave());
  const registry=new ProviderRegistry().register({id:'edge',kind:'tts',location:'remote',costTier:'free_unverified',noChargeConfirmed:true,
    invoke:async()=>({path:output})});
  const job=(await f.service.queue(f.scene.id,accepted)).job;
  const handler=createJobHandlers({repo:f.repo,registry,dataRoot:f.dir,
    probeVoice:async()=>({durationSec:1,codec:'pcm_s16le'})})['asset:voice'];
  f.db.prepare('UPDATE scenes SET text=? WHERE id=?').run('Nội dung đã đổi hoàn toàn',f.scene.id);
  await assert.rejects(handler(f.store.get(job.id).payload,{jobId:job.id}),{code:'STALE_VOICE_JOB'});
  assert.equal((await f.service.status(f.scene.id)).voiceAsset,null);
  await assert.rejects(f.service.audio(f.scene.id),{code:'VOICE_NOT_READY'});
 }finally{await f.close()}
});

test('asset promotion rejects old voice when newer intent arrives after successful TTS',async()=>{
 const f=await fixture();try{
  const output=join(f.dir,'voice.wav');await writeFile(output,wave());
  const registry=new ProviderRegistry().register({id:'edge',kind:'tts',location:'remote',costTier:'free_unverified',noChargeConfirmed:true,
    invoke:async()=>({path:output})});
  const old=(await f.service.queue(f.scene.id,accepted)).job;
  const claimed=f.store.claim('worker-1');assert.equal(claimed.id,old.id);
  const handler=createJobHandlers({repo:f.repo,registry,dataRoot:f.dir,
    probeVoice:async()=>({durationSec:1,codec:'pcm_s16le'})})['asset:voice'];
  const outcome=await handler(claimed.payload,{jobId:old.id});
  assert(f.store.complete(claimed.id,claimed.lease_token,outcome));
  await f.service.queue(f.scene.id,{...accepted,voice:'vi-VN-NamMinhNeural'});
  await assert.rejects(promoteQueueAsset({manifest:f.manifest,jobId:old.id}),{code:'STALE_VOICE_JOB'});
  assert.equal(f.repo.getScene(f.scene.id).voiceAssetId,null);
 }finally{await f.close()}
});

test('audio files that fail signature or probe cannot be committed',async()=>{
 const f=await fixture();try{
  const output=join(f.dir,'error.wav');await writeFile(output,Buffer.alloc(1600));
  const registry=new ProviderRegistry().register({id:'edge',kind:'tts',location:'remote',costTier:'free_unverified',noChargeConfirmed:true,
    invoke:async()=>({path:output})});
  const job=(await f.service.queue(f.scene.id,accepted)).job;
  const handler=createJobHandlers({repo:f.repo,registry,dataRoot:f.dir,
    probeVoice:async()=>({durationSec:0.1,codec:'pcm_s16le'})})['asset:voice'];
  await assert.rejects(handler(f.store.get(job.id).payload,{jobId:job.id}),{code:'INVALID_AUDIO'});
  assert.equal(f.db.prepare('SELECT count(*) n FROM asset_revisions').get().n,0);
 }finally{await f.close()}
});

test('late provider completion after a second voice request cannot overwrite intent',async()=>{
 const f=await fixture();try{
  const output=join(f.dir,'slow.wav');await writeFile(output,wave());
  let release;let called;const entered=new Promise(r=>called=r);
  const barrier=new Promise(r=>release=r);
  const registry=new ProviderRegistry().register({id:'edge',kind:'tts',location:'remote',costTier:'free_unverified',noChargeConfirmed:true,
    invoke:async()=>{called();await barrier;return {path:output}}});
  const old=(await f.service.queue(f.scene.id,accepted)).job;
  const handler=createJobHandlers({repo:f.repo,registry,dataRoot:f.dir,
    probeVoice:async()=>({durationSec:0.1,codec:'pcm_s16le'})})['asset:voice'];
  const ongoing=handler(f.store.get(old.id).payload,{jobId:old.id});
  await entered;
  const latest=await f.service.queue(f.scene.id,{...accepted,voice:'vi-VN-NamMinhNeural'});
  release();
  await assert.rejects(ongoing,{code:'STALE_VOICE_JOB'});
  assert.equal(f.db.prepare('SELECT job_id FROM scene_voice_intents WHERE scene_id=?').get(f.scene.id).job_id,latest.job.id);
  assert.equal(f.repo.getScene(f.scene.id).voiceAssetId,null);
 }finally{await f.close()}
});

test('real ffprobe reads a generated fixture WAV (only when ffprobe is installed)',async t=>{
 const {spawnSync}=await import('node:child_process');
 if(spawnSync('ffprobe',['-version'],{stdio:'ignore'}).status!==0){t.skip('ffprobe is not installed on this test host');return}
 const f=await fixture();try{
  const file=join(f.dir,'probe.wav');await writeFile(file,wave());
  const {probeAudio}=await import('../../../spikes/SP-02/src/audio.js');
  const measured=await probeAudio(file);
  assert.equal(measured.codec,'pcm_s16le');
  assert(Math.abs(measured.durationSec-0.1)<0.01);
 }finally{await f.close()}
});
