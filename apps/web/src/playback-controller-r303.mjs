import {sceneAtTime} from './timeline-model-r302.mjs';
/** R3-03: one HTMLAudioElement for the whole editor, never one per scene.
 * Async fetch/metadata events are fenced by a sequence so rapid seek cannot
 * revive an old voice. Authenticated URLs are revoked when replaced/unmounted.
 */
export class TimelinePlaybackR303{
 constructor({audio,loadVoice,createUrl=URL.createObjectURL,revokeUrl=URL.revokeObjectURL,onUpdate=()=>{},onError=()=>{}}){
  this.audio=audio;this.loadVoice=loadVoice;this.createUrl=createUrl;this.revokeUrl=revokeUrl;
  this.onUpdate=onUpdate;this.onError=onError;this.scenes=[];this.current=null;
  this.sequence=0;this.url=null;this.playing=false;this.positionMs=0;this.tailTimer=null;this.disposed=false;this.cancelMetadata=null;this.fetchAbort=null;
  this.audio.ontimeupdate=()=>{if(this.current&&!this.disposed){
   this.positionMs=Math.min(this.current.endMs,this.current.startMs+Math.round(this.audio.currentTime*1000));this.notify();}};
  this.audio.onended=()=>{if(this.playing)this.finishScene(this.sequence);else this.notify();};
 }
 notify(){if(!this.disposed)this.onUpdate({positionMs:this.positionMs,sceneId:this.current?.id??null,playing:this.playing});}
 setScenes(scenes){
  // An optimistic reorder changes absolute scene times and therefore invalidates
  // the current blob/audio clock. Keeping the old voice could play a different
  // scene than the highlighted timeline after saving/reordering.
  const signature=scenes.map(s=>`${s.id}:${s.startMs}:${s.endMs}:${s.voiceAssetId??''}`).join('|');
  if(this.sceneSignature!==undefined&&this.sceneSignature!==signature){
   this.sequence++;this.playing=false;this.stopCurrent();this.current=null;
   this.positionMs=0;this.notify();
  }
  this.sceneSignature=signature;this.scenes=scenes;
 }
 stopCurrent(){
  clearTimeout(this.tailTimer);this.tailTimer=null;this.fetchAbort?.abort();this.fetchAbort=null;this.cancelMetadata?.();this.cancelMetadata=null;this.audio.pause();this.audio.removeAttribute?.('src');
  this.audio.load?.();if(this.url){this.revokeUrl(this.url);this.url=null;}
 }
 async seek(ms,{play=false}={}){
  if(!Number.isFinite(ms)||this.disposed)return false;
  const seq=++this.sequence;
  const next=sceneAtTime(this.scenes,ms);
  // Seeking within one loaded voice is instantaneous and avoids repeated disk/network reads.
  if(next?.id===this.current?.id&&this.audio.src&&this.audio.readyState>=1){
   clearTimeout(this.tailTimer);this.audio.pause();this.playing=false;
   this.positionMs=Math.min(Math.max(ms,next.startMs),next.endMs);
   const offset=Math.max(0,(this.positionMs-next.startMs)/1000);
   this.audio.currentTime=Math.min(offset,Number.isFinite(this.audio.duration)?this.audio.duration:offset);
   if(play){try{await this.audio.play();if(seq!==this.sequence)return false;this.playing=true;}catch(err){this.onError(err?.message??'VOICE_PLAY_FAILED');}}
   this.notify();return true;
  }
  this.stopCurrent();this.playing=false;
  this.current=next;this.positionMs=next?Math.min(Math.max(ms,next.startMs),next.endMs):0;
  this.notify();if(!next)return false;
  if(!next.voiceAssetId){this.onError('VOICE_PREVIEW_MISSING');return false;}
  try{
   this.fetchAbort=new AbortController();
   const blob=await this.loadVoice(next.id,{signal:this.fetchAbort.signal});
   this.fetchAbort=null;
   if(seq!==this.sequence||this.disposed)return false;
   this.url=this.createUrl(blob);this.audio.src=this.url;
   // Seek after metadata load if currentTime cannot be assigned yet.
   const within=Math.max(0,(this.positionMs-next.startMs)/1000);
   if(this.audio.readyState<1){
    await new Promise((resolve,reject)=>{
     let done=false;
     const cleanup=()=>{this.audio.removeEventListener?.('loadedmetadata',complete);this.audio.removeEventListener?.('error',failed);clearTimeout(timeout);this.cancelMetadata=null;};
     const complete=()=>{if(done)return;done=true;cleanup();resolve();};
     const failed=()=>{if(done)return;done=true;cleanup();reject(Error('VOICE_MEDIA_INVALID'));};
     const timeout=setTimeout(failed,10000);
     this.cancelMetadata=()=>{if(done)return;done=true;cleanup();resolve();};
     this.audio.addEventListener?.('loadedmetadata',complete,{once:true});
     this.audio.addEventListener?.('error',failed,{once:true});this.audio.load?.();
    });
   }
   if(seq!==this.sequence||this.disposed)return false;
   this.audio.currentTime=Math.min(within,Number.isFinite(this.audio.duration)?this.audio.duration:within);
   if(play){await this.audio.play();if(seq!==this.sequence||this.disposed)return false;this.playing=true;}
   this.notify();return true;
  }catch(err){if(seq===this.sequence&&!this.disposed){this.playing=false;this.onError(err?.message??'VOICE_PREVIEW_ERROR');this.notify();}return false;}
 }
 async play(){
  if(this.disposed)return false;
  if(this.current&&this.audio.src){try{await this.audio.play();this.playing=true;this.notify();return true;}catch(err){this.onError(err?.message??'VOICE_PLAY_FAILED');return false;}}
  return this.seek(this.positionMs,{play:true});
 }
 pause(){this.sequence++;this.playing=false;clearTimeout(this.tailTimer);this.audio.pause();this.notify();}
 finishScene(seq){
  if(seq!==this.sequence||!this.current||this.disposed)return;
  const current=this.current;
  const remainder=Math.max(0,current.endMs-(current.startMs+Math.round((this.audio.duration||0)*1000)));
  this.positionMs=current.endMs;this.notify();
  this.tailTimer=setTimeout(()=>{
   if(seq!==this.sequence||!this.playing||this.disposed)return;
   const next=this.scenes[current.index+1];
   if(next)this.seek(next.startMs,{play:true});else this.pause();
  },Math.min(remainder,5000));
 }
 dispose(){this.disposed=true;this.sequence++;this.playing=false;this.stopCurrent();
  this.audio.ontimeupdate=null;this.audio.onended=null;}
}
