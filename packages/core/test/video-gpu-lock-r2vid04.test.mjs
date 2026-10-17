import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {withLocalGpuLock} from '../src/video-gpu-lock-r2vid04.mjs';

test('R2-VID-04: concurrent processes cannot dispatch together; waits, then releases',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r2vid04-lock-'));let count=0,max=0;
 try{
  const fn=()=>withLocalGpuLock(root,async()=>{count++;max=Math.max(max,count);await new Promise(r=>setTimeout(r,75));count--;});
  await Promise.all([fn(),fn(),fn()]);assert.equal(max,1);
  await assert.doesNotReject(()=>fn());
 }finally{await rm(root,{recursive:true,force:true});}
});
test('R2-VID-04: crash-surviving foreign lock fails closed; no automatic steal',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r2vid04-crash-'));
 try{
  await mkdir(join(root,'.scene-video-gpu.lock'));
  await assert.rejects(withLocalGpuLock(root,()=>{throw Error('should never run');},{waitMs:0}),e=>e.code==='VIDEO_GPU_LOCK_BUSY_OR_UNCERTAIN');
  const ac=new AbortController();ac.abort();
  await assert.rejects(withLocalGpuLock(root,()=>null,{signal:ac.signal}),e=>e.code==='VIDEO_GPU_LOCK_ABORTED');
 }finally{await rm(root,{recursive:true,force:true});}
});
