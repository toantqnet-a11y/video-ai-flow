/**
 * R2-03: durable scene narration intent and asset cache. No network in this file.
 * An immutable queue job carries text+config snapshots; only the most recent
 * intent may become the scene's active voice. Existing assets are immutable.
 */
import {createHash} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {detectAudioFormat} from '../../../spikes/SP-02/src/audio.js';
import {resolve,sep} from 'node:path';
import {DomainError} from './domain.mjs';
import {transact} from './db.mjs';
import {regenerationOptionsHash} from './regeneration-options-r211.mjs';

const bad=(code,status=400)=>{throw new DomainError(code,status)};
const sha=value=>createHash('sha256').update(value,'utf8').digest('hex');
const ID=/^[a-zA-Z0-9_.-]{1,100}$/;
export const EDGE_VOICE_IDS=Object.freeze(['vi-VN-HoaiMyNeural','vi-VN-NamMinhNeural']);

/** Canonical R2-04 snapshot: fallback is a *request-specific* opt-in.
 * Local voices are injected from operator configuration, never from a client
 * URL or the historical channel preset. A local provider cannot fallback remote.
 */
export function voiceSnapshot(scene,video,body={},localVoices={}){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!
    ['provider','voice','speed','remoteConsent','idempotencyKey','fallbackProvider','fallbackVoice','regenerationKey'].includes(k)))bad('INVALID_VOICE_REQUEST');
  const provider=body.provider??'edge';
  if(!['edge','piper','vieneu'].includes(provider))bad('UNSUPPORTED_VOICE_PROVIDER');
  if(provider==='edge'&&body.remoteConsent!==true)bad('REMOTE_CONSENT_REQUIRED',403);
  if(body.remoteConsent!==undefined&&typeof body.remoteConsent!=='boolean')bad('INVALID_REMOTE_CONSENT');
  if(typeof scene.text!=='string'||!scene.text.trim()||scene.text.length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(scene.text))bad('INVALID_SCENE_VOICE_TEXT',422);
  const configured=localVoices[provider];
  if(provider!=='edge'&&!configured)bad('LOCAL_TTS_NOT_CONFIGURED',503);
  const voice=body.voice??(provider==='edge'?video.effectivePreset?.voice?.voice:configured);
  const speed=body.speed??video.effectivePreset?.voice?.speed;
  if(typeof voice!=='string'||!ID.test(voice)||
    (provider==='edge'&&!EDGE_VOICE_IDS.includes(voice))||
    (provider!=='edge'&&voice!==configured))bad('INVALID_VOICE_ID');
  if(typeof speed!=='number'||!Number.isFinite(speed)||speed<0.5||speed>2)bad('INVALID_VOICE_SPEED');
  if(body.idempotencyKey!==undefined&&(typeof body.idempotencyKey!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.idempotencyKey)))bad('INVALID_IDEMPOTENCY_KEY');
  // A user-triggered regeneration key makes a NEW immutable job/version, even
  // if the script and model settings are unchanged. Replaying the same key is safe.
  if(body.regenerationKey!==undefined&&(typeof body.regenerationKey!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.regenerationKey)))bad('INVALID_REGENERATION_KEY');
  const fallbackProvider=body.fallbackProvider??null;
  if(fallbackProvider!==null&&(!['piper','vieneu'].includes(fallbackProvider)||provider!=='edge'))bad('INVALID_VOICE_FALLBACK');
  if(fallbackProvider&&!localVoices[fallbackProvider])bad('LOCAL_TTS_NOT_CONFIGURED',503);
  if(!fallbackProvider&&body.fallbackVoice!==undefined)bad('INVALID_VOICE_FALLBACK');
  const fallbackVoice=fallbackProvider?(body.fallbackVoice??localVoices[fallbackProvider]):null;
  if(fallbackProvider&&(typeof fallbackVoice!=='string'||!ID.test(fallbackVoice)||
    fallbackVoice!==localVoices[fallbackProvider]))bad('INVALID_FALLBACK_VOICE');
  const rate=Math.round((speed-1)*100),textSha256=sha(scene.text);
  const inputHash=sha(JSON.stringify({sceneId:scene.id,videoId:scene.videoId,
    textSha256,configRevision:video.configRevision,provider,voice,rate,fallbackProvider,fallbackVoice,
    ...(body.regenerationKey?{regenerationKey:body.regenerationKey}:{})}));
  return {sceneId:scene.id,projectId:scene.videoId,videoId:scene.videoId,
    text:scene.text,textSha256,configRevision:video.configRevision,providerId:provider,
    voice,rate,inputHash,remoteConsent:provider==='edge'&&body.remoteConsent===true,
    fallbackProvider,fallbackVoice,
    ...(body.regenerationKey?{regenerationKey:body.regenerationKey,regenerationOptionsHash:regenerationOptionsHash(body)}:{})};
}

