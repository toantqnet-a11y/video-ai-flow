/** R2-VID-04: fail-closed cross-process GPU gate for a single local dataRoot.
 * mkdir is atomic on supported local filesystems; a crash deliberately leaves
 * the lock in place. No time-based lease stealing while an uncertain GPU
 * inference might still be running. Operator must inspect before clearing.
 */
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const abortError=()=>Object.assign(new Error('VIDEO_GPU_LOCK_ABORTED'),{code:'VIDEO_GPU_LOCK_ABORTED',retryable:false});
export async function withLocalGpuLock(dataRoot,action,{signal,waitMs=300000,sleepMs=400}={}){
 if(typeof action!=='function'||!Number.isSafeInteger(waitMs)||waitMs<0||waitMs>3600000)
  throw Object.assign(Error('VIDEO_GPU_LOCK_INVALID'),{code:'VIDEO_GPU_LOCK_INVALID'});
 const folder=join(dataRoot,'.scene-video-gpu.lock');
 const deadline=Date.now()+waitMs;
 for(;;){
  if(signal?.aborted)throw abortError();
  try{await mkdir(folder,{mode:0o700});break;}
  catch(error){
   if(error?.code!=='EEXIST')throw error;
   if(Date.now()>=deadline)throw Object.assign(Error('VIDEO_GPU_LOCK_BUSY_OR_UNCERTAIN'),
     {code:'VIDEO_GPU_LOCK_BUSY_OR_UNCERTAIN',retryable:false});
   // Wait instead of failing another ordered batch; never remove a foreign
   // lock based on its age, PID or file timestamp (PID can be reused).
   await new Promise((resolve,reject)=>{
    const timeout=setTimeout(done,sleepMs);
    const onAbort=()=>{clearTimeout(timeout);signal?.removeEventListener('abort',onAbort);reject(abortError());};
    function done(){signal?.removeEventListener('abort',onAbort);resolve();}
    signal?.addEventListener('abort',onAbort,{once:true});
   });
  }
 }
 // Only the owning worker reaches this code. A failed marker write still
 // triggers finally cleanup; other workers never delete another process' lock.
 try{
  await writeFile(join(folder,'owner.json'),JSON.stringify({pid:process.pid,token:randomUUID(),since:new Date().toISOString()}),{flag:'wx',mode:0o600});
  if(signal?.aborted)throw abortError();
  return await action();
 }finally{await rm(folder,{recursive:true,force:true});}
}
