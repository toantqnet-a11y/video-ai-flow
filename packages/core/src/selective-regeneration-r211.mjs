/** R2-11 — explicit one-scene voice OR image regeneration and safe voice undo.
 * Reuses R2-03/R2-05 jobs and immutable registry; never creates another queue.
 * No automatic fallback; each remote Edge invocation requires fresh consent.
 */
import {createHash} from 'node:crypto';
import {DomainError} from './domain.mjs';
import {transact} from './db.mjs';
import {regenerationOptionsHash} from './regeneration-options-r211.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keyRe=/^[A-Za-z0-9_-]{1,100}$/;
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');

export class SelectiveRegenerationR211 {
  constructor({repo,manifest,sceneVoices,sceneImages}){
    Object.assign(this,{repo,db:repo.db,manifest,sceneVoices,sceneImages});
  }
  check(sceneId){
    const scene=this.repo.getScene(sceneId);
    if(!scene)fail('SCENE_NOT_FOUND',404);
    const video=this.repo.getVideo(scene.videoId);
    if(!video||video.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
    return {scene,video};
  }
  /** A single concrete scene and kind: never mutate other assets/scenes.
   * key must be stable across retries but new for each deliberate regeneration.
   */
  async regenerate(sceneId,body){
    if(!plain(body)||Object.keys(body).some(k=>!['kind','requestKey','expectedRowVersion','options'].includes(k))||
      !['voice','image'].includes(body.kind)||!keyRe.test(body.requestKey??'')||
      !Number.isSafeInteger(body.expectedRowVersion)||body.expectedRowVersion<1||
      !plain(body.options))fail('INVALID_SELECTIVE_REGENERATION');
    const {scene,video}=this.check(sceneId);
    // Inspect immutable jobs BEFORE scheduling, including after a crash or
    // an already-completed promotion that bumped rowVersion. Keys can never
    // be reused with different options or a now-edited source/config.
    const previous=this.db.prepare(`SELECT id,kind,status,payload_json FROM jobs
      WHERE kind IN ('asset:voice','asset:image')
      AND json_extract(payload_json,'$.sceneId')=?
      AND json_extract(payload_json,'$.regenerationKey')=?
      ORDER BY created_at DESC LIMIT 1`).get(sceneId,body.requestKey);
    if(previous){
      let snapshot;
      try{snapshot=JSON.parse(previous.payload_json)}catch{fail('REGENERATION_KEY_CONFLICT',409)}
      if(previous.kind!==`asset:${body.kind}`||
        snapshot.regenerationOptionsHash!==regenerationOptionsHash(body.options)||
        snapshot.configRevision!==video.configRevision||
        (body.kind==='voice'&&snapshot.textSha256!==sha(scene.text))||
        (body.kind==='image'&&snapshot.sourceSha256!==
          sha(JSON.stringify({text:scene.text,visualPrompt:scene.visualPrompt,mediaType:scene.mediaType}))))
        fail('REGENERATION_KEY_CONFLICT',409);
      return {sceneId,kind:body.kind,requestKey:body.requestKey,
        state:previous.status,cached:false,reused:true,jobId:previous.id};
    }
    if(scene.rowVersion!==body.expectedRowVersion)fail('SCENE_ROW_VERSION_CONFLICT',409);
    // Input hash incorporates the stable key so regeneration doesn't return
    // the older successful provider job just because the prompt is identical.
    const options={...body.options,regenerationKey:body.requestKey};
    const output=body.kind==='voice'?await this.sceneVoices.queue(sceneId,options):
      await this.sceneImages.queue(sceneId,options);
    return {sceneId,kind:body.kind,requestKey:body.requestKey,
      state:output.state,cached:output.cached===true,reused:output.reused===true,
      jobId:output.job?.id??null};
  }
  /** Re-activate a verified OLD voice without synthesizing audio.
   * Unlike image selection, voice must match current text/config to prevent
   * a previously spoken but now incorrect narration from silently playing.
   */
  async selectVoice(sceneId,body){
    if(!plain(body)||Object.keys(body).some(k=>!['assetId','expectedRowVersion'].includes(k))||
      typeof body.assetId!=='string'||!keyRe.test(body.assetId)||
      !Number.isSafeInteger(body.expectedRowVersion)||body.expectedRowVersion<1)
      fail('INVALID_VOICE_SELECTION');
    const {scene,video}=this.check(sceneId);
    const prior=this.db.prepare('SELECT job_id,input_hash FROM scene_voice_intents WHERE scene_id=?').get(sceneId);
    const asset=this.manifest.get(body.assetId);
    if(!asset||asset.sceneId!==sceneId||asset.kind!=='voice'||asset.state!=='committed')
      fail('VOICE_REVISION_NOT_FOUND',404);
    if(await this.manifest.verifyRevision(asset.id)!=='healthy')fail('VOICE_REVISION_UNHEALTHY',409);
    const meta=asset.metadata??{};
    if(meta.textSha256!==sha(scene.text)||!meta.queueJobId||!meta.inputHash)
      fail('VOICE_REVISION_STALE',409);
    // Load authoritative original snapshot from immutable completed job.
    const job=this.db.prepare('SELECT status,payload_json FROM jobs WHERE id=?').get(meta.queueJobId);
    if(!job||job.status!=='succeeded')fail('VOICE_REVISION_UNVERIFIED',409);
    let payload;
    try{payload=JSON.parse(job.payload_json)}catch{fail('VOICE_REVISION_UNVERIFIED',409)}
    if(payload.sceneId!==sceneId||payload.videoId!==scene.videoId||
      payload.inputHash!==meta.inputHash||payload.textSha256!==meta.textSha256||
      payload.configRevision!==video.configRevision)fail('VOICE_REVISION_STALE',409);
    // No asynchronous work after this point: DB is locked for pointer +
    // current intent promotion; concurrent requests fail rather than clobber.
    transact(this.db,()=>{
      const live=this.repo.getScene(sceneId);
      const liveVideo=this.repo.getVideo(scene.videoId);
      const intent=this.db.prepare('SELECT job_id,input_hash FROM scene_voice_intents WHERE scene_id=?').get(sceneId);
      if(!live||live.rowVersion!==body.expectedRowVersion||live.text!==scene.text||
        liveVideo?.configRevision!==video.configRevision||
        (intent?.job_id??null)!==(prior?.job_id??null)||
        (intent?.input_hash??null)!==(prior?.input_hash??null))
        fail('VOICE_SELECTION_CONFLICT',409);
      this.db.prepare('UPDATE scenes SET voice_asset_id=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?')
        .run(asset.id,Date.now(),sceneId,body.expectedRowVersion);
      this.db.prepare(`INSERT INTO scene_voice_intents
        (scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,fallback_provider_id,fallback_voice_id,requested_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(scene_id) DO UPDATE SET
        job_id=excluded.job_id,input_hash=excluded.input_hash,text_sha256=excluded.text_sha256,
        config_revision=excluded.config_revision,provider_id=excluded.provider_id,
        voice_id=excluded.voice_id,rate=excluded.rate,fallback_provider_id=excluded.fallback_provider_id,
        fallback_voice_id=excluded.fallback_voice_id,requested_at=excluded.requested_at`)
        .run(sceneId,meta.queueJobId,meta.inputHash,meta.textSha256,payload.configRevision,
          payload.providerId,payload.voice,payload.rate,payload.fallbackProvider??null,
          payload.fallbackVoice??null,Date.now());
      this.repo.event('asset',asset.id,'voice.revision.restored',{sceneId});
    });
    return {sceneId,assetId:asset.id,selected:true,regenerated:false};
  }
}
