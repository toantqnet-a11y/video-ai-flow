/**
 * Filesystem/SQLite boundary. A file rename and SQLite transaction cannot be
 * atomic together; use immutable paths and reconcile orphan/missing files on
 * startup instead of pretending a distributed transaction exists.
 */
import { randomUUID,createHash } from 'node:crypto';
import { mkdir,open,readFile,realpath,rename,rm,lstat,readdir } from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import { resolve,join,relative,sep,extname,isAbsolute } from 'node:path';
import { transact } from './db.mjs';
import { DomainError } from './domain.mjs';
import {voiceIntentMatches} from './scene-voice.mjs';
import {imageIntentMatches,imageSourceHash} from './scene-image.mjs';
import {SceneClipService} from './scene-video-r2vid.mjs';

const FORMATS={voice:['.mp3','.wav','.ogg'],image:['.png','.jpg','.jpeg','.webp'],video:['.mp4','.webm']};
const sha256=data=>createHash('sha256').update(data).digest('hex');
/** Streaming avoids loading dozens of 100 MiB videos into memory on scan. */
async function digestFile(path) {
  return new Promise((resolve,reject)=>{
    const hash=createHash('sha256'),stream=createReadStream(path);
    stream.on('data',chunk=>hash.update(chunk));
    stream.on('error',reject);stream.on('end',()=>resolve(hash.digest('hex')));
  });
}


