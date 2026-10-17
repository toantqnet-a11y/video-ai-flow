/** R2-05: explicit scene image intent, local-only generation, immutable revisions.
 * An image is activated only when its exact scene/prompt/config/workflow
 * snapshot is still requested. The worker and DB promotion both recheck it.
 * No automatic paid/remote fallback, image-model download or fake output.
 */
import {createHash} from 'node:crypto';
import {readFile,lstat,writeFile,rm,mkdtemp} from 'node:fs/promises';
import {resolve,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {detectImage,validateImageBytes,verifyImage} from '../../../spikes/SP-03/src/image.js';
import {DomainError} from './domain.mjs';
import {transact} from './db.mjs';
import {regenerationOptionsHash} from './regeneration-options-r211.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const fail=(code,status=400)=>{throw new DomainError(code,status)};
const safeBody=b=>b&&typeof b==='object'&&!Array.isArray(b);
export function imageSourceHash(scene){return sha(JSON.stringify({text:scene.text,visualPrompt:scene.visualPrompt,mediaType:scene.mediaType}));}
export function imageSnapshot(scene,video,body,workflowHash){
  if(!safeBody(body)||Object.keys(body).some(k=>!['style','seed','width','height','regenerationKey'].includes(k)))fail('INVALID_IMAGE_REQUEST');
  if(scene.mediaType!=='image_motion'||typeof scene.visualPrompt!=='string'||!scene.visualPrompt.trim()||scene.visualPrompt.length>3000)
    fail('SCENE_IMAGE_PROMPT_REQUIRED',409);
  // Deliberate re-generation is a new revision, not a cache-busting random read.
  if(body.regenerationKey!==undefined&&(typeof body.regenerationKey!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.regenerationKey)))fail('INVALID_REGENERATION_KEY');
  const style=body.style??video.effectivePreset?.media?.style??'';
  const seed=body.seed??1,width=body.width??1024,height=body.height??576;
  if(typeof style!=='string'||style.length>500||!Number.isSafeInteger(seed)||seed<0||
    !Number.isInteger(width)||width<64||width>8192||!Number.isInteger(height)||height<64||height>8192||
    width*height>40_000_000||typeof workflowHash!=='string'||!/^[a-f0-9]{64}$/.test(workflowHash))fail('INVALID_IMAGE_REQUEST');
  const sourceSha256=imageSourceHash(scene),configRevision=video.configRevision;
  const base={sceneId:scene.id,videoId:scene.videoId,sourceSha256,configRevision,providerId:'comfyui',
    workflowHash,style,seed,width,height,
    ...(body.regenerationKey?{regenerationKey:body.regenerationKey}:{})};
  return {...base,prompt:scene.visualPrompt,inputHash:sha(JSON.stringify(base)),remoteConsent:false,
    ...(body.regenerationKey?{regenerationOptionsHash:regenerationOptionsHash(body)}:{})};
}
/** This is intentionally independent of mutable scene row_version because
 * another media type's pointer updates that counter without changing images.
 */
