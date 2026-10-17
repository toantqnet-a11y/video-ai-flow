#!/usr/bin/env node
/** FI-04-04: explicit, paid-free, LOCAL, five-scene HyperFrames acceptance.
 * --inspect is a read-only prerequisite inventory. --run uses the existing
 * SP-04 queue/production adapter and installed exact-version CLI, never npx,
 * a mock renderer, an FFmpeg replacement, a remote service or an npm install.
 * Machine checks cannot replace visual/audio approval in a real Windows UI.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {copyFile,mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository} from '../packages/core/src/index.mjs';
import {findHyperframesCli,sanitizedRendererEnv} from '../packages/core/src/render-hyperframes.mjs';
import {SubtitleDraftsR405} from '../packages/core/src/r4-editor-music-style.mjs';
import {probeMp4,checkMp4Quality} from '../packages/core/src/render-ffmpeg-r2ext04.mjs';
import {JobStore} from '../spikes/SP-04/src/store.js';
import {JobRunner} from '../spikes/SP-04/src/runner.js';
import {RenderExportService} from '../apps/api/src/render-export-r2ext0406.mjs';
import {verifyWorkspaceLock} from './fi02-lock-policy.mjs';
import {safeGateReportPath} from './fi04-runtime-gates.mjs';

const PROJECT_ROOT=fileURLToPath(new URL('../',import.meta.url));
const PIN='0.8.159';
const hash=data=>createHash('sha256').update(data).digest('hex');
const media=(name)=>fileURLToPath(new URL(`../spikes/EXT-03/assets/${name}`,import.meta.url));
const labels=['Hà Nội','Đà Nẵng','Huế','Cần Thơ','Hồ Chí Minh'];
const errorCode=e=>String(e?.code??'FI04_HYPERFRAMES_RENDER_FAILED').replace(/[^A-Z0-9_]/g,'').slice(0,80);

/** Immutable proof requirements; never infer correctness from queue status alone. */
export function evaluateRealRenderEvidence({origin,rendererVersion,jobKind,jobStatus,sceneCount,subtitleCueCount,
 expectedFrames,metadata,qa,musicEnabled,sourceSrtVerified,checksumVerified}={}){
 const checks={
  realPinnedRenderer:origin==='PROJECT_LOCAL_CLI'&&rendererVersion===PIN,
  singleProductionQueue:jobKind==='render:hyperframes'&&jobStatus==='succeeded',
  fiveScenes:sceneCount===5,
  vietnameseSubtitleCues:subtitleCueCount===10&&sourceSrtVerified===true,
  backgroundMusic:musicEnabled===true,
  videoQA:qa?.passed===true&&metadata?.videoCodec==='h264'&&metadata?.audioCodec==='aac',
  exactFrames:Number.isInteger(expectedFrames)&&expectedFrames>0&&metadata?.frameCount===expectedFrames,
  checksumVerified:checksumVerified===true,
 };
 return {passed:Object.values(checks).every(Boolean),checks};
}

/** Dependency lock PASS and local CLI --help are only prerequisites, not proof of MP4. */
export async function inspectFi04Hyperframes(){
 const lock=await verifyWorkspaceLock(PROJECT_ROOT);
 let cli=null,code=null;
 try{
  cli=await findHyperframesCli();
  if(cli.version!==PIN)throw Object.assign(new Error('version mismatch'),{code:'HYPERFRAMES_VERSION_MISMATCH'});
 }catch(e){code=errorCode(e)}
 return {status:lock.status==='FAIL'?'FAIL':lock.status==='PASS'&&!!cli?'PREREQUISITES_PRESENT':'BLOCKED',
  dependencyLock:lock.status,cliInstalled:!!cli,rendererPin:PIN,
  ...(code?{blocker:code}:{})};
}


/** Offline queued-fixture construction is deliberately NOT render evidence.
 * Exported so real database/snapshot/subtitle/music prerequisites can be
 * regression-tested without pretending to have installed HyperFrames. */
