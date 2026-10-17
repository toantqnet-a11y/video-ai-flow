/**
 * HyperFrames is the preferred local renderer. This adapter converts immutable
 * Composition v2 into standalone HTML/locally pinned media, then invokes ONLY
 * the installed offline `hyperframes render` binary (never npx/cloud).
 * FFmpeg remains an EXPLICIT opt-in fast path, not a silent fallback.
 */
import {createHash,randomUUID} from 'node:crypto';
import {copyFile,mkdir,realpath,rename,rm,stat,writeFile,readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join,sep,extname,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DomainError} from './domain.mjs';
import {safePinnedPath,runBinary,probeMp4,checkMp4Quality} from './render-ffmpeg-r2ext04.mjs';
import {validateTimedComposition} from './composition-timing-r2ext02.mjs';
import {resolveMotionStyle} from './motion-brand-r2ext08.mjs';
import {hasVisualWindow,imageMotionKeyframes,videoWindowFilter} from './visual-window-r307.mjs';

const fail=(code,status=409)=>{throw new DomainError(code,status)};
const ensure=(value,code)=>{if(!value)fail(code)};
const sha256=async path=>new Promise((yes,no)=>{const h=createHash('sha256'),s=createReadStream(path);s.on('data',b=>h.update(b));s.on('error',no);s.on('end',()=>yes(h.digest('hex')))});
const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const sec=(frames,fps)=>(frames/fps).toFixed(6);
const motionClass=motion=>['zoom','ken_burns','pan'].includes(motion)?motion:'none';
const allowedExt=(kind,raw)=>{
 const extension=extname(raw).toLowerCase();
 const valid=kind==='voice'?['.mp3','.wav','.m4a','.ogg']:kind==='image'?['.png','.jpg','.jpeg','.webp']:['.mp4','.webm','.mov'];
 ensure(valid.includes(extension),'HYPERFRAMES_MEDIA_UNSUPPORTED');return extension;
};

/** HTML has no remote scripts/fonts/URLs. All user texts are encoded, asset
 * filenames generated, scene times derived strictly from integer frame spans. */
