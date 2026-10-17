/**
 * R2-03 / EP06: durable per-scene Edge TTS requests.
 *
 * Requests pin narration text, voice identity, rate and configuration revision
 * before joining the single SP-04 queue. The public status API exposes only
 * safe metadata; text is never echoed through SSE or the job-status endpoint.
 * Repeating a batch request reuses the same jobs and never re-bills/re-synthesizes
 * a valid asset. Edge TTS is ONLINE and unofficial: request-specific remote
 * consent is mandatory, and its availability/free access is not guaranteed.
 */
import {createHash,randomUUID} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {DomainError} from '../../../packages/core/src/domain.mjs';
import {EDGE_VOICES} from '../../../spikes/SP-02/src/edge.js';
import {publicJob} from './job-center.mjs';

const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const error=(code,status=400)=>{throw new DomainError(code,status)};
const keyOk=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
const voiceIds=new Set(EDGE_VOICES.map(v=>v.id));

export function voiceFingerprint({text,voice,rate}){
  // Canonical hash is based on actual TTS output inputs, NOT a mutable scene
  // rowVersion: promoting an image asset must not invalidate a voice cache.
  return hash(['edge',text,voice,rate,'r2-03-v1']);
}

export function validateVoiceBatch(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!
    ['sceneIds','voice','rate','remoteConsent','requestKey','expectedSceneRevision'].includes(k)))error('VOICE_BATCH_INVALID');
  if(!Array.isArray(body.sceneIds)||body.sceneIds.length<1||body.sceneIds.length>50||
    new Set(body.sceneIds).size!==body.sceneIds.length||body.sceneIds.some(x=>!keyOk(x)))error('VOICE_SCENES_INVALID');
  if(!keyOk(body.requestKey))error('VOICE_REQUEST_KEY_INVALID');
  if(body.voice!==undefined&&!voiceIds.has(body.voice))error('VOICE_ID_UNSUPPORTED');
  if(body.rate!==undefined&&(!Number.isInteger(body.rate)||body.rate< -50||body.rate>100))error('VOICE_RATE_INVALID');
  if(body.expectedSceneRevision!==undefined&&(!Number.isSafeInteger(body.expectedSceneRevision)||body.expectedSceneRevision<0))error('VOICE_SCENE_REVISION_INVALID');
  if(body.remoteConsent!==true)error('REMOTE_CONSENT_REQUIRED',403);
  return body;
}

/** A cached asset is trusted only if its bytes still match the DB checksum. */
async function activeVoiceAsset(manifest,scene,inputHash){
  if(!scene.voiceAssetId||!manifest?.get)return null;
  const entry=manifest.get(scene.voiceAssetId);
  if(!entry||entry.kind!=='voice'||entry.state!=='committed'||entry.metadata?.inputHash!==inputHash)return null;
  const path=resolve(manifest.dataRoot,entry.relativePath);
  if(!path.startsWith(resolve(manifest.dataRoot)+sep))return null;
  try{
    const stat=await lstat(path);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.bytes)return null;
    if(hash(await readFile(path))!==entry.checksum)return null;
    return {assetId:entry.id,durationMs:entry.metadata.durationMs};
  }catch{return null}
}

