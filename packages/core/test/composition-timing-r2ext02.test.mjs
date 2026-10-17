/** R2-EXT-02: real media timing when ffprobe installed, always offline/local. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository,
  validateTimedComposition,compositionDigest,measureVoiceDuration} from '../src/index.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
function audio(ms=1234){
  const samples=Math.round(ms*8),data=Buffer.alloc(samples,0),out=Buffer.alloc(44+samples,0);
  out.write('RIFF',0);out.writeUInt32LE(36+samples,4);out.write('WAVEfmt ',8);
  out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(8000,24);
  out.writeUInt32LE(8000,28);out.writeUInt16LE(1,32);out.writeUInt16LE(8,34);
  out.write('data',36);out.writeUInt32LE(samples,40);data.copy(out,44);return out;
}
async function fixture(count=1,probe=measureVoiceDuration){
 const dir=await mkdtemp(join(tmpdir(),'r2ext02-')),db=openProjectDb(join(dir,'project.db'));
 const repo=new StudioRepository(db),channel=repo.createChannel({name:'EXT02 local timing'});
 const video=repo.createVideo(channel.id,{title:'Xin chào Việt Nam'});
 const scenes=repo.replaceScenes(video.id,{rowVersion:1,scenes:Array.from({length:count},(_,i)=>({text:`Lời thoại ${i+1}: Hà Nội 😊\r\n`,durationMs:3000,mediaType:'image_motion'}))});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
 const compositions=new CompositionRepository({repo,manifest});
 const timing=new TimedCompositionRepository({compositions,manifest,probe});
 return {dir,db,repo,video,scenes,manifest,compositions,timing,
  async close(){db.close();await rm(dir,{force:true,recursive:true})}};
}
async function ready(f,scene,{wavMs=1234,metadataMs=99999}={}){
 const jobId=`v-${scene.id}`,inputHash=sha(`key-${scene.id}`);
 await f.manifest.importBytes({sceneId:scene.id,kind:'voice',source:'mock-tts',bytes:audio(wavMs),extension:'.wav',metadata:{queueJobId:jobId,inputHash,textSha256:sha(scene.text),durationMs:metadataMs,providerId:'piper'}});
 f.db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(scene.id,jobId,inputHash,sha(scene.text),f.repo.getVideo(f.video.id).configRevision,'piper','default',0,Date.now());
 const picture=await f.manifest.importBytes({sceneId:scene.id,kind:'image',source:'manual_import',bytes:png,extension:'.png'});
 f.db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,picture.id,Date.now());
}
const ffprobeAvailable=spawnSync('ffprobe',['-version'],{stdio:'ignore'}).status===0;
test('real ffprobe measures WAV, overrides false metadata, moves frame and caption cutoff before padding', {skip:!ffprobeAvailable},async()=>{
 const f=await fixture();try{
  await ready(f,f.scenes[0]);
  const v1=await f.compositions.preview(f.video.id);
  assert.equal(v1.schemaVersion,1);assert.equal(v1.scenes[0].durationFrames,90);
  const v2=await f.timing.preview(f.video.id,{});
  assert.equal(v2.schemaVersion,2);assert.equal(v2.readiness.ready,true);
  assert.equal(v2.scenes[0].voice.measuredDurationMs,1234);
  assert.equal(v2.scenes[0].durationMs,1484);
  assert.equal(v2.scenes[0].durationFrames,45);
  assert.equal(v2.scenes[0].timing.audioFrames,38);
  assert.equal(v2.scenes[0].timing.paddingFrames,7);
  assert.equal(v2.scenes[0].captions.cues[0].endFrame,38);
  assert.equal(v2.scenes[0].captions.cues[0].text,f.scenes[0].text);
  assert.equal(v2.scenes[0].durationBasis,'voice_measured');
  validateTimedComposition(v2);
  assert.equal(f.compositions.history(f.video.id).length,0,'preview is a read-only transformation');
 }finally{await f.close()}
});
test('cumulative frames have no gaps; options are deterministic and cannot mutate scene estimates',{skip:!ffprobeAvailable},async()=>{
 const f=await fixture(3);try{
  for(const [i,s] of f.scenes.entries())await ready(f,s,{wavMs:1000+333*i});
  const one=await f.timing.preview(f.video.id,{tailPaddingMs:300});
  const two=await f.timing.preview(f.video.id,{tailPaddingMs:300});
  assert.deepEqual(one,two);
  assert.equal(one.scenes[2].startFrame,one.scenes[1].endFrame);
  assert.equal(one.totalFrames,one.scenes.at(-1).endFrame);
  assert.equal(f.repo.listScenes(f.video.id)[0].durationMs,3000);
  assert.equal((await f.compositions.preview(f.video.id)).scenes[0].durationBasis,'scene_estimate');
 }finally{await f.close()}
});
test('manual timeline lock preserves duration and caption boundaries without silently replacing with voice',{skip:!ffprobeAvailable},async()=>{
 const f=await fixture();try{
  await ready(f,f.scenes[0],{wavMs:1200});
  const timeline=f.repo.getTimeline(f.video.id);
  f.repo.updateTimeline(f.video.id,{rowVersion:timeline.rowVersion,document:{tracks:['media','voice','text'],clips:[{
   sceneId:f.scenes[0].id,startMs:0,durationMs:2500,timingLocked:true,captionStartMs:250,captionEndMs:1700}]}});
  const snap=await f.timing.preview(f.video.id,{tailPaddingMs:3000});
  assert.equal(snap.scenes[0].durationBasis,'manual_locked');
  assert.equal(snap.scenes[0].durationMs,2500);
  assert.equal(snap.scenes[0].captions.mode,'manual_locked');
  assert.equal(snap.scenes[0].captions.cues[0].startFrame,7);
  assert.equal(snap.scenes[0].captions.cues[0].endFrame,51);
  assert.equal(snap.scenes[0].voice.measuredDurationMs,1200);
  assert.equal(snap.readiness.ready,true);
 }finally{await f.close()}
});
test('manual short-lock causes explicit cutoff blocker instead of trimming audio',{skip:!ffprobeAvailable},async()=>{
 const f=await fixture();try{
  await ready(f,f.scenes[0],{wavMs:1800});
  const timeline=f.repo.getTimeline(f.video.id);
  f.repo.updateTimeline(f.video.id,{rowVersion:timeline.rowVersion,document:{tracks:['media'],clips:[{
   sceneId:f.scenes[0].id,startMs:0,durationMs:1000,timingLocked:true}]}});
  const preview=await f.timing.preview(f.video.id);
  assert.equal(preview.readiness.ready,false);
  assert.ok(preview.readiness.blockers.some(b=>b.code==='VOICE_DURATION_OVERRUN'));
  await assert.rejects(f.timing.publish(f.video.id,{expectedDigest:preview.digest,expectedVideoRowVersion:preview.source.videoRowVersion}),{code:'COMPOSITION_ASSETS_NOT_READY'});
 }finally{await f.close()}
});
test('ffprobe unavailable blocks ready publish, never lies about WPM timing',async()=>{
 const f=await fixture(1,async()=>{throw new Error('unavailable');});try{
  await ready(f,f.scenes[0]);const preview=await f.timing.preview(f.video.id);
  assert.equal(preview.readiness.ready,false);
  assert.ok(preview.readiness.blockers.some(b=>b.code==='VOICE_DURATION_UNAVAILABLE'));
  assert.equal(preview.scenes[0].timing.mode,'estimate_only');
  await assert.rejects(f.timing.publish(f.video.id,{expectedDigest:preview.digest,expectedVideoRowVersion:preview.source.videoRowVersion}),{code:'COMPOSITION_ASSETS_NOT_READY'});
 }finally{await f.close()}
});
test('missing voice stays explicit blocker and triggers zero ffprobe calls',async()=>{
 let probes=0;const f=await fixture(1,async()=>{probes++;return 1200;});try{
  const preview=await f.timing.preview(f.video.id);
  assert.equal(preview.readiness.ready,false);assert.equal(probes,0);
  assert.ok(preview.readiness.blockers.some(b=>b.code==='VOICE_MISSING'));
  validateTimedComposition(preview);
 }finally{await f.close()}
});
test('v2 preview digest fenced; immutable v1 and v2 historical revisions read together',{skip:!ffprobeAvailable},async()=>{
 const f=await fixture();try{
  await ready(f,f.scenes[0]);
  const one=await f.compositions.preview(f.video.id);
  const old=await f.compositions.publish(f.video.id,{expectedDigest:one.digest,expectedVideoRowVersion:one.source.videoRowVersion});
  assert.equal(old.revision,1);
  const timed=await f.timing.preview(f.video.id,{tailPaddingMs:0});
  await assert.rejects(f.timing.publish(f.video.id,{expectedDigest:one.digest,expectedVideoRowVersion:timed.source.videoRowVersion,tailPaddingMs:0}),{code:'COMPOSITION_PREVIEW_CONFLICT'});
  const publish=await f.timing.publish(f.video.id,{expectedDigest:timed.digest,expectedVideoRowVersion:timed.source.videoRowVersion,tailPaddingMs:0});
  assert.equal(publish.revision,2);
  assert.equal(f.compositions.revision(f.video.id,1).composition.schemaVersion,1);
  assert.equal(f.compositions.revision(f.video.id,2).composition.schemaVersion,2);
  assert.equal((await f.timing.publish(f.video.id,{expectedDigest:timed.digest,expectedVideoRowVersion:timed.source.videoRowVersion,tailPaddingMs:0})).unchanged,true);
  assert.throws(()=>f.db.prepare('DELETE FROM composition_revisions').run(),/COMPOSITION_REVISION_IMMUTABLE/);
 }finally{await f.close()}
});
test('tampered timing and invented word-level captions cannot pass hash regeneration',{skip:!ffprobeAvailable},async()=>{
 const f=await fixture();try{
  await ready(f,f.scenes[0]);const base=await f.timing.preview(f.video.id);
  for(const mutate of [
   s=>{s.timing.audioFrames++;},
   s=>{s.captions.mode='word_level';},
   s=>{s.captions.cues[0].text='not approved';},
   s=>{s.timing.paddingFrames=0;},
   s=>{s.captions.cues[0].endFrame=s.durationFrames+1;},
   s=>{s.timing.evil='secret';}]){
    const forged=structuredClone(base);mutate(forged.scenes[0]);
    const {digest,...payload}=forged;forged.digest=compositionDigest(payload);
    assert.throws(()=>validateTimedComposition(forged));
   }
 }finally{await f.close()}
});
test('concurrent timeline mutation during measured FFprobe is rejected rather than publishing stale timing',async()=>{
 let f; f=await fixture(1,async()=>{
  const t=f.repo.getTimeline(f.video.id);
  f.repo.updateTimeline(f.video.id,{rowVersion:t.rowVersion,document:t.document});return 1100;
 });
 try{await ready(f,f.scenes[0]);await assert.rejects(f.timing.preview(f.video.id),{code:'COMPOSITION_SOURCE_CHANGED'});
  assert.equal(f.compositions.history(f.video.id).length,0);
 }finally{await f.close()}
});
test('invalid padding rejected, no provider side effects and no mutable database revisions',async()=>{
 const f=await fixture();try{
  for(const invalid of [-1,5001,0.3,'2',null])await assert.rejects(f.timing.preview(f.video.id,{tailPaddingMs:invalid}),{code:'INVALID_TIMED_PREVIEW'});
  await assert.rejects(f.timing.preview(f.video.id,{paidFallback:true}),{code:'INVALID_TIMED_PREVIEW'});
  assert.equal(f.db.prepare('SELECT count(*) n FROM composition_revisions').get().n,0);
 }finally{await f.close()}
});

test('out-of-position timeline lock is blocked instead of silently moving a manually positioned clip',async()=>{
 const f=await fixture(1,async()=>1200);try{
  await ready(f,f.scenes[0]);
  const t=f.repo.getTimeline(f.video.id);
  f.repo.updateTimeline(f.video.id,{rowVersion:t.rowVersion,document:{tracks:['media','voice'],clips:[{
   sceneId:f.scenes[0].id,startMs:3000,durationMs:3000,timingLocked:true}]}});
  const preview=await f.timing.preview(f.video.id);
  assert.equal(preview.readiness.ready,false);
  assert.ok(preview.readiness.blockers.some(b=>b.code==='TIMING_LOCK_CONFLICT'));
 }finally{await f.close()}
});
test('audio checksum corruption after preview cannot produce a new ready timed composition',async()=>{
 const f=await fixture(1,async()=>1200);try{
  await ready(f,f.scenes[0]);const before=await f.timing.preview(f.video.id);
  assert.equal(before.readiness.ready,true);
  const path=join(f.dir,before.scenes[0].voice.asset.relativePath);
  const old=Buffer.from(await import('node:fs/promises').then(fs=>fs.readFile(path)));
  old[44]^=1;await writeFile(path,old);
  const after=await f.timing.preview(f.video.id);
  assert.equal(after.readiness.ready,false);
  assert.ok(after.readiness.blockers.some(b=>b.code==='VOICE_UNHEALTHY'));
  await assert.rejects(f.timing.publish(f.video.id,{expectedDigest:before.digest,expectedVideoRowVersion:before.source.videoRowVersion}),{code:'COMPOSITION_PREVIEW_CONFLICT'});
 }finally{await f.close()}
});
