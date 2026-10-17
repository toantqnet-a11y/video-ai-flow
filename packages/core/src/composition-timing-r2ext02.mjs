/**
 * R2-EXT-02 — opt-in measured-audio composition v2.
 * V1 is immutable/unchanged for existing clients and historical revisions.
 * No video render, paid AI call, or provider-specific forced alignment occurs here.
 */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,sep} from 'node:path';
import {DomainError} from './domain.mjs';
import {transact} from './db.mjs';
import {framesFromMs,compositionDigest,stableCompositionJson,validateComposition} from './composition-r2ext01.mjs';
const exec=promisify(execFile);
const fail=(code,status=400)=>{throw new DomainError(code,status)};
const whole=(n,lo,hi)=>Number.isSafeInteger(n)&&n>=lo&&n<=hi;
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const only=(v,fields)=>obj(v)&&Object.keys(v).every(k=>fields.includes(k));
const digestOf=(v)=>{const {digest,...payload}=v;return compositionDigest(payload)};
/** Parse ffprobe's real audio stream duration, not user/provider metadata.
 * Pass a single fixed binary and argv; paths are never interpolated into a shell.
 * Failure must block publishing (NEVER fall back to the estimated WPM timing).
 */
export async function measureVoiceDuration(file,{binary='ffprobe',timeoutMs=10000}={}){
  try{
    const {stdout}=await exec(binary,['-v','error','-select_streams','a:0',
      '-show_entries','stream=duration:format=duration','-of','json',file],
      {timeout:timeoutMs,maxBuffer:65536,windowsHide:true});
    const probe=JSON.parse(stdout);
    if(!Array.isArray(probe.streams)||probe.streams.length<1)fail('VOICE_NO_AUDIO_STREAM',409);
    const seconds=[probe.streams[0]?.duration,probe.format?.duration]
      .map(Number).find(x=>Number.isFinite(x)&&x>0);
    const ms=Math.ceil(seconds*1000);
    if(!whole(ms,1,120000))fail('VOICE_INVALID_DURATION',409);
    return ms;
  }catch(err){
    if(err instanceof DomainError)throw err;
    fail('VOICE_FFPROBE_UNAVAILABLE',503);
  }
}
const getLocked=(clips,sceneId)=>{
 const rows=clips.filter(c=>c.sceneId===sceneId&&c.timingLocked===true);
 if(rows.length>1)return {conflict:true};
 if(!rows.length)return null;
 const clip=rows[0];
 // Never infer a manual lock merely because a clip exists.
 if(!whole(clip.durationMs,500,120000)||!whole(clip.startMs,0,14400000))return {conflict:true};
 if(clip.captionStartMs!==undefined||clip.captionEndMs!==undefined){
   if(!whole(clip.captionStartMs,0,clip.durationMs)||!whole(clip.captionEndMs,1,clip.durationMs)||
     clip.captionEndMs<=clip.captionStartMs)return {conflict:true};
 }
 return {startMs:clip.startMs,durationMs:clip.durationMs,captionStartMs:clip.captionStartMs??0,
   captionEndMs:clip.captionEndMs??clip.durationMs};
};
/** V2 validator delegates original unchanged v1 asset, intent, text, profile,
 * digest and boundary rules after projecting v2 onto a *virtual* v1 document.
 * Then it checks every v2-specific invariant; no unvalidated extra keys allowed.
 */
