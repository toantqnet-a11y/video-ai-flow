/** API R0-11 tests exercise actual controller methods and registered routes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository} from '../../../packages/core/src/index.mjs';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';

function fixture(){const db=openProjectDb(),repo=new StudioRepository(db);
  const channel=repo.createChannel({name:'Kênh Demo'}),video=repo.createVideo(channel.id,{title:'Video Demo'});
  const controllers=createControllers({repo,store:{},registry:{},manifest:{}});
  const handlers=new Map(),app={};
  for(const method of ['get','post','put','patch','delete'])app[method]=(route,fn)=>handlers.set(`${method} ${route}`,fn);
  registerStudioRoutes(app,{controllers,store:{}});
  return {db,repo,video,controllers,handlers};
}

async function invoke(fn,body,id,version){const reply={status:200,code(n){this.status=n;return this},send(value){return value}};
  const result=await fn({params:{id,version},body,log:{warn(){}}},reply);return {result,status:reply.status};}

test('R0-11 saved revisions + preview are reachable through canonical controllers',()=>{
  const f=fixture();try{
    const {controllers:c,video:v}=f;
    assert.equal(c.videoConfig(v.id).version,1);
    const body={rowVersion:v.rowVersion,overrides:{media:{mode:'ai_video'}}};
    const preview=c.previewVideoConfig(v.id,body);
    assert.equal(preview.changed,true);
    assert.equal(c.videoConfig(v.id).version,1);
    const saved=c.updateVideoConfig(v.id,body);
    assert.equal(saved.version,2);
    assert.equal(c.videoConfigRevision(v.id,'1').effectivePreset.media.mode,'hybrid');
    assert.equal(c.videoConfigHistory(v.id).length,2);
  }finally{f.db.close()}
});

test('R0-11 HTTP adapter returns explicit impact error not internal exception',async()=>{
  const f=fixture();try{
    const v=f.repo.updateScript(f.video.id,{rowVersion:1,masterScript:'Hello.'});
    const body={rowVersion:v.rowVersion,overrides:{voice:{voice:'vi-VN-NamMinhNeural'}}};
    // Script exists; changing voice with no scenes/assets is safe to save as-is.
    assert.equal((await invoke(f.handlers.get('post /api/videos/:id/config/preview'),body,v.id)).status,200);
    f.repo.replaceScenes(v.id,{rowVersion:v.rowVersion,scenes:[{text:'Hello',durationMs:2000}]});
    const newer=f.repo.getVideo(v.id);
    const rejected=await invoke(f.handlers.get('put /api/videos/:id/config'),{...body,rowVersion:newer.rowVersion},v.id);
    assert.equal(rejected.status,409);assert.deepEqual(rejected.result,{error:'CONFIG_CHANGE_REVIEW_REQUIRED'});
    const approved=await invoke(f.handlers.get('put /api/videos/:id/config'),{...body,rowVersion:newer.rowVersion,confirmImpact:true},v.id);
    assert.equal(approved.status,200);assert.equal(approved.result.version,2);
    const history=await invoke(f.handlers.get('get /api/videos/:id/config/revisions'),{},v.id);
    assert.equal(history.result.items.length,2);
  }finally{f.db.close()}
});

test('R0-11 image jobs use VIDEO settings, not updated channel preset',async()=>{
  const f=fixture();try{
    let captured;
    f.controllers.queueAsset = undefined; // Test the actual controller built with a spy store.
    const c=createControllers({repo:f.repo,store:{enqueue(arg){captured=arg;return {job:{id:'test-job',kind:'asset:image',status:'pending'},reused:false}}},registry:{imageAdapter:{loadWorkflow:async()=>({'10':{inputs:{prompt:'p'}}})},list:()=>[{id:'comfyui',kind:'image',location:'local',costTier:'local'}]},manifest:{}});
    f.repo.updateVideoConfig(f.video.id,{rowVersion:1,overrides:{media:{style:'vector art'}}});
    const channel=f.repo.getChannel(f.video.channelId);const modified=structuredClone(channel.preset);
    modified.media.style='photoreal';f.repo.savePresetRevision(channel.id,{rowVersion:channel.rowVersion,preset:modified});
    const scene=f.repo.replaceScenes(f.video.id,{rowVersion:2,scenes:[{text:'Demo',durationMs:2500,visualPrompt:'a castle'}]})[0];
    await c.queueSceneImage(scene.id,{});
    assert.equal(captured.payload.style,'vector art');
  }finally{f.db.close()}
});
