import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository,makeSrt,renderFfmpegComposition,safePinnedPath,probeMp4,checkMp4Quality} from '../src/index.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const support=spawnSync('ffmpeg',['-hide_banner','-filters'],{encoding:'utf8'});
const hasFfmpeg=support.status===0&&support.stdout.includes('subtitles');
const imageFile=join(import.meta.dirname,'../../../spikes/EXT-03/assets/background-01.png');
const voiceFile=join(import.meta.dirname,'../../../spikes/EXT-03/assets/voice-01.wav');
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'ext040506-')),
  db=openProjectDb(join(dir,'local.sqlite')),repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'EXT05 test'}),video=repo.createVideo(channel.id,{title:'Hà Nội'});
 const scenes=repo.replaceScenes(video.id,{rowVersion:1,scenes:[{text:'Xin chào Việt Nam! Tạo video có dấu.',durationMs:2700,mediaType:'image_motion'}]});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:dir}),compositions=new CompositionRepository({repo,manifest});
 const timed=new TimedCompositionRepository({compositions,manifest});
 const scene=scenes[0],voice=await manifest.importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',inputPath:voiceFile,metadata:{queueJobId:'mock',inputHash:sha('input'),textSha256:sha(scene.text),providerId:'piper'}});
 db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(scene.id,'mock',sha('input'),sha(scene.text),repo.getVideo(video.id).configRevision,'piper','default',0,Date.now());
 const picture=await manifest.importFile({sceneId:scene.id,kind:'image',source:'manual_import',inputPath:imageFile});
 db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,picture.id,Date.now());
 const composition=await timed.preview(video.id,{tailPaddingMs:250});
 return {dir,db,repo,manifest,compositions,timed,video,scene,picture,voice,composition,close:async()=>{db.close();await rm(dir,{recursive:true,force:true})}};
}
test('EXT04 measured composition has SRT Unicode and voice-bounded cue',{skip:!hasFfmpeg},async()=>{
 const f=await fixture();try{
  assert.equal(f.composition.readiness.ready,true,JSON.stringify(f.composition.readiness.blockers));
  const srt=makeSrt(f.composition);
  assert.match(srt,/Xin chào Việt Nam/);
  assert.match(srt,/--> /);
  assert.ok(!srt.includes('word_level'));
 }finally{await f.close()}
});
test('EXT04/06 actual MP4 H264 + AAC + burned subtitle, exact frames and local-only output',{skip:!hasFfmpeg,timeout:180000},async()=>{
 const f=await fixture();try{
  const result=await renderFfmpegComposition({composition:f.composition,dataRoot:f.dir});
  assert.equal(result.qa.passed,true,JSON.stringify(result.qa));
  assert.equal(result.engine,'ffmpeg-fastpath');
  assert.ok(result.bytes>1000);assert.equal(result.metadata.videoCodec,'h264');
  assert.equal(result.metadata.audioCodec,'aac');
  const meta=await probeMp4(join(f.dir,result.relativePath));
  assert.deepEqual(checkMp4Quality(meta,f.composition).checks,result.qa.checks);
 }finally{await f.close()}
});
test('EXT04 rejects changes to checksum and unsafe files, no output is published',{skip:!hasFfmpeg},async()=>{
 const f=await fixture();try{
  assert.equal(await safePinnedPath(f.dir,f.composition.scenes[0].voice.asset),join(f.dir,f.voice.relativePath));
  const bad=structuredClone(f.composition.scenes[0].voice.asset);bad.sha256='0'.repeat(64);
  await assert.rejects(safePinnedPath(f.dir,bad),{code:'RENDER_ASSET_CHANGED'});
  const escaped={...bad,relativePath:'../../etc/passwd'};
  await assert.rejects(safePinnedPath(f.dir,escaped),{code:'RENDER_UNSAFE_PATH'});
 }finally{await f.close()}
});
test('EXT04 blocks not-ready composition even with valid digest',{skip:!hasFfmpeg},async()=>{
 const f=await fixture();try{
  const forged=structuredClone(f.composition);
  forged.readiness={ready:false,blockers:[{sceneId:f.scene.id,code:'VOICE_DURATION_UNAVAILABLE'}]};
  const {digest,...base}=forged;forged.digest=sha(JSON.stringify(base));
  await assert.rejects(renderFfmpegComposition({composition:forged,dataRoot:f.dir}));
 }finally{await f.close()}
});
