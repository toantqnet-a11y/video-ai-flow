import {orderedTimelineScenes} from './timeline-editor-r302.mjs';
/**
 * R2-EXT-01 — render-engine-neutral composition v1. No renderer, AI dispatch,
 * FFmpeg invocation or paid-provider decisions are permitted in this module.
 * Snapshots pin immutable asset IDs and hashes; a renderer MUST recheck SHA-256
 * and scene intent at dispatch, because SQLite cannot lock filesystem bytes.
 */
import {createHash} from 'node:crypto';
import {DomainError} from './domain.mjs';
import {transact} from './db.mjs';
import {validateTimedComposition} from './composition-timing-r2ext02.mjs';

export const COMPOSITION_SCHEMA_VERSION=1;
const fail=(code,status=400)=>{throw new DomainError(code,status)};
const sha=value=>createHash('sha256').update(value,'utf8').digest('hex');
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const whole=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const hashOk=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9-]{1,100}$/.test(s);
const ratios={'16:9':[16,9],'9:16':[9,16],'1:1':[1,1]};
const supportedSizes=new Set(['1280x720','1920x1080','3840x2160','720x1280','1080x1920','1080x1080']);

/** Canonical recursive JSON key ordering, preserving Unicode and array order. */
export function stableCompositionJson(value){
  if(Array.isArray(value))return `[${value.map(v=>v===undefined?'null':stableCompositionJson(v)).join(',')}]`;
  if(plain(value))return `{${Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${stableCompositionJson(value[k])}`).join(',')}}`;
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  fail('INVALID_COMPOSITION_JSON');
}
export const compositionDigest=payload=>sha(stableCompositionJson(payload));
export function framesFromMs(ms,fps){
  if(!whole(ms,1,14400000)||![24,25,30,60].includes(fps))fail('INVALID_COMPOSITION_TIMING');
  // Ceil avoids zero-frame scenes and avoids floating rounding drift in JS.
  return Math.ceil(ms*fps/1000);
}
function profileFrom(preset,override){
  if(override!==undefined&&(!plain(override)||Object.keys(override).some(k=>!['width','height','fps'].includes(k))))fail('INVALID_COMPOSITION_PROFILE');
  const {width,height,fps}={...preset.render,...override};
  const aspectRatio=Object.keys(ratios).find(r=>width*ratios[r][1]===height*ratios[r][0]);
  if(!whole(width,1,3840)||!whole(height,1,2160)||!supportedSizes.has(`${width}x${height}`)||
    ![24,25,30,60].includes(fps)||!aspectRatio||aspectRatio!==preset.media.aspectRatio)fail('INVALID_COMPOSITION_PROFILE');
  return {width,height,fps,aspectRatio,codec:'h264'};
}
function pin(asset,scene,kind){
  if(!asset||asset.sceneId!==scene.id||asset.videoId!==scene.videoId||asset.kind!==kind||
    !hashOk(asset.checksum)||!whole(asset.bytes,1,104857600)||asset.state!=='committed'||
    typeof asset.relativePath!=='string'||asset.relativePath.startsWith('/')||
    asset.relativePath.includes('\\')||asset.relativePath.split('/').includes('..'))return null;
  return {id:asset.id,kind:asset.kind,sha256:asset.checksum,bytes:asset.bytes,
    relativePath:asset.relativePath};
}
const failIf=(flag,code)=>{if(flag)fail(code,409)};
const exactKeys=(obj,keys)=>plain(obj)&&Object.keys(obj).every(key=>keys.includes(key))&&keys.every(key=>Object.hasOwn(obj,key));
/** Shape validation is intentionally independent of npm/Ajv so Windows local
 * installs and future alternative rendering engines share the exact same gate.
 */
export function validateComposition(document){
  if(!exactKeys(document,['schemaVersion','videoId','source','profile','scenes','totalFrames','readiness','digest'])||document.schemaVersion!==1||!validId(document.videoId)||
    !exactKeys(document.source,['videoRowVersion','configRevision','sceneRevision','timelineRowVersion','scriptSha256'])||!whole(document.source.videoRowVersion,1,1e9)||
    !whole(document.source.configRevision,1,1e9)||!whole(document.source.sceneRevision,0,1e9)||
    !whole(document.source.timelineRowVersion,1,1e9)||
    !hashOk(document.source.scriptSha256)||!exactKeys(document.profile,['width','height','fps','aspectRatio','codec'])||
    !exactKeys(document.readiness,['ready','blockers'])||!Array.isArray(document.readiness.blockers)||
    typeof document.readiness.ready!=='boolean'||!Array.isArray(document.scenes)||
    !document.scenes.length||document.scenes.length>1200||!whole(document.totalFrames,1,864000))
    fail('INVALID_COMPOSITION');
  if(!hashOk(document.digest))fail('INVALID_COMPOSITION_DIGEST');
  const {profile:p}=document;
  if(!supportedSizes.has(`${p.width}x${p.height}`)||!ratios[p.aspectRatio]||
    p.width*ratios[p.aspectRatio][1]!==p.height*ratios[p.aspectRatio][0]||
    ![24,25,30,60].includes(p.fps)||p.codec!=='h264')fail('INVALID_COMPOSITION_PROFILE');
  let cursor=0;const seen=new Set();
  for(const [index,s] of document.scenes.entries()){
    if(!exactKeys(s,['id','index','sceneRowVersion','text','textSha256','mediaType','startFrame','endFrame','durationMs','durationFrames','durationBasis','voice','visual','captions'])||!validId(s.id)||seen.has(s.id)||s.index!==index||
      !whole(s.sceneRowVersion,1,1e9)||typeof s.text!=='string'||!s.text.trim()||
      !hashOk(s.textSha256)||sha(s.text)!==s.textSha256||
      !['image_motion','ai_video','import_video'].includes(s.mediaType)||
      !whole(s.durationMs,500,120000)||s.durationFrames!==framesFromMs(s.durationMs,p.fps)||
      s.startFrame!==cursor||s.endFrame!==cursor+s.durationFrames||
      s.durationBasis!=='scene_estimate'||!exactKeys(s.voice,['asset','measuredDurationMs'])||!exactKeys(s.visual,['kind','motion','asset'])||!exactKeys(s.captions,['mode','source','cues']))fail('INVALID_COMPOSITION_SCENE');
    seen.add(s.id);cursor=s.endFrame;
    const validatePin=(asset,kind)=>{
      if(asset===null)return;
      if(!exactKeys(asset,['id','kind','sha256','bytes','relativePath'])||!validId(asset.id)||asset.kind!==kind||!hashOk(asset.sha256)||
        !whole(asset.bytes,1,104857600)||typeof asset.relativePath!=='string'||
        !asset.relativePath||asset.relativePath.startsWith('/')||asset.relativePath.includes('\\')||
        asset.relativePath.split('/').includes('..'))fail('INVALID_COMPOSITION_ASSET');
    };
    validatePin(s.voice.asset,'voice');
    validatePin(s.visual.asset,s.mediaType==='image_motion'?'image':'video');
    if(!['none','ken_burns','zoom','pan'].includes(s.visual.motion)||
      !['image','video'].includes(s.visual.kind)||
      s.visual.kind!==(s.mediaType==='image_motion'?'image':'video')||
      s.captions.mode!=='scene_estimate'||s.captions.source!=='scene_text'||
      !Array.isArray(s.captions.cues)||s.captions.cues.length!==1||
      !exactKeys(s.captions.cues[0],['text','startFrame','endFrame'])||s.captions.cues[0]?.text!==s.text||s.captions.cues[0]?.startFrame!==0||
      s.captions.cues[0]?.endFrame!==s.durationFrames)fail('INVALID_COMPOSITION_CAPTIONS');
    if(s.voice.measuredDurationMs!==null&&(!whole(s.voice.measuredDurationMs,1,14400000)||s.voice.asset===null))
      fail('INVALID_COMPOSITION_VOICE_DURATION');
  }
  if(cursor!==document.totalFrames)fail('INVALID_COMPOSITION_TOTAL_FRAMES');
  if(document.readiness.ready!==!document.readiness.blockers.length)fail('INVALID_COMPOSITION_READINESS');
  for(const b of document.readiness.blockers){
    if(!exactKeys(b,['sceneId','code'])||!seen.has(b.sceneId)||!['VOICE_MISSING','VOICE_UNHEALTHY','VOICE_STALE',
      'VISUAL_MISSING','VISUAL_UNHEALTHY','VISUAL_STALE'].includes(b.code))fail('INVALID_COMPOSITION_READINESS');
  }
  const {digest,...payload}=document;
  if(compositionDigest(payload)!==digest)fail('COMPOSITION_DIGEST_MISMATCH',409);
  return document;
}

export class CompositionRepository {
  constructor({repo,manifest}){this.repo=repo;this.db=repo.db;this.manifest=manifest;}
  /** A compact state fingerprint fences concurrent editor writes AND queued
   * intent changes between the asynchronous file checks and SQLite publish.
   */
  liveState(videoId){
    const video=this.repo.getVideo(videoId);
    if(!video||video.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
    const timeline=this.repo.getTimeline(videoId);
    const scenes=orderedTimelineScenes(this.repo.listScenes(videoId),timeline.document);
    if(!scenes.length)fail('COMPOSITION_SCENES_REQUIRED',409);
    const sceneRevision=this.db.prepare('SELECT revision FROM scene_build_state WHERE video_id=?').get(videoId)?.revision??0;
    const intents=scenes.map(s=>({
      voice:this.db.prepare('SELECT job_id,input_hash,text_sha256,config_revision FROM scene_voice_intents WHERE scene_id=?').get(s.id)??null,
      image:this.db.prepare('SELECT job_id,input_hash,source_sha256,config_revision FROM scene_image_intents WHERE scene_id=?').get(s.id)??null,
      manual:this.db.prepare('SELECT asset_id FROM scene_image_manual_selections WHERE scene_id=?').get(s.id)??null
    }));
    const state={videoRowVersion:video.rowVersion,configRevision:video.configRevision,sceneRevision,
      timelineRowVersion:timeline.rowVersion,scriptSha256:sha(video.masterScript),scenes,intents,
      config:video.effectivePreset};
    return {video,state,scenes,fingerprint:compositionDigest(state)};
  }
  async preview(videoId,body={}){
    if(!plain(body)||Object.keys(body).some(k=>k!=='profile'))fail('INVALID_COMPOSITION_PREVIEW');
    const {profile}=body;
    const {video,scenes,state,fingerprint}=this.liveState(videoId);
    const renderProfile=profileFrom(video.effectivePreset,profile);
    const plan=await this.manifest.planRecompute(videoId);
    const statuses=new Map(plan.scenes.map(s=>[s.sceneId,s]));
    const blockers=[];let cursor=0;
    const composed=[];
    for(const [i,scene] of scenes.entries()){
      const expected=scene.mediaType==='image_motion'?'image':'video';
      const voice=scene.voiceAssetId?this.manifest.get(scene.voiceAssetId):null;
      const visual=scene.visualAssetId?this.manifest.get(scene.visualAssetId):null;
      const vPin=pin(voice,scene,'voice'),iPin=pin(visual,scene,expected);
      const status=statuses.get(scene.id);
      // R2-06 already hashed both files while computing intent/reuse status.
      // Reuse its health verdict to avoid hashing multi-GB long-form assets twice.
      const voiceHealth=vPin?status?.voiceHealth??'missing':'missing';
      const visualHealth=iPin?status?.visualHealth??'missing':'missing';
      if(!vPin)blockers.push({sceneId:scene.id,code:'VOICE_MISSING'});
      else if(voiceHealth!=='healthy')blockers.push({sceneId:scene.id,code:'VOICE_UNHEALTHY'});
      else if(status?.voice!=='reuse')blockers.push({sceneId:scene.id,code:'VOICE_STALE'});
      if(!iPin)blockers.push({sceneId:scene.id,code:'VISUAL_MISSING'});
      else if(visualHealth!=='healthy')blockers.push({sceneId:scene.id,code:'VISUAL_UNHEALTHY'});
      else if(!['reuse','manual_preserved'].includes(status?.visual)&&expected==='image')
        blockers.push({sceneId:scene.id,code:'VISUAL_STALE'});
      const durationFrames=framesFromMs(scene.durationMs,renderProfile.fps);
      const durationMs=scene.durationMs;
      const measured=voice?.metadata?.durationMs;
      composed.push({id:scene.id,index:i,sceneRowVersion:scene.rowVersion,text:scene.text,
        textSha256:sha(scene.text),mediaType:scene.mediaType,startFrame:cursor,endFrame:cursor+durationFrames,
        durationMs,durationFrames,durationBasis:'scene_estimate',
        voice:{asset:vPin,measuredDurationMs:vPin&&whole(measured,1,14400000)?measured:null},
        visual:{kind:expected,motion:expected==='image'?(video.effectivePreset.media.motionEffect??'none'):'none',asset:iPin},
        captions:{mode:'scene_estimate',source:'scene_text',cues:[{text:scene.text,startFrame:0,endFrame:durationFrames}]}});
      cursor+=durationFrames;
    }
    const payload={schemaVersion:1,videoId,source:{videoRowVersion:video.rowVersion,
      configRevision:video.configRevision,sceneRevision:state.sceneRevision,
      timelineRowVersion:state.timelineRowVersion,scriptSha256:state.scriptSha256},
    profile:renderProfile,scenes:composed,totalFrames:cursor,readiness:{ready:blockers.length===0,blockers}};
    const result={...payload,digest:compositionDigest(payload)};
    validateComposition(result);
    // Filesystem inspection above was async: clients must not see a preview
    // that can be mistaken for a stable snapshot after editing meanwhile.
    failIf(this.liveState(videoId).fingerprint!==fingerprint,'COMPOSITION_SOURCE_CHANGED');
    return result;
  }
  /** Explicit immutable approval with digest + rowVersion optimistic fencing.
   * A read-only incomplete preview is allowed; publishing requires ready assets.
   */
  async publish(videoId,body={}){
    if(!plain(body)||Object.keys(body).some(k=>!['expectedDigest','expectedVideoRowVersion','profile'].includes(k))||
      !hashOk(body.expectedDigest)||!whole(body.expectedVideoRowVersion,1,1e9))fail('INVALID_COMPOSITION_PUBLISH');
    const before=this.liveState(videoId);
    if(before.video.rowVersion!==body.expectedVideoRowVersion)fail('COMPOSITION_VERSION_CONFLICT',409);
    const snapshot=await this.preview(videoId,{profile:body.profile});
    if(snapshot.digest!==body.expectedDigest)fail('COMPOSITION_PREVIEW_CONFLICT',409);
    if(!snapshot.readiness.ready)fail('COMPOSITION_ASSETS_NOT_READY',409);
    const json=stableCompositionJson(snapshot);
    return transact(this.db,()=>{
      const current=this.liveState(videoId);
      if(current.fingerprint!==before.fingerprint)fail('COMPOSITION_SOURCE_CHANGED',409);
      const prev=this.db.prepare('SELECT revision,payload_json FROM composition_revisions WHERE video_id=? ORDER BY revision DESC LIMIT 1').get(videoId);
      if(prev?.payload_json===json)return {revision:prev.revision,unchanged:true,composition:snapshot};
      const revision=(prev?.revision??0)+1;
      this.db.prepare('INSERT INTO composition_revisions(video_id,revision,digest,payload_json,created_at) VALUES(?,?,?,?,?)')
        .run(videoId,revision,snapshot.digest,json,Date.now());
      this.repo.event('video',videoId,'composition.published',{revision,digest:snapshot.digest});
      return {revision,unchanged:false,composition:snapshot};
    });
  }
  history(videoId){this.liveState(videoId);
    return this.db.prepare('SELECT revision,digest,created_at FROM composition_revisions WHERE video_id=? ORDER BY revision DESC LIMIT 100').all(videoId)
      .map(x=>({revision:x.revision,digest:x.digest,createdAt:x.created_at}));
  }
  revision(videoId,revision){
    const video=this.repo.getVideo(videoId);if(!video||video.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
    if(!whole(revision,1,1e9))fail('INVALID_COMPOSITION_REVISION');
    const row=this.db.prepare('SELECT * FROM composition_revisions WHERE video_id=? AND revision=?').get(videoId,revision);
    if(!row)fail('COMPOSITION_REVISION_NOT_FOUND',404);
    const doc=JSON.parse(row.payload_json);
    if(doc.schemaVersion===2)validateTimedComposition(doc);else validateComposition(doc);
    return {revision:row.revision,createdAt:row.created_at,composition:doc};
  }
}
