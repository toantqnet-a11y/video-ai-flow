/** R0-VID-01: controller/routes contract with real SQLite and mock HTTP registrar. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository} from '../../../packages/core/src/index.mjs';
import {ProviderRegistry} from '../../../packages/providers/src/index.mjs';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {operations} from '../../../packages/contracts/src/catalog.mjs';

const caps={modes:['text_to_video'],maxDurationSec:6,maxWidth:1280,maxHeight:720,maxFps:24,minVramGb:8,requiresGpu:true};
test('R0-VID-01 route methods match OpenAPI catalog',()=>{
 const app={routes:[],get(p){this.routes.push(['GET',p])},post(p){this.routes.push(['POST',p])},put(p){this.routes.push(['PUT',p])},patch(p){this.routes.push(['PATCH',p])},delete(p){this.routes.push(['DELETE',p])}};
 registerStudioRoutes(app,{controllers:{}});
 for(const id of ['listVideoProviderCapabilities','saveVideoProviderCapabilities','preflightVideoProvider']){
  const op=operations.find(x=>x.id===id);
  assert(op);assert(app.routes.some(r=>r[0]===op.method&&r[1]===op.path));
 }
});

test('R0-VID-01 controller read/save/preview with no network access',async()=>{
 const db=openProjectDb(),repo=new StudioRepository(db),registry=new ProviderRegistry();
 let calls=0;
 const store={countByStatus:()=>({}),get:()=>{calls++;return null}};
 try{
  const ctl=createControllers({repo,registry,store,manifest:{}});
  const a=await ctl.createProviderAccount({providerId:'comfyui',name:'Local'});
  const model=ctl.createProviderModel(a.id,{modelId:'wan-local',kind:'video'});
  assert.equal(ctl.videoProviderCapabilities().items.length,1);
  assert.equal(ctl.videoProviderCapabilities().items[0].configured,false);
  assert.equal(ctl.saveVideoProviderCapabilities(model.id,{revision:0,capabilities:caps}).revision,1);
  const r=ctl.preflightVideoProvider({modelId:model.id,mode:'text_to_video',durationSec:5,width:1280,height:720,fps:24,allowRemote:false,fallbackImageMotion:false});
  assert.equal(r.canPlan,true);assert.equal(r.willQueue,false);assert.equal(calls,0);
 }finally{db.close()}
});

test('R0-VID-01 rejects video job before enqueue without chosen capability model or valid declared limits',async()=>{
 const db=openProjectDb(),repo=new StudioRepository(db),registry=new ProviderRegistry();
 let queued=0;
 const store={countByStatus:()=>({}),get:()=>null,enqueue:()=>{queued++;throw new Error('SHOULD_NOT_ENQUEUE')}};
 try{
  const ctl=createControllers({repo,registry,store,manifest:{}});
  const channel=repo.createChannel({name:'Scene Studio'}),video=repo.createVideo(channel.id,{title:'Test'});
  const [scene]=repo.replaceScenes(video.id,{rowVersion:1,scenes:[{text:'Test scene',durationMs:6000}]});
  const a=await ctl.createProviderAccount({providerId:'comfyui',name:'local'});
  const m=ctl.createProviderModel(a.id,{modelId:'wan-configured-workflow',kind:'video'});
  const request={mode:'text_to_video',prompt:'A mountain landscape',durationSeconds:6,width:1280,height:720,fps:24};
  assert.throws(()=>ctl.queueAsset(scene.id,{kind:'video',idempotencyKey:'job-video-1',request}),{code:'VIDEO_MODEL_REQUIRED'});
  assert.throws(()=>ctl.queueAsset(scene.id,{kind:'video',idempotencyKey:'job-video-2',request,providerModelId:m.id}),{code:'VIDEO_PREFLIGHT_BLOCKED'});
  ctl.saveVideoProviderCapabilities(m.id,{revision:0,capabilities:caps});
  assert.throws(()=>ctl.queueAsset(scene.id,{kind:'video',idempotencyKey:'job-video-3',request:{...request,durationSeconds:45},providerModelId:m.id}),{code:'VIDEO_PREFLIGHT_BLOCKED'});
  assert.throws(()=>ctl.queueAsset(scene.id,{kind:'video',idempotencyKey:'job-video-4',request:{...request,apiKey:'bad'},providerModelId:m.id}),{code:'INVALID_VIDEO_REQUEST'});
  assert.equal(queued,0);
 }finally{db.close()}
});

test('R0-VID-01 paid video jobs remain disabled even with UI-provided remoteConsent',async()=>{
 const db=openProjectDb(),repo=new StudioRepository(db),registry=new ProviderRegistry();let queued=0;
 const store={countByStatus:()=>({}),get:()=>null,enqueue:()=>{queued++;throw new Error('PAID_QUEUED')}};
 try{
  const ctl=createControllers({repo,registry,store,manifest:{}});
  const ch=repo.createChannel({name:'Video'}),v=repo.createVideo(ch.id,{title:'Test'});
  const [scene]=repo.replaceScenes(v.id,{rowVersion:1,scenes:[{text:'Test',durationMs:6000}]});
  const a=await ctl.createProviderAccount({providerId:'seedance',name:'Paid account'});
  const m=ctl.createProviderModel(a.id,{modelId:'seedance',kind:'video'});
  ctl.saveVideoProviderCapabilities(m.id,{revision:0,capabilities:{...caps,minVramGb:null,requiresGpu:false}});
  const body={kind:'video',idempotencyKey:'paid1234',providerModelId:m.id,remoteConsent:true,
    paidApproval:{approved:true},request:{mode:'text_to_video',prompt:'a lake',durationSeconds:6,width:1280,height:720,fps:24}};
  assert.throws(()=>ctl.queueAsset(scene.id,body),{code:'VIDEO_PREFLIGHT_BLOCKED'});
  assert.equal(queued,0);
 }finally{db.close()}
});

test('R0-VID-01 configured local model permits only a queued job, not a fake success',async()=>{
 const db=openProjectDb(),repo=new StudioRepository(db),registry=new ProviderRegistry();
 let recorded=null;
 const store={countByStatus:()=>({}),get:()=>null,
   enqueue:job=>{recorded=job;return {job:{id:'queued-dry-local',status:'pending',kind:job.kind,createdAt:Date.now()},reused:false}}};
 try{
  const ctl=createControllers({repo,registry,store,manifest:{}});
  const ch=repo.createChannel({name:'Video'}),v=repo.createVideo(ch.id,{title:'Test'});
  const [scene]=repo.replaceScenes(v.id,{rowVersion:1,scenes:[{text:'Test',durationMs:6000}]});
  const a=await ctl.createProviderAccount({providerId:'comfyui',name:'Local'});
  const m=ctl.createProviderModel(a.id,{modelId:'wan-workflow',kind:'video'});
  ctl.saveVideoProviderCapabilities(m.id,{revision:0,capabilities:caps});
  const request={mode:'text_to_video',prompt:'sunset over the sea',durationSeconds:6,width:1280,height:720,fps:24};
  const saved=ctl.queueAsset(scene.id,{kind:'video',idempotencyKey:'local-scene-6',providerModelId:m.id,request});
  assert.equal(saved.job.status,'pending');
  assert.equal(recorded.kind,'asset:video');
  assert.equal(recorded.payload.providerModelId,m.id);
  assert.equal(recorded.payload.remoteConsent,false);
  assert.equal(recorded.payload.request.prompt,'sunset over the sea');
 }finally{db.close()}
});
