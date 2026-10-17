/** R2-EXT-01 offline schema/version pinning tests; NO AI/GPU/render execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,framesFromMs,
  validateComposition,compositionDigest,stableCompositionJson} from '../src/index.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const image=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
const wav=Buffer.alloc(44+1600,0);wav.write('RIFF',0);wav.write('WAVE',8);

async function fixture({count=2,portrait=false}={}){
 const dir=await mkdtemp(join(tmpdir(),'r2-ext-01-')),db=openProjectDb(join(dir,'studio.sqlite'));
 const repo=new StudioRepository(db),channel=repo.createChannel({name:'Composition v1'});
 if(portrait){const preset={...channel.preset,media:{...channel.preset.media,aspectRatio:'9:16'},render:{...channel.preset.render,width:1080,height:1920}};repo.updateChannel(channel.id,{preset,rowVersion:channel.rowVersion});}
 const video=repo.createVideo(channel.id,{title:'Khám phá Việt Nam'});
 const scenes=repo.replaceScenes(video.id,{rowVersion:1,scenes:Array.from({length:count},(_,i)=>({
  text:`Cảnh ${i+1}: Xin chào Việt Nam 😊\r\n`,durationMs:1501+i*1000,visualPrompt:'sunrise',mediaType:'image_motion'
 }))});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
 const composition=new CompositionRepository({repo,manifest});
 return {dir,db,repo,video,scenes,manifest,composition,async close(){db.close();await rm(dir,{recursive:true,force:true})}};
}
async function readyScene(f,id){
  // Assets use existing R2 registry, and intent rows mirror a verified worker
  // promotion without dispatching a provider or depending on GPUs.
  const scene=f.repo.getScene(id),jobId=`mock-${id}`,inputHash=hash(`voice ${id}`);
  await f.manifest.importBytes({sceneId:id,kind:'voice',source:'local_test',bytes:wav,extension:'.wav',metadata:{
    queueJobId:jobId,inputHash,textSha256:hash(scene.text),durationMs:1100,providerId:'piper'}});
  f.db.prepare(`INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,
    config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(id,jobId,inputHash,hash(scene.text),f.repo.getVideo(f.video.id).configRevision,'piper','test',0,Date.now());
  const visual=await f.manifest.importBytes({sceneId:id,kind:'image',source:'manual_import',bytes:image,extension:'.png'});
  f.db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(id,visual.id,Date.now());
}

test('v28 additive migration and immutable publish history reject SQL mutation',async()=>{
 const f=await fixture();try{
  assert.ok(f.db.prepare('PRAGMA user_version').get().user_version>=28);
  for(const s of f.scenes)await readyScene(f,s.id);
  const p=await f.composition.preview(f.video.id);
  assert.equal(p.readiness.ready,true);assert.equal(p.scenes[0].durationFrames,46);
  assert.equal(p.scenes[0].voice.measuredDurationMs,1100);
  assert.equal(p.scenes[0].durationBasis,'scene_estimate','EXT-02 owns the real audio timing switch');
  const saved=await f.composition.publish(f.video.id,{expectedDigest:p.digest,expectedVideoRowVersion:p.source.videoRowVersion});
  assert.equal(saved.revision,1);assert.equal(saved.unchanged,false);
  const repeated=await f.composition.publish(f.video.id,{expectedDigest:p.digest,expectedVideoRowVersion:p.source.videoRowVersion});
  assert.equal(repeated.revision,1);assert.equal(repeated.unchanged,true);
  assert.deepEqual(f.composition.revision(f.video.id,1).composition,p);
  assert.equal(f.composition.history(f.video.id).length,1);
  assert.throws(()=>f.db.prepare('UPDATE composition_revisions SET digest=? WHERE video_id=?').run(hash('tamper'),f.video.id),/COMPOSITION_REVISION_IMMUTABLE/);
  assert.throws(()=>f.db.prepare('DELETE FROM composition_revisions WHERE video_id=?').run(f.video.id),/COMPOSITION_REVISION_IMMUTABLE/);
  assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{await f.close()}
});
test('draft has explicit blockers, publishing never silently treats missing media as render-ready',async()=>{
 const f=await fixture();try{
   const p=await f.composition.preview(f.video.id);
   assert.equal(p.readiness.ready,false);
   assert.deepEqual(p.readiness.blockers.map(b=>b.code),['VOICE_MISSING','VISUAL_MISSING','VOICE_MISSING','VISUAL_MISSING']);
   await assert.rejects(f.composition.publish(f.video.id,{expectedDigest:p.digest,expectedVideoRowVersion:p.source.videoRowVersion}),{code:'COMPOSITION_ASSETS_NOT_READY'});
   assert.equal(f.composition.history(f.video.id).length,0);
 }finally{await f.close()}
});
test('portrait profile and frame quantization deterministic with Vietnamese Unicode',async()=>{
 const f=await fixture({portrait:true});try{
  const one=await f.composition.preview(f.video.id),two=await f.composition.preview(f.video.id);
  assert.deepEqual(one,two);assert.equal(one.profile.aspectRatio,'9:16');
  assert.equal(one.profile.width,1080);assert.equal(one.profile.height,1920);
  assert.equal(one.scenes.map(s=>s.text).join(''),f.scenes.map(s=>s.text).join(''));
  assert.equal(one.totalFrames,one.scenes.reduce((n,s)=>n+s.durationFrames,0));
  assert.equal(framesFromMs(1,24),1);assert.equal(framesFromMs(1501,30),46);
  await assert.rejects(f.composition.preview(f.video.id,{profile:{width:1920,height:1080}}),{code:'INVALID_COMPOSITION_PROFILE'});
  assert.equal(one.scenes[0].captions.cues[0].text,f.scenes[0].text);
 }finally{await f.close()}
});
test('tampered composition text, mismatched frames and fabricated digest are rejected',async()=>{
 const f=await fixture();try{
  const p=await f.composition.preview(f.video.id);
  validateComposition(p);
  const forged=structuredClone(p);forged.scenes[0].text+='tamper';
  assert.throws(()=>validateComposition(forged),{code:'INVALID_COMPOSITION_SCENE'});
  const frames=structuredClone(p);frames.scenes[1].startFrame=0;
  frames.digest=compositionDigest(Object.fromEntries(Object.entries(frames).filter(([key])=>key!=='digest')));
  assert.throws(()=>validateComposition(frames),{code:'INVALID_COMPOSITION_SCENE'});
  const digest=structuredClone(p);digest.digest=hash('forged');
  assert.throws(()=>validateComposition(digest),{code:'COMPOSITION_DIGEST_MISMATCH'});
  assert.equal(stableCompositionJson({b:1,a:{z:2,x:3}}),'{"a":{"x":3,"z":2},"b":1}');
 }finally{await f.close()}
});
test('selected media become invalid if file altered; pinned old revision remains auditable',async()=>{
 const f=await fixture({count:1});try{
  await readyScene(f,f.scenes[0].id);
  const one=await f.composition.preview(f.video.id);
  const saved=await f.composition.publish(f.video.id,{expectedDigest:one.digest,expectedVideoRowVersion:one.source.videoRowVersion});
  const pinned=one.scenes[0].visual.asset;
  await writeFile(join(f.dir,pinned.relativePath),Buffer.alloc(pinned.bytes,42));
  const now=await f.composition.preview(f.video.id);
  assert.equal(now.readiness.ready,false);
  assert.ok(now.readiness.blockers.some(b=>b.code==='VISUAL_UNHEALTHY'));
  await assert.rejects(f.composition.publish(f.video.id,{expectedDigest:one.digest,expectedVideoRowVersion:one.source.videoRowVersion}),{code:'COMPOSITION_PREVIEW_CONFLICT'});
  assert.equal(f.composition.revision(f.video.id,saved.revision).composition.digest,one.digest,'history is immutable, not a health attestation');
 }finally{await f.close()}
});
test('scene pointer changes prevent old preview publish, preserve other scene pins',async()=>{
 const f=await fixture();try{
  for(const s of f.scenes)await readyScene(f,s.id);
  const p=await f.composition.preview(f.video.id);
  await f.manifest.importBytes({sceneId:f.scenes[0].id,kind:'image',source:'manual_import',bytes:image,extension:'.png'});
  await assert.rejects(f.composition.publish(f.video.id,{expectedDigest:p.digest,expectedVideoRowVersion:p.source.videoRowVersion}),{code:'COMPOSITION_PREVIEW_CONFLICT'});
  assert.equal(f.composition.history(f.video.id).length,0);
 }finally{await f.close()}
});
test('same digest refuses publish when source timeline changes while verifying files',async()=>{
 const f=await fixture({count:1});try{
   await readyScene(f,f.scenes[0].id);
   const p=await f.composition.preview(f.video.id);
   const old=f.manifest.verifyRevision.bind(f.manifest);let changed=false;
   f.manifest.verifyRevision=async (...args)=>{
     const state=await old(...args);
     if(!changed){changed=true;const t=f.repo.getTimeline(f.video.id);f.repo.updateTimeline(f.video.id,{document:t.document,rowVersion:t.rowVersion});}
     return state;
   };
   await assert.rejects(f.composition.publish(f.video.id,{expectedDigest:p.digest,expectedVideoRowVersion:p.source.videoRowVersion}),{code:'COMPOSITION_SOURCE_CHANGED'});
   assert.equal(f.composition.history(f.video.id).length,0);
 }finally{await f.close()}
});
test('cross-scene visual pointer is never pinned as current composition media',async()=>{
 const f=await fixture();try{
  for(const scene of f.scenes)await readyScene(f,scene.id);
  const foreignImage=f.repo.getScene(f.scenes[1].id).visualAssetId;
  f.db.prepare('UPDATE scenes SET visual_asset_id=?,row_version=row_version+1 WHERE id=?').run(foreignImage,f.scenes[0].id);
  const preview=await f.composition.preview(f.video.id);
  assert.equal(preview.scenes[0].visual.asset,null);
  assert.ok(preview.readiness.blockers.some(b=>b.code==='VISUAL_MISSING'&&b.sceneId===f.scenes[0].id));
  await assert.rejects(f.composition.publish(f.video.id,{expectedDigest:preview.digest,expectedVideoRowVersion:preview.source.videoRowVersion}),{code:'COMPOSITION_ASSETS_NOT_READY'});
 }finally{await f.close()}
});
test('unexpected fields and invalid asset path are rejected even with recomputed hash',async()=>{
 const f=await fixture();try{
  await readyScene(f,f.scenes[0].id);await readyScene(f,f.scenes[1].id);
  const p=await f.composition.preview(f.video.id);
  const v=structuredClone(p);v.untrustedProviderKey='secret';
  v.digest=compositionDigest(Object.fromEntries(Object.entries(v).filter(([key])=>key!=='digest')));
  assert.throws(()=>validateComposition(v),{code:'INVALID_COMPOSITION'});
  const path=structuredClone(p);path.scenes[0].visual.asset.relativePath='../escape.png';
  path.digest=compositionDigest(Object.fromEntries(Object.entries(path).filter(([key])=>key!=='digest')));
  assert.throws(()=>validateComposition(path),{code:'INVALID_COMPOSITION_ASSET'});
  await assert.rejects(f.composition.preview(f.video.id,{provider:'free'}),{code:'INVALID_COMPOSITION_PREVIEW'});
 }finally{await f.close()}
});
