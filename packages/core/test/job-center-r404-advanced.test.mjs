import test from 'node:test';
import assert from 'node:assert/strict';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {createJobCenter} from '../../../apps/api/src/job-center.mjs';
test('R4-04 bound pagination and filtered read-only queue never leaks job payload',()=>{
 const store=new JobStore({path:':memory:'});
 try{
  for(let i=0;i<5;i++)store.enqueue({key:'test-r404-'+i,kind:'render:ffmpeg',payload:{projectId:i<3?'video1':'video2',prompt:'PRIVATE SECRET PROMPT'},maxAttempts:1});
  const c=createJobCenter(store);
  const p=c.list({videoId:'video1',kind:'render:ffmpeg',limit:'2',cursor:'0'});
  assert.equal(p.items.length,2);assert.equal(p.nextCursor,'2');
  const next=c.list({videoId:'video1',kind:'render:ffmpeg',limit:'2',cursor:p.nextCursor});
  assert.equal(next.items.length,1);assert.equal(next.nextCursor,null);
  assert.equal(JSON.stringify(p).includes('PRIVATE SECRET PROMPT'),false);
  assert.throws(()=>c.list({cursor:'-1'}),{code:'INVALID_JOB_CURSOR'});
 }finally{store.close()}
});
test('R4-04 bulk forbids GPU inference retry and running cancellation',()=>{
 const store=new JobStore({path:':memory:'});
 try{
  const gpu=store.enqueue({key:'gpu-r404',kind:'scene:ai-video',payload:{projectId:'v1'},maxAttempts:1}).job;
  store.db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(gpu.id);
  const c=createJobCenter(store);
  assert.throws(()=>c.bulk({ids:[gpu.id],action:'retry',confirmation:'CONFIRM_BULK_JOBS'}),{code:'JOB_BULK_RETRY_FORBIDDEN'});
  const render=store.enqueue({key:'render-r404',kind:'render:ffmpeg',payload:{projectId:'v1'},maxAttempts:1}).job;
  const done=c.bulk({ids:[render.id],action:'cancel',confirmation:'CONFIRM_BULK_JOBS'});
  assert.equal(done.changed,1);assert.equal(c.get(render.id).status,'cancelled');
  assert.equal(c.get(gpu.id).status,'failed');
 }finally{store.close()}
});
