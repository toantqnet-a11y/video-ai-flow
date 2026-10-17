/** R3-VID-02: local MP4/MOV/WebM -> pinned CFR H.264 MP4 visual stream.
 * Input must ALREADY be checked with safePinnedPath (SHA, size, no symlinks).
 * No network calls or user shell. Never mix embedded source audio: the scene's
 * verified voice asset is ALWAYS the only narration in the final segment.
 */
import {spawn} from 'node:child_process';
import {copyFile} from 'node:fs/promises';
import {extname} from 'node:path';
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const isPos=n=>Number.isFinite(n)&&n>0;
const rational=(value)=>{
 if(typeof value!=='string')return null;
 const match=/^(\d+)(?:\/(\d+))?$/.exec(value);
 if(!match)return null;
 const rate=Number(match[1])/Number(match[2]??1);
 return isPos(rate)?rate:null;
};

/** A strict ffprobe JSON inspection. Filename extension is never evidence of
 * playable video. MOV/QuickTime and ISO BMFF are both accepted by ffprobe's
 * mov,mp4 format family; WebM supports legacy imported assets.
 */
export function inspectClipProbe(value){
 const format=value?.format,streams=value?.streams;
 if(!Array.isArray(streams)||!format||typeof format.format_name!=='string')fail('CLIP_PROBE_INVALID');
 const family=format.format_name.split(',');
 if(!family.some(x=>['mov','mp4','webm','matroska'].includes(x)))fail('CLIP_CONTAINER_UNSUPPORTED');
 const video=streams.find(x=>x?.codec_type==='video'&&x.disposition?.attached_pic!==1);
 if(!video||!['h264','hevc','mpeg4','vp8','vp9','av1','prores','mjpeg'].includes(video.codec_name))
  fail('CLIP_VIDEO_CODEC_UNSUPPORTED');
 const duration=Number(format.duration),width=Number(video.width),height=Number(video.height);
 if(!isPos(duration)||duration>300||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
    width<16||height<16||width>8192||height>8192)fail('CLIP_PROBE_INVALID');
 const fps=rational(video.avg_frame_rate)||rational(video.r_frame_rate);
 if(!fps||fps>240)fail('CLIP_PROBE_INVALID');
 return {container:family.includes('mov')?'mov/mp4':'webm',sourceCodec:video.codec_name,
  durationSeconds:duration,width,height,fps,embeddedAudio:streams.some(s=>s?.codec_type==='audio')};
}

/** Non-shell bounded JSON ffprobe call; no stderr/raw path leaked in errors. */
export async function probeClipSource(input,{ffprobe='ffprobe',signal,run}={}){
 const args=['-v','error','-show_format','-show_streams','-of','json',input];
 let raw;
 try{raw=run?await run(ffprobe,args,{signal,timeoutMs:15000}):await runSafe(ffprobe,args,{signal});}
 catch{fail('CLIP_PROBE_FAILED')}
 try{return inspectClipProbe(JSON.parse(raw))}catch(e){if(e?.code)throw e;fail('CLIP_PROBE_INVALID')}
}
/** Used only in isolated CLI tests; production injects render.runBinary, which
 * already implements Windows cancellation and child process group cleanup. */
function runSafe(binary,args,{signal}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(Error('ABORTED'));
  const proc=spawn(binary,args,{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  let out='',done=false;const timer=setTimeout(()=>proc.kill('SIGKILL'),15000);
  const abort=()=>proc.kill('SIGKILL'); signal?.addEventListener('abort',abort,{once:true});
  const settle=(err,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);err?reject(err):resolve(value)};
  proc.stdout.on('data',chunk=>{out+=String(chunk);if(out.length>131072)proc.kill('SIGKILL')});
  proc.on('error',e=>settle(e));proc.on('close',status=>settle(status===0?null:Error('PROBE_FAILED'),out));
 });
}

/** Preview of exact frame-space fit. Video-with-window holds first/last pose;
 * video without window loops short clips to cover the whole voice duration.
 * Requires only a known valid source and a pinned scene; never mutates input.
 */
