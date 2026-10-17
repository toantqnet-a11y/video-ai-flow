#!/usr/bin/env node
/** FI-04-06: an operator-triggered real EXISTING-PROJECT HyperFrames render.
 * Takes no synthetic media and cannot turn an arbitrary MP4 into provenance.
 * Requires 35-40 min already-published immutable Composition v2 in an isolated
 * Windows test data folder; uses ONE existing SP-04 queue and pinned CLI.
 * Long job can legitimately require hours: no hidden auto-retry or provider call.
 */
import {readFile,stat,statfs,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository} from '../packages/core/src/index.mjs';
import {RenderExportService} from '../apps/api/src/render-export-r2ext0406.mjs';
import {probeMp4,checkMp4Quality} from '../packages/core/src/render-ffmpeg-r2ext04.mjs';
import {JobStore} from '../spikes/SP-04/src/store.js';
import {JobRunner} from '../spikes/SP-04/src/runner.js';
import {inspectFi04Hyperframes} from './fi04-hyperframes-acceptance.mjs';
import {sha256File,verifiedEvidenceFile,options,reportFile,output,sanitizeError,timestamp} from './fi04-final-gate-core.mjs';

export function assessLongVideo({platform,cliReady,job,composition,metadata,quality,result,elapsedMs,checksumMatch,subtitlesMatch,monitorSamples}={}){
 const seconds=composition?.totalFrames/composition?.profile?.fps;
 const dims=composition?.profile;
 const gates={
  windows:platform==='win32',pinnedHyperframesCli:cliReady===true,
  genuineQueueJob:job?.kind==='render:hyperframes'&&job?.status==='succeeded'&&result?.engine==='hyperframes',
  actualLongComposition:Number.isFinite(seconds)&&seconds>=2100&&seconds<=2400&&composition?.scenes?.length>=5,
  fullHD:dims?.width>=1080&&dims?.height>=1080&&Math.max(dims.width,dims.height)>=1920,
  exactFrames:metadata?.frameCount===composition?.totalFrames&&Number.isSafeInteger(composition?.totalFrames),
  audioVideo:metadata?.videoCodec==='h264'&&metadata?.audioCodec==='aac'&&quality?.passed===true,
  subtitlesAndMusic:subtitlesMatch===true&&!!result?.music&&result?.subtitles?.cueCount>=10,
  outputChecksum:checksumMatch===true,
  realMonitoredExecution:Number.isFinite(elapsedMs)&&elapsedMs>0&&monitorSamples>=2,
 };
 return {status:Object.values(gates).every(Boolean)?'PASS':'NOT_READY',gates,seconds:Number.isFinite(seconds)?seconds:null};
}
function hostSample(dataRoot){let diskFree=null;return statfs(dataRoot).then(s=>{diskFree=Number(s.bavail)*Number(s.bsize);return {at:Date.now(),rss:process.memoryUsage().rss,hostFree:os.freemem(),diskFree};}).catch(()=>({at:Date.now(),rss:process.memoryUsage().rss,hostFree:os.freemem(),diskFree}));}

