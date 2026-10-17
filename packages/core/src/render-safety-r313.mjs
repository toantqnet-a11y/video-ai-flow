/** R3-13: disk admission and orphan staging collection for LOCAL render jobs.
 * Why: retries must not fill the filesystem or mistake partial exports for QA'd
 * outputs. Capacity estimates are deliberately conservative, NOT guarantees.
 */
import {statfs,readdir,lstat,realpath,rm} from 'node:fs/promises';
import {join,sep} from 'node:path';
import {DomainError} from './domain.mjs';

const MiB=1024**2;
const GiB=1024**3;
const error=(code,status=409)=>{throw new DomainError(code,status)};
const safeSize=n=>Number.isSafeInteger(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;

/** Approximate simultaneous temp segments + mux + MP4 + intermediate files.
 * Do not show this as a guaranteed output file size; refuse unsafe arithmetic.
 */
export function estimateRenderDiskBytes(composition,{engine='hyperframes'}={}){
 const p=composition?.profile;
 if(!p||![p.width,p.height,p.fps,composition.totalFrames].every(n=>safeSize(n)&&n>0)||
   !Array.isArray(composition.scenes)||!['hyperframes','ffmpeg-fastpath'].includes(engine))error('RENDER_DISK_ESTIMATE_INVALID',400);
 const seconds=composition.totalFrames/p.fps,mp=p.width*p.height/1e6;
 const inputBytes=composition.scenes.reduce((sum,scene)=>sum+(Number(scene?.voice?.asset?.bytes)||0)+(Number(scene?.visual?.asset?.bytes)||0),0);
 if(!Number.isFinite(seconds)||seconds>12*3600||!Number.isFinite(inputBytes)||inputBytes>Number.MAX_SAFE_INTEGER)error('RENDER_DISK_ESTIMATE_INVALID',400);
 // Baseline H.264/AAC bitrate scales with pixels. Multiplier includes staging,
 // duplicate encoding/mux, and error margin; HyperFrames copies input media.
 const predicted=seconds*((2_500_000*mp+192_000)/8);
 const needed=Math.ceil(256*MiB+predicted*(engine==='hyperframes'?7:5)+(engine==='hyperframes'?inputBytes:0));
 if(!safeSize(needed))error('RENDER_DISK_ESTIMATE_INVALID',400);
 return {requiredBytes:needed,reserveBytes:512*MiB,estimatedWorkingBytes:needed,estimateOnly:true};
}

/** statfs.bavail is the blocks usable by THIS user; bfree overstates space. */
export async function checkRenderDisk(dataRoot,composition,{engine='hyperframes',getStats=statfs}={}){
 const estimate=estimateRenderDiskBytes(composition,{engine});
 try{
  const s=await getStats(dataRoot);
  const available=Number(s.bavail)*Number(s.bsize);
  if(!Number.isFinite(available)||available<0||!Number.isSafeInteger(available))error('RENDER_DISK_CHECK_FAILED',503);
  return {...estimate,availableBytes:available,ready:available>=estimate.requiredBytes+estimate.reserveBytes,
    // No machine-specific directory names in the HTTP response.
    blocker:available>=estimate.requiredBytes+estimate.reserveBytes?null:'RENDER_DISK_SPACE_LOW'};
 }catch(e){if(e instanceof DomainError)throw e;error('RENDER_DISK_CHECK_FAILED',503);}
}

/** Remove only old, known disposable UUID-named directories. Never touch
 * hashed published MP4/JPEG/SRT or the segment cache. Startup-only (before
 * workers begin): age grace protects separate still-running app processes.
 */
export async function cleanupOrphanRenderStages(dataRoot,{now=Date.now(),minAgeMs=24*3600*1000,dryRun=false}={}){
 if(!Number.isFinite(now)||!Number.isFinite(minAgeMs)||minAgeMs<60_000)error('RENDER_CLEANUP_INVALID',400);
 const root=await realpath(dataRoot);
 const base=join(root,'renders');
 const dirs=await readdir(base,{withFileTypes:true}).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));
 let scanned=0,removed=0,skipped=0;
 for(const project of dirs){
  if(!project.isDirectory()||!/^[a-zA-Z0-9-]{1,100}$/.test(project.name))continue;
  const projectDir=join(base,project.name);
  if(await realpath(projectDir)!==projectDir){skipped++;continue;}
  const children=await readdir(projectDir,{withFileTypes:true});
  for(const child of children){
   if(!/^\.(?:staging|hyperframes)-[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(child.name))continue;
   scanned++;
   if(!child.isDirectory()||child.isSymbolicLink()){skipped++;continue;}
   const path=join(projectDir,child.name);
   const s=await lstat(path);
   if(!s.isDirectory()||s.isSymbolicLink()||now-s.mtimeMs<minAgeMs){skipped++;continue;}
   // Parent and entry symlink checks prevent following an out-of-root target.
   const resolved=await realpath(path);
   if(resolved!==path||!resolved.startsWith(root+sep)){skipped++;continue;}
   if(!dryRun)await rm(path,{recursive:true,force:true});
   removed++;
  }
 }
 return {scanned,removed,skipped,dryRun};
}