export function clipNormalizationPlan({scene,profile,source}){
 const {width,height,fps}=profile??{};
 if(!Number.isSafeInteger(width)||width<128||width>4096||
   !Number.isSafeInteger(height)||height<128||height>4096||
   ![24,25,30,60].includes(fps)||
   !Number.isSafeInteger(scene?.durationFrames)||scene.durationFrames<1||scene.durationFrames>fps*120)
  fail('CLIP_PLAN_INVALID');
 const sourceDurationFrames=Math.floor(source.durationSeconds*fps+1e-6);
 if(sourceDurationFrames<1)fail('CLIP_SOURCE_TOO_SHORT');
 const window=scene.visualWindow??null;
 if(window&&(!Number.isSafeInteger(window.inFrame)||!Number.isSafeInteger(window.outFrame)||
   window.inFrame<0||window.outFrame>scene.durationFrames||window.outFrame<=window.inFrame))
  fail('CLIP_WINDOW_INVALID');
 const activeFrames=window?window.outFrame-window.inFrame:scene.durationFrames;
 // A deliberate visual window is a hold, not a loop; an insufficient source
 // is a hard error rather than fabricating frames inside user's active window.
 if(window&&sourceDurationFrames<activeFrames)fail('CLIP_WINDOW_SOURCE_TOO_SHORT');
 const cover=`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
 const filter=window?
  `fps=${fps},trim=end_frame=${activeFrames},setpts=PTS-STARTPTS,`+
  `tpad=start_mode=clone:start=${window.inFrame}:stop_mode=clone:stop=${scene.durationFrames-window.outFrame},`+
  `trim=end_frame=${scene.durationFrames},setpts=N/(${fps}*TB),${cover},format=yuv420p`:
  `${cover},fps=${fps},format=yuv420p,setpts=N/(${fps}*TB)`;
 return {fit:window?'hold':'loop',filter,frames:scene.durationFrames,
  fps,width,height,sourceDurationSeconds:source.durationSeconds,
  activeFrames,voicePreserved:true,stripSourceAudio:true};
}

/** Pre-normalize only after cache miss. Long looping source is bounded to
 * exact frames by -frames:v. All bytes stay in private renderer staging.
 * run and probe are injected to reuse production's safe spawn/ffprobe guards.
 */
export async function normalizePinnedClip({input,output,scene,profile,ffmpeg='ffmpeg',ffprobe='ffprobe',signal,
 run,probeNormalized}={}){
 if(!input||!output||typeof run!=='function'||typeof probeNormalized!=='function')fail('CLIP_NORMALIZATION_INVALID');
 const source=await probeClipSource(input,{ffprobe,signal,run});
 const p=clipNormalizationPlan({scene,profile,source});
 // Common zero-extra-encode path for already normalized, audio-free H264 MP4.
 // Never pass through MOV simply because ffprobe's format family matches MP4.
 // Exact pinned frame count/duration/fps are required to avoid silent drift.
 if(extname(input).toLowerCase()==='.mp4'&&!scene.visualWindow&&
    source.sourceCodec==='h264'&&!source.embeddedAudio&&
    source.width===p.width&&source.height===p.height&&source.fps===p.fps){
  const current=await probeNormalized(input,{ffprobe,signal});
  if(current.videoCodec==='h264'&&current.audioCodec===null&&
     current.frameCount===p.frames&&current.fps===`${p.fps}/1`&&
     isPos(current.durationSeconds)&&Math.abs(current.durationSeconds-p.frames/p.fps)<=0.11){
    await copyFile(input,output);
    return {source,fit:p.fit,frames:p.frames,qa:current,
      passthrough:true,voicePreserved:true,sourceAudioDiscarded:true};
  }
 }
 const args=['-hide_banner','-nostdin','-loglevel','error',
  ...(p.fit==='loop'?['-stream_loop','-1']:[]),'-i',input,
  '-map','0:v:0','-an','-sn','-dn','-vf',p.filter,
  '-frames:v',String(p.frames),'-r',String(p.fps),'-fps_mode','cfr',
  '-c:v','libx264','-preset','ultrafast','-crf','21','-pix_fmt','yuv420p',
  '-video_track_timescale',String(p.fps*1000),'-movflags','+faststart','-y',output];
 // The caller already enforces <=120s per scene; normalization is bounded too.
 await run(ffmpeg,args,{signal,timeoutMs:Math.max(30000,p.frames/p.fps*26000)});
 const qa=await probeNormalized(output,{ffprobe,signal});
 if(qa.videoCodec!=='h264'||qa.audioCodec!==null||qa.width!==p.width||qa.height!==p.height||
   qa.frameCount!==p.frames||qa.fps!==`${p.fps}/1`||
   !isPos(qa.durationSeconds)||Math.abs(qa.durationSeconds-p.frames/p.fps)>0.11)
  fail('CLIP_NORMALIZED_QA_FAILED');
 return {source,fit:p.fit,frames:p.frames,qa,passthrough:false,voicePreserved:true,sourceAudioDiscarded:true};
}
