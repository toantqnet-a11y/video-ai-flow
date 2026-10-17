/** R2-02 public HTTP contract exercised without npm/Fastify dependencies. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,MasterScriptRepository,SceneBuilderRepository} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {operations} from '../../../packages/contracts/src/catalog.mjs';

const fixture=()=>{
 const db=openProjectDb(),store=new JobStore(),repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'Kênh'}),video=repo.createVideo(channel.id,{title:'Video'});
 const master=new MasterScriptRepository(repo),scenes=new SceneBuilderRepository(repo);
 const text=('Nội dung khoa học và trải nghiệm tự nhiên dành cho người Việt. ').repeat(35);
 master.save(video.id,{outlineRevision:0,selections:[],editedText:text,expectedRevision:0});
 master.approve(video.id,{revision:1,expectedRevision:1,videoRowVersion:repo.getVideo(video.id).rowVersion,acknowledgeWarnings:true});
 const preview=scenes.preview(video.id,{targetSeconds:12});
 const saved=scenes.apply(video.id,{approvedMasterRevision:1,expectedSceneRevision:0,videoRowVersion:preview.videoRowVersion,
  acknowledgeEdits:false,scenes:preview.scenes});
 db.prepare("INSERT INTO provider_accounts(id,provider_id,name,created_at,updated_at) VALUES('a','ollama','Ollama',1,1)").run();
 db.prepare("INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,created_at,updated_at) VALUES('local1','a','qwen2.5','llm','local','local',1,1)").run();
 const controllers=createControllers({repo,store,registry:{},manifest:{}});
 const map=new Map(),app={};for(const method of ['get','post','put','patch','delete'])app[method]=(path,fn)=>map.set(`${method.toUpperCase()} ${path}`,fn);
 registerStudioRoutes(app,{controllers,store});
 return {db,repo,store,video,saved,map,close(){store.close();db.close()}};
};
async function call(f,method,path,body,runId){
 const reply={status:200,code(v){this.status=v;return this},send(x){return x}};
 const result=await f.map.get(method+' '+path)({params:{id:f.video.id,runId},body,log:{warn(){}}},reply);
 return {status:reply.status,result};
}

test('R2-02 routes match OpenAPI and create a review-only job; never write prompt to scenes',async()=>{
 const f=fixture();try{
  for(const op of operations.filter(o=>o.path.includes('visual-prompts')))
   assert.ok(f.map.has(`${op.method} ${op.path}`),op.id);
  const original=f.repo.listScenes(f.video.id);
  const r=await call(f,'POST','/api/videos/:id/scenes/visual-prompts/generate',{
    sceneRevision:1,videoRowVersion:f.saved.state.videoRowVersion,modelId:'local1',requestKey:'api-request',indices:[0,1]});
  assert.equal(r.status,202);assert.equal(r.result.sceneCount,2);
  assert.equal(r.result.items.length,0);
  const listed=await call(f,'GET','/api/videos/:id/scenes/visual-prompts/runs');
  assert.equal(listed.result.items.length,1);
  const one=await call(f,'GET','/api/videos/:id/scenes/visual-prompts/runs/:runId',null,r.result.id);
  assert.equal(one.result.id,r.result.id);
  assert.deepEqual(f.repo.listScenes(f.video.id),original);
  const bad=await call(f,'POST','/api/videos/:id/scenes/visual-prompts/generate',{
    sceneRevision:1,videoRowVersion:f.saved.state.videoRowVersion,modelId:'local1',requestKey:'api-request',indices:[2]});
  assert.equal(bad.status,409);assert.deepEqual(bad.result,{error:'VISUAL_REQUEST_KEY_CONFLICT'});
 }finally{f.close()}
});
test('R2-02 visual run ID cannot be read from a different video',async()=>{
 const f=fixture();try{
  const r=await call(f,'POST','/api/videos/:id/scenes/visual-prompts/generate',{
    sceneRevision:1,videoRowVersion:f.saved.state.videoRowVersion,modelId:'local1',requestKey:'id-safety'});
  const channel=f.repo.createChannel({name:'Another'});const other=f.repo.createVideo(channel.id,{title:'Different'});
  const master=new MasterScriptRepository(f.repo);
  master.save(other.id,{outlineRevision:0,selections:[],editedText:'Xin chào. '.repeat(50),expectedRevision:0});
  master.approve(other.id,{revision:1,expectedRevision:1,videoRowVersion:f.repo.getVideo(other.id).rowVersion,acknowledgeWarnings:true});
  const builder=new SceneBuilderRepository(f.repo);const preview=builder.preview(other.id);
  builder.apply(other.id,{approvedMasterRevision:1,expectedSceneRevision:0,videoRowVersion:preview.videoRowVersion,acknowledgeEdits:false,scenes:preview.scenes});
  const result=await f.map.get('GET /api/videos/:id/scenes/visual-prompts/runs/:runId')({params:{id:other.id,runId:r.result.id},log:{warn(){}}},
   {code(status){this.status=status;return this},send(x){return x}});
  assert.deepEqual(result,{error:'VISUAL_RUN_NOT_FOUND'});
 }finally{f.close()}
});