export async function prepareFi04QueuedFixture({db,store,root}){
  const repo=new StudioRepository(db);
  const channel=repo.createChannel({name:'FI04 offline renderer acceptance'});
  const video=repo.createVideo(channel.id,{title:'Năm thành phố Việt Nam'});
  const scenes=repo.replaceScenes(video.id,{rowVersion:video.rowVersion,scenes:labels.map((city,i)=>({
   text:`Chặng ${i+1}: khám phá ${city}.`,durationMs:2600,mediaType:'image_motion'}))});
  const manifest=new AssetManifest({db,repository:repo,dataRoot:root});
  const compositions=new CompositionRepository({repo,manifest});
  const renderer=new RenderExportService({repo,compositions,manifest,store});
  for(const [i,scene] of scenes.entries()){
   const textHash=hash(scene.text),inputHash=hash(`fi04-real-voice-${i}`),jobId=`fi04-voice-${i}`;
   await manifest.importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',
    inputPath:media(`voice-${String(i+1).padStart(2,'0')}.wav`),
    metadata:{queueJobId:jobId,inputHash,textSha256:textHash,providerId:'piper'}});
   // Fixture WAVs are local test media, not proof of a real TTS provider.
   db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(scene.id,jobId,inputHash,textHash,repo.getVideo(video.id).configRevision,'piper','default',0,Date.now());
   const photo=await manifest.importFile({sceneId:scene.id,kind:'image',inputPath:media(`background-${String(i+1).padStart(2,'0')}.png`)});
   db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,photo.id,Date.now());
  }
  const timed=new TimedCompositionRepository({compositions,manifest});
  const preview=await timed.preview(video.id);
  // Report codes only: diagnose cross-platform fixture failures without exposing text or paths.
  assert.equal(preview.readiness.ready,true,`FI04_FIXTURE_NOT_READY_${preview.readiness.blockers.map(b=>b.code).join('_')}`);
  const published=await timed.publish(video.id,{expectedDigest:preview.digest,expectedVideoRowVersion:preview.source.videoRowVersion});
  const doc=published.composition;
  assert.equal(doc.scenes.length,5);
  const overrides=doc.scenes.map((scene,i)=>{
   const middle=Math.floor(scene.durationFrames/2);
   return {sceneId:scene.id,cues:[
    {text:`Chặng ${i+1}: xin chào!`,startFrame:0,endFrame:middle},
    {text:`Khám phá ${labels[i]}.`,startFrame:middle,endFrame:scene.durationFrames}]};
  });
  const drafts=new SubtitleDraftsR405(db);
  const saved=drafts.save(video.id,{document:doc,expectedRevision:0,overrides});
  // Pin a real, local test WAV as the music input; no paid/remote provider used.
  const imported=await renderer.importMusic(video.id,{extension:'wav',base64:(await readFile(media('voice-01.wav'))).toString('base64')});
  const selection={revision:published.revision,engine:'hyperframes',subtitleDraftRevision:saved.revision,
   music:{pin:imported.pin,settings:{volume:0.12,fadeInSeconds:0.1,fadeOutSeconds:0.1,loop:true}}};
  const preflight=await renderer.preflight(video.id,selection);
  assert.equal(preflight.ready,true,`FI04_PREFLIGHT_FAILED_${preflight.blockers.join('_')}`);
  const queued=await renderer.enqueue(video.id,{...selection,requestKey:'fi04-5scene-hyperframes-only'});
  assert.equal(queued.job.kind,'render:hyperframes');
  return {repo,video,renderer,queued,doc,overrides,saved};
}

/** This is intentionally not a generic configurable pipeline, to prevent a
 * passing FFmpeg/mock fixture from masquerading as the local primary engine. */