export function makeHyperframesHtml(document,{motionStyle=null,subtitlePlan=null}={}){
 validateTimedComposition(document);
 const styled=motionStyle?resolveMotionStyle(motionStyle,document):null;
 const {width,height,fps}=document.profile;
 // A timeline-free HTML composition declares data-no-timeline at the root;
 // otherwise HyperFrames waits for an unregistered GSAP timeline.
 const brand=styled?.brand??{captionColor:'#FFFFFF',outlineColor:'#131722',captionSize:26,showLowerThird:false,title:'',accentColor:'#1E88E5'};
 const lines=[],trimCss=[];
 for(const [idx,scene] of document.scenes.entries()){
  const start=sec(scene.startFrame,fps),duration=sec(scene.durationFrames,fps);
  const visualExt=scene.visual.kind==='video'&&hasVisualWindow(scene)?'.mp4':allowedExt(scene.visual.kind,scene.visual.asset?.relativePath??'');
  const audioExt=allowedExt('voice',scene.voice.asset?.relativePath??'');
  const effect=styled?.byScene.get(scene.id)?.motion??scene.visual.motion;
  const transition=styled?.byScene.get(scene.id)?.transition==='fade_black'?' fade-black':'';
  const motion=motionClass(effect);
  const n=String(idx+1).padStart(4,'0');
  // Clip timing and visual media are independent of narration. Audio ends at
  // measured voice boundary while scene may continue for tail padding.
  if(scene.visual.kind==='image'){
   const keyframes=hasVisualWindow(scene)?imageMotionKeyframes(scene,motion):null;
   if(keyframes)trimCss.push(`@keyframes hf-window-${n}{${keyframes}} .scene-${n} img{animation:hf-window-${n} ${duration}s linear both!important}`);
   lines.push(`<section id="scene-${n}" class="clip scene scene-${n} ${motion}${transition}" data-start="${start}" data-duration="${duration}" data-track-index="0" style="--scene-seconds:${duration}s"><img src="assets/visual-${n}${visualExt}" alt=""/></section>`);
  }else{
   lines.push(`<video id="scene-${n}" class="clip scene" src="assets/visual-${n}${visualExt}" muted playsinline data-start="${start}" data-duration="${duration}" data-track-index="0"></video>`);
  }
  const audioFrames=Math.min(scene.durationFrames,scene.timing.audioFrames);
  ensure(audioFrames>0,'HYPERFRAMES_VOICE_DURATION_UNAVAILABLE');
  lines.push(`<audio id="voice-${n}" src="assets/voice-${n}${audioExt}" data-start="${start}" data-duration="${sec(audioFrames,fps)}" data-track-index="10" data-volume="1"></audio>`);
  const absoluteCues=subtitlePlan?.cues?.filter(c=>c.sceneId===scene.id)??scene.captions.cues.map(c=>({startFrame:scene.startFrame+c.startFrame,endFrame:scene.startFrame+c.endFrame,text:c.text}));
  for(const [j,cue] of absoluteCues.entries()){
   const frames=cue.endFrame-cue.startFrame;
   if(frames<=0)continue;
   lines.push(`<div id="caption-${n}-${j}" class="clip caption-holder" data-start="${sec(cue.startFrame,fps)}" data-duration="${sec(frames,fps)}" data-track-index="2"><div class="captions">${escapeHtml(cue.text)}</div></div>`);
  }
  if(brand.showLowerThird&&brand.title){
   lines.push(`<div class="clip lower-third" data-start="${start}" data-duration="${sec(Math.min(90,scene.durationFrames),fps)}" data-track-index="3">${escapeHtml(brand.title)}</div>`);
  }
 }
 return `<!doctype html>\n<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
 html,body{margin:0;padding:0;background:#000}*{box-sizing:border-box}#stage{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#000}
 .clip{position:absolute;inset:0;overflow:hidden}.scene{width:100%;height:100%}.scene img{width:100%;height:100%;object-fit:cover}
 .scene.zoom img{animation:hf-zoom var(--scene-seconds) linear both}.scene.ken_burns img{animation:hf-kenburns var(--scene-seconds) linear both}.scene.pan img{animation:hf-pan var(--scene-seconds) linear both}
 .fade-black{animation:hf-fade var(--scene-seconds) linear both}
 @keyframes hf-zoom{from{transform:scale(1)}to{transform:scale(1.04)}}
 @keyframes hf-kenburns{from{transform:scale(1.02) translateX(-0.5%)}to{transform:scale(1.08) translateX(0.5%)}}
 @keyframes hf-pan{from{transform:scale(1.05) translateX(-1%)}to{transform:scale(1.05) translateX(1%)}}
 @keyframes hf-fade{0%{opacity:0}6%,94%{opacity:1}100%{opacity:0}}
 .caption-holder{display:flex;align-items:flex-end;justify-content:center;padding:0 ${Math.round(width*.06)}px ${Math.round(height*.1)}px;pointer-events:none}
 .captions{max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;padding:12px 18px;text-align:center;border-radius:14px;background:rgba(0,0,0,.68);font-family:Arial,'Noto Sans',sans-serif;font-weight:700;font-size:${brand.captionSize*width/1080}px;line-height:1.4;color:${brand.captionColor};text-shadow:1px 2px 2px ${brand.outlineColor}}
 .lower-third{inset:auto auto ${Math.round(height*.22)}px ${Math.round(width*.05)}px;width:max-content;max-width:85%;height:auto;padding:12px 20px;border-radius:10px;background:${brand.accentColor};color:${brand.captionColor};font:700 ${Math.round(height/40)}px Arial,sans-serif}
 ${trimCss.join('\n')}
 </style></head><body><div id="stage" data-composition-id="contentstudio" data-start="0" data-no-timeline data-duration="${sec(document.totalFrames,fps)}" data-width="${width}" data-height="${height}" data-fps="${fps}">
 ${lines.join('\n')}\n </div></body></html>`;
}

/** npm's Windows shim ends with .cmd, which Node must not spawn with a
 * shell. Invoke the actual local package CLI using Node instead. This also
 * avoids npx auto-install and guarantees the currently locked project copy.
 */
/** Resolve the pinned local CLI only. Global PATH or npx could silently run a
 * different version, change rendered bytes, or contact npm. Explicit custom
 * binaries remain possible ONLY for an injected test renderer. */
export function validateHyperframesInstallManifest(rootPkg,installed){
 const expected=rootPkg?.devDependencies?.hyperframes??rootPkg?.dependencies?.hyperframes;
 ensure(typeof expected==='string'&&/^\d+\.\d+\.\d+$/.test(expected),'HYPERFRAMES_VERSION_NOT_PINNED');
 ensure(installed?.version===expected,'HYPERFRAMES_VERSION_MISMATCH');
 const entry=typeof installed.bin==='string'?installed.bin:installed.bin?.hyperframes;
 ensure(typeof entry==='string'&&/\.[cm]?js$/.test(entry),'HYPERFRAMES_CLI_INVALID');
 return {version:expected,entry};
}
export async function findHyperframesCli(requested='hyperframes'){
 if(requested!=='hyperframes')return {binary:requested,argvPrefix:[],version:null};
 const projectDir=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
 const pkgDir=join(projectDir,'node_modules','hyperframes');
 let installed,rootPkg;
 try{
  [installed,rootPkg]=await Promise.all([
   readFile(join(pkgDir,'package.json'),'utf8').then(JSON.parse),
   readFile(join(projectDir,'package.json'),'utf8').then(JSON.parse),
  ]);
 }catch{fail('HYPERFRAMES_NOT_INSTALLED',503);}
 const {version:expected,entry}=validateHyperframesInstallManifest(rootPkg,installed);
 const cli=resolve(pkgDir,entry);
 ensure(cli.startsWith(pkgDir+sep),'HYPERFRAMES_CLI_INVALID');
 const real=await realpath(cli).catch(()=>fail('HYPERFRAMES_CLI_INVALID'));
 ensure(real.startsWith(pkgDir+sep),'HYPERFRAMES_CLI_INVALID');
 return {binary:process.execPath,argvPrefix:[real],version:expected};
}