export function validateTimedComposition(doc){
 if(!obj(doc)||doc.schemaVersion!==2||!Array.isArray(doc.scenes)||!doc.scenes.length)fail('INVALID_TIMED_COMPOSITION');
 const copy=structuredClone(doc);
 copy.schemaVersion=1;
 const supported=new Set(['VOICE_DURATION_UNAVAILABLE','VOICE_DURATION_OVERRUN','TIMING_LOCK_CONFLICT','VISUAL_WINDOW_CONFLICT']);
 for(const s of copy.scenes){
   if(!obj(s)||!obj(s.timing)||!obj(s.voice)||!obj(s.captions))fail('INVALID_TIMED_SCENE');
   const t=s.timing;
   // Frame-space visual holds are optional: old immutable v2 documents remain
   // valid. Remove the field only on the temporary v1 validation projection.
   if(s.visualWindow!==undefined){
     const w=s.visualWindow;
     if(!obj(w)||Object.keys(w).sort().join(',')!=='inFrame,outFrame'||
       !whole(w.inFrame,0,s.durationFrames-1)||!whole(w.outFrame,w.inFrame+1,s.durationFrames)||
       (w.inFrame===0&&w.outFrame===s.durationFrames))fail('INVALID_VISUAL_WINDOW');
     delete s.visualWindow;
   }
   if(Object.keys(t).sort().join(',')!=='audioFrames,audioMs,mode,paddingFrames,tailPaddingMs' ||
      !['voice_measured','manual_locked','estimate_only'].includes(t.mode)||
      !whole(t.audioFrames,0,7200)||!whole(t.audioMs,0,120000)||
      !whole(t.paddingFrames,0,7200)||!whole(t.tailPaddingMs,0,5000)||
      !['voice_measured','manual_locked','scene_estimate'].includes(s.durationBasis)||
      (t.mode==='voice_measured'&&s.durationBasis!=='voice_measured')||
      (t.mode==='manual_locked'&&s.durationBasis!=='manual_locked')||
      (t.mode==='estimate_only'&&s.durationBasis!=='scene_estimate')||
      t.paddingFrames!==s.durationFrames-Math.min(s.durationFrames,t.audioFrames)||
      (t.audioMs>0&&t.audioFrames!==framesFromMs(t.audioMs,doc.profile.fps))||
      (t.audioMs===0&&t.audioFrames!==0)||
      s.voice.measuredDurationMs!==(t.audioMs||null)||
      (t.mode==='voice_measured'&&(t.audioMs===0||s.durationMs!==Math.max(500,t.audioMs+t.tailPaddingMs)))||
      (t.mode==='estimate_only'&&t.audioMs!==0)||
      !Array.isArray(s.captions.cues)||s.captions.cues.length!==1)fail('INVALID_TIMED_SCENE');
   const cue=s.captions.cues[0];
   if(!obj(cue)||Object.keys(cue).sort().join(',')!=='endFrame,startFrame,text'||
      cue.text!==s.text||!whole(cue.startFrame,0,s.durationFrames-1)||
      !whole(cue.endFrame,cue.startFrame+1,s.durationFrames)||
      !['measured_scene','manual_locked','scene_estimate'].includes(s.captions.mode)||
      !['scene_text','timeline_locked'].includes(s.captions.source)||
      (t.mode==='voice_measured'&&(s.captions.mode!=='measured_scene'||cue.startFrame!==0||cue.endFrame!==Math.min(s.durationFrames,t.audioFrames)))||
      (t.mode==='estimate_only'&&(s.captions.mode!=='scene_estimate'||cue.startFrame!==0||cue.endFrame!==s.durationFrames))||
      (t.mode==='manual_locked'&&(s.captions.mode!=='manual_locked'||s.captions.source!=='timeline_locked'))||
      (t.mode!=='manual_locked'&&s.captions.source!=='scene_text'))fail('INVALID_TIMED_CAPTIONS');
   // V1 verifies shape/integrity, not the newly introduced timing origin.
   delete s.timing;s.durationBasis='scene_estimate';
   s.captions={mode:'scene_estimate',source:'scene_text',cues:[{text:s.text,startFrame:0,endFrame:s.durationFrames}]};
   // V1 duration bounds still apply to v2 (including manual locks).
 }
 copy.readiness.blockers=copy.readiness.blockers.filter(b=>{
   if(!supported.has(b.code))return true;
   return false;
 });
 copy.readiness.ready=copy.readiness.blockers.length===0;
 copy.digest=digestOf(copy);
 validateComposition(copy);
 if(doc.readiness.ready!==!doc.readiness.blockers.length||
    doc.readiness.blockers.some(b=>!obj(b)||Object.keys(b).sort().join(',')!=='code,sceneId'||
      !doc.scenes.some(s=>s.id===b.sceneId)||
      ![...supported,'VOICE_MISSING','VOICE_UNHEALTHY','VOICE_STALE','VISUAL_MISSING','VISUAL_UNHEALTHY','VISUAL_STALE','VISUAL_WINDOW_CONFLICT'].includes(b.code)))fail('INVALID_TIMED_READINESS');
 // These safety blockers are intrinsic to timing measurements; a caller may
 // not strip them and forge a new digest to turn a dangerous draft into ready.
 for(const s of doc.scenes){
   if(s.timing.audioFrames>s.durationFrames&&
     !doc.readiness.blockers.some(b=>b.sceneId===s.id&&b.code==='VOICE_DURATION_OVERRUN'))
     fail('INVALID_TIMED_READINESS');
   if(s.timing.mode==='estimate_only'&&s.voice.asset!==null&&
     !doc.readiness.blockers.some(b=>b.sceneId===s.id&&b.code.startsWith('VOICE_')))
     fail('INVALID_TIMED_READINESS');
 }
 if(doc.digest!==digestOf(doc))fail('COMPOSITION_DIGEST_MISMATCH',409);
 return doc;
}
export class TimedCompositionRepository {
 constructor({compositions,manifest,probe=measureVoiceDuration}){
   this.compositions=compositions;this.manifest=manifest;this.probe=probe;
   this.db=compositions.db;
 }
 async preview(videoId,body={}){
   if(!only(body,['profile','tailPaddingMs'])||
      (body.tailPaddingMs!==undefined&&!whole(body.tailPaddingMs,0,5000)))fail('INVALID_TIMED_PREVIEW');
   const tailPaddingMs=body.tailPaddingMs??250;
   const start=this.compositions.liveState(videoId);
   const base=await this.compositions.preview(videoId,{profile:body.profile});
   const scenes=[];const blockers=[...base.readiness.blockers];let cursor=0;
   const timeline=this.compositions.repo.getTimeline(videoId).document;
   const windows=new Map((timeline.visualEdits??[]).map(v=>[v.sceneId,v]));
   for(const s of base.scenes){
     const original=s.voice.asset?this.manifest.get(s.voice.asset.id):null;
     const locked=getLocked(timeline.clips??[],s.id);
     let audioMs=0;
     if(s.voice.asset&&original&&(!base.readiness.blockers.some(b=>b.sceneId===s.id&&b.code.startsWith('VOICE_')))){
       // File was verified in the v1 preview. Re-verify AFTER probing to fence
       // replacement/symlink swaps during asynchronous FFprobe execution.
       const path=resolve(this.manifest.dataRoot,s.voice.asset.relativePath);
       if(!path.startsWith(this.manifest.dataRoot+sep))fail('INVALID_ASSET_PATH',409);
       try{audioMs=await this.probe(path);if(!whole(audioMs,1,120000))throw new Error('bad duration');}
       catch{blockers.push({sceneId:s.id,code:'VOICE_DURATION_UNAVAILABLE'});}
       if(audioMs&&await this.manifest.verifyRevision(s.voice.asset.id)!=='healthy'){
         audioMs=0;blockers.push({sceneId:s.id,code:'VOICE_UNHEALTHY'});
       }
     }
     if(locked?.conflict||(locked&&Math.abs(Math.round(locked.startMs*base.profile.fps/1000)-cursor)>1))
       blockers.push({sceneId:s.id,code:'TIMING_LOCK_CONFLICT'});
     const mode=locked&&!locked.conflict?'manual_locked':audioMs?'voice_measured':'estimate_only';
     let durationMs=mode==='manual_locked'?locked.durationMs:mode==='voice_measured'?Math.max(500,audioMs+tailPaddingMs):s.durationMs;
     if(durationMs>120000){durationMs=120000;blockers.push({sceneId:s.id,code:'VOICE_DURATION_OVERRUN'});}
     if(mode==='manual_locked'&&audioMs>durationMs)blockers.push({sceneId:s.id,code:'VOICE_DURATION_OVERRUN'});
     const durationFrames=framesFromMs(durationMs,base.profile.fps);
     const audioFrames=audioMs?framesFromMs(audioMs,base.profile.fps):0;
     // One scene-level cue, bounded by measured voice length. No invented word
     // timestamps; true forced alignment remains opt-in/future work.
     let startCue=0,endCue=mode==='voice_measured'?Math.min(durationFrames,audioFrames):durationFrames;
     if(mode==='manual_locked'){
       startCue=Math.min(durationFrames-1,Math.floor(locked.captionStartMs*base.profile.fps/1000));
       endCue=Math.min(durationFrames,Math.max(startCue+1,framesFromMs(locked.captionEndMs,base.profile.fps)));
     }
     const edit=windows.get(s.id);
     let visualWindow;
     if(edit){
       // Measured voice time can shorten the scene. A saved visual window
       // outside the new scene must block approval, not silently be clamped.
       const inFrame=Math.floor(edit.inMs*base.profile.fps/1000);
       const outFrame=Math.ceil(edit.outMs*base.profile.fps/1000);
       if(inFrame<0||outFrame>durationFrames||inFrame>=outFrame||
          outFrame-inFrame<Math.ceil(0.2*base.profile.fps))
         blockers.push({sceneId:s.id,code:'VISUAL_WINDOW_CONFLICT'});
       else if(inFrame!==0||outFrame!==durationFrames)visualWindow={inFrame,outFrame};
     }
     scenes.push({...s,startFrame:cursor,endFrame:cursor+durationFrames,durationMs,durationFrames,
       ...(visualWindow?{visualWindow}:{}),
       durationBasis:mode==='estimate_only'?'scene_estimate':mode,
       voice:{...s.voice,measuredDurationMs:audioMs||null},
       timing:{mode,audioMs,audioFrames,paddingFrames:durationFrames-Math.min(durationFrames,audioFrames),tailPaddingMs},
       captions:{mode:mode==='voice_measured'?'measured_scene':mode==='manual_locked'?'manual_locked':'scene_estimate',
         source:mode==='manual_locked'?'timeline_locked':'scene_text',cues:[{text:s.text,startFrame:startCue,endFrame:endCue}]}});
     cursor+=durationFrames;
     if(!audioMs&&!blockers.some(b=>b.sceneId===s.id&&b.code.startsWith('VOICE_')))
       blockers.push({sceneId:s.id,code:'VOICE_DURATION_UNAVAILABLE'});
   }
   const {digest:_ignored,...fromBase}=base;
   const result={...fromBase,schemaVersion:2,scenes,totalFrames:cursor,
     readiness:{ready:blockers.length===0,blockers}};
   result.digest=compositionDigest(result);
   validateTimedComposition(result);
   if(this.compositions.liveState(videoId).fingerprint!==start.fingerprint)fail('COMPOSITION_SOURCE_CHANGED',409);
   return result;
 }
 async publish(videoId,body={}){
   if(!only(body,['profile','tailPaddingMs','expectedDigest','expectedVideoRowVersion'])||
      typeof body.expectedDigest!=='string'||!/^[a-f0-9]{64}$/.test(body.expectedDigest)||
      !whole(body.expectedVideoRowVersion,1,1e9))fail('INVALID_TIMED_PUBLISH');
   const state=this.compositions.liveState(videoId);
   if(state.video.rowVersion!==body.expectedVideoRowVersion)fail('COMPOSITION_VERSION_CONFLICT',409);
   const snapshot=await this.preview(videoId,{profile:body.profile,tailPaddingMs:body.tailPaddingMs});
   if(snapshot.digest!==body.expectedDigest)fail('COMPOSITION_PREVIEW_CONFLICT',409);
   if(!snapshot.readiness.ready)fail('COMPOSITION_ASSETS_NOT_READY',409);
   const json=stableCompositionJson(snapshot);
   return transact(this.db,()=>{
     if(this.compositions.liveState(videoId).fingerprint!==state.fingerprint)fail('COMPOSITION_SOURCE_CHANGED',409);
     const previous=this.db.prepare('SELECT revision,payload_json FROM composition_revisions WHERE video_id=? ORDER BY revision DESC LIMIT 1').get(videoId);
     if(previous?.payload_json===json)return {revision:previous.revision,unchanged:true,composition:snapshot};
     const revision=(previous?.revision??0)+1;
     this.db.prepare('INSERT INTO composition_revisions(video_id,revision,digest,payload_json,created_at) VALUES(?,?,?,?,?)')
       .run(videoId,revision,snapshot.digest,json,Date.now());
     this.compositions.repo.event('video',videoId,'composition.published',{revision,digest:snapshot.digest,schemaVersion:2});
     return {revision,unchanged:false,composition:snapshot};
   });
 }
}