export function voiceIntentMatches(repo,snapshot,jobId){
  const scene=repo.getScene(snapshot.sceneId),video=scene&&repo.getVideo(scene.videoId);
  if(!scene||!video||scene.videoId!==snapshot.videoId||video.configRevision!==snapshot.configRevision||
    sha(scene.text)!==snapshot.textSha256)return false;
  const row=repo.db.prepare('SELECT * FROM scene_voice_intents WHERE scene_id=?').get(scene.id);
  return Boolean(row&&row.job_id===jobId&&row.input_hash===snapshot.inputHash&&
    row.text_sha256===snapshot.textSha256&&row.config_revision===snapshot.configRevision);
}

export class SceneVoiceRepository {
  constructor(repo,{store,manifest,localVoices={}}){this.repo=repo;this.db=repo.db;this.store=store;this.manifest=manifest;this.localVoices=localVoices;}
  check(sceneId){
    const scene=this.repo.getScene(sceneId);if(!scene)bad('SCENE_NOT_FOUND',404);
    const video=this.repo.getVideo(scene.videoId);if(!video||video.deletedAt!==null)bad('VIDEO_NOT_FOUND',404);
    return {scene,video};
  }
  async validCurrentAsset(scene){
    if(!scene.voiceAssetId)return null;
    const asset=this.manifest.get(scene.voiceAssetId);
    if(!asset||asset.sceneId!==scene.id||asset.kind!=='voice'||asset.state!=='committed')return null;
    const path=resolve(this.manifest.dataRoot,asset.relativePath);
    if(!path.startsWith(this.manifest.dataRoot+sep))return null;
    try{const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==asset.bytes)return null;
      if(createHash('sha256').update(await readFile(path)).digest('hex')!==asset.checksum)return null;
    }catch{return null;}
    return asset;
  }
  /** Return existing asset only if its frozen input matches the requested input. */
  async queue(sceneId,body){
    const {scene,video}=this.check(sceneId),snapshot=voiceSnapshot(scene,video,body,this.localVoices);
    const cached=await this.validCurrentAsset(scene);
    if(cached?.metadata?.inputHash===snapshot.inputHash){
      // Restore the matching intent if an unfinished newer request was queued
      // but the operator deliberately switched back to the current file.
      this.enqueueSnapshot(snapshot);
      return {state:'cached',cached:true,reused:true,
        asset:{id:cached.id,source:cached.source,durationMs:cached.metadata.durationMs},job:null};
    }
    return this.enqueueSnapshot(snapshot);
  }
  enqueueWithoutCache(sceneId,body){
    const {scene,video}=this.check(sceneId);
    return this.enqueueSnapshot(voiceSnapshot(scene,video,body,this.localVoices));
  }
  enqueueSnapshot(snapshot){
    const key=`scene-voice:${snapshot.sceneId}:${snapshot.inputHash}`;
    // The idempotency key depends ONLY on canonical provider input, not a
    // caller-generated key; reopening the screen never repeats a paid/remote call.
    const {job,reused}=this.store.enqueue({key,kind:'asset:voice',payload:snapshot,maxAttempts:3});
    transact(this.db,()=>this.db.prepare(`INSERT INTO scene_voice_intents
      (scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,fallback_provider_id,fallback_voice_id,requested_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(scene_id) DO UPDATE SET job_id=excluded.job_id,
      input_hash=excluded.input_hash,text_sha256=excluded.text_sha256,
      config_revision=excluded.config_revision,provider_id=excluded.provider_id,
      voice_id=excluded.voice_id,rate=excluded.rate,
      fallback_provider_id=excluded.fallback_provider_id,fallback_voice_id=excluded.fallback_voice_id,
      requested_at=excluded.requested_at`)
      .run(snapshot.sceneId,job.id,snapshot.inputHash,snapshot.textSha256,snapshot.configRevision,
        snapshot.providerId,snapshot.voice,snapshot.rate,
        snapshot.fallbackProvider,snapshot.fallbackVoice,Date.now()));
    return {state:'queued',cached:false,reused,job:{id:job.id,kind:job.kind,status:job.status,attempt:job.attempt}};
  }
  async status(sceneId){
    const {scene}=this.check(sceneId);
    const intent=this.db.prepare('SELECT * FROM scene_voice_intents WHERE scene_id=?').get(sceneId);
    const job=intent?this.store.get(intent.job_id):null;
    const asset=await this.validCurrentAsset(scene);
    const current=Boolean(asset&&intent&&asset.metadata?.inputHash===intent.input_hash&&
      voiceIntentMatches(this.repo,{sceneId,videoId:scene.videoId,textSha256:intent.text_sha256,
        configRevision:intent.config_revision,inputHash:intent.input_hash},intent.job_id));
    // A previously generated asset is NOT current just because a file exists.
    // The frontend must not show old audio as the selected new voice.
    return {sceneId,estimatedDurationMs:scene.durationMs,voiceAsset:current?{
      id:asset.id,source:asset.source,format:asset.relativePath.endsWith('.mp3')?'mp3':'wav',
      durationMs:asset.metadata.durationMs,codec:asset.metadata.codec,
      provider:asset.metadata.providerId??asset.source,voice:asset.metadata.voice,
      fallbackUsed:asset.metadata.fallbackUsed===true}:null,
      durationMs:current&&Number.isFinite(asset.metadata?.durationMs)?asset.metadata.durationMs:null,
      job:job?{id:job.id,status:job.status,attempt:job.attempt,kind:job.kind}:null,
      state:current?'ready':job?.status??'not_generated',stale:!!asset&&!current};
  }
  async audio(sceneId){
    const status=await this.status(sceneId);
    if(!status.voiceAsset)bad('VOICE_NOT_READY',404);
    const asset=this.manifest.get(status.voiceAsset.id);
    const path=resolve(this.manifest.dataRoot,asset.relativePath);
    if(!path.startsWith(this.manifest.dataRoot+sep))bad('UNSAFE_ASSET_PATH',403);
    const bytes=await readFile(path).catch(()=>bad('VOICE_NOT_READY',404));
    if(bytes.length>12_000_000||bytes.length<44||
      sha(bytes)!==asset.checksum)bad('VOICE_AUDIO_CORRUPT',409);
    const format=detectAudioFormat(bytes);
    // Re-check intent, since the user may have requested a newer voice while
    // this large file was being read from disk.
    const current=await this.status(sceneId);
    if(current.voiceAsset?.id!==asset.id)bad('VOICE_NOT_READY',409);
    return {bytes,format};
  }
  async batch(videoId,body){
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!
      ['sceneIds','provider','voice','speed','remoteConsent','fallbackProvider','fallbackVoice'].includes(k)))bad('INVALID_VOICE_BATCH');
    if(!Array.isArray(body.sceneIds)||body.sceneIds.length<1||body.sceneIds.length>50||
      new Set(body.sceneIds).size!==body.sceneIds.length)bad('INVALID_VOICE_BATCH');
    const video=this.repo.getVideo(videoId);if(!video||video.deletedAt!==null)bad('VIDEO_NOT_FOUND',404);
    // Validate all scene ownership and voice parameters BEFORE the first
    // enqueue; a foreign last scene must not leave a partial batch behind.
    const scenes=body.sceneIds.map(id=>this.check(id).scene);
    if(scenes.some(s=>s.videoId!==videoId))bad('VOICE_SCENE_SCOPE_MISMATCH',404);
    scenes.forEach(s=>voiceSnapshot(s,video,{provider:body.provider,voice:body.voice,
      speed:body.speed,remoteConsent:body.remoteConsent,
      fallbackProvider:body.fallbackProvider,fallbackVoice:body.fallbackVoice},this.localVoices));
    const items=[];
    for(const sceneId of body.sceneIds){
      items.push({sceneId,...await this.queue(sceneId,{provider:body.provider,voice:body.voice,speed:body.speed,remoteConsent:body.remoteConsent,
        fallbackProvider:body.fallbackProvider,fallbackVoice:body.fallbackVoice})});
    }
    return {items};
  }
}
