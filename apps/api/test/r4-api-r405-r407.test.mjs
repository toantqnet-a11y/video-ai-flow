import test from 'node:test';import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository} from '../../../packages/core/src/index.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';import {createControllers} from '../src/controllers.mjs';
import {operationById} from '../../../packages/contracts/src/catalog.mjs';
function setup(){const db=openProjectDb(),repo=new StudioRepository(db),channel=repo.createChannel({name:'R4 API'}),video=repo.createVideo(channel.id,{title:'Bản thử'});
 const handlers=new Map(),app={};for(const action of ['get','post','put','patch','delete'])app[action]=(path,fn)=>handlers.set(`${action} ${path}`,fn);
 const controllers=createControllers({repo,store:{},registry:{},manifest:{}});registerStudioRoutes(app,{controllers,store:{}});
 return {db,repo,video,handlers};}
async function call(f,method,path,body){const reply={status:200,code(code){this.status=code;return this;},send(payload){return payload;}};
 const result=await f.handlers.get(`${method} ${path}`)({params:{id:f.video.id},body,log:{warn(){}}},reply);return {result,status:reply.status};}
test('R4-05/07 API routes are cataloged, return safe draft and fail closed for invalid source',async()=>{
 const f=setup();try{
  assert.equal(operationById.get('getSubtitleDraftR405').path,'/api/videos/:id/subtitles/draft');
  assert.equal(operationById.get('previewVisualConsistencyR407').method,'POST');
  const draft=await call(f,'get','/api/videos/:id/subtitles/draft');assert.equal(draft.result.revision,0);
  const stale=await call(f,'post','/api/videos/:id/subtitles/preview',{compositionRevision:1,overrides:[]});
  assert.equal(stale.status,409);assert.deepEqual(stale.result,{error:'COMPOSITION_SCENES_REQUIRED'});
  f.repo.replaceScenes(f.video.id,{rowVersion:1,scenes:[{text:'Hello',visualPrompt:'watercolor character',durationMs:2000}]});
  const analysis=await call(f,'post','/api/videos/:id/visual-consistency/preview',{styleToken:'watercolor',characterTokens:['character']});
  assert.equal(analysis.status,200);assert.equal(analysis.result.sceneCount,1);assert.equal(analysis.result.ready,false);
  const malformed=await call(f,'post','/api/videos/:id/visual-consistency/preview',{styleToken:'../../key',characterTokens:[]});
  assert.equal(malformed.status,400);assert.deepEqual(malformed.result,{error:'R4_STYLE_PROFILE_INVALID'});
 }finally{f.db.close()}
});
