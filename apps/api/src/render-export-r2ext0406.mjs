/** EXT-04/06: queue local FFmpeg export through the one existing SP-04 store. */
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,rm,stat,mkdir} from 'node:fs/promises';
import {lstat,realpath} from 'node:fs/promises';
import {join,sep} from 'node:path';
import {prepareSubtitleRenderPlan,validateRenderMusic,renderMusicDigest} from '../../../packages/core/src/render-finishing-r405-r406.mjs';
import {SubtitleDraftsR405,mixMusicIntoMp4} from '../../../packages/core/src/r4-editor-music-style.mjs';
import {importMusicTrack,listMusicTracks} from '../../../packages/core/src/music-import-r406.mjs';
import {probeMp4,checkMp4Quality} from '../../../packages/core/src/render-ffmpeg-r2ext04.mjs';
import {MotionBrandRepository,resolveMotionStyle} from '../../../packages/core/src/index.mjs';
import {DomainError} from '../../../packages/core/src/domain.mjs';
import {renderFfmpegComposition,safePinnedPath,makeSrt} from '../../../packages/core/src/render-ffmpeg-r2ext04.mjs';
import {renderHyperframesComposition} from '../../../packages/core/src/render-hyperframes.mjs';
import {publicJob} from './job-center.mjs';
import {renderProfileVariant,renderDrawerProgress,RENDER_RESOLUTIONS} from '../../../packages/core/src/render-drawer-r312.mjs';
import {checkRenderDisk} from '../../../packages/core/src/render-safety-r313.mjs';
const fail=(code,status=409)=>{throw new DomainError(code,status)};
const safeId=s=>typeof s==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(s);
/** Keep pinned published revision immutable, refuse stale scene/timeline edits. */
export function checkPublishedSource(repo,compositions,document){
 const live=compositions.liveState(document.videoId);
 const {source,scenes}=document;
 if(source.videoRowVersion!==live.video.rowVersion||source.configRevision!==live.video.configRevision||
  source.sceneRevision!==live.state.sceneRevision||source.timelineRowVersion!==live.state.timelineRowVersion||
  source.scriptSha256!==live.state.scriptSha256||scenes.length!==live.scenes.length)
  fail('RENDER_STALE_COMPOSITION');
 for(const s of scenes){const actual=live.scenes.find(c=>c.id===s.id);
  if(!actual||actual.rowVersion!==s.sceneRowVersion||actual.voiceAssetId!==s.voice.asset?.id||
     actual.visualAssetId!==s.visual.asset?.id)fail('RENDER_STALE_COMPOSITION');
 }
}
export class RenderExportService{
 constructor({repo,compositions,store,manifest,diskCheck=checkRenderDisk}){this.repo=repo;this.compositions=compositions;this.store=store;this.manifest=manifest;this.diskCheck=diskCheck;this.styles=new MotionBrandRepository(repo);this.subtitleDrafts=new SubtitleDraftsR405(repo.db);}
 /** A bounded audio import does not invoke providers or alter the render snapshot. */
 async listMusic(videoId){
  if(!this.repo.getVideo(videoId))fail('R4_VIDEO_NOT_FOUND',404);
  return listMusicTracks({videoId,dataRoot:this.manifest.dataRoot});
 }
 async importMusic(videoId,body){
  if(!this.repo.getVideo(videoId))fail('R4_VIDEO_NOT_FOUND',404);
  return importMusicTrack({videoId,body,dataRoot:this.manifest.dataRoot});
 }
 /** R4-05/06 require explicit opt-in; a saved draft is immutable in the
  * queued snapshot even if another tab modifies it while rendering. */
 async finishing(videoId,document,body){
  let draft=null,subtitlePlan=null;
  if(body.subtitleDraftRevision!==undefined){
   if(!Number.isSafeInteger(body.subtitleDraftRevision)||body.subtitleDraftRevision<1)fail('R4_SUBTITLE_REVISION_INVALID',400);
   draft=this.subtitleDrafts.get(videoId);
   if(draft.revision!==body.subtitleDraftRevision||draft.sourceDigest!==document.digest)fail('R4_SUBTITLE_SOURCE_STALE');
   subtitlePlan=prepareSubtitleRenderPlan(document,draft);
  }
  const music=validateRenderMusic(body.music);
  if(music){await safePinnedPath(this.manifest.dataRoot,music.pin);}
  return {draft,subtitlePlan,music};
 }
 /** Read-only preflight validates the precise pinned bytes and selected output size.
  * It never invokes a provider, writes a render job, or invents readiness. */
 async preflight(videoId,body={}){
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).some(k=>!['revision','styleRevision','engine','resolution','subtitleDraftRevision','music'].includes(k))||
     !Number.isSafeInteger(body.revision)||body.revision<1||
     (body.styleRevision!==undefined&&(!Number.isSafeInteger(body.styleRevision)||body.styleRevision<1))||
     !['hyperframes','ffmpeg-fastpath'].includes(body.engine??'hyperframes')||
     !RENDER_RESOLUTIONS.includes(body.resolution??'source'))fail('RENDER_INVALID_REQUEST',400);
  const snap=this.compositions.revision(videoId,body.revision),document=snap.composition;
  if(document.schemaVersion!==2)fail('RENDER_TIMED_COMPOSITION_REQUIRED');
  const blockers=[];
  if(!document.readiness.ready)blockers.push('RENDER_COMPOSITION_NOT_READY');
  try{checkPublishedSource(this.repo,this.compositions,document)}catch(e){
   if(e instanceof DomainError)blockers.push(e.code);else throw e;
  }
  let finishing=null;
  try{finishing=await this.finishing(videoId,document,body)}catch(e){
   if(e instanceof DomainError)blockers.push(e.code);else throw e;
  }
  let effective=null;
  try{effective=renderProfileVariant(document,body.resolution??'source')}catch(e){
   if(e instanceof DomainError)blockers.push(e.code);else throw e;
  }
  const selectedStyle=body.styleRevision===undefined?null:this.styles.revision(videoId,body.styleRevision);
  if(selectedStyle&&effective){try{resolveMotionStyle(selectedStyle.style,effective)}catch(e){
   if(e instanceof DomainError)blockers.push(e.code);else throw e;
  }}
  // Reject impossible fade settings before scheduling an expensive encoder.
  if(effective&&finishing?.music&&
     finishing.music.settings.fadeInSeconds+finishing.music.settings.fadeOutSeconds>
       effective.totalFrames/effective.profile.fps)blockers.push('R4_MUSIC_DURATION_INVALID');
  if(!blockers.length){for(const scene of document.scenes){
   for(const asset of [scene.voice.asset,scene.visual.asset]){
    try{await safePinnedPath(this.manifest.dataRoot,asset)}catch(e){
     if(e instanceof DomainError){
      // Preserve already-public domain error codes so older clients/tests can
      // identify an asset that changed after approval, without leaking paths.
      blockers.push(['RENDER_ASSET_CHANGED','RENDER_UNSAFE_PATH'].includes(e.code)?e.code:'RENDER_PINNED_ASSET_INVALID');
     }else if(e?.code==='ENOENT')blockers.push('RENDER_PINNED_ASSET_MISSING');
     else throw e;
    }
   }
  }}
  // R3-13: capacity is rechecked by the worker; this check is advisory at click time.
  let disk=null;
  if(effective){
   try{disk=await this.diskCheck(this.manifest.dataRoot,effective,{engine:body.engine??'hyperframes'});
    if(!disk.ready)blockers.push(disk.blocker);
   }catch(e){if(e instanceof DomainError)blockers.push(e.code);else throw e;}
  }
  return {ready:blockers.length===0,blockers:[...new Set(blockers)],revision:body.revision,
   compositionDigest:document.digest,engine:body.engine??'hyperframes',
   resolution:body.resolution??'source',styleRevision:body.styleRevision??null,subtitleDraftRevision:finishing?.draft?.revision??null,
   musicEnabled:!!finishing?.music,
   profile:effective?.profile??document.profile,sceneCount:document.scenes.length,
   // Enough metadata for truthful UI; no filesystem paths or installed-engine promises.
   hyperframesRuntimeVerified:false,
   disk:disk?{requiredBytes:disk.requiredBytes,reserveBytes:disk.reserveBytes,availableBytes:disk.availableBytes,estimateOnly:true}:null};
 }
 async enqueue(videoId,body={}){
  if(!body||Object.keys(body).some(k=>!['requestKey','revision','styleRevision','engine','resolution','subtitleDraftRevision','music'].includes(k))||
    !safeId(body.requestKey))fail('RENDER_INVALID_REQUEST',400);
  const {requestKey,...parameters}=body;
  const preflight=await this.preflight(videoId,parameters);
  if(!preflight.ready)fail(preflight.blockers[0]);
  const snap=this.compositions.revision(videoId,body.revision),document=snap.composition;
  const selectedStyle=body.styleRevision===undefined?null:this.styles.revision(videoId,body.styleRevision);
  const engine=body.engine??'hyperframes',resolution=body.resolution??'source';
  const finishing=await this.finishing(videoId,document,body);
  const {draft,subtitlePlan,music}=finishing;
  // Preflight and enqueue are both fail-closed; recheck mutable source just
  // before committing a queued job to reduce the source-edit race window.
  checkPublishedSource(this.repo,this.compositions,document);
  let queued;
  try{queued=this.store.enqueue({kind:engine==='hyperframes'?'render:hyperframes':'render:ffmpeg',key:`render:${videoId}:${body.requestKey}`,payload:{projectId:videoId,engine,
    revision:body.revision,digest:document.digest,styleRevision:selectedStyle?.revision??null,
    styleDigest:selectedStyle?.style.digest??null,resolution,
    subtitleDraftRevision:draft?.revision??null,subtitleDigest:subtitlePlan?.digest??null,
    musicDigest:music?createHash('sha256').update(JSON.stringify(music)).digest('hex'):null},maxAttempts:2});}
  catch(error){
    // The shared SP-04 store reports a static, non-domain idempotency error;
    // translate only that case into a sanitized 409 instead of HTTP 500.
    if(error?.message==='idempotency key conflict: payload/dependencies changed')fail('RENDER_IDEMPOTENCY_CONFLICT');
    throw error;
  }
  // A reused idempotency key MUST refer to the exact same composition and
  // exact same style revision; reject conflicts instead of silently reusing.
  const snapshotPayload=JSON.stringify({composition:document,style:selectedStyle?.style??null,resolution,
   subtitleDraft:draft,music});
  const found=this.repo.db.prepare('SELECT * FROM render_snapshots WHERE job_id=?').get(queued.job.id);
  if(!found){
   this.repo.db.prepare(`INSERT INTO render_snapshots(job_id,video_id,engine,composition_digest,style_digest,composition_revision,payload_json,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(queued.job.id,videoId,engine,document.digest,
    selectedStyle?.style.digest??null,body.revision,snapshotPayload,Date.now());
  }else if(found.video_id!==videoId||found.engine!==engine||found.composition_digest!==document.digest||
   found.style_digest!==(selectedStyle?.style.digest??null)||found.payload_json!==snapshotPayload)fail('RENDER_SNAPSHOT_CONFLICT');
  const existing=this.store.get(queued.job.id);
  if(existing?.payload?.digest!==document.digest||existing?.payload?.engine!==engine||existing?.payload?.resolution!==resolution||existing?.payload?.styleDigest!==(selectedStyle?.style.digest??null)||
   existing?.payload?.subtitleDigest!==(subtitlePlan?.digest??null)||
   existing?.payload?.musicDigest!==(music?createHash('sha256').update(JSON.stringify(music)).digest('hex'):null))fail('RENDER_IDEMPOTENCY_CONFLICT');
  return {job:publicJob(queued.job),reused:queued.reused};
 }
 job(videoId,jobId){
  if(!safeId(jobId)||!this.repo.getVideo(videoId))fail('RENDER_JOB_NOT_FOUND',404);
  const job=this.store.get(jobId);
  if(!job||!['render:hyperframes','render:ffmpeg'].includes(job.kind)||job.payload.projectId!==videoId)fail('RENDER_JOB_NOT_FOUND',404);
  const progressRow=this.store.db.prepare("SELECT detail_json FROM outbox WHERE job_id=? AND type='render_progress' ORDER BY seq DESC LIMIT 1").get(jobId);
  const last=progressRow?JSON.parse(progressRow.detail_json):null;
  const progress=last?{completedScenes:Number.isSafeInteger(last.completedScenes)?last.completedScenes:null,
    totalScenes:Number.isSafeInteger(last.totalScenes)?last.totalScenes:null,
    stage:['preparing','encoding','finalizing','verifying'].includes(last.stage)?last.stage:null}:null;
  const frozen=this.repo.db.prepare('SELECT composition_revision,payload_json FROM render_snapshots WHERE job_id=?').get(jobId);
  const snapshot=frozen?JSON.parse(frozen.payload_json):null;
  let sourceCurrent=false;
  if(snapshot?.composition){try{checkPublishedSource(this.repo,this.compositions,snapshot.composition);sourceCurrent=true}catch(e){
   if(!(e instanceof DomainError))throw e;
  }}
  return {...publicJob(job),progress,drawer:renderDrawerProgress({status:job.status,progress}),
    revision:frozen?.composition_revision??null,resolution:snapshot?.resolution??'source',sourceCurrent,
    output:job.status==='succeeded'?{qa:job.result?.qa??null,bytes:job.result?.bytes??0,
    downloadUrl:`/api/videos/${videoId}/renders/${jobId}/mp4`,
    thumbnailUrl:job.result?.thumbnail?`/api/videos/${videoId}/renders/${jobId}/thumbnail`:null,
    subtitleUrl:job.result?.subtitles?`/api/videos/${videoId}/renders/${jobId}/srt`:null,
    segmentCache:job.result?.segmentCache??null,subtitleDraftRevision:job.result?.subtitleDraftRevision??null,
    musicEnabled:!!job.result?.music,engine:job.result?.engine??(job.kind==='render:hyperframes'?'hyperframes':'ffmpeg-fastpath')}:null};
 }
 async file(videoId,jobId){
  const job=this.job(videoId,jobId);
  if(job.status!=='succeeded')fail('RENDER_NOT_READY');
  const internal=this.store.get(jobId).result;
  if(!internal||internal.videoId!==videoId||!internal.qa?.passed||!internal.relativePath?.startsWith(`renders/${videoId}/`))fail('RENDER_INVALID_OUTPUT');
  const path=join(this.manifest.dataRoot,internal.relativePath);
  const root=await realpath(this.manifest.dataRoot),real=await realpath(path).catch(()=>fail('RENDER_OUTPUT_MISSING',404));
  if(!real.startsWith(root+sep)||real!==path)fail('RENDER_UNSAFE_OUTPUT');
  const s=await lstat(path);
  if(!s.isFile()||s.isSymbolicLink()||s.size!==internal.bytes)fail('RENDER_INVALID_OUTPUT');
  return {stream:createReadStream(path),size:s.size};
 }
 async subtitle(videoId,jobId){
   const state=this.job(videoId,jobId);
   if(state.status!=='succeeded')fail('RENDER_NOT_READY');
   const subtitle=this.store.get(jobId).result?.subtitles;
   if(!subtitle||!subtitle.relativePath?.startsWith(`renders/${videoId}/`)||
     !/^[a-f0-9]{64}$/.test(subtitle.sha256))fail('RENDER_SUBTITLE_MISSING',404);
   const root=await realpath(this.manifest.dataRoot),path=join(root,subtitle.relativePath);
   const real=await realpath(path).catch(()=>fail('RENDER_SUBTITLE_MISSING',404));
   if(!real.startsWith(root+sep)||real!==path)fail('RENDER_UNSAFE_OUTPUT');
   const st=await lstat(path);
   if(!st.isFile()||st.isSymbolicLink()||st.size!==subtitle.bytes||st.size>5_000_000||
     createHash('sha256').update(await readFile(path)).digest('hex')!==subtitle.sha256)fail('RENDER_SUBTITLE_CHANGED');
   return {stream:createReadStream(path),size:st.size};
 }
 async thumbnail(videoId,jobId){
   const state=this.job(videoId,jobId);
   if(state.status!=='succeeded')fail('RENDER_NOT_READY');
   const thumb=this.store.get(jobId).result?.thumbnail;
   if(!thumb||!thumb.relativePath?.startsWith(`renders/${videoId}/`)||
      !/^[a-f0-9]{64}$/.test(thumb.sha256))fail('RENDER_THUMBNAIL_NOT_FOUND',404);
   const root=await realpath(this.manifest.dataRoot),path=join(root,thumb.relativePath);
   const real=await realpath(path).catch(()=>fail('RENDER_THUMBNAIL_NOT_FOUND',404));
   if(!real.startsWith(root+sep)||real!==path)fail('RENDER_UNSAFE_OUTPUT');
   const fs=await lstat(path);
   if(!fs.isFile()||fs.isSymbolicLink()||fs.size!==thumb.bytes||fs.size>10000000)fail('RENDER_THUMBNAIL_BAD');
   if(createHash('sha256').update(await readFile(path)).digest('hex')!==thumb.sha256)fail('RENDER_THUMBNAIL_BAD');
   return {stream:createReadStream(path),size:fs.size};
 }
 handler(engine='ffmpeg-fastpath'){return async(payload,{signal,jobId}={})=>{
  const {projectId,revision,digest,styleRevision,styleDigest,resolution='source'}=payload;
  if((payload.engine??'ffmpeg-fastpath')!==engine)fail('RENDER_ENGINE_MISMATCH');
  // The worker MUST consume immutable enqueue-time data, not live edited scenes.
  const frozen=this.repo.db.prepare('SELECT * FROM render_snapshots WHERE job_id=?').get(jobId);
  if(!frozen||frozen.video_id!==projectId||frozen.engine!==engine||
   frozen.composition_digest!==digest||frozen.composition_revision!==revision||
   frozen.style_digest!==(styleDigest??null))fail('RENDER_SNAPSHOT_MISSING');
  const {composition:document,style,resolution:frozenResolution='source',subtitleDraft=null,music=null}=JSON.parse(frozen.payload_json);
  const subtitlePlan=prepareSubtitleRenderPlan(document,subtitleDraft);
  const musicSelection=validateRenderMusic(music);
  if((payload.subtitleDraftRevision??null)!==(subtitleDraft?.revision??null)||(payload.subtitleDigest??null)!==(subtitlePlan?.digest??null)||
     (payload.musicDigest??null)!==(musicSelection?createHash('sha256').update(JSON.stringify(musicSelection)).digest('hex'):null))fail('RENDER_FINISHING_SNAPSHOT_CHANGED');
  if(frozenResolution!==resolution||document.digest!==digest||document.schemaVersion!==2||
    (style?.digest??null)!==(styleDigest??null))fail('RENDER_SNAPSHOT_CHANGED');
  if(style)resolveMotionStyle(style,document);
  const render=engine==='hyperframes'?renderHyperframesComposition:renderFfmpegComposition;
  const outputComposition=renderProfileVariant(document,resolution);
  // A queued job may start hours later on a nearly full disk. Fail closed.
  const disk=await this.diskCheck(this.manifest.dataRoot,outputComposition,{engine});
  if(!disk.ready)fail('RENDER_DISK_SPACE_LOW',507);
  if(signal?.aborted)fail('RENDER_ABORTED');
  this.store.emit(jobId,'render_progress',{stage:'preparing'});
  const result=await render({composition:outputComposition,motionStyle:style,dataRoot:this.manifest.dataRoot,signal,
    cacheDb:this.repo.db,subtitlePlan,
    // Production renderer must never be replaceable by an environment-variable
    // path. Tests inject their command only via renderHyperframesComposition().
    hyperframes:'hyperframes',
    onProgress:progress=>this.store.emit(jobId,'render_progress',{stage:'encoding',...progress})});
  this.store.emit(jobId,'render_progress',{stage:'finalizing',completedScenes:document.scenes.length,totalScenes:document.scenes.length});
  // R3-10: write a separate UTF-8 SRT from the *same frozen input* as MP4.
  // Never regenerate captions from the current mutable editor after export.
  if(!result.relativePath?.startsWith(`renders/${projectId}/`)||!/^renders\/[A-Za-z0-9-]+\/[a-f0-9]{64}\.mp4$/.test(result.relativePath))fail('RENDER_OUTPUT_UNSAFE');
  const content=subtitlePlan?.srt??makeSrt(outputComposition),subtitlePath=join(this.manifest.dataRoot,result.relativePath.replace(/\.mp4$/,'.srt'));
  if(Buffer.byteLength(content)>5_000_000)fail('RENDER_SUBTITLE_TOO_LARGE');
  const hash=createHash('sha256').update(content,'utf8').digest('hex');
  const temp=`${subtitlePath}.${randomUUID()}.tmp`;
  try{
   await writeFile(temp,content,{flag:'wx',mode:0o600});
   const existing=await stat(subtitlePath).catch(()=>null);
   if(existing){
    if(existing.size!==Buffer.byteLength(content)||createHash('sha256').update(await readFile(subtitlePath)).digest('hex')!==hash)
      fail('RENDER_SUBTITLE_COLLISION');
   }else await rename(temp,subtitlePath);
  }finally{await rm(temp,{force:true});}
  this.store.emit(jobId,'render_progress',{stage:'verifying',completedScenes:document.scenes.length,totalScenes:document.scenes.length});
  result.subtitles={relativePath:result.relativePath.replace(/\.mp4$/,'.srt'),sha256:hash,
    bytes:Buffer.byteLength(content),cueCount:(content.match(/ --> /g)??[]).length};
  // R4-06: music is a consented, pinned local second pass for BOTH engines.
  // Do not touch the published base MP4; audio output gets a new digest name.
  if(musicSelection){
   this.store.emit(jobId,'render_progress',{stage:'finalizing',completedScenes:document.scenes.length,totalScenes:document.scenes.length});
   const baseRelativePath=result.relativePath,baseMp4=join(this.manifest.dataRoot,baseRelativePath);
   const musicHash=renderMusicDigest({baseRelativePath,music:musicSelection});
   const musicRelativePath=`renders/${projectId}/${musicHash}.mp4`,musicPath=join(this.manifest.dataRoot,musicRelativePath);
   const existing=await stat(musicPath).catch(()=>null);
   let mixed;
   if(existing){
    // A previously published output is reusable only if the same input
    // fingerprint and strict MP4 QA are valid; never overwrite on collisions.
    const metadata=await probeMp4(musicPath);
    const qa=checkMp4Quality(metadata,outputComposition);
    if(!qa.passed||!existing.isFile())fail('R4_MUSIC_OUTPUT_COLLISION');
    mixed={output:musicPath,metadata};
   }else mixed=await mixMusicIntoMp4({sourceMp4:baseMp4,musicPin:musicSelection.pin,dataRoot:this.manifest.dataRoot,
    targetMp4:musicPath,seconds:outputComposition.totalFrames/outputComposition.profile.fps,settings:musicSelection.settings,signal});
   const qa=checkMp4Quality(mixed.metadata,outputComposition);
   if(!qa.passed)fail('R4_MUSIC_QA_FAILED');
   result.relativePath=musicRelativePath;result.bytes=(await stat(musicPath)).size;result.metadata=mixed.metadata;result.qa=qa;
   result.music={sha256:musicSelection.pin.sha256,settings:musicSelection.settings};
  }
  // R4-05 separate .srt is always aligned to the exact pinned burn-in cues.
  result.subtitleDraftRevision=subtitleDraft?.revision??null;
  return {result};
 };}
}