export async function runRealLong({dataRoot,videoId,selection,requestKey,maxMs=12*3600*1000}={}){
 if(process.platform!=='win32')return {status:'BLOCKED',code:'FI0406_WINDOWS_HOST_REQUIRED'};
 const prerequisites=await inspectFi04Hyperframes();
 if(prerequisites.status!=='PREREQUISITES_PRESENT'||prerequisites.dependencyLock!=='PASS')return {status:'BLOCKED',code:'FI0406_PINNED_DEPENDENCIES_REQUIRED'};
 if(!dataRoot||!videoId||!selection||!requestKey)return {status:'BLOCKED',code:'FI0406_EXPLICIT_OPERATOR_INPUT_REQUIRED'};
 if(!/^[a-zA-Z0-9_-]{8,120}$/.test(requestKey)||!/^[a-zA-Z0-9_-]{1,100}$/.test(videoId))return {status:'BLOCKED',code:'FI0406_INVALID_ID'};
 const root=await realpath(resolve(dataRoot)),dbPath=join(root,'project.sqlite');
 if(!(await stat(dbPath)).isFile())return {status:'BLOCKED',code:'FI0406_PROJECT_DB_REQUIRED'};
 let db,store,runner;const started=performance.now();const samples=[];
 try{
  db=openProjectDb(dbPath);store=new JobStore({path:dbPath,leaseMs:120000});
  const repo=new StudioRepository(db),manifest=new AssetManifest({db,repository:repo,dataRoot:root});
  const compositions=new CompositionRepository({repo,manifest});
  const service=new RenderExportService({repo,compositions,manifest,store});
  // Selection is the same explicit revision/music/cues that a user chose in UI.
  if(selection?.engine!=='hyperframes'||!Number.isSafeInteger(selection?.revision)||selection.revision<1||!selection.music||!Number.isSafeInteger(selection.subtitleDraftRevision))return {status:'BLOCKED',code:'FI0406_APPROVED_SELECTION_REQUIRED'};
  const snap=compositions.revision(videoId,selection.revision),document=snap.composition;
  const seconds=document.totalFrames/document.profile.fps;
  if(seconds<2100||seconds>2400||document.scenes.length<5||Math.min(document.profile.width,document.profile.height)<1080||Math.max(document.profile.width,document.profile.height)<1920)return {status:'BLOCKED',code:'FI0406_REAL_LONG_FULLHD_COMPOSITION_REQUIRED'};
  const preflight=await service.preflight(videoId,selection);
  if(!preflight.ready)return {status:'BLOCKED',code:'FI0406_PREFLIGHT_BLOCKED',blockers:preflight.blockers};
  const queued=await service.enqueue(videoId,{...selection,requestKey});
  if(queued.reused||queued.job?.status!=='pending')return {status:'BLOCKED',code:'FI0406_REQUIRE_FRESH_QUEUE_JOB'};
  runner=new JobRunner(store,{'render:hyperframes':service.handler('hyperframes')},{concurrency:1,pollMs:500,heartbeatMs:15000});
  // Samples are parent/host memory and filesystem only, NOT a claim that the
  // HyperFrames subprocess peak RSS or GPU VRAM were measured.
  samples.push(await hostSample(root));const timer=setInterval(()=>{void hostSample(root).then(x=>samples.push(x));},10000);
  try{runner.start();await runner.waitForIdle({timeoutMs:maxMs});}finally{clearInterval(timer)}
  samples.push(await hostSample(root));
  const job=store.get(queued.job.id),result=job?.result;
  if(job?.status!=='succeeded'||result?.engine!=='hyperframes')return {status:'FAIL',code:'FI0406_RENDER_JOB_NOT_SUCCEEDED',jobStatus:job?.status??'missing'};
  // Canonical Windows path comparison; still rejects symlink/junction escapes.
  const {path}=await verifiedEvidenceFile(root,result.relativePath);
  const metadata=await probeMp4(path),quality=checkMp4Quality(metadata,document);
  const firstStat=await stat(path),sha=await sha256File(path),secondSha=await sha256File(path),secondStat=await stat(path);
  const srtAsset=await verifiedEvidenceFile(root,result.subtitles?.relativePath);
  const srt=await readFile(srtAsset.path,'utf8');
  const expectedCues=result.subtitles?.cueCount??0;
  const subtitlesMatch=expectedCues>=10&&(srt.match(/ --> /g)??[]).length===expectedCues&&
   createHash('sha256').update(srt,'utf8').digest('hex')===result.subtitles.sha256;
  const measured=assessLongVideo({platform:process.platform,cliReady:true,job,composition:document,metadata,quality,result,
   elapsedMs:performance.now()-started,checksumMatch:sha===secondSha&&firstStat.size===secondStat.size&&secondStat.size===result.bytes&&metadata.bytes===secondStat.size,subtitlesMatch,monitorSamples:samples.length});
  return {status:measured.status,task:'FI-04-06',jobId:job.id,compositionDigest:document.digest,
   engine:'hyperframes',frames:metadata.frameCount,expectedFrames:document.totalFrames,durationSeconds:metadata.durationSeconds,
   hash:sha,elapsedMs:Math.round(performance.now()-started),hostSampleCount:samples.length,
   peakParentRss:Math.max(...samples.map(x=>x.rss)),minHostFree:Math.min(...samples.map(x=>x.hostFree)),minDiskFree:Math.min(...samples.map(x=>x.diskFree??Number.MAX_SAFE_INTEGER)),
   sampleScope:'parent-process RSS, total host available RAM/disk; not renderer/VRAM',manualVisualAudioApproval:'BLOCKED',releaseGateSatisfied:false,...measured};
 }finally{if(runner)await runner.stop({abort:true}).catch(()=>{});store?.close();db?.close();}
}
async function main(){const a=options(process.argv.slice(2),['inspect','run','confirm-local-render'],['data-root','video-id','selection-file','request-key','report']);
 if(!!a.run===!!a.inspect)throw Error('FI0406_MODE_REQUIRED');
 let result={task:'FI-04-06',timestamp:timestamp(),status:'BLOCKED',code:'FI0406_INSPECT_ONLY',releaseGateSatisfied:false};
 if(a.run){if(!a['confirm-local-render'])throw Error('FI0406_EXPLICIT_CONSENT_REQUIRED');
  try{const dataRoot=resolve(a['data-root']),selectionFile=resolve(a['selection-file']);
   const selected=JSON.parse(await readFile(selectionFile,'utf8'));
   result={...result,...await runRealLong({dataRoot,videoId:a['video-id'],selection:selected,requestKey:a['request-key']})};}
  catch(e){result={...result,status:'BLOCKED_OR_FAILED',code:sanitizeError(e)};}}
 await reportFile(a.report,result);output(result,!!a.run);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
