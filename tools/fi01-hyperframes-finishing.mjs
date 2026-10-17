/** FI-01 opt-in LIVE HyperFrames release probe: run the real pinned renderer
 * through the production SQLite queue with two edited Vietnamese subtitle cues
 * and a locally imported music track. No mocks, npx, remote AI or paid APIs.
 * Requires Node 22, npm deps + HyperFrames browser runtime on the target PC.
 */
import {mkdtemp,readFile,rm,stat,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository} from '../packages/core/src/index.mjs';
import {findHyperframesCli} from '../packages/core/src/render-hyperframes.mjs';
import {SubtitleDraftsR405} from '../packages/core/src/r4-editor-music-style.mjs';
import {probeMp4,checkMp4Quality} from '../packages/core/src/render-ffmpeg-r2ext04.mjs';
import {JobStore} from '../spikes/SP-04/src/store.js';
import {JobRunner} from '../spikes/SP-04/src/runner.js';
import {RenderExportService} from '../apps/api/src/render-export-r2ext0406.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixture=kind=>fileURLToPath(new URL(`../spikes/EXT-03/assets/${kind}`,import.meta.url));
const picture=fixture('background-01.png'),wav=fixture('voice-01.wav');
const opts=process.argv.slice(2),reportFile=opts.find(a=>a.startsWith('--report='))?.slice(9);

export async function liveHyperframesSubtitleMusicProof(){
 // Must validate *local* CLI before any project data or queue is created.
 const cli=await findHyperframesCli();
 const dir=await mkdtemp(join(tmpdir(),'fi01-hf-finish-'));
 let db,store,runner;
 const begin=performance.now();
 try{
  const path=join(dir,'proof.sqlite');
  db=openProjectDb(path);store=new JobStore({path});
  const repo=new StudioRepository(db),channel=repo.createChannel({name:'FI-01 live local verification'});
  const video=repo.createVideo(channel.id,{title:'Phiên bản phụ đề + nhạc'});
  const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
  const compositions=new CompositionRepository({repo,manifest});
  const renderer=new RenderExportService({repo,compositions,manifest,store});
  const scene=repo.replaceScenes(video.id,{rowVersion:1,scenes:[
    {text:'Đây là câu chuyện tại Hà Nội.',durationMs:2600,mediaType:'image_motion'}
  ]})[0];
  await manifest.importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',inputPath:wav,
   metadata:{queueJobId:'fi01-voice',inputHash:hash('fi01'),textSha256:hash(scene.text),providerId:'piper'}});
  db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(scene.id,'fi01-voice',hash('fi01'),hash(scene.text),repo.getVideo(video.id).configRevision,'piper','default',0,Date.now());
  const image=await manifest.importFile({sceneId:scene.id,kind:'image',inputPath:picture});
  db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,image.id,Date.now());
  const timed=new TimedCompositionRepository({compositions,manifest}),preview=await timed.preview(video.id);
  assert.equal(preview.readiness.ready,true,'Fixture composition is not ready');
  const published=await timed.publish(video.id,{expectedDigest:preview.digest,expectedVideoRowVersion:preview.source.videoRowVersion});
  const doc=published.composition;
  const mid=Math.floor(doc.scenes[0].durationFrames/2);
  const draft=new SubtitleDraftsR405(db);
  const saved=draft.save(video.id,{document:doc,expectedRevision:0,overrides:[
   {sceneId:scene.id,cues:[{text:'Phụ đề một: Hà Nội',startFrame:0,endFrame:mid},
    {text:'Phụ đề hai: Đà Nẵng',startFrame:mid,endFrame:doc.scenes[0].durationFrames}]}
  ]});
  const imported=await renderer.importMusic(video.id,{extension:'wav',base64:(await readFile(wav)).toString('base64')});
  const options={revision:published.revision,engine:'hyperframes',subtitleDraftRevision:saved.revision,
   music:{pin:imported.pin,settings:{volume:0.12,fadeInSeconds:0.1,fadeOutSeconds:0.1,loop:true}}};
  const preflight=await renderer.preflight(video.id,options);
  assert.equal(preflight.ready,true,`Preflight blockers: ${preflight.blockers.join(',')}`);
  const enqueued=await renderer.enqueue(video.id,{...options,requestKey:'fi01-hyperframes-subtitle-music'});
  assert.equal(enqueued.job.kind,'render:hyperframes');
  runner=new JobRunner(store,{'render:hyperframes':renderer.handler('hyperframes')},
   {concurrency:1,pollMs:75,heartbeatMs:1000});
  runner.start();await runner.waitForIdle({timeoutMs:300000});
  const job=renderer.job(video.id,enqueued.job.id);
  assert.equal(job.status,'succeeded',`Live HyperFrames queue job failed: ${job.status}`);
  const result=store.get(enqueued.job.id).result;
  assert.equal(result.engine,'hyperframes');
  assert.equal(result.musicEnabled,true);
  assert.equal(result.subtitleDraftRevision,saved.revision);
  const mediaPath=join(dir,result.relativePath);
  const media=await probeMp4(mediaPath);
  // Audio is AAC because finishing postmix is applied to genuine HyperFrames MP4.
  assert.equal(media.audioCodec,'aac');
  assert.equal(checkMp4Quality(media,doc).passed,true);
  const srt=await readFile(join(dir,result.subtitles.relativePath),'utf8');
  assert.match(srt,/Phụ đề một: Hà Nội/);assert.match(srt,/Phụ đề hai: Đà Nẵng/);
  const bytes=(await stat(mediaPath)).size;
  return {status:'PASS',engine:'hyperframes',version:cli.version,origin:'real pinned CLI + SP-04 queued render + FFmpeg BGM postmix',
   frames:media.frameCount,expectedFrames:doc.totalFrames,durationSeconds:media.durationSeconds,
   subtitleCueCount:2,musicEnabled:true,sha256:hash(await readFile(mediaPath)),bytes,
   elapsedMs:Math.round(performance.now()-begin),providerCalls:0,
   limitation:'Automated media QA does not certify visible caption typography or subjective loudness. Windows/browser/operator visual review remains required.'};
 }finally{
  if(runner)await runner.stop({abort:true}).catch(()=>{});
  store?.close();db?.close();await rm(dir,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let report;
 try{report=await liveHyperframesSubtitleMusicProof();}
 catch(e){report={status:'BLOCKED_OR_FAILED',code:e?.code??'FI01_LIVE_RENDER_FAILED',
  note:'No substitute/mock/FFmpeg result may be counted as genuine HyperFrames'};process.exitCode=1;}
 if(reportFile){const dest=resolve(reportFile);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));
}
