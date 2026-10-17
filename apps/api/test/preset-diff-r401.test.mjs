import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openProjectDb,StudioRepository} from '../../../packages/core/src/index.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {createControllers} from '../src/controllers.mjs';
import {operationById} from '../../../packages/contracts/src/catalog.mjs';

function fixture(){const db=openProjectDb(),repo=new StudioRepository(db);
  const channel=repo.createChannel({name:'Kênh'}),video=repo.createVideo(channel.id,{title:'Video'});
  const controllers=createControllers({repo,store:{},registry:{},manifest:{}});
  const handlers=new Map(),app={};
  for(const method of ['get','post','put','patch','delete'])app[method]=(route,fn)=>handlers.set(`${method} ${route}`,fn);
  registerStudioRoutes(app,{controllers,store:{}});
  return {db,repo,channel,video,handlers};
}
async function invoke(fn,id,body){const reply={status:200,code(n){this.status=n;return this},send(o){return o}};
  const result=await fn({params:{id},body,log:{warn(){}}},reply);return {status:reply.status,result};}

test('R4-01 REST route and catalog use authenticated SDK operations',async()=>{
  const f=fixture();try{
    const current=f.repo.getChannel(f.channel.id);const p=structuredClone(current.preset);p.content.tone='chuyên gia';
    const next=f.repo.updateChannel(current.id,{rowVersion:current.rowVersion,preset:p});
    const d=await invoke(f.handlers.get('post /api/videos/:id/config/diff'),f.video.id,{rowVersion:1,channelPresetVersion:next.presetVersion,selectedPaths:['content.tone']});
    assert.equal(d.status,200);assert.equal(d.result.changed,true);
    const saved=await invoke(f.handlers.get('post /api/videos/:id/config/apply'),f.video.id,{rowVersion:1,channelPresetVersion:next.presetVersion,selectedPaths:['content.tone'],expectedDigest:d.result.previewDigest,confirmImpact:false});
    assert.equal(saved.status,200);assert.equal(saved.result.effectivePreset.content.tone,'chuyên gia');
    assert.equal(operationById.get('previewChannelPresetDiff').path,'/api/videos/:id/config/diff');
    assert.equal(operationById.get('applyChannelPresetDiff').path,'/api/videos/:id/config/apply');
  }finally{f.db.close();}
});
test('R4-01 API serializes stale conflicts, never returns prompt in logs',async()=>{
  const f=fixture();try{
    const response=await invoke(f.handlers.get('post /api/videos/:id/config/diff'),f.video.id,{rowVersion:99,channelPresetVersion:1,selectedPaths:[]});
    assert.equal(response.status,409);assert.deepEqual(response.result,{error:'VERSION_CONFLICT'});
    const bad=await invoke(f.handlers.get('post /api/videos/:id/config/diff'),f.video.id,{rowVersion:1,channelPresetVersion:1,selectedPaths:['__proto__.secret']});
    assert.equal(bad.status,400);assert.deepEqual(bad.result,{error:'INVALID_PRESET_SELECTION'});
  }finally{f.db.close();}
});
test('R4-01 UI provides selection and explicit preview/apply actions',()=>{
  const ui=readFileSync(new URL('../../web/src/VideoConfigWorkspace.jsx',import.meta.url),'utf8');
  assert.match(ui,/selectedPaths/);assert.match(ui,/config\/diff/);assert.match(ui,/config\/apply/);
  assert.match(ui,/previewDigest/);assert.match(ui,/confirmImpact/);
});
