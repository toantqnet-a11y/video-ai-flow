/** EXT-07/08 regression: no provider dispatch, frozen brand history, true MP4. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {
 openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository,
 MotionBrandRepository,normalizeMotionStyle,validateMotionStyle,resolveMotionStyle,routeVisuals,
 renderFfmpegComposition,probeMp4,MOTION_TEMPLATES
} from '../src/index.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const sound=new URL('../../../spikes/EXT-03/assets/voice-01.wav',import.meta.url).pathname;
const picture=new URL('../../../spikes/EXT-03/assets/background-01.png',import.meta.url).pathname;
const filters=spawnSync('ffmpeg',['-hide_banner','-filters'],{encoding:'utf8'});
const capable=filters.status===0&&['subtitles','drawtext'].every(name=>filters.stdout.includes(name));
const buildStyle=(overrides={})=>({schemaVersion:1,presetId:'story',brand:{title:'Đà Nẵng %{evil}',accentColor:'#1E88E5',captionColor:'#FFFFFF',outlineColor:'#131722',captionSize:26,showLowerThird:true},sceneOverrides:[],...overrides});
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'r2ext0708-'));
 const db=openProjectDb(join(dir,'studio.sqlite')),repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'Chi phí ảnh & Brand'}),video=repo.createVideo(channel.id,{title:'Kiểm thử'});
 const scenes=repo.replaceScenes(video.id,{rowVersion:1,scenes:[
  {text:'Xin chào Việt Nam!',durationMs:2700,mediaType:'image_motion'},
  {text:'Một cảnh chưa có hình.',durationMs:2700,mediaType:'image_motion'}]});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
 const compositions=new CompositionRepository({repo,manifest}),timed=new TimedCompositionRepository({compositions,manifest});
 const voice=await manifest.importFile({sceneId:scenes[0].id,kind:'voice',source:'mock-tts',inputPath:sound,metadata:{queueJobId:'mock',inputHash:sha('input'),textSha256:sha(scenes[0].text),providerId:'piper'}});
 db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(scenes[0].id,'mock',sha('input'),sha(scenes[0].text),repo.getVideo(video.id).configRevision,'piper','default',0,Date.now());
 const image=await manifest.importFile({sceneId:scenes[0].id,kind:'image',source:'manual_import',inputPath:picture});
 db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scenes[0].id,image.id,Date.now());
 const doc=await timed.preview(video.id);const styles=new MotionBrandRepository(repo);
 const close=async()=>{db.close();await rm(dir,{recursive:true,force:true})};
 return {dir,db,repo,manifest,timed,scenes,video,voice,image,doc,styles,close};
}

test('EXT07 / 3 cost modes are read-only, cache-first, and never authorize paid provider',async()=>{
 const f=await fixture();try{
  assert.equal(f.doc.readiness.ready,false);
  const savings=routeVisuals({composition:f.doc,mode:'saving',localComfyConfigured:true,includePaidCandidates:true});
  const balanced=routeVisuals({composition:f.doc,mode:'balanced',localComfyConfigured:true});
  const quality=routeVisuals({composition:f.doc,mode:'quality',localComfyConfigured:true,includePaidCandidates:true});
  assert.deepEqual(savings.scenes.map(x=>x.action),['reuse_verified','import_media']);
  assert.deepEqual(balanced.scenes.map(x=>x.action),['reuse_verified','generate_local_image']);
  assert.equal(quality.scenes[1].alternatives[0].status,'blocked_requires_explicit_approval_and_adapter');
  for(const r of [savings,balanced,quality]){
   assert.equal(r.summary.paidCallsScheduled,0);
   assert.equal(r.summary.actualApiUsd,null);
   assert.equal(r.scenes[0].existingAssetId,f.image.id);
   assert.ok(r.scenes.every(x=>x.paidDispatchAllowed===false));
  }
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM provider_usage_events').get().n,0);
  assert.throws(()=>routeVisuals({composition:f.doc,mode:'unknown'}),{code:'VISUAL_ROUTE_INVALID_OPTIONS'});
 }finally{await f.close()}
});

test('EXT08 invalid style props and forged digest fail closed',()=>{
 for(const brand of [
  {title:'hello\n-world'},{title:'x'.repeat(43)},{captionSize:9999},{accentColor:'red;movie=bad'},
  {showLowerThird:'yes'},{fontPath:'../../evil'}, {title:'\u202ehidden'}
 ])assert.throws(()=>normalizeMotionStyle(buildStyle({brand:{...buildStyle().brand,...brand}})));
 assert.throws(()=>normalizeMotionStyle({...buildStyle(),js:'alert(1)'}),{code:'MOTION_STYLE_INVALID'});
 assert.throws(()=>normalizeMotionStyle({...buildStyle(),presetId:'../../custom'}),{code:'MOTION_PRESET_UNKNOWN'});
 assert.throws(()=>normalizeMotionStyle({...buildStyle(),sceneOverrides:[{sceneId:'bad',presetId:'documentary'},{sceneId:'bad',presetId:'clean'}]}),{code:'MOTION_OVERRIDES_INVALID'});
 const good=normalizeMotionStyle(buildStyle());
 assert.throws(()=>validateMotionStyle({...good,digest:'0'.repeat(64)}),{code:'MOTION_STYLE_DIGEST_MISMATCH'});
 assert.equal(MOTION_TEMPLATES.length,4);
});

test('EXT08 immutable versions, stale edit conflict, scoped scene overrides, rollback read',async()=>{
 const f=await fixture();try{
  const first=f.styles.latest(f.video.id);assert.equal(first.revision,0);
  const body={expectedRevision:0,style:buildStyle({sceneOverrides:[{sceneId:f.scenes[0].id,presetId:'gentle'}]})};
  const saved=f.styles.publish(f.video.id,body);assert.equal(saved.revision,1);
  assert.equal(f.styles.revision(f.video.id,1).style.digest,saved.style.digest);
  assert.equal(f.styles.publish(f.video.id,{...body,expectedRevision:1}).unchanged,true);
  assert.throws(()=>f.styles.publish(f.video.id,body),{code:'MOTION_REVISION_CONFLICT'});
  const next=f.styles.publish(f.video.id,{expectedRevision:1,style:buildStyle({presetId:'clean'})});
  assert.equal(next.revision,2);
  assert.equal(f.styles.revision(f.video.id,1).style.digest,saved.style.digest);
  const resolved=resolveMotionStyle(saved.style,f.doc);
  assert.equal(resolved.byScene.get(f.scenes[0].id).motion,'zoom');
  assert.equal(resolved.byScene.get(f.scenes[1].id).transition,'fade_black');
  assert.throws(()=>f.styles.publish(f.video.id,{expectedRevision:2,style:buildStyle({sceneOverrides:[{sceneId:'foreign',presetId:'clean'}]})}),{code:'MOTION_STYLE_STALE_SCENE'});
  assert.throws(()=>f.db.prepare('UPDATE motion_brand_revisions SET digest=? WHERE video_id=? AND revision=1').run('0'.repeat(64),f.video.id));
  assert.throws(()=>f.db.prepare('DELETE FROM motion_brand_revisions WHERE video_id=?').run(f.video.id));
 }finally{await f.close()}
});

test('EXT08 real branded FFmpeg output is QA-verified and style digest isolates cache',{skip:!capable,timeout:120000},async()=>{
 const f=await fixture();try{
  // Removing the unready second scene here would change composition pins;
  // instead import real audio/media and generate a new measured document.
  const second=f.scenes[1];
  await f.manifest.importFile({sceneId:second.id,kind:'voice',source:'mock-tts',inputPath:sound,metadata:{queueJobId:'other',inputHash:sha('other'),textSha256:sha(second.text),providerId:'piper'}});
  f.db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(second.id,'other',sha('other'),sha(second.text),f.repo.getVideo(f.video.id).configRevision,'piper','default',0,Date.now());
  const img=await f.manifest.importFile({sceneId:second.id,kind:'image',source:'manual_import',inputPath:picture});
  f.db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(second.id,img.id,Date.now());
  const composition=await f.timed.preview(f.video.id);
  assert.equal(composition.readiness.ready,true,JSON.stringify(composition.readiness.blockers));
  const style=f.styles.publish(f.video.id,{expectedRevision:0,style:buildStyle()}).style;
  const branded=await renderFfmpegComposition({composition,motionStyle:style,dataRoot:f.dir});
  assert.ok(branded.qa.passed);assert.equal(branded.styleDigest,style.digest);
  assert.match(branded.relativePath,/renders\//);
  const probe=await probeMp4(join(f.dir,branded.relativePath));
  assert.equal(probe.videoCodec,'h264');assert.equal(probe.audioCodec,'aac');
  const repeat=await renderFfmpegComposition({composition,motionStyle:style,dataRoot:f.dir});
  assert.equal(repeat.relativePath,branded.relativePath);
  const unstyled=await renderFfmpegComposition({composition,dataRoot:f.dir});
  assert.notEqual(unstyled.relativePath,branded.relativePath);
 }finally{await f.close()}
});
