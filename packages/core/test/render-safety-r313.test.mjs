import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,utimes,symlink,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {rm} from 'node:fs/promises';
import {estimateRenderDiskBytes,checkRenderDisk,cleanupOrphanRenderStages} from '../src/render-safety-r313.mjs';
import {runBinary} from '../src/render-ffmpeg-r2ext04.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';

const doc={profile:{width:1280,height:720,fps:30},totalFrames:900,
 scenes:[{voice:{asset:{bytes:100}},visual:{asset:{bytes:1000}}}]};
test('R3-13: conservative disk admission uses bavail, not root bfree',async()=>{
 const estimate=estimateRenderDiskBytes(doc,{engine:'hyperframes'});
 assert.ok(estimate.requiredBytes>256*1024*1024);
 const low=await checkRenderDisk('/safe',doc,{getStats:async()=>({bsize:4096,bavail:1,bfree:10**10})});
 assert.equal(low.ready,false);assert.equal(low.blocker,'RENDER_DISK_SPACE_LOW');
 const enough=await checkRenderDisk('/safe',doc,{getStats:async()=>({bsize:4096,bavail:10**7})});
 assert.equal(enough.ready,true);assert.equal(enough.blocker,null);
 assert.ok(estimateRenderDiskBytes(doc,{engine:'hyperframes'}).requiredBytes>=estimateRenderDiskBytes(doc,{engine:'ffmpeg-fastpath'}).requiredBytes);
});
test('R3-13: cannot silently pass unknown filesystem or invalid geometry',async()=>{
 await assert.rejects(checkRenderDisk('/safe',doc,{getStats:async()=>{throw Error('IO')}}),{code:'RENDER_DISK_CHECK_FAILED'});
 await assert.rejects(checkRenderDisk('/safe',doc,{getStats:async()=>({bsize:NaN,bavail:1})}),{code:'RENDER_DISK_CHECK_FAILED'});
 assert.throws(()=>estimateRenderDiskBytes({...doc,profile:{width:0,height:720,fps:30}}),{code:'RENDER_DISK_ESTIMATE_INVALID'});
});
test('R3-13: cleanup removes only old UUID stages, never cache/output or symlink',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r313-safe-'));const video=join(root,'renders','video-1');
 const older='.staging-12345678-1234-1234-1234-123456789012';
 const newer='.hyperframes-12345678-1234-1234-1234-123456789012';
 const outside=await mkdtemp(join(tmpdir(),'r313-outside-'));
 try{
  await mkdir(video,{recursive:true});
  await mkdir(join(video,older));await mkdir(join(video,newer));
  await mkdir(join(video,'.segment-cache'));
  await symlink(outside,join(video,'.staging-87654321-1234-1234-1234-123456789012'));
  await utimes(join(video,older),new Date(2020,0,1),new Date(2020,0,1));
  const report=await cleanupOrphanRenderStages(root,{now:Date.now(),minAgeMs:60_000});
  assert.equal(report.removed,1);
  const names=await readdir(video);
  assert.ok(!names.includes(older));assert.ok(names.includes(newer));assert.ok(names.includes('.segment-cache'));
  assert.ok((await stat(outside)).isDirectory());
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
test('R3-13: timed-out renderer subprocess is reaped',async()=>{
 await assert.rejects(runBinary(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:170}),{code:'RENDER_COMMAND_TIMEOUT'});
});
test('R3-13: aborted renderer subprocess is reaped with a distinct error',async()=>{
 const controller=new AbortController();
 const t=setTimeout(()=>controller.abort(),80);
 try{await assert.rejects(runBinary(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal,timeoutMs:4000}),{code:'RENDER_ABORTED'});}finally{clearTimeout(t);}
});
test('R3-13: recovered lease and idempotency key fence stale worker commit',()=>{
 let now=10_000;
 const store=new JobStore({clock:()=>now,leaseMs:100,baseBackoffMs:0});
 try{
  const payload={projectId:'vid',digest:'fixed'};
  const item=store.enqueue({key:'render:vid:click1',kind:'render:ffmpeg',payload,maxAttempts:2});
  const first=store.claim('worker-a');
  assert.equal(first.id,item.job.id);now+=200;
  assert.equal(store.recoverExpired(),1);
  assert.equal(store.complete(first.id,first.lease_token,{result:{wrong:true}}),false);
  const same=store.enqueue({key:'render:vid:click1',kind:'render:ffmpeg',payload,maxAttempts:2});
  assert.equal(same.reused,true);assert.equal(same.job.id,first.id);
  const second=store.claim('worker-b');assert.equal(second.id,first.id);
  assert.equal(store.complete(second.id,second.lease_token,{result:{passed:true}}),true);
  assert.equal(store.get(first.id).status,'succeeded');assert.equal(store.get(first.id).result.passed,true);
  assert.equal(store.recoverExpired(),0);
 }finally{store.close();}
});
