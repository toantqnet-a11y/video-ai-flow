import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository} from '../../../packages/core/src/index.mjs';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {operations} from '../../../packages/contracts/src/catalog.mjs';
function fixture(){const db=openProjectDb(),repo=new StudioRepository(db),channel=repo.createChannel({name:'Content'}),video=repo.createVideo(channel.id,{title:'Long form'}),controllers=createControllers({repo,store:{},registry:{},manifest:{}});
 const map=new Map(),app={};for(const method of ['get','post','put','patch','delete'])app[method]=(path,fn)=>map.set(method+' '+path,fn);
 registerStudioRoutes(app,{controllers,store:{}});return {db,video,map};}
const sample=()=>({topic:'Lịch sử internet',idea:'',sourceText:'',freePrompt:'Giải thích rõ',target:{mode:'duration',durationMinutes:35,wordCount:5075,wpm:145,chapterTargetWords:1100},styleOverrides:{},modelIds:[]});
async function invoke(f,method,path,body,version){const reply={status:200,code(n){this.status=n;return this;},send(v){return v;}};const result=await f.map.get(method+' '+path)({params:{id:f.video.id,version},body,log:{warn(){}}},reply);return {status:reply.status,result};}
test('R1-01 routes match generated API operations and normalize error without leaking prompt',async()=>{
 const f=fixture();try{
  for(const op of operations.filter(x=>x.path.includes('/content/')))assert.ok(f.map.has(op.method.toLowerCase()+' '+op.path),'Missing '+op.id);
  const path='/api/videos/:id/content/brief';
  const loaded=await invoke(f,'get',path);assert.equal(loaded.result.revision,0);
  const saved=await invoke(f,'put',path,{expectedRevision:0,brief:sample()});assert.equal(saved.result.revision,1);
  const conflict=await invoke(f,'put',path,{expectedRevision:0,brief:{...sample(),freePrompt:'PRIVATE SCRIPT'}});
  assert.equal(conflict.status,409);assert.deepEqual(conflict.result,{error:'CONTENT_VERSION_CONFLICT'});
  assert.ok(!JSON.stringify(conflict).includes('PRIVATE SCRIPT'));
  const validated=await invoke(f,'post','/api/videos/:id/content/brief/validate',sample());assert.equal(validated.result.willGenerate,false);
  const estimate=await invoke(f,'post','/api/videos/:id/content/estimate',sample());assert.equal(estimate.result.targetWords,5075);
  const revisions=await invoke(f,'get','/api/videos/:id/content/brief/revisions');assert.equal(revisions.result.items.length,1);
  const revision=await invoke(f,'get','/api/videos/:id/content/brief/revisions/:version',undefined,'1');assert.equal(revision.result.revision,1);
 }finally{f.db.close()}
});
