/**
 * EXT-04/06: conservative offline FFmpeg fast-path. This is NOT a Remotion or
 * HyperFrames selection. Runs against immutable published Composition v2 and
 * writes a private MP4 only after ffprobe QA; never invokes a paid provider.
 * All process arguments use spawn (no shell); media SHA256 is rechecked before
 * use to fence stale revisions, and input paths cannot escape dataRoot.
 */
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,constants as fsConstants} from 'node:fs';
import {mkdir,readFile,realpath,rename,rm,stat,lstat,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {DomainError} from './domain.mjs';
import {validateTimedComposition} from './composition-timing-r2ext02.mjs';
import {resolveMotionStyle} from './motion-brand-r2ext08.mjs';
import {hasVisualWindow,videoWindowFilter,visualMotionProgress} from './visual-window-r307.mjs';

const failure=(code,status=409)=>{throw new DomainError(code,status)};
const ensure=(test,code)=>{if(!test)failure(code)};
const frameClock=(frame,fps)=>{
 const n=Math.round(frame*1000/fps),h=Math.floor(n/3600000),m=Math.floor(n/60000)%60,s=Math.floor(n/1000)%60,ms=n%1000;
 return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
};
export function makeSrt(composition){
 validateTimedComposition(composition);
 let counter=0;const cues=[];
 for(const scene of composition.scenes){
  for(const cue of scene.captions.cues){
   // Escape SRT HTML markup and directional overrides; preserve Vietnamese.
   const text=cue.text.replace(/[\u202a-\u202e\u2066-\u2069]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
   cues.push(`${++counter}\n${frameClock(scene.startFrame+cue.startFrame,composition.profile.fps)} --> ${frameClock(scene.startFrame+cue.endFrame,composition.profile.fps)}\n${text}\n`);
  }
 }
 return cues.join('\n');
}
async function fileHash(path){return new Promise((done,reject)=>{const hash=createHash('sha256');const stream=createReadStream(path);stream.on('data',b=>hash.update(b));stream.on('error',reject);stream.on('end',()=>done(hash.digest('hex')));});}
/** No symlinks are followed, including symlinked parent directories. */
export async function safePinnedPath(dataRoot,asset){
 ensure(asset&&/^[a-f0-9]{64}$/.test(asset.sha256)&&/^[a-zA-Z0-9/_\-.]+$/.test(asset.relativePath),'RENDER_INVALID_PIN');
 const root=await realpath(dataRoot);
 const path=resolve(root,asset.relativePath);
 ensure(path.startsWith(root+sep)&&!asset.relativePath.split('/').includes('..'),'RENDER_UNSAFE_PATH');
 const real=await realpath(path).catch(()=>failure('RENDER_ASSET_MISSING'));
 ensure(real.startsWith(root+sep)&&real===path,'RENDER_UNSAFE_PATH');
 const s=await lstat(path);
 ensure(s.isFile()&&!s.isSymbolicLink()&&s.size===asset.bytes,'RENDER_ASSET_CHANGED');
 ensure(await fileHash(path)===asset.sha256,'RENDER_ASSET_CHANGED');
 return path;
}
/** Child process: fixed command and argv, limited stdout/stderr, bounded runtime. */
export function runBinary(binary,args,{signal,timeoutMs=180000,maxLog=32768,cwd,env}={}){
 return new Promise((ok,bad)=>{
  if(signal?.aborted)return bad(Object.assign(new Error('RENDER_ABORTED'),{code:'RENDER_ABORTED'}));
  // A process group ensures FFmpeg/HyperFrames grandchildren cannot survive a
  // cancelled job on POSIX. Windows needs taskkill /T because .cmd children
  // have a different tree model. Neither path interpolates shell commands.
  let child;
  try{child=spawn(binary,args,{windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],cwd,env});}
  catch{return bad(Object.assign(new Error('RENDER_BINARY_UNAVAILABLE'),{code:'RENDER_BINARY_UNAVAILABLE'}));}
  let log='',reason=null,settled=false;
  const save=data=>{log=(log+String(data)).slice(-maxLog);};
  child.stderr?.on('data',save);child.stdout?.on('data',save);
  const killTree=()=>{
   if(!child.pid)return;
   if(process.platform==='win32'){
    const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    killer.on('error',()=>{});
   }else{
    try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}
   }
  };
  const abort=()=>{reason='RENDER_ABORTED';killTree();};
  if(signal)signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{reason='RENDER_COMMAND_TIMEOUT';killTree();},timeoutMs);
  const settle=(error,result)=>{
   if(settled)return;settled=true;clearTimeout(timer);
   signal?.removeEventListener('abort',abort);
   if(error)bad(error);else ok(result);
  };
  child.on('error',()=>settle(Object.assign(new Error('RENDER_BINARY_UNAVAILABLE'),{code:reason??'RENDER_BINARY_UNAVAILABLE'})));
  child.on('close',code=>{
   if(reason)return settle(Object.assign(new Error(reason),{code:reason}));
   if(code===0)return settle(null,log);
   // Public error cannot expose source paths, prompts, or untrusted CLI logs.
   const errorCode=/no space left on device|enospc/i.test(log)?'RENDER_DISK_SPACE_LOW':'RENDER_COMMAND_FAILED';
   settle(Object.assign(new Error(errorCode),{code:errorCode}));
  });
  if(signal?.aborted)abort();
 });
}
export async function probeMp4(path,{ffprobe='ffprobe',signal}={}){
 let result;
 try{result=JSON.parse(await runBinary(ffprobe,['-v','error','-show_entries','format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames','-of','json',path],{signal,timeoutMs:15000}));}
 catch{failure('RENDER_PROBE_FAILED')}
 const streams=result.streams??[];const video=streams.find(s=>s.codec_type==='video');const audio=streams.find(s=>s.codec_type==='audio');
 return {durationSeconds:Number(result.format?.duration),bytes:Number(result.format?.size),videoCodec:video?.codec_name??null,audioCodec:audio?.codec_name??null,width:video?.width??null,height:video?.height??null,fps:video?.r_frame_rate??null,frameCount:video?.nb_frames?Number(video.nb_frames):null};
}
export function checkMp4Quality(metadata,document,{durationToleranceSeconds=0.25}={}){
 const target=document.totalFrames/document.profile.fps;
 const {width,height,fps}=document.profile;
 const ok=metadata.videoCodec==='h264'&&metadata.audioCodec==='aac'&&metadata.width===width&&metadata.height===height&&
  metadata.fps===`${fps}/1`&&metadata.frameCount===document.totalFrames&&Number.isFinite(metadata.durationSeconds)&&Math.abs(metadata.durationSeconds-target)<=durationToleranceSeconds&&metadata.bytes>100;
 return {passed:ok,expectedSeconds:target,actualSeconds:metadata.durationSeconds,driftSeconds:Number((metadata.durationSeconds-target).toFixed(3)),
  profile:{width,height,fps},checks:{h264:metadata.videoCodec==='h264',aac:metadata.audioCodec==='aac',dimensions:metadata.width===width&&metadata.height===height,framerate:metadata.fps===`${fps}/1`,frames:metadata.frameCount===document.totalFrames,duration:Math.abs(metadata.durationSeconds-target)<=durationToleranceSeconds}};
}
function imageFilter(scene,{width:w,height:h,fps},motion=scene.visual.motion){
 const progress=visualMotionProgress(scene,'on-1'); // zoompan `on` starts at 1, unlike crop `n`.
 const cover=`scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
 if(motion==='zoom'||motion==='ken_burns'){
  // Zoompan uses exactly one frame per input loop and outputs fixed fps.
  return `scale=${w*2}:${h*2}:force_original_aspect_ratio=increase,zoompan=z='${hasVisualWindow(scene)?`1+0.035*${progress}`:'min(1+on*0.00025,1.035)'}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${w}x${h}:fps=${fps},setsar=1,format=yuv420p`;
 }
 if(motion==='pan'){
  return `scale=${Math.ceil(w*1.05/2)*2}:${Math.ceil(h*1.05/2)*2}:force_original_aspect_ratio=increase,crop=${w}:${h}:x='(in_w-out_w)*${hasVisualWindow(scene)?visualMotionProgress(scene,'n'):`min(n/${Math.max(1,scene.durationFrames)},1)`}':y='(in_h-out_h)/2',setsar=1,fps=${fps},format=yuv420p`;
 }
 return `${cover},fps=${fps},format=yuv420p`;
}
/** Only palette hex values from normalizeMotionStyle reach the filtergraph. */
const assColor=hex=>`&H00${hex.slice(5,7)}${hex.slice(3,5)}${hex.slice(1,3)}`;
function filterPath(p){return p.replaceAll('\\','\\\\').replaceAll(':','\\:').replaceAll("'","'\\''").replaceAll(',','\\,').replaceAll('[','\\[').replaceAll(']','\\]');}
function subtitleFilter(srtPath,brand){
  // Brand props are validated hex colors and bounded integers; text never
  // becomes part of the filter expression.
  const style=brand?`FontName=DejaVu Sans,FontSize=${brand.captionSize},PrimaryColour=${assColor(brand.captionColor)},OutlineColour=${assColor(brand.outlineColor)},Alignment=2,MarginV=65,Outline=2`:
    'FontName=DejaVu Sans,FontSize=20,Alignment=2,MarginV=65,Outline=2';
  return `subtitles=filename='${filterPath(srtPath)}':force_style='${style}'`;
}
function decorateVideoFilter(base,{brand,preset,scene,duration,work,profile}){
  let filter=base;
  if(preset?.transition==='fade_black'){
    const frames=Math.max(1,Math.min(8,Math.floor(scene.durationFrames/5)));
    // Fade-through-black at the hard cut; not overlapping xfade and never
    // changes audio length or the authoritative Composition frame count.
    filter+=`,fade=t=in:s=0:n=${frames},fade=t=out:s=${Math.max(frames,scene.durationFrames-frames)}:n=${frames}`;
  }
  if(brand?.showLowerThird&&brand.title){
    const titleFile=join(work,'brand-title.txt');
    const accent=`0x${brand.accentColor.slice(1)}`;
    const fg=`0x${brand.captionColor.slice(1)}`;
    filter+=`,drawtext=textfile='${filterPath(titleFile)}':expansion=none:fontcolor=${fg}:fontsize=${Math.round(Math.max(18,profile.height/40))}:x=40:y=${Math.floor(profile.height*0.74)}:box=1:boxcolor=${accent}@0.65:boxborderw=12`;
  }
  return filter;
}
/** R3-08: a segment hash excludes absolute position/index/captions, since
 * captions are applied in the final mux. Moving a scene must NOT re-encode it.
 * The pinned voice/visual asset hashes, local trim, geometry, and style are in.
 */
