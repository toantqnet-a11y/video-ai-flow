/** R2-VID-01..05: production clip policy, provenance, import and local queue.
 * Keep all scene jobs on SP-04; inference is OFF unless a trusted operator
 * configured a loopback ComfyUI video workflow. No paid/remote fallback.
 */
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm,realpath,stat} from 'node:fs/promises';
import {join,relative,resolve,sep,isAbsolute} from 'node:path';
import {DomainError} from './domain.mjs';
import {transact} from './db.mjs';
import {VideoAssetService} from '../../../spikes/SP-VID-01/src/service.mjs';
import {probeVideo} from '../../../spikes/SP-VID-01/src/media.mjs';
import {withLocalGpuLock} from './video-gpu-lock-r2vid04.mjs';
import {runBinary} from './render-ffmpeg-r2ext04.mjs';
import {probeClipSource} from './clip-normalize-r3vid02.mjs';
import {estimateClipResources,normalizeClipResourceLimits} from './clip-resource-r2vid06.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const ID=/^[a-zA-Z0-9_-]{1,100}$/;
const MAX_IMPORT=8*1024*1024;
// Higher-level presets can be explicitly overridden per scene.
const DEFAULT=Object.freeze({mediaType:'image_motion',mode:'text_to_video',
 fallback:'manual_image',durationSec:4,width:768,height:432,fps:24,seed:1});
const VALID_KEYS=Object.keys(DEFAULT);
export function normalizeClipPolicy(input){
 if(!plain(input)||Object.keys(input).some(k=>!VALID_KEYS.includes(k)))fail('VIDEO_POLICY_INVALID');
 const p={...DEFAULT,...input};
 if(!['image_motion','ai_video','import_video'].includes(p.mediaType)||
    !['text_to_video','image_to_video'].includes(p.mode)||
    !['manual_image','none'].includes(p.fallback)||
    !integer(p.durationSec,1,300)||!integer(p.width,128,4096)||
    !integer(p.height,128,4096)||!integer(p.fps,1,120)||
    !integer(p.seed,0,2147483647)||p.width*p.height>4096*4096)
    fail('VIDEO_POLICY_INVALID');
 return Object.fromEntries(VALID_KEYS.map(k=>[k,p[k]]));
}
const scopeTable={channel:'channels',video:'videos',scene:'scenes'};
const safeScope=(scope,id)=>{
 if(!Object.hasOwn(scopeTable,scope)||typeof id!=='string'||!ID.test(id))fail('VIDEO_POLICY_SCOPE_INVALID');
 return scope;
};
const rowPolicy=r=>r?{revision:r.revision,policy:JSON.parse(r.policy_json)}:null;
const safeJob=j=>j?{id:j.id,status:j.status,kind:j.kind,attempt:j.attempt,lastError:j.last_error??null}:null;

