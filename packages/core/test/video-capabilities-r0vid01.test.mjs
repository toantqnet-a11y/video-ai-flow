/** R0-VID-01: real SQLite capabilities; no GPU or network required. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,VideoCapabilityRepository,ProviderAccountRepository,migrations} from '../src/index.mjs';

const cap={modes:['image_to_video','text_to_video'],maxDurationSec:8,maxWidth:1280,maxHeight:720,
  maxFps:30,minVramGb:12,requiresGpu:true};
const input=(id,rest={})=>({modelId:id,mode:'text_to_video',durationSec:6,width:1280,height:720,fps:24,
  allowRemote:false,fallbackImageMotion:true,...rest});
function fixture(provider='comfyui',modelKind='video'){
 const db=openProjectDb(),accounts=new ProviderAccountRepository(db),repo=new VideoCapabilityRepository(db);
 const a=accounts.createAccount({providerId:provider,name:'test'});
 const m=accounts.createModel(a.id,{modelId:'demo-model',kind:modelKind});
 return {db,accounts,repo,a,m,close:()=>db.close()};
}

test('R0-VID-01 version 11 migration creates capability table and correct version',()=>{
 const f=fixture();try{
  assert(f.db.prepare('PRAGMA user_version').get().user_version>=11);
  assert(migrations.some(m=>m.version===11)); // Later additive migrations must preserve v11 capabilities.
  assert.equal(f.repo.get(f.m.id),null);
  assert.equal(f.repo.list().length,1);
 }finally{f.close()}
});

test('R0-VID-01 canonical mode sort, durable read and non-verified evidence',()=>{
 const f=fixture();try{
  const saved=f.repo.save(f.m.id,{revision:0,capabilities:cap});
  assert.deepEqual(saved.capabilities.modes,['image_to_video','text_to_video']);
  assert.equal(saved.source,'user_declared');assert.equal(saved.verified,false);
  assert.equal(f.repo.list()[0].capability.revision,1);
  assert.equal(f.repo.get(f.m.id).capabilities.maxDurationSec,8);
  assert(!JSON.stringify(f.repo.list()).includes('credentialId'));
 }finally{f.close()}
});

test('R0-VID-01 require optimistic revision to avoid lost capability update',()=>{
 const f=fixture();try{
  f.repo.save(f.m.id,{revision:0,capabilities:cap});
  assert.throws(()=>f.repo.save(f.m.id,{revision:0,capabilities:cap}),{code:'VERSION_CONFLICT',status:409});
  assert.equal(f.repo.save(f.m.id,{revision:1,capabilities:{...cap,maxFps:24}}).revision,2);
 }finally{f.close()}
});

test('R0-VID-01 rejects dangerous and fake verified capability metadata',()=>{
 const f=fixture();try{
  for (const bad of [{...cap,providerVerified:true},{...cap,modes:[]},{...cap,modes:['text_to_video','text_to_video']},
    {...cap,modes:['video_to_video']},{...cap,minVramGb:-1},{...cap,maxDurationSec:0},
    {...cap,maxWidth:999999},{...cap,requiresGpu:'false'}])
    assert.throws(()=>f.repo.save(f.m.id,{revision:0,capabilities:bad}),{code:'INVALID_VIDEO_CAPABILITIES'});
  assert.equal(f.repo.get(f.m.id),null);
 }finally{f.close()}
});

test('R0-VID-01 non-video model is not accepted',()=>{
 const f=fixture('ollama','llm');try{
  assert.equal(f.repo.list().length,0);
  assert.throws(()=>f.repo.save(f.m.id,{revision:0,capabilities:cap}),{code:'NOT_VIDEO_MODEL',status:409});
 }finally{f.close()}
});

test('R0-VID-01 preflight is fail-closed before capabilities are configured',()=>{
 const f=fixture();try{
  const out=f.repo.preflight(input(f.m.id));
  assert.equal(out.canPlan,false);assert(out.blockers.includes('CAPABILITIES_NOT_CONFIGURED'));
  assert.equal(out.proposedFallback,'image_motion');assert.equal(out.willQueue,false);assert.equal(out.willBill,false);
 }finally{f.close()}
});

test('R0-VID-01 preflight enforces model mode, duration, resolution, fps',()=>{
 const f=fixture();try{
  f.repo.save(f.m.id,{revision:0,capabilities:{...cap,modes:['text_to_video']}});
  let out=f.repo.preflight(input(f.m.id,{mode:'image_to_video',durationSec:12,width:1920,height:1080,fps:60}));
  assert.deepEqual(out.blockers,['MODE_NOT_SUPPORTED','DURATION_EXCEEDED','RESOLUTION_EXCEEDED','FPS_EXCEEDED']);
  assert.equal(out.proposedFallback,'image_motion');
  out=f.repo.preflight(input(f.m.id,{fallbackImageMotion:false}));
  assert.equal(out.canPlan,true);assert.equal(out.proposedFallback,null);
  assert(out.warnings.includes('GPU_NOT_VERIFIED'));assert(out.warnings.includes('INFERENCE_NOT_VERIFIED'));
 }finally{f.close()}
});

test('R0-VID-01 disabled model/account and exhausted estimated quota block preflight',()=>{
 const f=fixture();try{
  f.repo.save(f.m.id,{revision:0,capabilities:cap});
  f.accounts.updateModel(f.m.id,{rowVersion:1,status:'disabled'});
  assert(f.repo.preflight(input(f.m.id)).blockers.includes('MODEL_DISABLED'));
  f.accounts.updateModel(f.m.id,{rowVersion:2,status:'active'});
  f.accounts.setQuota(f.m.id,{rowVersion:3,source:'estimated',limit:4,used:4});
  assert(f.repo.preflight(input(f.m.id)).blockers.includes('QUOTA_EXHAUSTED'));
  f.accounts.updateAccount(f.a.id,{rowVersion:1,status:'disabled'});
  assert(f.repo.preflight(input(f.m.id)).blockers.includes('MODEL_DISABLED'));
 }finally{f.close()}
});

test('R0-VID-01 remote paid Seedance always needs paid execution approval',()=>{
 const f=fixture('seedance');try{
  f.repo.save(f.m.id,{revision:0,capabilities:{...cap,requiresGpu:false,minVramGb:null}});
  assert.deepEqual(f.repo.preflight(input(f.m.id)).blockers,['REMOTE_CONSENT_REQUIRED','PAID_APPROVAL_REQUIRED']);
  const after=f.repo.preflight(input(f.m.id,{allowRemote:true}));
  assert(after.blockers.includes('PAID_APPROVAL_REQUIRED'));
  assert.equal(after.willQueue,false);assert.equal(after.willBill,false);
 }finally{f.close()}
});

test('R0-VID-01 remote free unverified is never described as guaranteed free',()=>{
 const f=fixture('gemini');try{
  f.repo.save(f.m.id,{revision:0,capabilities:{...cap,requiresGpu:false,minVramGb:null}});
  const out=f.repo.preflight(input(f.m.id,{allowRemote:true}));
  assert(out.blockers.includes('FREE_TIER_NOT_VERIFIED'));
 }finally{f.close()}
});

test('R0-VID-01 bad preflight input and unknown IDs fail without side effects',()=>{
 const f=fixture();try{
  const before=f.db.prepare('SELECT count(*) n FROM domain_events').get().n;
  for(const bad of [input(f.m.id,{width:1}),input(f.m.id,{remoteApproval:true}),input(f.m.id,{fps:0}),input(f.m.id,{durationSec:100000})])
    assert.throws(()=>f.repo.preflight(bad),{code:'INVALID_VIDEO_PREFLIGHT'});
  assert.throws(()=>f.repo.preflight(input('fake')),{code:'VIDEO_MODEL_NOT_FOUND',status:404});
  f.repo.preflight(input(f.m.id));
  assert.equal(f.db.prepare('SELECT count(*) n FROM domain_events').get().n,before);
 }finally{f.close()}
});

test('R0-VID-01 foreign key prevents orphan metadata rows',()=>{
 const f=fixture();try{
  assert.throws(()=>f.repo.save('nonexistent',{revision:0,capabilities:cap}),{code:'PROVIDER_MODEL_NOT_FOUND',status:404});
  assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{f.close()}
});