export function renderSegmentHash({scene,profile,motionStyle=null}){
 const stable={v:'ffmpeg-segment-cache-2',fps:profile.fps,width:profile.width,height:profile.height,
  sceneId:scene.id,mediaType:scene.mediaType,durationFrames:scene.durationFrames,
  voice:scene.voice?.asset?.sha256,visual:scene.visual?.asset?.sha256,
  visualWindow:scene.visualWindow??null,visualMotion:scene.visual?.motion,
  motionStyleDigest:motionStyle?.digest??null};
 return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
async function cacheDirectory(root,id){
 const out=join(root,'renders',id,'.segment-cache');
 await mkdir(out,{recursive:true,mode:0o700});
 ensure(await realpath(out)===out,'RENDER_UNSAFE_CACHE_DIR');
 return out;
}
async function cachedSegment({db,root,id,scene,profile,motionStyle,ffprobe,signal,segment}){
 if(!db)return null; // Offline direct-render callers are not forced to store a DB.
 const segmentHash=renderSegmentHash({scene,profile,motionStyle});
 const row=db.prepare('SELECT * FROM render_segment_cache WHERE video_id=? AND segment_hash=?').get(id,segmentHash);
 if(!row)return {segmentHash,hit:false};
 const dir=await cacheDirectory(root,id),cachePath=join(dir,`${segmentHash}.mp4`);
 ensure(row.relative_path===`renders/${id}/.segment-cache/${segmentHash}.mp4`,'RENDER_CACHE_BAD_RECORD');
 const real=await realpath(cachePath).catch(()=>failure('RENDER_CACHE_MISSING'));
 ensure(real===cachePath&&real.startsWith(root+sep),'RENDER_CACHE_UNSAFE');
 const st=await lstat(cachePath);
 ensure(st.isFile()&&!st.isSymbolicLink()&&st.size===row.bytes&&await fileHash(cachePath)===row.file_sha256,'RENDER_CACHE_CORRUPT');
 const metadata=await probeMp4(cachePath,{ffprobe,signal});
 ensure(metadata.frameCount===scene.durationFrames&&metadata.videoCodec==='h264'&&metadata.audioCodec==='aac'&&
  metadata.width===profile.width&&metadata.height===profile.height,'RENDER_CACHE_QA_FAILED');
 await copyFile(cachePath,segment); // Staging is disposable; cache record is immutable.
 return {segmentHash,hit:true};
}
async function publishSegmentCache({db,root,id,scene,profile,motionStyle,ffprobe,signal,segment,segmentHash}){
 if(!db)return;
 const qa=await probeMp4(segment,{ffprobe,signal});
 ensure(qa.frameCount===scene.durationFrames&&qa.videoCodec==='h264'&&qa.audioCodec==='aac'&&
   qa.width===profile.width&&qa.height===profile.height,'RENDER_SEGMENT_QA_FAILED');
 const dir=await cacheDirectory(root,id),dest=join(dir,`${segmentHash}.mp4`);
 const digest=await fileHash(segment),bytes=(await stat(segment)).size;
 try{await copyFile(segment,dest,fsConstants.COPYFILE_EXCL)}
 catch(e){if(e.code!=='EEXIST')throw e;}
 const real=await realpath(dest),meta=await lstat(dest);
 ensure(real===dest&&meta.isFile()&&!meta.isSymbolicLink()&&meta.size===bytes&&await fileHash(dest)===digest,'RENDER_CACHE_COLLISION');
 db.prepare('INSERT OR IGNORE INTO render_segment_cache(video_id,segment_hash,file_sha256,frames,bytes,relative_path,created_at) VALUES(?,?,?,?,?,?,?)')
  .run(id,segmentHash,digest,scene.durationFrames,bytes,`renders/${id}/.segment-cache/${segmentHash}.mp4`,Date.now());
 const row=db.prepare('SELECT * FROM render_segment_cache WHERE video_id=? AND segment_hash=?').get(id,segmentHash);
 ensure(row.file_sha256===digest&&row.frames===scene.durationFrames&&row.bytes===bytes,'RENDER_CACHE_RECORD_COLLISION');
}
/**
 * Export to private render/<videoId>/, validating every pinned input before
 * render and once again before atomic publication. Per-scene segments remain
 * in staging; interrupted runs cannot masquerade as completed exports.
 */
export async function renderFfmpegComposition({composition,motionStyle=null,dataRoot,ffmpeg='ffmpeg',ffprobe='ffprobe',signal,onProgress=()=>{},maxSceneSeconds=120,cacheDb=null,subtitlePlan=null}={}){
 validateTimedComposition(composition);
 ensure(composition.readiness.ready,'RENDER_COMPOSITION_NOT_READY');
 const resolvedStyle=motionStyle?resolveMotionStyle(motionStyle,composition):null;
 const root=await realpath(dataRoot),id=composition.videoId;
 ensure(/^[a-zA-Z0-9-]{1,100}$/.test(id),'RENDER_BAD_VIDEO');
 const outputDir=join(root,'renders',id),work=join(outputDir,`.staging-${randomUUID()}`);
 await mkdir(outputDir,{recursive:true,mode:0o700});
 // Guard against symlinked output directories before any bytes are written.
 ensure(await realpath(outputDir)===outputDir,'RENDER_UNSAFE_OUTPUT_DIR');
 await mkdir(work,{mode:0o700});
 const inputPaths=[];
 try{
  if(resolvedStyle?.brand?.showLowerThird&&resolvedStyle.brand.title)
    await writeFile(join(work,'brand-title.txt'),resolvedStyle.brand.title,{mode:0o600});
  const {width,height,fps}=composition.profile;
  for(const scene of composition.scenes){
   ensure(scene.durationFrames/fps<=maxSceneSeconds,'RENDER_SCENE_TOO_LONG');
   inputPaths.push({audio:await safePinnedPath(root,scene.voice.asset),visual:await safePinnedPath(root,scene.visual.asset)});
  }
  let idx=0,encoded=0,reused=0;
  for(const scene of composition.scenes){
   if(signal?.aborted)failure('RENDER_ABORTED');
   const pins=inputPaths[idx],duration=scene.durationFrames/fps;
   if(scene.visual.kind==='video'&&hasVisualWindow(scene)){
    // Reject a short source before encoding: the final 2-frame tail-repair
    // must never mask missing user-selected frames in an edited clip.
    const source=await probeMp4(pins.visual,{ffprobe,signal});
    const required=(scene.visualWindow.outFrame-scene.visualWindow.inFrame)/fps;
    ensure(Number.isFinite(source.durationSeconds)&&source.durationSeconds+0.001>=required,
      'RENDER_VISUAL_WINDOW_SHORT_SOURCE');
   }
   const segment=join(work,`scene-${String(idx).padStart(4,'0')}.mp4`);
   const cache=await cachedSegment({db:cacheDb,root,id,scene,profile:composition.profile,
    motionStyle,ffprobe,signal,segment});
   if(cache?.hit){
    idx++;reused++;onProgress({completedScenes:idx,totalScenes:composition.scenes.length,reusedSegments:reused});
    continue;
   }
   const isImage=scene.mediaType==='image_motion';
   // Limit incoming video to a finite duration; scale/crop consistently.
   const argv=isImage?['-loop','1','-framerate',String(fps),'-i',pins.visual,'-i',pins.audio]:
    [...(hasVisualWindow(scene)?[]:['-stream_loop','-1']),'-i',pins.visual,'-i',pins.audio];
   const preset=resolvedStyle?.byScene.get(scene.id);
   const baseFilter=isImage?imageFilter(scene,composition.profile,preset?.motion??scene.visual.motion):
    hasVisualWindow(scene)?videoWindowFilter(scene,composition.profile):`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p`;
   const vf=decorateVideoFilter(baseFilter,{brand:resolvedStyle?.brand,preset,scene,duration,work,profile:composition.profile});
   argv.push('-map','0:v:0','-map','1:a:0','-vf',vf,'-af','apad',
    '-frames:v',String(scene.durationFrames),'-t',String(duration),'-r',String(fps),
    '-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p',
    '-c:a','aac','-ar','48000','-ac','2','-b:a','128k','-video_track_timescale',String(fps*1000),
    '-movflags','+faststart','-y',segment);
   await runBinary(ffmpeg,['-hide_banner','-nostdin','-loglevel','error',...argv],{signal,timeoutMs:Math.max(30000,duration*25000)});
   if(!isImage&&hasVisualWindow(scene)){
    const actual=await probeMp4(segment,{ffprobe,signal});
    ensure(actual.frameCount===scene.durationFrames,'RENDER_VISUAL_WINDOW_FRAME_MISMATCH');
   }
   // Per-segment QA prevents corrupt partials from entering the cache or concat.
   if(cacheDb)await publishSegmentCache({db:cacheDb,root,id,scene,profile:composition.profile,
    motionStyle,ffprobe,signal,segment,segmentHash:cache.segmentHash});
   idx++;encoded++;onProgress({completedScenes:idx,totalScenes:composition.scenes.length,reusedSegments:reused});
  }
  const list=composition.scenes.map((_,i)=>`file 'scene-${String(i).padStart(4,'0')}.mp4'`).join('\n')+'\n';
  await writeFile(join(work,'concat.txt'),list,{mode:0o600});
  await writeFile(join(work,'captions.srt'),subtitlePlan?.srt??makeSrt(composition),{mode:0o600});
  const raw=join(work,'raw.mp4');const finalTmp=join(work,'completed.mp4');
  await runBinary(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-f','concat','-safe','1','-i',join(work,'concat.txt'),'-c','copy','-y',raw],{signal,timeoutMs:180000});
  // Subtitle rendering requires libass. A missing filter is a hard failure,
  // never a silently captionless MP4 advertised as export complete.
  // AAC packets from many concatenated scenes can add encoder padding.
  // Resample and clamp the *final* audio to the authoritative frame clock.
  // This caps cumulative audio drift on videos with hundreds of scenes.
  const duration=(composition.totalFrames/fps).toFixed(6);
  await runBinary(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-i',raw,
   // Container concat can start at +1 frame owing to AAC priming. Normalize
   // video timestamps onto the Composition frame clock before burning captions;
   // at most two cloned tail frames cover encoder padding, never missing scenes.
   '-vf',`fps=${fps}:start_time=0,tpad=stop_mode=clone:stop_duration=${(2/fps).toFixed(6)},${subtitleFilter(join(work,'captions.srt'),resolvedStyle?.brand)}`,
   '-af',`aresample=async=1:first_pts=0,apad,atrim=duration=${duration}`,
   '-frames:v',String(composition.totalFrames),'-t',duration,
   '-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-b:a','128k',
   '-movflags','+faststart','-y',finalTmp],{signal,timeoutMs:Math.max(30000,composition.totalFrames/fps*20000)});
  const info=await probeMp4(finalTmp,{ffprobe,signal});const qa=checkMp4Quality(info,composition);
  ensure(qa.passed,'RENDER_QA_FAILED');
  // EXT-08: style-aware thumbnail is generated from the actual encoded frame,
  // not a placeholder stock image. Fails closed if optional branded output is
  // requested and FFmpeg cannot produce a valid JPEG.
  const thumbTmp=motionStyle?join(work,'thumbnail.jpg'):null;
  if(thumbTmp){
   await runBinary(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-ss','0.25','-i',finalTmp,
    '-frames:v','1','-vf','scale=480:-2','-q:v','3','-update','1','-y',thumbTmp],{signal,timeoutMs:30000});
   const ts=await stat(thumbTmp);
   ensure(ts.isFile()&&ts.size>300&&ts.size<10000000,'RENDER_THUMBNAIL_BAD');
  }
  for(const pins of inputPaths){
   // Existing files may be swapped while FFmpeg is rendering.
   for(const assetPath of [pins.audio,pins.visual]){
    const original=composition.scenes[inputPaths.indexOf(pins)];
    const pin=assetPath===pins.audio?original.voice.asset:original.visual.asset;
    ensure(await fileHash(assetPath)===pin.sha256,'RENDER_ASSET_CHANGED');
   }
  }
  if(signal?.aborted)failure('RENDER_ABORTED');
  // Distinct style revisions must never collide with an existing render.
  // The composition digest still pins all source assets separately.
  const outputDigest=subtitlePlan?.digest?createHash('sha256').update(`r405:${composition.digest}:${motionStyle?.digest??''}:${subtitlePlan.digest}`).digest('hex'):
   motionStyle?createHash('sha256').update(`${composition.digest}:${motionStyle.digest}`).digest('hex'):composition.digest;
  const exportPath=join(outputDir,`${outputDigest}.mp4`);
  const thumbnailPath=thumbTmp?join(outputDir,`${outputDigest}.jpg`):null;
  // Every published path is digest-addressed. A repeated run with identical
  // validated inputs returns the pre-existing artifact instead of overwriting.
  const old=await stat(exportPath).catch(()=>null);
  if(old){
   // Do not claim success from an old, corrupt result simply because the
   // digest-addressed path already exists. Revalidate it independently.
   ensure(old.isFile()&&await realpath(exportPath)===exportPath,'RENDER_EXISTING_OUTPUT_BAD');
   const previous=await probeMp4(exportPath,{ffprobe,signal});
   ensure(checkMp4Quality(previous,composition).passed,'RENDER_EXISTING_OUTPUT_BAD');
  }else await rename(finalTmp,exportPath);
  let thumbnail=null;
  if(thumbnailPath){
   const hash=await fileHash(thumbTmp),existingThumb=await stat(thumbnailPath).catch(()=>null);
   if(existingThumb){
    ensure(existingThumb.isFile()&&await realpath(thumbnailPath)===thumbnailPath&&
      await fileHash(thumbnailPath)===hash,'RENDER_EXISTING_THUMBNAIL_BAD');
   }else await rename(thumbTmp,thumbnailPath);
   thumbnail={relativePath:`renders/${id}/${outputDigest}.jpg`,sha256:hash,bytes:(await stat(thumbnailPath)).size};
  }
  return {thumbnail,videoId:id,compositionDigest:composition.digest,styleDigest:motionStyle?.digest??null,relativePath:`renders/${id}/${outputDigest}.mp4`,
   bytes:(await stat(exportPath)).size,metadata:info,qa,segmentCache:{reused,encoded,total:composition.scenes.length},engine:'ffmpeg-fastpath'};
 }finally{await rm(work,{recursive:true,force:true});}
}