export class SceneClipService {
 constructor({repo,manifest,store,videoAdapter=null,ffprobe='ffprobe',clock=()=>Date.now(),resourceLimits={}}){
  this.repo=repo;this.db=repo.db;this.manifest=manifest;this.store=store;
  this.videoAdapter=videoAdapter;this.ffprobe=ffprobe;this.clock=clock;
  // Immutable operator-owned guardrails; never accepted from scene/HTTP body.
  this.resourceLimits=normalizeClipResourceLimits(resourceLimits);
  // A single in-process provider mutex prevents two simultaneous GPU calls.
  // Multi-instance GPU ownership still requires hardware acceptance/locking.
  this.gpuTail=Promise.resolve();
 }
 scope(scope,id){
  safeScope(scope,id);
  const exists=this.db.prepare('SELECT id FROM '+scopeTable[scope]+' WHERE id=?').get(id);
  if(!exists)fail('VIDEO_POLICY_SCOPE_NOT_FOUND',404);
  return {scope,id};
 }
 getScopePolicy(scope,id){
  this.scope(scope,id);
  const row=this.db.prepare('SELECT * FROM scene_video_policies WHERE scope=? AND scope_id=?').get(scope,id);
  return {scope,id,...(rowPolicy(row)??{revision:0,policy:null})};
 }
 saveScopePolicy(scope,id,{expectedRevision,policy}={}){
  this.scope(scope,id);
  if(!integer(expectedRevision,0,1_000_000))fail('VIDEO_POLICY_VERSION_REQUIRED');
  const config=normalizeClipPolicy(policy),now=this.clock();
  return transact(this.db,()=>{
   const current=this.getScopePolicy(scope,id);
   if(current.revision!==expectedRevision)fail('VIDEO_POLICY_VERSION_CONFLICT',409);
   const revision=current.revision+1;
   this.db.prepare(`INSERT INTO scene_video_policies(scope,scope_id,revision,policy_json,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(scope,scope_id) DO UPDATE SET
    revision=excluded.revision,policy_json=excluded.policy_json,updated_at=excluded.updated_at`)
    .run(scope,id,revision,JSON.stringify(config),now);
   this.db.prepare('INSERT INTO scene_video_policy_revisions(scope,scope_id,revision,policy_json,created_at) VALUES(?,?,?,?,?)')
    .run(scope,id,revision,JSON.stringify(config),now);
   // Current scene mediaType is also used by render/timeline and must stay
   // synchronized with a *scene* override. Never mutate voice/text pointers.
   if(scope==='scene'){
    this.db.prepare('UPDATE scenes SET media_type=?,row_version=row_version+1,updated_at=? WHERE id=?')
      .run(config.mediaType,now,id);
    this.db.prepare('DELETE FROM scene_video_intents WHERE scene_id=?').run(id);
   }
   this.repo.event('video_media_policy',id,'video.policy.saved',{scope,revision});
   return {scope,id,revision,policy:config};
  });
 }
 history(scope,id){
  this.scope(scope,id);
  return {items:this.db.prepare('SELECT revision,created_at FROM scene_video_policy_revisions WHERE scope=? AND scope_id=? ORDER BY revision DESC LIMIT 30')
   .all(scope,id).map(x=>({revision:x.revision,createdAt:x.created_at}))};
 }
 effective(sceneId){
  const scene=this.repo.getScene(sceneId);if(!scene)fail('SCENE_NOT_FOUND',404);
  const video=this.repo.getVideo(scene.videoId);if(!video||video.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
  const scopes=[['scene',scene.id],['video',video.id],['channel',video.channelId]];
  const selected=scopes.map(([scope,id])=>this.getScopePolicy(scope,id)).find(p=>p.policy!==null);
  const policy=selected?.policy??normalizeClipPolicy({mediaType:scene.mediaType});
  const digest=sha({policy,source:selected?{scope:selected.scope,id:selected.id,revision:selected.revision}:null});
  return {scene,video,policy,digest,source:selected?{scope:selected.scope,id:selected.id,revision:selected.revision}:
   {scope:'scene-default',id:scene.id,revision:0}};
 }
 /** Digest excludes rowVersion: selecting a voice cannot stale a video clip. */
 input(sceneId){
  const e=this.effective(sceneId);
  const fingerprint=sha({sceneId:e.scene.id,videoId:e.video.id,visualPrompt:e.scene.visualPrompt,
   text:e.scene.text,configRevision:e.video.configRevision,policyDigest:e.digest,
   imageId:e.policy.mode==='image_to_video'?e.scene.visualAssetId:null});
  return {...e,inputHash:fingerprint};
 }
 preflight(sceneId){
  const e=this.input(sceneId),blockers=[];
  if(e.policy.mediaType!=='ai_video')blockers.push('VIDEO_MEDIA_NOT_AI');
  if(!this.videoAdapter)blockers.push('VIDEO_LOCAL_WORKFLOW_NOT_CONFIGURED');
  if(!e.scene.visualPrompt?.trim())blockers.push('VIDEO_PROMPT_REQUIRED');
  if(e.policy.mode==='image_to_video'){
   const image=e.scene.visualAssetId&&this.manifest.get(e.scene.visualAssetId);
   if(!image||image.kind!=='image'||image.state!=='committed')blockers.push('VIDEO_REFERENCE_IMAGE_REQUIRED');
  }
  // R2-VID-06: check workload cap/declared VRAM before any SP-04 submission.
  // This does not replace real driver/GPU inference or license verification.
  const resourceEstimate=estimateClipResources(e.policy,this.resourceLimits);
  blockers.push(...resourceEstimate.blockers);
  return {sceneId,canQueue:blockers.length===0,blockers,
   warnings:resourceEstimate.warnings,resourceEstimate,policy:e.policy,
   policyDigest:e.digest,inputHash:e.inputHash,dryRun:true,
   willBill:false,willCallRemote:false,gpuInferenceVerified:false};
 }
 /** Multiple scene requests are atomic in the shared WAL store; dependency
  * chaining bounds GPU concurrency even across multiple queue consumers. */
 enqueueBatch(videoId,{sceneIds,requestKey}={}){
  const video=this.repo.getVideo(videoId);
  if(!video||video.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
  if(!Array.isArray(sceneIds)||sceneIds.length<1||sceneIds.length>40||
     new Set(sceneIds).size!==sceneIds.length||!ID.test(requestKey??''))fail('VIDEO_BATCH_INVALID');
  const snapshots=sceneIds.map(id=>{
   const e=this.input(id);if(e.video.id!==videoId)fail('SCENE_NOT_IN_VIDEO',409);
   const p=this.preflight(id);if(!p.canQueue)fail(p.blockers[0],409);
   return e;
  });
  const digest=sha(snapshots.map(e=>[e.scene.id,e.inputHash]));
  const existing=this.db.prepare('SELECT * FROM scene_video_batches WHERE video_id=? AND request_key=?').get(videoId,requestKey);
  if(existing){if(existing.spec_hash!==digest)fail('VIDEO_BATCH_KEY_CONFLICT',409);
   return {reused:true,jobs:JSON.parse(existing.job_ids_json).map(id=>safeJob(this.store.get(id)))};
  }
  let prev=null;const specs=snapshots.map(e=>{
   const id=randomUUID();
   const payload={videoId,sceneId:e.scene.id,inputHash:e.inputHash,
    imageAssetId:e.policy.mode==='image_to_video'?e.scene.visualAssetId:null,
    policy:e.policy,policyDigest:e.digest,configRevision:e.video.configRevision};
   const row={id,kind:'scene:ai-video',key:'r2vid:'+videoId+':'+e.scene.id+':'+requestKey,
    payload,deps:prev?[prev]:[],maxAttempts:1,priority:0};
   prev=id;return row;
  });
  // A successful local GPU inference cannot be rolled back after OS kill.
  // One attempt only; manual retry requires a distinct requestKey.
  let jobs;
  try{
   jobs=this.store.enqueueManyAtomic(specs,(results,db)=>{
    for(let i=0;i<snapshots.length;i++){
     db.prepare(`INSERT INTO scene_video_intents(scene_id,job_id,input_hash,requested_at)
      VALUES(?,?,?,?) ON CONFLICT(scene_id) DO UPDATE SET
      job_id=excluded.job_id,input_hash=excluded.input_hash,requested_at=excluded.requested_at`)
      .run(snapshots[i].scene.id,results[i].job.id,snapshots[i].inputHash,this.clock());
    }
    db.prepare('INSERT INTO scene_video_batches(video_id,request_key,spec_hash,job_ids_json,created_at) VALUES(?,?,?,?,?)')
      .run(videoId,requestKey,digest,JSON.stringify(results.map(r=>r.job.id)),this.clock());
   });
  }catch(error){if(error instanceof DomainError)throw error;fail('VIDEO_QUEUE_CONFLICT',409);}
  return {reused:false,jobs:jobs.map(r=>safeJob(r.job))};
 }
 queue(sceneId,body){
  const scene=this.repo.getScene(sceneId);if(!scene)fail('SCENE_NOT_FOUND',404);
  if(!plain(body)||Object.keys(body).some(k=>!['requestKey','expectedPolicyDigest'].includes(k)))
   fail('VIDEO_QUEUE_INVALID');
  const p=this.preflight(sceneId);
  if(p.policyDigest!==body.expectedPolicyDigest)fail('VIDEO_POLICY_STALE',409);
  return this.enqueueBatch(scene.videoId,{sceneIds:[sceneId],requestKey:body.requestKey});
 }
 intentMatches(payload,jobId){
  if(!payload||!jobId)return false;
  const row=this.db.prepare('SELECT * FROM scene_video_intents WHERE scene_id=?').get(payload.sceneId);
  if(row?.job_id!==jobId||row.input_hash!==payload.inputHash)return false;
  try{return this.input(payload.sceneId).inputHash===payload.inputHash}catch{return false}
 }
 /** A process-local FIFO mutex prevents simultaneous ComfyUI GPU use. */
 handler(){
  const service=this.videoAdapter?new VideoAssetService({adapter:this.videoAdapter,
   dataRoot:this.manifest.dataRoot,ffprobe:this.ffprobe}):null;
  return async(payload,{signal,jobId})=>{
   if(!service)throw Object.assign(Error('video not configured'),{code:'VIDEO_LOCAL_WORKFLOW_NOT_CONFIGURED',retryable:false});
   const previous=this.gpuTail;let done;this.gpuTail=new Promise(resolve=>done=resolve);
   await previous;
   try{
    if(signal?.aborted)throw Object.assign(Error('cancelled'),{code:'VIDEO_JOB_ABORTED',retryable:false});
    if(!this.intentMatches(payload,jobId))throw Object.assign(Error('stale'),{code:'VIDEO_INTENT_STALE',retryable:false});
    const snap=this.input(payload.sceneId),p=payload.policy;
    if(p.mediaType!=='ai_video'||snap.digest!==payload.policyDigest)throw Object.assign(Error('policy changed'),{code:'VIDEO_POLICY_STALE',retryable:false});
    // Recheck on worker immediately before provider dispatch. A queued job
    // must not bypass a resource gate merely because its preflight was old.
    const resourceEstimate=estimateClipResources(p,this.resourceLimits);
    if(!resourceEstimate.canPassConfiguredLimits)
     throw Object.assign(Error('resource budget'),{
      code:resourceEstimate.blockers[0],retryable:false});
    let imageBytes;
    if(p.mode==='image_to_video'){
     const asset=this.manifest.get(payload.imageAssetId);
     if(!asset||asset.kind!=='image'||await this.manifest.verifyRevision(asset.id)!=='healthy')
      throw Object.assign(Error('image missing'),{code:'VIDEO_REFERENCE_UNHEALTHY',retryable:false});
     imageBytes=await readFile(join(this.manifest.dataRoot,asset.relativePath));
    }
    // Cross-process filesystem mutex covers the actual GPU call; crash keeps
    // a lock until a human confirms no inference survived the parent process.
    const output=await withLocalGpuLock(this.manifest.dataRoot,()=>service.generateScene({projectId:payload.videoId,sceneId:payload.sceneId,
     request:{mode:p.mode,prompt:snap.scene.visualPrompt,negativePrompt:'',
      seed:p.seed,width:p.width,height:p.height,fps:p.fps,durationSeconds:p.durationSec,
      ...(imageBytes?{imageBytes}:{})},policy:{type:'local'}},{signal}),{signal});
    if(signal?.aborted||!this.intentMatches(payload,jobId))
     throw Object.assign(Error('stale output'),{code:'VIDEO_INTENT_STALE',retryable:false});
    return {result:{kind:'video',sceneId:payload.sceneId,providerId:'comfyui-video',
      inputHash:payload.inputHash,policyDigest:payload.policyDigest,configRevision:payload.configRevision,
      durationMs:output.durationMs,width:output.width,height:output.height,fps:output.fps,
      source:'ai_video'},
     asset:{logicalKey:'r2vid:'+jobId,filePath:output.filePath,checksum:output.checksum}};
   }finally{done();}
  };
 }
 async importBase64(sceneId,{base64,container='mp4',expectedRowVersion}={}){
  if(!['mp4','mov'].includes(container))fail('VIDEO_IMPORT_CONTAINER_UNSUPPORTED');
  const e=this.input(sceneId);
  if(e.policy.mediaType!=='import_video')fail('VIDEO_IMPORT_POLICY_REQUIRED',409);
  if(!integer(expectedRowVersion,1,1_000_000)||expectedRowVersion!==e.scene.rowVersion)
   fail('SCENE_ROW_VERSION_CONFLICT',409);
  if(typeof base64!=='string'||base64.length<100||base64.length>Math.ceil(MAX_IMPORT/3)*4+20||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))fail('VIDEO_IMPORT_INVALID');
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length<100||bytes.length>MAX_IMPORT||bytes.toString('base64')!==base64)fail('VIDEO_IMPORT_INVALID');
  // Detect decoded MP4 via real FFprobe, never trust extension or JS MIME.
  const scratch=await mkdtemp(join(this.manifest.dataRoot,'clip-import-'));
  try{
   const file=join(scratch,`candidate.${container}`);
   await writeFile(file,bytes,{flag:'wx',mode:0o600});
   const original=await probeClipSource(file,{ffprobe:this.ffprobe,run:runBinary});
   if(original.durationSeconds>120||original.width>4096||original.height>4096||
      (container==='mov'&&(original.durationSeconds>30||
       original.width*original.height*original.fps*original.durationSeconds>350_000_000)))
    fail('VIDEO_IMPORT_RESOURCE_LIMIT',413);
   // MOV often contains codecs unsupported by Chromium and source soundtracks.
   // Normalize once to browser-compatible, mute-source H264 MP4. Preserve only
   // SHA/codec/container metadata about input; staged MOV is deleted on exit.
   let candidate=bytes;
   if(container==='mov'){
    const converted=join(scratch,'normalized.mp4');
    await runBinary('ffmpeg',['-hide_banner','-nostdin','-loglevel','error',
     '-i',file,'-map','0:v:0','-an','-sn','-dn',
     '-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p',
     '-movflags','+faststart','-y',converted],{timeoutMs:Math.max(30000,original.durationSeconds*25000)});
    const size=(await stat(converted)).size;
    if(size<100||size>32*1024*1024)fail('VIDEO_IMPORT_NORMALIZED_TOO_LARGE',413);
    candidate=await readFile(converted);
   }
   const info=await probeVideo(container==='mov'?join(scratch,'normalized.mp4'):file,{ffprobe:this.ffprobe});
   const meta={source:'manual_import',durationMs:info.durationMs,width:info.width,
    height:info.height,fps:info.fps,codec:info.codec,hasAudio:info.hasAudio,
    originalContainer:container,originalSha256:createHash('sha256').update(bytes).digest('hex'),
    sourceCodec:original.sourceCodec,sourceHasAudio:original.embeddedAudio,
    locallyNormalized:container==='mov'};
   const asset=await this.manifest.importBytes({sceneId,kind:'video',source:'manual_import',
    bytes:candidate,extension:'.mp4',metadata:meta,expectedRowVersion,
    onCommitted:assetId=>{
     // An inherited import_video policy must update render's canonical scene
     // kind in the same transaction as its visual pointer and provenance.
     this.db.prepare("UPDATE scenes SET media_type='import_video' WHERE id=?").run(sceneId);
     this.db.prepare('DELETE FROM scene_video_intents WHERE scene_id=?').run(sceneId);
     this.db.prepare(`INSERT INTO scene_video_selections(scene_id,asset_id,selected_at)
      VALUES(?,?,?) ON CONFLICT(scene_id) DO UPDATE SET asset_id=excluded.asset_id,
      selected_at=excluded.selected_at`).run(sceneId,assetId,this.clock());
    }});
   return {assetId:asset.id,kind:'video',source:'manual_import',metadata:meta,verified:true};
  }finally{await rm(scratch,{recursive:true,force:true})}
 }
 async select(sceneId,{assetId,expectedRowVersion}={}){
  const e=this.input(sceneId);
  if(!integer(expectedRowVersion,1,1e9)||expectedRowVersion!==e.scene.rowVersion)
   fail('SCENE_ROW_VERSION_CONFLICT',409);
  const asset=this.manifest.get(assetId);
  if(!asset||asset.sceneId!==sceneId||asset.kind!=='video')fail('VIDEO_ASSET_NOT_FOUND',404);
  if(e.policy.mediaType!==(asset.source==='manual_import'?'import_video':'ai_video'))
   fail('VIDEO_SELECTION_POLICY_MISMATCH',409);
  if(await this.manifest.verifyRevision(asset.id)!=='healthy')fail('VIDEO_ASSET_UNHEALTHY',409);
  return transact(this.db,()=>{
   if(this.repo.getScene(sceneId)?.rowVersion!==expectedRowVersion)fail('SCENE_ROW_VERSION_CONFLICT',409);
   this.db.prepare('DELETE FROM scene_video_intents WHERE scene_id=?').run(sceneId);
   this.db.prepare('UPDATE scenes SET visual_asset_id=?,row_version=row_version+1,updated_at=? WHERE id=?')
    .run(asset.id,this.clock(),sceneId);
   this.db.prepare(`INSERT INTO scene_video_selections(scene_id,asset_id,selected_at)
    VALUES(?,?,?) ON CONFLICT(scene_id) DO UPDATE SET asset_id=excluded.asset_id,selected_at=excluded.selected_at`)
    .run(sceneId,asset.id,this.clock());
   return {assetId:asset.id,selected:true,voiceUnchanged:true};
  });
 }
 /** R2-VID-05: explicit still-image fallback never invokes a provider.
  * Scene-scoped policy revision + image pointer are committed together.
  * The previous video revision remains available for later manual selection. */
 async fallbackToImage(sceneId,{imageAssetId,expectedRowVersion,expectedPolicyRevision}={}){
  const e=this.input(sceneId),p=this.getScopePolicy('scene',sceneId);
  if(e.policy.fallback!=='manual_image')fail('VIDEO_FALLBACK_DISABLED',409);
  if(!integer(expectedRowVersion,1,1e9)||e.scene.rowVersion!==expectedRowVersion)
   fail('SCENE_ROW_VERSION_CONFLICT',409);
  if(expectedPolicyRevision!==p.revision)fail('VIDEO_POLICY_VERSION_CONFLICT',409);
  const image=this.manifest.get(imageAssetId);
  if(!image||image.sceneId!==sceneId||image.kind!=='image'||image.state!=='committed')
   fail('VIDEO_FALLBACK_IMAGE_NOT_FOUND',404);
  if(await this.manifest.verifyRevision(image.id)!=='healthy')fail('VIDEO_FALLBACK_IMAGE_UNHEALTHY',409);
  const next=normalizeClipPolicy({...e.policy,mediaType:'image_motion'}),now=this.clock();
  return transact(this.db,()=>{
   if(this.repo.getScene(sceneId)?.rowVersion!==expectedRowVersion||
      this.getScopePolicy('scene',sceneId).revision!==expectedPolicyRevision)
     fail('VIDEO_FALLBACK_CONFLICT',409);
   const revision=expectedPolicyRevision+1;
   this.db.prepare(`INSERT INTO scene_video_policies(scope,scope_id,revision,policy_json,updated_at)
     VALUES('scene',?,?,?,?) ON CONFLICT(scope,scope_id) DO UPDATE SET
     revision=excluded.revision,policy_json=excluded.policy_json,updated_at=excluded.updated_at`)
     .run(sceneId,revision,JSON.stringify(next),now);
   this.db.prepare(`INSERT INTO scene_video_policy_revisions
     (scope,scope_id,revision,policy_json,created_at) VALUES('scene',?,?,?,?)`)
     .run(sceneId,revision,JSON.stringify(next),now);
   this.db.prepare('DELETE FROM scene_video_intents WHERE scene_id=?').run(sceneId);
   this.db.prepare(`UPDATE scenes SET media_type='image_motion',visual_asset_id=?,
     row_version=row_version+1,updated_at=? WHERE id=?`).run(image.id,now,sceneId);
   this.repo.event('scene',sceneId,'video.image_fallback',{revision,imageAssetId:image.id});
   return {status:'FALLBACK_IMAGE_SELECTED',assetId:image.id,revision,voiceUnchanged:true};
  });
 }
 async status(sceneId){
  const e=this.input(sceneId),intent=this.db.prepare('SELECT * FROM scene_video_intents WHERE scene_id=?').get(sceneId);
  const selected=this.db.prepare('SELECT asset_id FROM scene_video_selections WHERE scene_id=?').get(sceneId);
  const assets=this.manifest.listScene(sceneId).filter(x=>x.kind==='video');
  const videoAssets=await Promise.all(assets.slice(0,40).map(async a=>({
   id:a.id,source:a.source,metadata:a.metadata,bytes:a.bytes,
   health:await this.manifest.verifyRevision(a.id)})));
  return {sceneId,policy:e.policy,policyDigest:e.digest,policySource:e.source,
   sceneRowVersion:e.scene.rowVersion,selectedAssetId:e.scene.visualAssetId,
   selectedVideoAssetId:selected?.asset_id===e.scene.visualAssetId?selected.asset_id:null,
   job:safeJob(intent?this.store.get(intent.job_id):null),
   intentCurrent:!!intent&&this.intentMatches({sceneId,inputHash:intent.input_hash},intent.job_id),
   assets:videoAssets,localConfigured:!!this.videoAdapter,
   imageFallbacks:await Promise.all(this.manifest.listScene(sceneId).filter(a=>a.kind==='image'&&a.state==='committed').slice(0,20).map(async a=>({
    id:a.id,health:await this.manifest.verifyRevision(a.id)}))),
   hasImageFallback:!!this.manifest.listScene(sceneId).find(a=>a.kind==='image'&&a.state==='committed'),
   gpuInferenceVerified:false};
 }
 /** R2-VID-05: preview an immutable prior revision without activating it.
  * The scoped scene ownership and SHA health checks run before returning bytes.
  * No bearer credentials are ever embedded in browser video URLs. */
 async revisionBytes(sceneId,assetId){
  const scene=this.repo.getScene(sceneId);if(!scene)fail('SCENE_NOT_FOUND',404);
  const asset=this.manifest.get(assetId);
  if(!asset||asset.sceneId!==scene.id||asset.videoId!==scene.videoId||asset.kind!=='video')
   fail('VIDEO_ASSET_NOT_FOUND',404);
  if(asset.bytes>100*1024*1024)fail('VIDEO_ASSET_TOO_LARGE',413);
  if(await this.manifest.verifyRevision(asset.id)!=='healthy')fail('VIDEO_ASSET_UNHEALTHY',409);
  return {bytes:await readFile(join(this.manifest.dataRoot,asset.relativePath)),mime:'video/mp4'};
 }
 async activeBytes(sceneId){
  const s=this.repo.getScene(sceneId);if(!s)fail('SCENE_NOT_FOUND',404);
  const a=s.visualAssetId&&this.manifest.get(s.visualAssetId);
  if(!a||a.kind!=='video'||a.sceneId!==sceneId)fail('VIDEO_ACTIVE_CLIP_NOT_FOUND',404);
  if(await this.manifest.verifyRevision(a.id)!=='healthy')fail('VIDEO_ASSET_UNHEALTHY',409);
  if(a.bytes>100*1024*1024)fail('VIDEO_ASSET_TOO_LARGE',413);
  return {bytes:await readFile(join(this.manifest.dataRoot,a.relativePath)),mime:'video/mp4'};
 }
}