export function imageIntentMatches(repo,payload,jobId){
  const scene=repo.getScene(payload?.sceneId);
  if(!scene||scene.videoId!==payload.videoId||imageSourceHash(scene)!==payload.sourceSha256)return false;
  const video=repo.getVideo(scene.videoId);
  if(!video||video.deletedAt!==null||video.configRevision!==payload.configRevision)return false;
  const row=repo.db.prepare('SELECT * FROM scene_image_intents WHERE scene_id=?').get(scene.id);
  return !!(row&&row.job_id===jobId&&row.input_hash===payload.inputHash&&
    row.source_sha256===payload.sourceSha256&&row.config_revision===payload.configRevision);
}
export class SceneImageRepository {
  constructor(repo,{store,manifest,registry}){this.repo=repo;this.db=repo.db;this.store=store;this.manifest=manifest;this.registry=registry;}
  check(sceneId){
    const scene=this.repo.getScene(sceneId);if(!scene)fail('SCENE_NOT_FOUND',404);
    const video=this.repo.getVideo(scene.videoId);if(!video||video.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
    return {scene,video};
  }
  async validAsset(scene){
    if(!scene.visualAssetId)return null;
    const asset=this.manifest.get(scene.visualAssetId);
    if(!asset||asset.kind!=='image'||asset.sceneId!==scene.id||asset.state!=='committed')return null;
    const full=resolve(this.manifest.dataRoot,asset.relativePath);
    if(!full.startsWith(this.manifest.dataRoot+sep))return null;
    const stat=await lstat(full).catch(()=>null);
    if(!stat?.isFile()||stat.isSymbolicLink()||stat.size>25*1024*1024)return null;
    if(sha(await readFile(full))!==asset.checksum)return null;
    return asset;
  }
  /** No client supplied prompt/URL/path/model: only a persisted and reviewed scene prompt. */
  async queue(sceneId,body={}){
    const {scene,video}=this.check(sceneId);
    if(!this.registry.imageAdapter||!this.registry.list().some(p=>p.id==='comfyui'&&p.kind==='image'&&p.location==='local'&&p.costTier==='local'))fail('LOCAL_IMAGE_NOT_CONFIGURED',503);
    const normalized=safeBody(body)?body:null;
    // Validate before loading an operator-owned workflow.
    const provisional=imageSnapshot(scene,video,normalized,'0'.repeat(64));
    let workflow;
    try{workflow=await this.registry.imageAdapter.loadWorkflow(provisional)}
    catch{fail('LOCAL_IMAGE_WORKFLOW_INVALID',503)}
    const snapshot=imageSnapshot(scene,video,normalized,sha(JSON.stringify(workflow)));
    const asset=await this.validAsset(scene);
    const currentIntent=this.db.prepare('SELECT * FROM scene_image_intents WHERE scene_id=?').get(sceneId);
    if(asset?.metadata?.inputHash===snapshot.inputHash&&currentIntent?.job_id===asset.metadata?.queueJobId&&
      imageIntentMatches(this.repo,snapshot,currentIntent.job_id)){
      // Never remove the intent for an active cache hit: status and eventual
      // recovery depend on the exact job still being the authoritative source.
      return {state:'cached',cached:true,asset:{id:asset.id,source:asset.source},job:null};
    }
    const {job,reused}=this.store.enqueue({key:`scene-image:${scene.id}:${snapshot.inputHash}`,
      kind:'asset:image',payload:snapshot,maxAttempts:2});
    transact(this.db,()=>{
      this.db.prepare('DELETE FROM scene_image_manual_selections WHERE scene_id=?').run(sceneId);
      this.db.prepare(`INSERT INTO scene_image_intents
      (scene_id,job_id,input_hash,source_sha256,config_revision,requested_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(scene_id) DO UPDATE SET
      job_id=excluded.job_id,input_hash=excluded.input_hash,source_sha256=excluded.source_sha256,
      config_revision=excluded.config_revision,requested_at=excluded.requested_at`)
      .run(sceneId,job.id,snapshot.inputHash,snapshot.sourceSha256,snapshot.configRevision,Date.now());
    });
    return {state:'queued',cached:false,reused,job:{id:job.id,status:job.status,kind:job.kind}};
  }
  async status(sceneId){
    const {scene,video}=this.check(sceneId);
    const intent=this.db.prepare('SELECT * FROM scene_image_intents WHERE scene_id=?').get(sceneId);
    const job=intent?this.store.get(intent.job_id):null;
    const asset=await this.validAsset(scene);
    const selected=this.db.prepare('SELECT asset_id FROM scene_image_manual_selections WHERE scene_id=?').get(sceneId);
    const sourceCurrent=asset?.metadata?.sourceSha256===imageSourceHash(scene)&&
      asset?.metadata?.configRevision===video.configRevision;
    const valid=asset&&(selected?.asset_id===asset.id?
      true:sourceCurrent&&intent&&asset.metadata?.inputHash===intent.input_hash&&
      imageIntentMatches(this.repo,{sceneId,videoId:scene.videoId,inputHash:intent.input_hash,
        sourceSha256:intent.source_sha256,configRevision:intent.config_revision},intent.job_id));
    return {sceneId,state:valid?'ready':job?.status??'not_generated',stale:!!asset&&!valid,
      imageAsset:valid?{id:asset.id,source:asset.source,format:asset.relativePath.split('.').at(-1),
        width:asset.metadata.width??null,height:asset.metadata.height??null}:null,
      job:job?{id:job.id,status:job.status,attempt:job.attempt}:null};
  }
  /** Small-file local upload via authenticated JSON (512 KiB binary limit).
   * Larger raw uploads deliberately defer to R2-09; no filesystem path from HTTP.
   */
  async importBase64(sceneId,body){
    const {scene}=this.check(sceneId);
    const expectedRowVersion=scene.rowVersion;
    // Row version does not change for queue intent updates, so pin both.
    const startingIntent=this.db.prepare('SELECT job_id,input_hash FROM scene_image_intents WHERE scene_id=?').get(sceneId);
    if(!safeBody(body)||Object.keys(body).some(k=>!['mimeType','dataBase64'].includes(k))||
      !['image/png','image/jpeg','image/webp'].includes(body.mimeType)||
      typeof body.dataBase64!=='string'||body.dataBase64.length<32||body.dataBase64.length>700_000||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(body.dataBase64)||body.dataBase64.length%4!==0)
      fail('INVALID_IMAGE_UPLOAD');
    const bytes=Buffer.from(body.dataBase64,'base64');
    if(bytes.length>512*1024||bytes.toString('base64')!==body.dataBase64)fail('INVALID_IMAGE_UPLOAD');
    let kind;
    try{validateImageBytes(bytes);kind=detectImage(bytes)}catch{fail('INVALID_IMAGE_UPLOAD')}
    const mime={'png':'image/png','jpg':'image/jpeg','webp':'image/webp'}[kind.format];
    if(mime!==body.mimeType)fail('IMAGE_MIME_MISMATCH');
    const temp=await mkdtemp(join(tmpdir(),'contentstudio-image-'));
    try{
      const file=join(temp,`source.${kind.format}`);
      await writeFile(file,bytes,{flag:'wx',mode:0o600});
      const result=await verifyImage(file).catch(()=>fail('IMAGE_DECODE_FAILED',422));
      if(result.width!==kind.width||result.height!==kind.height)fail('IMAGE_DECODE_FAILED',422);
    }finally{await rm(temp,{recursive:true,force:true})}
    // Defer deleting the generation intent until the SAME transaction that
    // promotes the manual asset. An import can overlap an in-flight worker;
    // failed optimistic lock must preserve the newer selection and intent.
    const asset=await this.manifest.importBytes({sceneId,kind:'image',source:'manual_import',bytes,
      extension:`.${kind.format}`,metadata:{width:kind.width,height:kind.height},
      expectedRowVersion,reuseIdentical:true,onCommitted:assetId=>{
        const newest=this.db.prepare('SELECT job_id,input_hash FROM scene_image_intents WHERE scene_id=?').get(sceneId);
        if((newest?.job_id??null)!==(startingIntent?.job_id??null)||
          (newest?.input_hash??null)!==(startingIntent?.input_hash??null))fail('SCENE_IMAGE_INTENT_CONFLICT',409);
        this.db.prepare('DELETE FROM scene_image_intents WHERE scene_id=?').run(sceneId);
        this.db.prepare(`INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)
          ON CONFLICT(scene_id) DO UPDATE SET asset_id=excluded.asset_id,selected_at=excluded.selected_at`)
          .run(sceneId,assetId,Date.now());
        this.repo.event('asset',assetId,'image.manually.imported',{sceneId});
      }});
    return {sceneId,assetId:asset.id,format:kind.format,width:kind.width,height:kind.height};
  }
  async image(sceneId){
    const status=await this.status(sceneId);
    if(!status.imageAsset)fail('IMAGE_NOT_READY',404);
    const asset=this.manifest.get(status.imageAsset.id);
    const full=resolve(this.manifest.dataRoot,asset.relativePath);
    if(!full.startsWith(this.manifest.dataRoot+sep))fail('UNSAFE_ASSET_PATH',403);
    const bytes=await readFile(full).catch(()=>fail('IMAGE_NOT_READY',404));
    if(bytes.length>25*1024*1024||sha(bytes)!==asset.checksum)fail('IMAGE_ASSET_CORRUPT',409);
    let format;
    try{format=detectImage(bytes).format}catch{fail('IMAGE_ASSET_CORRUPT',409)}
    const current=await this.status(sceneId);
    if(current.imageAsset?.id!==asset.id)fail('IMAGE_NOT_READY',409);
    return {bytes,format};
  }
  /** Opt-in reuse of an older/imported image. Restrict to this very scene. */
  async select(sceneId,{assetId,expectedRowVersion}={}){
    const {scene}=this.check(sceneId);
    const startingIntent=this.db.prepare('SELECT job_id,input_hash FROM scene_image_intents WHERE scene_id=?').get(sceneId);
    if(typeof assetId!=='string'||!Number.isInteger(expectedRowVersion)||expectedRowVersion<1)fail('INVALID_IMAGE_SELECTION');
    const asset=this.manifest.get(assetId);
    if(!asset||asset.sceneId!==sceneId||asset.kind!=='image'||asset.state!=='committed')fail('IMAGE_ASSET_NOT_FOUND',404);
    const path=resolve(this.manifest.dataRoot,asset.relativePath);
    if(!path.startsWith(this.manifest.dataRoot+sep))fail('UNSAFE_ASSET_PATH',403);
    const data=await readFile(path).catch(()=>fail('IMAGE_ASSET_MISSING',409));
    if(sha(data)!==asset.checksum)fail('IMAGE_ASSET_CORRUPT',409);
    transact(this.db,()=>{
      const newest=this.db.prepare('SELECT job_id,input_hash FROM scene_image_intents WHERE scene_id=?').get(sceneId);
      if((newest?.job_id??null)!==(startingIntent?.job_id??null)||
        (newest?.input_hash??null)!==(startingIntent?.input_hash??null))fail('SCENE_IMAGE_INTENT_CONFLICT',409);
      const updated=this.db.prepare(`UPDATE scenes SET visual_asset_id=?,row_version=row_version+1,updated_at=?
        WHERE id=? AND row_version=?`).run(assetId,Date.now(),sceneId,expectedRowVersion);
      if(updated.changes!==1)fail('SCENE_ROW_VERSION_CONFLICT',409);
      this.db.prepare('DELETE FROM scene_image_intents WHERE scene_id=?').run(sceneId);
      this.db.prepare(`INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)
        ON CONFLICT(scene_id) DO UPDATE SET asset_id=excluded.asset_id,selected_at=excluded.selected_at`)
        .run(sceneId,assetId,Date.now());
      this.repo.event('asset',assetId,'image.manually.selected',{sceneId});
    });
    return {sceneId,assetId,selected:true};
  }
}
