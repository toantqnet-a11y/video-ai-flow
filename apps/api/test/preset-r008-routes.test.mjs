/** R0-08 boundary tests exercise the registered handlers/controllers (not live HTTP). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository} from '../../../packages/core/src/index.mjs';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {buildOpenApi} from '../../../packages/contracts/src/openapi.mjs';
import {defaultPreset,presetSchema} from '../../../packages/core/src/preset-schema.mjs';

const setup=()=>{
 const db=openProjectDb(),repo=new StudioRepository(db);
 const controllers=createControllers({repo,store:{},registry:{},manifest:{}});
 const handlers=new Map(),app={};
 for(const method of ['get','post','put','patch','delete'])app[method]=(path,fn)=>handlers.set(`${method.toUpperCase()} ${path}`,fn);
 registerStudioRoutes(app,{controllers,store:{}});
 return {db,repo,handlers};
};
const reply=()=>({status:200,code(s){this.status=s;return this;},send(x){return x;}});
const invoke=async(handlers,key,{id,version,body}={})=>{
 const r=reply();return {response:await handlers.get(key)({params:{id,version},body,log:{warn(){}}},r),status:r.status};
};

test('R0-08 guarded routes save, list and fetch immutable revisions',async()=>{
 const {db,repo,handlers}=setup();try{
  const c=repo.createChannel({name:'Official'});
  const newPreset=structuredClone(c.preset);newPreset.content.tone='Trung tính';
  const result=await invoke(handlers,'POST /api/channels/:id/presets/revisions',
    {id:c.id,body:{rowVersion:c.rowVersion,preset:newPreset}});
  assert.equal(result.status,200);assert.equal(result.response.version,2);
  const historical=await invoke(handlers,'GET /api/channels/:id/presets/:version',{id:c.id,version:'1'});
  assert.equal(historical.response.preset.content.tone,defaultPreset.content.tone);
  const list=await invoke(handlers,'GET /api/channels/:id/presets',{id:c.id});
  assert.deepEqual(list.response.items.map(x=>x.version),[2,1]);
  const cap=await invoke(handlers,'GET /api/preset-capabilities');
  assert.equal(cap.response.paidEnabledByDefault,false);
  assert(cap.response.mediaModes.includes('ai_video'));
 }finally{db.close()}
});

test('R0-08 routes return sanitized conflicts and do not mutate history on stale save',async()=>{
 const {db,repo,handlers}=setup();try{
  const c=repo.createChannel({name:'Locked'});
  const p=structuredClone(c.preset);p.media.mode='ai_video';
  await invoke(handlers,'POST /api/channels/:id/presets/revisions',
    {id:c.id,body:{rowVersion:c.rowVersion,preset:p}});
  const wrong=await invoke(handlers,'POST /api/channels/:id/presets/revisions',
    {id:c.id,body:{rowVersion:c.rowVersion,preset:p}});
  assert.deepEqual(wrong,{status:409,response:{error:'VERSION_CONFLICT'}});
  const missing=await invoke(handlers,'GET /api/channels/:id/presets/:version',{id:c.id,version:'not-a-number'});
  assert.deepEqual(missing,{status:400,response:{error:'INVALID_PRESET_VERSION'}});
  assert.equal(repo.listPresetRevisions(c.id).length,2);
 }finally{db.close()}
});

test('R0-08 published OpenAPI references the exact canonical preset schema',()=>{
 const doc=buildOpenApi();
 assert.deepEqual(doc.components.schemas.Preset,presetSchema);
 const paths=doc.paths;
 assert(paths['/api/channels/{id}/presets/revisions'].post);
 assert(paths['/api/channels/{id}/presets/{version}'].get);
 assert(paths['/api/preset-capabilities'].get);
});