/** Renderer children receive only OS/browser necessities, never the API server's
 * model credentials, pairing secrets, database URLs or proxy variables. A
 * project-local renderer does not need OpenAI or other provider credentials. */
export function sanitizedRendererEnv(source=process.env){
 const keys=['PATH','Path','PATHEXT','SystemRoot','SYSTEMROOT','WINDIR','COMSPEC',
  'TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA',
  'XDG_CACHE_HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','DISPLAY','WAYLAND_DISPLAY',
  'LANG','LC_ALL','TZ','CHROME_PATH','PUPPETEER_EXECUTABLE_PATH'];
 const env=Object.create(null);
 for(const key of keys)if(typeof source[key]==='string')env[key]=source[key];
 Object.assign(env,{HYPERFRAMES_NO_TELEMETRY:'1',HYPERFRAMES_NO_UPDATE_CHECK:'1',DO_NOT_TRACK:'1'});
 return env;
}

/** Render is staged; every source SHA is checked before and after encoding.
 * An incomplete/invalid MP4 cannot become a completed queue result. */
export async function renderHyperframesComposition({composition,motionStyle=null,dataRoot,hyperframes='hyperframes',ffmpeg='ffmpeg',ffprobe='ffprobe',signal,onProgress=()=>{},timeoutMs=3*60*60*1000,renderCommand=runBinary,subtitlePlan=null}={}){
 validateTimedComposition(composition);
 ensure(composition.readiness.ready,'RENDER_COMPOSITION_NOT_READY');
 const root=await realpath(dataRoot),videoId=composition.videoId;
 ensure(/^[A-Za-z0-9-]{1,100}$/.test(videoId),'RENDER_BAD_VIDEO');
 const outputDir=join(root,'renders',videoId);
 await mkdir(outputDir,{recursive:true,mode:0o700});
 ensure(await realpath(outputDir)===outputDir,'RENDER_UNSAFE_OUTPUT_DIR');
 const jobDir=join(outputDir,`.hyperframes-${randomUUID()}`);
 await mkdir(jobDir,{mode:0o700});
 const assetsDir=join(jobDir,'assets');
 await mkdir(assetsDir,{mode:0o700});
 // Include the selected local renderer release in the immutable output key: a
 // future version upgrade must never reuse bytes from the older renderer.
 const rootPackage=JSON.parse(await readFile(resolve(dirname(fileURLToPath(import.meta.url)),'../../../package.json'),'utf8'));
 const pin=rootPackage.devDependencies?.hyperframes??rootPackage.dependencies?.hyperframes;
 ensure(typeof pin==='string'&&/^\d+\.\d+\.\d+$/.test(pin),'HYPERFRAMES_VERSION_NOT_PINNED');
 const sha=createHash('sha256').update(`hyperframes-v2:${pin}:${composition.digest}:${motionStyle?.digest??''}:${subtitlePlan?.digest??''}`).digest('hex');
 const finalPath=join(outputDir,`${sha}.mp4`),thumbPath=join(outputDir,`${sha}.jpg`);
 try{
  const pins=[];
  for(const [idx,scene] of composition.scenes.entries()){
   if(signal?.aborted)fail('RENDER_ABORTED');
   const n=String(idx+1).padStart(4,'0');
   for(const [kind,asset] of [['voice',scene.voice.asset],['visual',scene.visual.asset]]){
    const path=await safePinnedPath(root,asset);
    const ext=allowedExt(kind==='voice'?'voice':scene.visual.kind,asset.relativePath);
    const editedVideo=kind==='visual'&&scene.visual.kind==='video'&&hasVisualWindow(scene);
    const target=join(assetsDir,`${kind}-${n}${editedVideo?'.mp4':ext}`);
    if(editedVideo){
     const source=await probeMp4(path,{ffprobe,signal});
     const needed=(scene.visualWindow.outFrame-scene.visualWindow.inFrame)/composition.profile.fps;
     ensure(Number.isFinite(source.durationSeconds)&&source.durationSeconds+0.001>=needed,
       'RENDER_VISUAL_WINDOW_SHORT_SOURCE');
     // Only edited videos are preprocessed locally. HyperFrames still renders
     // the final composition; FFmpeg is used solely for clip-frame preparation.
     await runBinary(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-i',path,
       '-vf',videoWindowFilter(scene,composition.profile),'-an','-frames:v',String(scene.durationFrames),
       '-r',String(composition.profile.fps),'-c:v','libx264','-preset','ultrafast','-crf','23',
       '-pix_fmt','yuv420p','-y',target],{signal,timeoutMs:Math.max(30000,scene.durationFrames/composition.profile.fps*25000)});
     const frameResult=JSON.parse(await runBinary(ffprobe,['-v','error','-count_frames','-select_streams','v:0',
       '-show_entries','stream=nb_read_frames','-of','json',target],{signal,timeoutMs:15000}));
     ensure(Number(frameResult.streams?.[0]?.nb_read_frames)===scene.durationFrames,'RENDER_VISUAL_WINDOW_SHORT_SOURCE');
     ensure(await sha256(path)===asset.sha256,'RENDER_ASSET_CHANGED');
    }else{
     await copyFile(path,target);
     ensure(await sha256(target)===asset.sha256,'RENDER_ASSET_CHANGED');
    }
    pins.push({path,asset});
   }
  }
  await writeFile(join(jobDir,'index.html'),makeHyperframesHtml(composition,{motionStyle,subtitlePlan}),{mode:0o600});
  await writeFile(join(jobDir,'package.json'),'{"name":"contentstudio-hyperframes-render","private":true,"type":"module"}\n',{mode:0o600});
  onProgress({completedScenes:0,totalScenes:composition.scenes.length});
  const rendered=join(jobDir,'output.mp4');
  try{
   const cmd=await findHyperframesCli(hyperframes);
   await renderCommand(cmd.binary,[...cmd.argvPrefix,'render',jobDir,'--composition','index.html','--output',rendered,'--fps',String(composition.profile.fps),'--quality','high'],
    {signal,cwd:jobDir,timeoutMs,env:sanitizedRendererEnv()});
  }catch(error){if(error?.code==='RENDER_BINARY_UNAVAILABLE')fail('HYPERFRAMES_NOT_INSTALLED',503);throw error;}
  const metadata=await probeMp4(rendered,{ffprobe,signal});
  const qa=checkMp4Quality(metadata,composition);
  ensure(qa.passed,'HYPERFRAMES_MP4_QA_FAILED');
  for(const {path,asset} of pins)ensure(await safePinnedPath(root,asset)===path,'RENDER_ASSET_CHANGED');
  if(signal?.aborted)fail('RENDER_ABORTED');
  const existing=await stat(finalPath).catch(()=>null);
  if(existing){ensure(existing.isFile()&&await realpath(finalPath)===finalPath,'RENDER_EXISTING_OUTPUT_BAD');
   ensure(checkMp4Quality(await probeMp4(finalPath,{ffprobe,signal}),composition).passed,'RENDER_EXISTING_OUTPUT_BAD');
  }else await rename(rendered,finalPath);
  // Failure of thumbnail extraction does not invalidate the already-QA'd MP4.
  let thumbnail=null;
  try{
   const tempThumb=join(jobDir,'thumb.jpg');
   await runBinary(ffmpeg,['-hide_banner','-loglevel','error','-ss','0.25','-i',finalPath,'-frames:v','1','-vf','scale=480:-2','-q:v','3','-update','1','-y',tempThumb],{signal,timeoutMs:30000});
   const ts=await stat(tempThumb);
   if(ts.isFile()&&ts.size>300&&ts.size<10000000){
    const dig=await sha256(tempThumb),prev=await stat(thumbPath).catch(()=>null);
    if(prev){ensure(prev.isFile()&&await realpath(thumbPath)===thumbPath&&await sha256(thumbPath)===dig,'RENDER_EXISTING_THUMBNAIL_BAD');}
    else await rename(tempThumb,thumbPath);
    thumbnail={relativePath:`renders/${videoId}/${sha}.jpg`,sha256:dig,bytes:ts.size};
   }
  }catch(e){if(['RENDER_EXISTING_THUMBNAIL_BAD','RENDER_ABORTED'].includes(e?.code))throw e;}
  onProgress({completedScenes:composition.scenes.length,totalScenes:composition.scenes.length});
  return {engine:'hyperframes',thumbnail,videoId,compositionDigest:composition.digest,styleDigest:motionStyle?.digest??null,
   relativePath:`renders/${videoId}/${sha}.mp4`,bytes:(await stat(finalPath)).size,metadata,qa};
 }finally{await rm(jobDir,{recursive:true,force:true});}
}
