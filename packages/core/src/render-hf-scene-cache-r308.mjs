/** R3-08: optional scene-granularity HyperFrames cache.
 * HyperFrames genuinely renders each changed scene. Only immutable, probed
 * H264/AAC fragments are reused; a final FFmpeg mux rechecks whole-film QA.
 * This is not equivalent to one uninterrupted HyperFrames HTML render, so
 * human caption/transition comparison is still a release gate.
 */
import {createHash,randomUUID} from 'node:crypto';
import {copyFile,mkdir,readFile,lstat,realpath,rename,rm,stat,writeFile} from 'node:fs/promises';
import {createReadStream,constants as fsConstants} from 'node:fs';
import {join,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compositionDigest} from './composition-r2ext01.mjs';
import {normalizeMotionStyle} from './motion-brand-r2ext08.mjs';
import {validateTimedComposition} from './composition-timing-r2ext02.mjs';
import {renderHyperframesComposition} from './render-hyperframes.mjs';
import {probeMp4,runBinary,checkMp4Quality,safePinnedPath} from './render-ffmpeg-r2ext04.mjs';
import {DomainError} from './domain.mjs';
const fail=code=>{throw new DomainError(code,409)};
const sha=value=>createHash('sha256').update(value).digest('hex');
const fileHash=path=>new Promise((ok,bad)=>{const h=createHash('sha256'),s=createReadStream(path);s.on('data',d=>h.update(d));s.on('error',bad);s.on('end',()=>ok(h.digest('hex')))});
const idOk=x=>typeof x==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(x);
const assert=(x,code)=>{if(!x)fail(code)};
export function hyperframesSceneCacheKey({scene,profile,style,subtitlePlan,rendererVersion}){
 assert(idOk(scene.id)&&typeof rendererVersion==='string','HF_CACHE_INVALID_KEY');
 const perSceneCaptions=subtitlePlan?.cues?.filter(c=>c.sceneId===scene.id).map(c=>[c.startFrame-scene.startFrame,c.endFrame-scene.startFrame,c.text])??scene.captions.cues;
 // Position outside the scene is absent: simple reorder reuses the fragment.
 return sha(JSON.stringify({version:'hf-rendered-scene-1',rendererVersion,sceneId:scene.id,
  frames:scene.durationFrames,geometry:profile,mediaType:scene.mediaType,
  voice:{sha256:scene.voice.asset?.sha256,measuredDurationMs:scene.voice.measuredDurationMs},
  timing:scene.timing,durationBasis:scene.durationBasis,
  visual:scene.visual.asset?.sha256,visualKind:scene.visual.kind,
  visualWindow:scene.visualWindow??null,motion:scene.visual.motion,
  style:style?.digest??null,captions:perSceneCaptions}));
}
function singleScene(doc,scene){
 const s=structuredClone(scene);s.startFrame=0;s.endFrame=s.durationFrames;s.index=0;
 const payload={...structuredClone(doc),scenes:[s],totalFrames:s.durationFrames};
 delete payload.digest;payload.digest=compositionDigest(payload);
 validateTimedComposition(payload);return payload;
}
function isolatedStyle(style,sceneId){
 if(!style)return null;
 return normalizeMotionStyle({schemaVersion:1,presetId:style.presetId,brand:style.brand,
   sceneOverrides:style.sceneOverrides.filter(x=>x.sceneId===sceneId)});
}
function isolatedSubtitles(plan,scene){
 if(!plan)return null;
 const cues=plan.cues.filter(x=>x.sceneId===scene.id).map(c=>({...c,startFrame:c.startFrame-scene.startFrame,endFrame:c.endFrame-scene.startFrame}));
 return {cues,digest:sha(JSON.stringify(cues))};
}
async function healthy(path,expected,scene,doc,ffprobe,signal){
 const s=await lstat(path).catch(()=>null);
 if(!s?.isFile()||s.isSymbolicLink()||s.size!==expected.bytes||await realpath(path)!==path)return false;
 if(await fileHash(path)!==expected.file_sha256)return false;
 const p=await probeMp4(path,{ffprobe,signal});
 return p.videoCodec==='h264'&&p.audioCodec==='aac'&&p.frameCount===scene.durationFrames&&
  p.width===doc.profile.width&&p.height===doc.profile.height;
}
export async function renderCachedHyperframesComposition({composition,motionStyle=null,subtitlePlan=null,
 dataRoot,hyperframes='hyperframes',ffmpeg='ffmpeg',ffprobe='ffprobe',signal,onProgress=()=>{},
 timeoutMs=3*60*60*1000,renderCommand=runBinary,cacheDb}={}){
 validateTimedComposition(composition);
 assert(composition.readiness.ready,'RENDER_COMPOSITION_NOT_READY');
 assert(cacheDb?.prepare,'HF_CACHE_DB_REQUIRED');
 const root=await realpath(dataRoot),id=composition.videoId;
 assert(idOk(id),'RENDER_BAD_VIDEO');
 const targetDir=join(root,'renders',id),cacheDir=join(targetDir,'.segment-cache');
 await mkdir(cacheDir,{recursive:true,mode:0o700});
 assert(await realpath(cacheDir)===cacheDir,'HF_CACHE_UNSAFE_DIRECTORY');
 const work=join(targetDir,`.staging-${randomUUID()}`);await mkdir(work,{mode:0o700});
 // A separate private root keeps intermediate per-scene HyperFrames MP4s
 // disposable. They must not accumulate as seemingly published projects.
 const childRoot=join(work,'single-scene');await mkdir(childRoot,{mode:0o700});
 const pinned=[];let reused=0,encoded=0;
 try{
  const pkg=JSON.parse(await readFile(fileURLToPath(new URL('../../../package.json',import.meta.url)),'utf8'));
  const rendererVersion=pkg.devDependencies?.hyperframes??pkg.dependencies?.hyperframes;
  assert(/^\d+\.\d+\.\d+$/.test(rendererVersion??''),'HYPERFRAMES_VERSION_NOT_PINNED');
  const outputKey=sha(JSON.stringify(['hf-scenes-1',rendererVersion,composition.digest,motionStyle?.digest??null,subtitlePlan?.digest??null]));
  const finalPath=join(targetDir,`${outputKey}.mp4`);
  for(const [i,scene] of composition.scenes.entries()){
   if(signal?.aborted)fail('RENDER_ABORTED');
   // Check SHA pins even for hits, but stage bytes only when encoding a miss.
   for(const asset of [scene.voice.asset,scene.visual.asset])pinned.push({asset,path:await safePinnedPath(root,asset)});
   const style=isolatedStyle(motionStyle,scene.id),sub=isolatedSubtitles(subtitlePlan,scene);
   const key=hyperframesSceneCacheKey({scene,profile:composition.profile,style,subtitlePlan,rendererVersion});
   const segment=join(work,`scene-${String(i).padStart(4,'0')}.mp4`);
   const record=cacheDb.prepare('SELECT * FROM render_segment_cache WHERE video_id=? AND segment_hash=?').get(id,key);
   const path=join(cacheDir,`${key}.mp4`),relativePath=`renders/${id}/.segment-cache/${key}.mp4`;
   if(record){
    assert(record.relative_path===relativePath,'HF_CACHE_BAD_RECORD');
    assert(await healthy(path,record,scene,composition,ffprobe,signal),'HF_CACHE_CORRUPT');
    await copyFile(path,segment);reused++;
   }else{
    for(const asset of [scene.voice.asset,scene.visual.asset]){
     const path=await safePinnedPath(root,asset),clone=join(childRoot,asset.relativePath);
     await mkdir(dirname(clone),{recursive:true,mode:0o700});
     await copyFile(path,clone);
     assert(await safePinnedPath(childRoot,asset)===clone,'HF_CACHE_STAGING_ASSET_CHANGED');
    }
    const rendered=await renderHyperframesComposition({composition:singleScene(composition,scene),motionStyle:style,
      subtitlePlan:sub,dataRoot:childRoot,hyperframes,ffmpeg,ffprobe,signal,renderCommand,timeoutMs});
    const src=join(childRoot,rendered.relativePath);
    await copyFile(src,segment);
    const qa=await probeMp4(segment,{ffprobe,signal});
    assert(qa.videoCodec==='h264'&&qa.audioCodec==='aac'&&qa.frameCount===scene.durationFrames&&
       qa.width===composition.profile.width&&qa.height===composition.profile.height,'HF_CACHE_SEGMENT_QA_FAILED');
    const bytes=(await stat(segment)).size,digest=await fileHash(segment);
    try{await copyFile(segment,path,fsConstants.COPYFILE_EXCL)}catch(e){if(e.code!=='EEXIST')throw e;}
    assert(await healthy(path,{bytes,file_sha256:digest},scene,composition,ffprobe,signal),'HF_CACHE_COLLISION');
    cacheDb.prepare('INSERT OR IGNORE INTO render_segment_cache(video_id,segment_hash,file_sha256,frames,bytes,relative_path,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id,key,digest,scene.durationFrames,bytes,relativePath,Date.now());
    const saved=cacheDb.prepare('SELECT * FROM render_segment_cache WHERE video_id=? AND segment_hash=?').get(id,key);
    assert(saved.file_sha256===digest&&saved.bytes===bytes&&saved.frames===scene.durationFrames,'HF_CACHE_RECORD_COLLISION');
    encoded++;
   }
   onProgress({completedScenes:i+1,totalScenes:composition.scenes.length,reusedSegments:reused});
  }
  const list=composition.scenes.map((_,i)=>`file 'scene-${String(i).padStart(4,'0')}.mp4'`).join('\n')+'\n';
  await writeFile(join(work,'concat.txt'),list,{mode:0o600});
  const concat=join(work,'concat.mp4'),finalTmp=join(work,'final.mp4');
  await runBinary(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-f','concat','-safe','1','-i',join(work,'concat.txt'),'-c','copy','-y',concat],{signal,timeoutMs:Math.max(60000,composition.totalFrames/composition.profile.fps*1000)});
  const fps=composition.profile.fps,seconds=composition.totalFrames/fps;
  await runBinary(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-i',concat,
    '-vf',`fps=${fps}:start_time=0,tpad=stop_mode=clone:stop_duration=${(2/fps).toFixed(6)}`,
    '-af',`aresample=async=1:first_pts=0,apad,atrim=duration=${seconds.toFixed(6)}`,
    '-frames:v',String(composition.totalFrames),'-t',seconds.toFixed(6),
    '-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p',
    '-c:a','aac','-ar','48000','-ac','2','-b:a','128k','-movflags','+faststart','-y',finalTmp],
    {signal,timeoutMs:Math.max(120000,seconds*20000)});
  const metadata=await probeMp4(finalTmp,{ffprobe,signal}),qa=checkMp4Quality(metadata,composition);
  assert(qa.passed,'HF_CACHE_FINAL_QA_FAILED');
  for(const x of pinned)assert(await safePinnedPath(root,x.asset)===x.path,'RENDER_ASSET_CHANGED');
  if(signal?.aborted)fail('RENDER_ABORTED');
  const old=await stat(finalPath).catch(()=>null);
  if(old){assert(old.isFile()&&await realpath(finalPath)===finalPath,'RENDER_EXISTING_OUTPUT_BAD');
    assert(checkMp4Quality(await probeMp4(finalPath,{ffprobe,signal}),composition).passed,'RENDER_EXISTING_OUTPUT_BAD');
  }else await rename(finalTmp,finalPath);
  return {engine:'hyperframes',videoId:id,compositionDigest:composition.digest,
    styleDigest:motionStyle?.digest??null,relativePath:`renders/${id}/${outputKey}.mp4`,
    bytes:(await stat(finalPath)).size,metadata,qa,thumbnail:null,
    segmentCache:{reused,encoded,total:composition.scenes.length}};
 }finally{await rm(work,{recursive:true,force:true});}
}