export class SceneVoiceService {
  constructor({repo,store,manifest,clock=()=>Date.now()}={}){
    if(!repo||!store||!manifest)throw Error('VOICE_SERVICE_DEPENDENCY_MISSING');
    this.repo=repo;this.store=store;this.manifest=manifest;this.clock=clock;
  }
  /** Queue up to 50 scenes; return no script text, prompts or machine paths. */
  async request(videoId,untrusted){
    const body=validateVoiceBatch(untrusted);
    const video=this.repo.getVideo(videoId);
    if(!video)error('VIDEO_NOT_FOUND',404);
    const source=this.repo.db.prepare('SELECT revision FROM scene_build_state WHERE video_id=?').get(videoId);
    if(body.expectedSceneRevision!==undefined&&body.expectedSceneRevision!==(source?.revision??0))error('VOICE_SCENE_REVISION_CONFLICT',409);
    const voice=body.voice??video.effectivePreset.voice.voice;
    if(!voiceIds.has(voice))error('VOICE_ID_UNSUPPORTED');
    const rate=body.rate??Math.round((video.effectivePreset.voice.speed-1)*100);
    if(!Number.isInteger(rate)||rate< -50||rate>100)error('VOICE_RATE_INVALID');
    if(video.effectivePreset.voice.provider!=='edge')error('VOICE_PROVIDER_NOT_EDGE',409);
    const inputs=body.sceneIds.map(sceneId=>{
      const scene=this.repo.getScene(sceneId);
      if(!scene||scene.videoId!==videoId)error('VOICE_SCENE_NOT_FOUND',404);
      if(!scene.text?.trim()||scene.text.length>4000||scene.text.includes('\0'))error('VOICE_TEXT_UNSUPPORTED',422);
      return {scene,inputHash:voiceFingerprint({text:scene.text,voice,rate}),sourceHash:hash(scene.text)};
    });
    const batchHash=hash([videoId,voice,rate,video.configRevision,source?.revision??0,
      inputs.map(x=>[x.scene.id,x.inputHash])]);
    const old=this.repo.db.prepare('SELECT * FROM scene_voice_batches WHERE video_id=? AND request_key=?').get(videoId,body.requestKey);
    if(old&&old.batch_hash!==batchHash)error('VOICE_REQUEST_CONFLICT',409);
    const batchId=old?.id??randomUUID(),createdAt=this.clock();
    if(!old)this.repo.db.prepare(`INSERT INTO scene_voice_batches(id,video_id,request_key,batch_hash,created_at)
      VALUES(?,?,?,?,?)`).run(batchId,videoId,body.requestKey,batchHash,createdAt);
    const jobs=[];
    for(const {scene,inputHash,sourceHash} of inputs){
      // Cached or queued work shares a content-derived key, independent of the
      // HTTP request key, so a different UI retry cannot duplicate synthesis.
      const existing=await activeVoiceAsset(this.manifest,scene,inputHash);
      if(existing){jobs.push({sceneId:scene.id,state:'cached',assetId:existing.assetId,durationMs:existing.durationMs});continue;}
      const payload={projectId:videoId,sceneId:scene.id,kind:'voice',revisionId:inputHash,inputHash,
        sourceHash,configRevision:video.configRevision,sceneRevision:source?.revision??0,
        text:scene.text,voice,rate,remoteConsent:true};
      const queued=this.store.enqueue({key:`voice:${scene.id}:${inputHash}`,kind:'asset:voice',payload,maxAttempts:3});
      this.repo.db.prepare(`INSERT OR IGNORE INTO scene_voice_jobs(batch_id,scene_id,job_id,input_hash,created_at)
        VALUES(?,?,?,?,?)`).run(batchId,scene.id,queued.job.id,inputHash,createdAt);
      jobs.push({sceneId:scene.id,state:queued.job.status,job:publicJob(queued.job),reused:queued.reused});
    }
    return {batchId,videoId,sceneCount:inputs.length,jobs};
  }
  /** Status is derived from durable JobStore; never return its payload. */
  status(videoId,batchId){
    if(!this.repo.getVideo(videoId))error('VIDEO_NOT_FOUND',404);
    const batch=this.repo.db.prepare('SELECT id,video_id,created_at FROM scene_voice_batches WHERE video_id=? AND id=?').get(videoId,batchId);
    if(!batch)error('VOICE_BATCH_NOT_FOUND',404);
    const jobs=this.repo.db.prepare('SELECT scene_id,job_id FROM scene_voice_jobs WHERE batch_id=? ORDER BY created_at,scene_id').all(batchId);
    return {batchId,videoId,createdAt:batch.created_at,jobs:jobs.map(row=>({sceneId:row.scene_id,
      job:publicJob(this.store.get(row.job_id)),assetId:this.repo.getScene(row.scene_id)?.voiceAssetId??null}))};
  }
}

/** Worker rejects obsolete input BEFORE performing an external TTS call. */
export function createSceneVoiceJobHandler({repo,registry,dataRoot,probeOverride=null}={}){
  if(!repo||!registry||!dataRoot)throw Error('VOICE_HANDLER_DEPENDENCY_MISSING');
  return async(payload,{signal}={})=>{
    if(!payload||payload.kind!=='voice'||!voiceIds.has(payload.voice)||!Number.isInteger(payload.rate)||
      !payload.inputHash||!payload.sourceHash||payload.remoteConsent!==true||
      voiceFingerprint({text:payload.text,voice:payload.voice,rate:payload.rate})!==payload.inputHash)
      throw Object.assign(new Error('VOICE_JOB_INVALID'),{code:'VOICE_JOB_INVALID',retryable:false});
    const scene=repo.getScene(payload.sceneId),video=scene&&repo.getVideo(scene.videoId);
    if(!scene||!video||video.id!==payload.projectId||hash(scene.text)!==payload.sourceHash||
      video.configRevision!==payload.configRevision)
      throw Object.assign(new Error('VOICE_SOURCE_STALE'),{code:'VOICE_SOURCE_STALE',retryable:false});
    const produced=await registry.invoke('edge',payload,{signal,allowRemote:true});
    const relativePath=resolve(produced.path),safeRoot=resolve(dataRoot);
    if(!relativePath.startsWith(safeRoot+sep))
      throw Object.assign(new Error('UNSAFE_VOICE_OUTPUT'),{code:'UNSAFE_VOICE_OUTPUT',retryable:false});
    const meta=produced.metadata;
    // This duration is verified by ffprobe inside SP-02 TtsService, not WPM.
    // Missing/untrusted duration must never become the authoritative timeline.
    const durationSec=probeOverride?await probeOverride(relativePath):meta?.durationSec;
    const durationMs=Math.round(durationSec*1000);
    if(!Number.isSafeInteger(durationMs)||durationMs<100||durationMs>300000)
      throw Object.assign(new Error('VOICE_DURATION_INVALID'),{code:'VOICE_DURATION_INVALID',retryable:false});
    const bytes=await readFile(relativePath);
    if(!bytes.length||bytes.length>32_000_000)
      throw Object.assign(new Error('VOICE_OUTPUT_INVALID'),{code:'VOICE_OUTPUT_INVALID',retryable:false});
    return {result:{sceneId:scene.id,kind:'voice',providerId:'edge',inputHash:payload.inputHash,
      sourceHash:payload.sourceHash,configRevision:payload.configRevision,
      voice:payload.voice,rate:payload.rate,durationMs},
      asset:{logicalKey:`voice:${scene.id}:${payload.inputHash}`,filePath:relativePath,checksum:hash(bytes)}};
  };
}