export class AssetManifest {
  constructor({db,repository,dataRoot}) {
    this.db=db;this.repo=repository;this.dataRoot=resolve(dataRoot);
  }
  /** Import a new immutable revision. expectedRowVersion and onCommitted fence manual
   * changes + dependent selection inside the SAME SQLite transaction. No
   * async work occurs between revision insert and pointer switch.
   * reuseIdentical only skips identical *manual* imports, not generated jobs.
   */
  async importBytes({sceneId,kind,source,bytes,extension,metadata={},
    expectedRowVersion=null,onCommitted=null,reuseIdentical=false}) {
    const scene=this.repo.getScene(sceneId);
    if (!scene) throw new DomainError('SCENE_NOT_FOUND',404);
    if (!FORMATS[kind]?.includes(extension) || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length>100*1024*1024)
      throw new DomainError('INVALID_ASSET');
    if (typeof source!=='string'||source.length>100 || JSON.stringify(metadata).length>3000) throw new DomainError('INVALID_ASSET');
    const id=randomUUID(),checksum=sha256(bytes);
    const expected=expectedRowVersion===null?null:Number(expectedRowVersion);
    if(expected!==null&&(!Number.isSafeInteger(expected)||expected<1))throw new DomainError('INVALID_ROW_VERSION');
    if(onCommitted!==null&&typeof onCommitted!=='function')throw new DomainError('INVALID_ASSET');
    const promote=(assetId)=>{
      if(expected!==null&&this.repo.getScene(sceneId)?.rowVersion!==expected)
        throw new DomainError('SCENE_ROW_VERSION_CONFLICT',409);
      const pointer=kind==='voice'?'voice_asset_id':'visual_asset_id';
      this.db.prepare(`UPDATE scenes SET ${pointer}=?,row_version=row_version+1,updated_at=? WHERE id=?`)
        .run(assetId,Date.now(),sceneId);
      onCommitted?.(assetId);
      this.repo.event('asset',assetId,'asset.committed',{kind,sceneId});
    };
    // Never dedupe generated versions by bytes alone: identical pixels can
    // represent different prompts, jobs and provenance. Manual imports only.
    if(reuseIdentical&&source==='manual_import') {
      const candidates=this.db.prepare(`SELECT id FROM asset_revisions WHERE scene_id=? AND kind=?
        AND source=? AND sha256=? AND bytes=? AND state='committed' ORDER BY created_at DESC`)
        .all(sceneId,kind,source,checksum,bytes.length);
      for(const candidate of candidates){
        const existing=this.get(candidate.id);
        if(existing.relativePath.endsWith(extension)&&JSON.stringify(existing.metadata)===JSON.stringify(metadata)&&
          await this.verifyRevision(existing.id)==='healthy'){
          transact(this.db,()=>promote(existing.id));
          return {...existing,reused:true};
        }
      }
    }
    const dirname=join(this.dataRoot,'assets',scene.videoId,sceneId,kind);
    await mkdir(dirname,{recursive:true});
    // Verify real destination directory is still nested in the real data root.
    const realRoot=await realpath(this.dataRoot),realDir=await realpath(dirname);
    if (!(realDir.startsWith(realRoot+sep))) throw new DomainError('UNSAFE_ASSET_DIRECTORY',403);
    const relativePath=`assets/${scene.videoId}/${sceneId}/${kind}/${id}${extension}`;
    const finalPath=join(this.dataRoot,relativePath);
    const tempPath=`${finalPath}.${randomUUID()}.partial`;
    try {
      const fh=await open(tempPath,'wx',0o600);
      try {await fh.writeFile(bytes);await fh.sync();}finally{await fh.close();}
      await rename(tempPath,finalPath);
      // If DB commit fails here, file remains as a detectable, nonactive orphan.
      transact(this.db,()=>{
        this.db.prepare(`INSERT INTO asset_revisions(id,video_id,scene_id,kind,source,file_path,sha256,bytes,state,metadata_json,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .run(id,scene.videoId,sceneId,kind,source,relativePath,checksum,bytes.length,'committed',JSON.stringify(metadata),Date.now());
        promote(id);
      });
      return {id,sceneId,videoId:scene.videoId,kind,source,relativePath,checksum,bytes:bytes.length,state:'committed'};
    } finally {await rm(tempPath,{force:true});}
  }
  async importFile({sceneId,kind,source='manual_import',inputPath,metadata={}}) {
    if (typeof inputPath!=='string') throw new DomainError('INVALID_SOURCE_PATH');
    const stats=await lstat(inputPath);
    if (!stats.isFile()||stats.isSymbolicLink()||stats.size>100*1024*1024) throw new DomainError('INVALID_SOURCE_FILE');
    const ext=extname(inputPath).toLowerCase();
    if (!FORMATS[kind]?.includes(ext)) throw new DomainError('INVALID_ASSET_FORMAT');
    return this.importBytes({sceneId,kind,source,bytes:await readFile(inputPath),extension:ext,metadata});
  }
  get(id) {
    const r=this.db.prepare('SELECT * FROM asset_revisions WHERE id=?').get(id);
    return r&&{id:r.id,videoId:r.video_id,sceneId:r.scene_id,kind:r.kind,source:r.source,
      relativePath:r.file_path,checksum:r.sha256,bytes:r.bytes,state:r.state,metadata:JSON.parse(r.metadata_json)};
  }
  listScene(sceneId) {return this.db.prepare('SELECT id FROM asset_revisions WHERE scene_id=? ORDER BY created_at DESC').all(sceneId).map(x=>this.get(x.id));}
  /** Hash index is logical, not hardlink-based. Separate scene files cannot
   * corrupt each other when an external editor mutates one of them.
   */
  contentInfo(checksum) {
    if(typeof checksum!=='string'||!/^[a-f0-9]{64}$/.test(checksum))throw new DomainError('INVALID_CONTENT_HASH');
    const record=this.db.prepare('SELECT * FROM asset_content_index WHERE sha256=?').get(checksum);
    if(!record)return null;
    const usage=this.db.prepare(`SELECT COUNT(*) revisions,
      SUM(CASE WHEN state='committed' THEN 1 ELSE 0 END) committed
      FROM asset_revisions WHERE sha256=?`).get(checksum);
    return {sha256:record.sha256,bytes:record.bytes,revisions:usage.revisions,
      committed:usage.committed};
  }
  async verifyRevision(assetId){
    const asset=this.get(assetId);
    if(!asset)return 'unknown';
    // path.relative is case-insensitive on Windows; string startsWith is not.
    // Compare canonical root to canonical asset to handle Windows temp junctions
    // without allowing path traversal or symlinks to escape the asset root.
    const nested=(base,candidate)=>{
      const rel=relative(base,candidate);
      return rel!==''&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);
    };
    const file=resolve(this.dataRoot,asset.relativePath);
    if(!nested(this.dataRoot,file))return 'unsafe';
    const stat=await lstat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
    if(!stat)return 'missing';
    if(!stat.isFile()||stat.isSymbolicLink())return 'unsafe';
    const actual=await realpath(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
    if(!actual)return 'missing';
    const root=await realpath(this.dataRoot);
    if(!nested(root,actual))return 'unsafe';
    if(stat.size!==asset.bytes)return 'corrupt';
    return await digestFile(file)===asset.checksum?'healthy':'corrupt';
  }
  /** Read-only per-scene selective regeneration plan, never triggers AI spend.
   * Manual images remain pinned by operator choice, even after script edits.
   * Voice and generated image require their own exact source + config revision.
   */
  async planRecompute(videoId,{sceneIds=null}={}){
    const video=this.repo.getVideo(videoId);
    if(!video||video.deletedAt!==null)throw new DomainError('VIDEO_NOT_FOUND',404);
    const all=this.repo.listScenes(videoId);
    const selected=sceneIds===null?null:new Set(sceneIds);
    const scenes=selected?all.filter(s=>selected.has(s.id)):all;
    if(selected&&scenes.length!==selected.size)throw new DomainError('SCENE_NOT_FOUND',404);
    const result=[];
    for(const scene of scenes){
      const voice=scene.voiceAssetId?this.get(scene.voiceAssetId):null;
      const visual=scene.visualAssetId?this.get(scene.visualAssetId):null;
      const voiceIntent=this.db.prepare('SELECT * FROM scene_voice_intents WHERE scene_id=?').get(scene.id);
      const imageIntent=this.db.prepare('SELECT * FROM scene_image_intents WHERE scene_id=?').get(scene.id);
      const pinned=this.db.prepare('SELECT asset_id FROM scene_image_manual_selections WHERE scene_id=?').get(scene.id);
      const voiceHealth=voice?await this.verifyRevision(voice.id):'missing';
      const visualHealth=visual?await this.verifyRevision(visual.id):'missing';
      const vOk=voice&&voice.kind==='voice'&&voice.state==='committed'&&voiceHealth==='healthy'&&
        voiceIntent?.job_id===voice.metadata.queueJobId&&voiceIntent.input_hash===voice.metadata.inputHash&&
        voiceIntent.text_sha256===sha256(scene.text)&&voiceIntent.config_revision===video.configRevision;
      const manual=visual&&visual.kind==='image'&&pinned?.asset_id===visual.id;
      const iOk=visual&&visual.state==='committed'&&visualHealth==='healthy'&&
        (manual||(visual.metadata.queueJobId===imageIntent?.job_id&&
          visual.metadata.inputHash===imageIntent?.input_hash&&
          visual.metadata.sourceSha256===imageSourceHash(scene)&&
          visual.metadata.configRevision===video.configRevision));
      result.push({sceneId:scene.id,index:scene.index,
        voice:vOk?'reuse':voice?'regenerate':'not_generated',
        visual:iOk?(manual?'manual_preserved':'reuse'):visual?'regenerate':'not_generated',
        voiceHealth,visualHealth});
    }
    return {videoId,sceneCount:scenes.length,scenes:result,
      regenerateVoice:result.filter(r=>r.voice==='regenerate').map(r=>r.sceneId),
      regenerateVisual:result.filter(r=>r.visual==='regenerate').map(r=>r.sceneId)};
  }
  /** Reconciliation NEVER deletes user media, or clears pointers/intents.
   * Unknown orphan files are only listed for explicit later operator review.
   */
  async reconcile({scanOrphans=false}={}) {
    const missing=[],corrupt=[],restored=[],orphans=[],unsafe=[];
    const listed=new Set();
    for (const r of this.db.prepare('SELECT id,file_path,state FROM asset_revisions').all()) {
      listed.add(r.file_path.replaceAll('\\','/'));
      const health=await this.verifyRevision(r.id);
      if(health==='unsafe')unsafe.push(r.id);
      if(health==='missing'||health==='corrupt'||health==='unsafe'){
        missing.push(r.id);
        if(health==='corrupt')corrupt.push(r.id);
        if(r.state!=='missing')this.db.prepare("UPDATE asset_revisions SET state='missing' WHERE id=?").run(r.id);
      }else if(health==='healthy'&&r.state==='missing'){
        this.db.prepare("UPDATE asset_revisions SET state='committed' WHERE id=?").run(r.id);
        restored.push(r.id);
      }
    }
    if(scanOrphans){
      const root=join(this.dataRoot,'assets');
      const walk=async folder=>{
        for(const e of await readdir(folder,{withFileTypes:true}).catch(x=>x.code==='ENOENT'?[]:Promise.reject(x))){
          const full=join(folder,e.name);
          // Do not traverse symlinked directories outside project storage.
          if(e.isDirectory())await walk(full);
          else if(e.isFile()){
            const rel=relative(this.dataRoot,full).replaceAll('\\','/');
            if(!listed.has(rel))orphans.push(rel);
          }else if(e.isSymbolicLink())unsafe.push(relative(this.dataRoot,full).replaceAll('\\','/'));
        }
      };
      await walk(root);
    }
    return {missing,corrupt,restored,orphans,unsafe};
  }

}

/**
 * Promote SP-04's fenced successful file to the domain scene pointer. Both
 * pointers and revision insertion commit in ONE SQLite transaction. Promotion
 * can be replayed safely after crash (unique job_id), unlike provider calls.
 * All generated assets are versioned and committed through this bridge.
 */
export async function promoteQueueAsset({manifest,jobId}) {
  const row=manifest.db.prepare(`SELECT a.*,j.status,j.kind AS job_kind,j.result_json
    FROM assets a JOIN jobs j ON j.id=a.job_id WHERE j.id=?`).get(jobId);
  if(!row || row.status!=='succeeded') throw new DomainError('QUEUE_ASSET_NOT_COMMITTED',409);
  const jobResult=JSON.parse(row.result_json||'null');
  const {sceneId,kind,providerId}=jobResult??{};
  if(!['voice','image','video'].includes(kind)||typeof sceneId!=='string') throw new DomainError('INVALID_JOB_RESULT');
  const scene=manifest.repo.getScene(sceneId);
  if(!scene) throw new DomainError('SCENE_NOT_FOUND',404);
  // A committed revision is immutable: replay may return it even when its
  // once-active intent has since been superseded or manually deselected.
  const committed=manifest.db.prepare('SELECT id FROM asset_revisions WHERE job_id=?').get(jobId);
  if(committed)return manifest.get(committed.id);
  // A stale voice job may have succeeded but must never replace current audio.
  // All pre-R2-03 voice jobs lack a safe immutable snapshot: fail closed.
  if(kind==='voice'&&(!jobResult?.voiceInputHash || !voiceIntentMatches(manifest.repo,
    {sceneId,videoId:scene.videoId,textSha256:jobResult.textSha256,
      configRevision:jobResult.configRevision,inputHash:jobResult.voiceInputHash},jobId)))
    throw new DomainError('STALE_VOICE_JOB',409);
  // A completed GPU call cannot override a newer user import or policy.
  if(kind==='video'&&row.job_kind==='scene:ai-video'&&(!jobResult?.inputHash||!new SceneClipService({
    repo:manifest.repo,manifest,store:null
  }).intentMatches({sceneId,inputHash:jobResult.inputHash},jobId)))
    throw new DomainError('STALE_VIDEO_JOB',409);
  if(kind==='image'&&(!jobResult?.imageInputHash||!imageIntentMatches(manifest.repo,
    {sceneId,videoId:scene.videoId,inputHash:jobResult.imageInputHash,
      sourceSha256:jobResult.sourceSha256,configRevision:jobResult.configRevision},jobId)))
    throw new DomainError('STALE_IMAGE_JOB',409);
  const resolved=resolve(row.file_path);
  if(!resolved.startsWith(manifest.dataRoot+sep)) throw new DomainError('UNSAFE_ASSET_PATH',403);
  const info=await lstat(resolved);
  if(!info.isFile()||info.isSymbolicLink()) throw new DomainError('INVALID_QUEUE_ASSET');
  const bytes=await readFile(resolved);
  const sha=createHash('sha256').update(bytes).digest('hex');
  if(sha!==row.checksum) throw new DomainError('ASSET_CHECKSUM_MISMATCH',409);
  const rel=relative(manifest.dataRoot,resolved).replaceAll('\\','/');
  return transact(manifest.db,()=>{
    const old=manifest.db.prepare('SELECT id FROM asset_revisions WHERE job_id=?').get(jobId);
    if(old) return manifest.get(old.id);
    // Repeat the snapshot check under SQLite's write lock: a replacement
    // intent arriving during filesystem verification cannot win a late race.
    if(kind==='voice'&&!voiceIntentMatches(manifest.repo,
      {sceneId,videoId:scene.videoId,textSha256:jobResult.textSha256,
        configRevision:jobResult.configRevision,inputHash:jobResult.voiceInputHash},jobId))
      throw new DomainError('STALE_VOICE_JOB',409);
    if(kind==='video'&&row.job_kind==='scene:ai-video'&&!new SceneClipService({repo:manifest.repo,manifest,store:null})
      .intentMatches({sceneId,inputHash:jobResult.inputHash},jobId))
      throw new DomainError('STALE_VIDEO_JOB',409);
    if(kind==='image'&&!imageIntentMatches(manifest.repo,
      {sceneId,videoId:scene.videoId,inputHash:jobResult.imageInputHash,
        sourceSha256:jobResult.sourceSha256,configRevision:jobResult.configRevision},jobId))
      throw new DomainError('STALE_IMAGE_JOB',409);
    const id=randomUUID();
    const metadata=kind==='video'?{queueJobId:jobId,inputHash:jobResult.inputHash,
      policyDigest:jobResult.policyDigest,configRevision:jobResult.configRevision,
      durationMs:jobResult.durationMs,width:jobResult.width,height:jobResult.height,
      fps:jobResult.fps,providerId:jobResult.providerId}:kind==='voice'?{queueJobId:jobId,inputHash:jobResult.voiceInputHash,
      textSha256:jobResult.textSha256,voice:jobResult.voice,rate:jobResult.rate,
      providerId:jobResult.providerId,fallbackUsed:jobResult.fallbackUsed===true,
      durationSec:jobResult.durationSec,durationMs:Math.round(jobResult.durationSec*1000),
      codec:jobResult.codec}: kind==='image'?{queueJobId:jobId,inputHash:jobResult.imageInputHash,
      sourceSha256:jobResult.sourceSha256,configRevision:jobResult.configRevision,
      workflowHash:jobResult.workflowHash,width:jobResult.width,height:jobResult.height,
      seed:jobResult.seed,providerId:jobResult.providerId}: {queueJobId:jobId};
    manifest.db.prepare(`INSERT INTO asset_revisions(id,video_id,scene_id,kind,source,file_path,sha256,bytes,state,metadata_json,created_at,job_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,scene.videoId,sceneId,kind,providerId||'unknown',rel,sha,bytes.length,'committed',JSON.stringify(metadata),Date.now(),jobId);
    const pointer=kind==='voice'?'voice_asset_id':'visual_asset_id';
    // Metadata must describe the actual probed clip; video source stays versioned.
    if(kind==='video'&&row.job_kind==='scene:ai-video'){
      const policy=new SceneClipService({repo:manifest.repo,manifest,store:null}).effective(sceneId).policy;
      if(policy.mediaType!=='ai_video')throw new DomainError('VIDEO_POLICY_STALE',409);
    }
    manifest.db.prepare(`UPDATE scenes SET ${pointer}=?,row_version=row_version+1,updated_at=? WHERE id=?`)
      .run(id,Date.now(),sceneId);
    if(kind==='video'&&row.job_kind==='scene:ai-video'){
      // Video/channel override may target an old image-motion scene; only
      // successful fenced promotion converts render's media_type to ai_video.
      manifest.db.prepare("UPDATE scenes SET media_type='ai_video' WHERE id=?").run(sceneId);
      manifest.db.prepare(`INSERT INTO scene_video_selections(scene_id,asset_id,selected_at)
        VALUES(?,?,?) ON CONFLICT(scene_id) DO UPDATE SET asset_id=excluded.asset_id,
        selected_at=excluded.selected_at`).run(sceneId,id,Date.now());
    }
    manifest.repo.event('asset',id,'queue.asset.promoted',{jobId,sceneId});
    return manifest.get(id);
  });
}

export async function promotePendingQueueAssets(manifest,{limit=100}={}) {
  // Failures are reported for investigation, never silently swallowed or auto-billed.
  const rows=manifest.db.prepare(`SELECT a.job_id FROM assets a JOIN jobs j ON j.id=a.job_id
    LEFT JOIN asset_revisions ar ON ar.job_id=a.job_id
    WHERE j.status='succeeded' AND ar.id IS NULL
      AND (j.kind<>'asset:voice' OR EXISTS (SELECT 1 FROM scene_voice_intents vi
        WHERE vi.job_id=j.id))
      AND (j.kind<>'asset:image' OR EXISTS (SELECT 1 FROM scene_image_intents ii
        WHERE ii.job_id=j.id)) LIMIT ?`).all(limit);
  const promoted=[],failed=[];
  for(const {job_id} of rows) {
    try {promoted.push((await promoteQueueAsset({manifest,jobId:job_id})).id);}
    catch (error) {failed.push({jobId:job_id,code:error.code||'PROMOTION_FAILED'});}
  }
  return {promoted,failed};
}
