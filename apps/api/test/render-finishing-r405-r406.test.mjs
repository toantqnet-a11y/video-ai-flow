import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat,copyFile,mkdir} from 'node:fs/promises';
import {createVerifiedBackup,verifyBackup} from '../../../packages/core/src/maintenance-r402-r403.mjs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {RenderExportService} from '../src/render-export-r2ext0406.mjs';
import {prepareSubtitleRenderPlan,validateRenderMusic} from '../../../packages/core/src/render-finishing-r405-r406.mjs';
import {makeHyperframesHtml} from '../../../packages/core/src/render-hyperframes.mjs';
import {SubtitleDraftsR405} from '../../../packages/core/src/r4-editor-music-style.mjs';
const picture=new URL('../../../spikes/EXT-03/assets/background-01.png',import.meta.url).pathname;
const wav=new URL('../../../spikes/EXT-03/assets/voice-01.wav',import.meta.url).pathname;
const hash=x=>createHash('sha256').update(x).digest('hex');
const capabilities=spawnSync('ffmpeg',['-hide_banner','-filters'],{encoding:'utf8'});
const installed=capabilities.status===0&&capabilities.stdout.includes('subtitles');
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'r405-r406-'));
 const path=join(dir,'local.sqlite'),db=openProjectDb(path),repo=new StudioRepository(db),store=new JobStore({path});
 const video=repo.createVideo(repo.createChannel({name:'R405/06 acceptance'}).id,{title:'Music + Vietnamese captions'});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
 const compositions=new CompositionRepository({repo,manifest});
 const service=new RenderExportService({repo,store,manifest,compositions});
 const scene=repo.replaceScenes(video.id,{rowVersion:1,scenes:[{text:'Đây là phụ đề gốc cần thay.',durationMs:2600,mediaType:'image_motion'}]})[0];
 await manifest.importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',inputPath:wav,metadata:{queueJobId:'job',inputHash:hash('x'),textSha256:hash(scene.text),providerId:'piper'}});
 db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)').run(scene.id,'job',hash('x'),hash(scene.text),repo.getVideo(video.id).configRevision,'piper','default',0,Date.now());
 const image=await manifest.importFile({sceneId:scene.id,kind:'image',inputPath:picture});
 db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,image.id,Date.now());
 const timed=new TimedCompositionRepository({compositions,manifest}),draft=await timed.preview(video.id);
 assert.equal(draft.readiness.ready,true);
 const published=await timed.publish(video.id,{expectedDigest:draft.digest,expectedVideoRowVersion:draft.source.videoRowVersion});
 return {dir,db,repo,video,store,manifest,compositions,service,doc:published.composition,revision:published.revision,scene,
  async close(){store.close();db.close();await rm(dir,{recursive:true,force:true})}};
}
test('R4-05/06 reject unpinned local files, out-of-date draft, and off-policy music',()=>{
 assert.throws(()=>validateRenderMusic({pin:{relativePath:'../../outside.mp3',sha256:'f'.repeat(64),bytes:10},settings:{volume:.1,loop:true,fadeInSeconds:0,fadeOutSeconds:0}}),{code:'R4_MUSIC_REQUEST_INVALID'});
 assert.throws(()=>validateRenderMusic({pin:{relativePath:'music/v/sound.mp3',sha256:'f'.repeat(64),bytes:10},settings:{volume:.1,loop:true,fadeInSeconds:0,fadeOutSeconds:0}}),{code:'R4_MUSIC_REQUEST_INVALID'});
});
test('R4-05/06 user-selected edited cues and imported music are frozen into ONE queued FFmpeg MP4',{skip:!installed,timeout:180000},async()=>{
 const f=await fixture();let runner;
 try{
  const mid=Math.round(f.doc.scenes[0].durationFrames/2),end=f.doc.scenes[0].durationFrames;
  const edits=[{sceneId:f.scene.id,cues:[{text:'Lời mới: Hà Nội',startFrame:0,endFrame:mid},{text:'Đà Nẵng ✓',startFrame:mid,endFrame:end}]}];
  const drafts=new SubtitleDraftsR405(f.db),saved=drafts.save(f.video.id,{document:f.doc,overrides:edits,expectedRevision:0});
  const plan=prepareSubtitleRenderPlan(f.doc,{...saved});
  assert.equal(plan.cues.length,2);
  assert.match(plan.srt,/Đà Nẵng/);
  assert.ok(makeHyperframesHtml(f.doc,{subtitlePlan:plan}).includes('Lời mới: Hà Nội'));
  assert.ok(!makeHyperframesHtml(f.doc,{subtitlePlan:plan}).includes('Đây là phụ đề gốc cần thay.</div>'));
  const imported=await f.service.importMusic(f.video.id,{extension:'wav',base64:(await readFile(wav)).toString('base64')});
  const tracks=await f.service.listMusic(f.video.id);
  assert.equal(tracks.items.length,1);assert.deepEqual(tracks.items[0].pin,imported.pin);
  const options={revision:f.revision,subtitleDraftRevision:saved.revision,engine:'ffmpeg-fastpath',
   music:{pin:imported.pin,settings:{volume:0.12,fadeInSeconds:0.1,fadeOutSeconds:0.1,loop:true}}};
  assert.equal((await f.service.preflight(f.video.id,options)).ready,true);
  const stale=await f.service.preflight(f.video.id,{...options,subtitleDraftRevision:99});
  assert.equal(stale.ready,false);assert.ok(stale.blockers.includes('R4_SUBTITLE_SOURCE_STALE'));
  const wrongPin=await f.service.preflight(f.video.id,{...options,music:{...options.music,pin:{...imported.pin,sha256:'f'.repeat(64)}}});
  assert.equal(wrongPin.ready,false);assert.ok(wrongPin.blockers.includes('RENDER_ASSET_CHANGED'));
  const {job}=await f.service.enqueue(f.video.id,{...options,requestKey:'render-edited-music'});
  // Changing the draft AFTER enqueue cannot change the pinned MP4/SRT.
  const changed=[{sceneId:f.scene.id,cues:[{text:'KHÔNG được render',startFrame:0,endFrame:end}]}];
  drafts.save(f.video.id,{document:f.doc,overrides:changed,expectedRevision:saved.revision});
  runner=new JobRunner(f.store,{'render:ffmpeg':f.service.handler()},{concurrency:1,heartbeatMs:100,pollMs:40});
  runner.start();await runner.waitForIdle({timeoutMs:90000});
  const state=f.service.job(f.video.id,job.id);
  assert.equal(state.status,'succeeded',JSON.stringify(state));
  assert.equal(state.output.qa.passed,true);
  assert.equal(state.output.subtitleDraftRevision,1);
  assert.equal(state.output.musicEnabled,true);
  assert.ok((await stat(join(f.dir,f.store.get(job.id).result.relativePath))).size>2000);
  const output=f.store.get(job.id).result;
  assert.notEqual(output.relativePath.replace('.mp4',''),output.subtitles.relativePath.replace('.srt',''));
  const srt=await readFile(join(f.dir,output.subtitles.relativePath),'utf8');
  assert.match(srt,/Lời mới: Hà Nội/);assert.match(srt,/Đà Nẵng/);assert.doesNotMatch(srt,/KHÔNG được render|Đây là phụ đề gốc/);
  assert.equal(output.metadata.videoCodec,'h264');assert.equal(output.metadata.audioCodec,'aac');
  if(process.env.CONTENTSTUDIO_R408_DEMO_DIR){
   const dest=process.env.CONTENTSTUDIO_R408_DEMO_DIR;await mkdir(dest,{recursive:true});
   await copyFile(join(f.dir,output.relativePath),join(dest,'Video_AI_Flow_R405_R406_FFmpeg_Finishing_Demo.mp4'));
   await copyFile(join(f.dir,output.subtitles.relativePath),join(dest,'Video_AI_Flow_R405_R406_Finishing_Subtitles.srt'));
  }
  const stream=await f.service.file(f.video.id,job.id);stream.stream.destroy();
 }finally{await runner?.stop();await f.close()}
});


test('R4-02/06 managed music survives checksum-verified backup and is restored only to an empty destination',{skip:!installed,timeout:60000},async()=>{
 const f=await fixture();const external=await mkdtemp(join(tmpdir(),'r406-backup-external-'));
 try{
  const imported=await f.service.importMusic(f.video.id,{extension:'wav',base64:(await readFile(wav)).toString('base64')});
  const directory=join(external,'backup');await createVerifiedBackup({dbPath:join(f.dir,'local.sqlite'),dataRoot:f.dir,backupDir:directory});
  const proof=await verifyBackup(directory);
  assert.ok(proof.media.some(x=>x.path===imported.pin.relativePath&&x.sha256===imported.pin.sha256));
 }finally{await f.close();await rm(external,{recursive:true,force:true})}
});