export async function runFi04HyperframesProof({saveReview=false}={}){
 const prerequisite=await inspectFi04Hyperframes();
 if(prerequisite.status!=='PREREQUISITES_PRESENT')return {...prerequisite,releaseGateSatisfied:false};
 const cli=await findHyperframesCli();
 const help=spawnSync(cli.binary,[...cli.argvPrefix,'render','--help'],{
  cwd:PROJECT_ROOT,env:sanitizedRendererEnv(),encoding:'utf8',timeout:20000,
  windowsHide:true,maxBuffer:256*1024,stdio:['ignore','pipe','pipe']});
 if(help.error||help.status!==0)return {status:'FAIL',code:'FI04_CLI_RENDER_HELP_FAILED',releaseGateSatisfied:false};
 const root=await mkdtemp(join(tmpdir(),'fi04-real-hf-'));
 let db,store,runner;
 const began=performance.now();
 try{
  db=openProjectDb(join(root,'project.sqlite'));
  // Render jobs need a lease longer than the worker heartbeat (SP-04 defaults to 1s).
  store=new JobStore({path:join(root,'project.sqlite'),leaseMs:60000});
  const {repo,video,renderer,queued,doc,overrides,saved}=await prepareFi04QueuedFixture({db,store,root});
  runner=new JobRunner(store,{'render:hyperframes':renderer.handler('hyperframes')},
   {concurrency:1,pollMs:75,heartbeatMs:5000});
  runner.start();
  await runner.waitForIdle({timeoutMs:420000});
  const job=renderer.job(video.id,queued.job.id);
  assert.equal(job.status,'succeeded',`FI04_QUEUE_JOB_${job.status}`);
  const result=store.get(queued.job.id).result;
  assert.equal(result.engine,'hyperframes');
  const path=join(root,result.relativePath);
  const bytes=await readFile(path),statInfo=await stat(path);
  const metadata=await probeMp4(path),qa=checkMp4Quality(metadata,doc);
  const srt=await readFile(join(root,result.subtitles.relativePath),'utf8');
  const expectedSrt=overrides.flatMap(x=>x.cues.map(c=>c.text));
  const sourceSrtVerified=expectedSrt.every(x=>srt.includes(x))&&
   (srt.match(/ --> /g)??[]).length===10;
  const report=evaluateRealRenderEvidence({origin:'PROJECT_LOCAL_CLI',rendererVersion:cli.version,
   jobKind:queued.job.kind,jobStatus:job.status,sceneCount:doc.scenes.length,
   subtitleCueCount:result.subtitles?.cueCount,expectedFrames:doc.totalFrames,
   metadata,qa,musicEnabled:!!result.music,sourceSrtVerified,
   checksumVerified:statInfo.size===bytes.length&&hash(bytes).length===64});
  // Keep review assets ONLY on an explicitly requested real-success run. No
  // media is persisted by default; the operator can review Vietnamese glyphs
  // and sound from these files without making a release claim.
  if(saveReview&&report.passed){
   const reviewDir=join(PROJECT_ROOT,'docs','evidence');
   await mkdir(reviewDir,{recursive:true});
   await copyFile(path,join(reviewDir,'FI0404_review.mp4'));
   await copyFile(join(root,result.subtitles.relativePath),join(reviewDir,'FI0404_review.srt'));
  }
  return {status:report.passed?'PASS':'FAIL',code:report.passed?null:'FI04_MP4_PROOF_INCOMPLETE',
   engine:'hyperframes',origin:'PROJECT_LOCAL_CLI',version:cli.version,queue:'SP-04',
   sceneCount:doc.scenes.length,cues:10,musicEnabled:!!result.music,
   frameCount:metadata.frameCount,expectedFrames:doc.totalFrames,
   durationSeconds:metadata.durationSeconds,videoCodec:metadata.videoCodec,audioCodec:metadata.audioCodec,
   sha256:hash(bytes),bytes:bytes.length,elapsedMs:Math.round(performance.now()-began),reviewMediaWritten:saveReview&&report.passed,
   checks:report.checks,releaseGateSatisfied:false,providerCalls:0,
   warning:'Automated local renderer proof ONLY; no visual glyph/loudness approval, Windows UI, real TTS, or 35-min run. Test WAV is not actual Vietnamese narration.'};
 }finally{
  if(runner)await runner.stop({abort:true}).catch(()=>{});
  store?.close();db?.close();await rm(root,{recursive:true,force:true});
 }
}

async function main(){
 const argv=process.argv.slice(2),modes=argv.filter(x=>['--inspect','--run'].includes(x));
 if(argv.some(x=>!['--inspect','--run','--strict','--save-review'].includes(x)&&!x.startsWith('--report='))||
  modes.length>1||argv.filter(x=>x.startsWith('--report=')).length>1)throw new Error('FI04_UNSUPPORTED_ARGS');
 const run=modes[0]==='--run';
 if(argv.includes('--save-review')&&!run)throw new Error('FI04_REVIEW_MEDIA_REQUIRES_EXPLICIT_REAL_RUN');
 let report;
 try{report=run?await runFi04HyperframesProof({saveReview:argv.includes('--save-review')}):await inspectFi04Hyperframes()}
 catch(e){
  // Local fixture errors need actionable, scrubbed diagnostics on hosted CI.
  // Never serialize raw stacks, paths, input payloads or environment variables.
  const msg=String(e?.message??'')
   .replace(/([A-Za-z]:[\\/]|\/)\S+/g,'<path>')
   .replace(/[^A-Za-z0-9 .:_()\-]/g,'_').slice(0,140);
  const frame=String(e?.stack??'').match(/([A-Za-z0-9_.-]+\.mjs):(\d+):(\d+)/);
  report={status:'FAIL',code:errorCode(e),errorClass:String(e?.name??'Error').slice(0,40),
   errorHint:msg,originFrame:frame?frame.slice(1).join(':'):null,releaseGateSatisfied:false};
 }
 if(!run)report={...report,releaseGateSatisfied:false,notice:'Read-only prerequisites, never render proof'};
 const reportArg=argv.find(x=>x.startsWith('--report='))?.slice(9);
 if(reportArg){const target=safeGateReportPath(PROJECT_ROOT,reportArg);
  await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify({task:'FI-04-04',
   timestamp:new Date().toISOString(),mode:run?'real':'inspect',...report},null,2)+'\n',{mode:0o600});}
 console.log(JSON.stringify({task:'FI-04-04',mode:run?'real':'inspect',...report},null,2));
 if((run&&report.status!=='PASS')||(argv.includes('--strict')&&report.status!=='PASS'))process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
