import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository} from '../../../packages/core/src/index.mjs';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {operations} from '../../../packages/contracts/src/catalog.mjs';

const brief=()=>({topic:'Chuyện công nghệ',idea:'',sourceText:'Nguồn phải kiểm chứng',freePrompt:'',
  target:{mode:'duration',durationMinutes:35,wordCount:5075,wpm:145,chapterTargetWords:1100},
  styleOverrides:{},modelIds:[],scriptSkillId:'educational'});
function fixture(){const db=openProjectDb(),repo=new StudioRepository(db),channel=repo.createChannel({name:'Studio'}),video=repo.createVideo(channel.id,{title:'Mẫu'}),
  controllers=createControllers({repo,store:{},registry:{},manifest:{}});
 const map=new Map(),app={};for(const method of ['get','post','put','patch','delete'])app[method]=(path,fn)=>map.set(method+' '+path,fn);
 registerStudioRoutes(app,{controllers,store:{}});
 const send=async(method,path,body)=>{const reply={status:200,code(n){this.status=n;return this},send(x){return x}};
  const result=await map.get(method+' '+path)({params:{id:video.id},body,log:{warn(){}}},reply);
  return {status:reply.status,result};};
 return {db,repo,video,controllers,map,send};
}
test('R1-EXT-01 API catalog/route parity and no provider calls in preview',async()=>{
 const f=fixture();try{
  for(const op of operations.filter(x=>x.path.includes('/script-skills')))assert.ok(f.map.has(op.method.toLowerCase()+' '+op.path));
  const catalog=await f.send('get','/api/content/script-skills');assert.equal(catalog.result.items.length,5);
  const missing=await f.send('post','/api/videos/:id/content/script-skills/plan',{briefRevision:1});assert.equal(missing.status,404);
  f.controllers.saveContentBrief(f.video.id,{expectedRevision:0,brief:brief()});
  const before=f.db.prepare('SELECT count(*) n FROM domain_events').get().n;
  const ok=await f.send('post','/api/videos/:id/content/script-skills/plan',{briefRevision:1});
  assert.equal(ok.result.steps.length,5);assert.equal(ok.result.willGenerate,false);
  assert.equal(f.db.prepare('SELECT count(*) n FROM domain_events').get().n,before);
 }finally{f.db.close()}
});
test('R1-EXT-01 route requires approval, exports immutable master and leaves DB unchanged',async()=>{
 const f=fixture();try{
  const raw='Xin chào mọi người! Hôm nay chúng ta tìm hiểu AI. '.repeat(7)+'\nKết luận: kiểm chứng các thông tin trước khi sử dụng.';
  f.controllers.saveContentBrief(f.video.id,{expectedRevision:0,brief:brief()});
  const draft=f.controllers.masterSave(f.video.id,{outlineRevision:0,selections:[],editedText:raw,expectedRevision:0});
  const denied=await f.send('post','/api/videos/:id/content/script-skills/export',{approvedRevision:draft.revision});
  assert.equal(denied.status,409);assert.deepEqual(denied.result,{error:'MASTER_APPROVAL_REQUIRED'});
  const state=f.controllers.masterState(f.video.id);
  f.controllers.masterApprove(f.video.id,{revision:draft.revision,expectedRevision:draft.revision,videoRowVersion:state.currentVideoRowVersion,acknowledgeWarnings:true});
  const before=f.db.prepare('SELECT count(*) n FROM domain_events').get().n;
  const response=await f.send('post','/api/videos/:id/content/script-skills/export',{approvedRevision:draft.revision});
  assert.equal(response.status,200);assert.equal(response.result.segments.map(x=>x.spokenText).join(''),raw);
  assert.equal(f.db.prepare('SELECT count(*) n FROM domain_events').get().n,before);
  assert.deepEqual(response.result,(await f.send('post','/api/videos/:id/content/script-skills/export',{approvedRevision:draft.revision})).result);
 }finally{f.db.close()}
});
test('R1-EXT-01 fail closed for unknown request fields and cross-video revision',async()=>{
 const f=fixture();try{
  f.controllers.saveContentBrief(f.video.id,{expectedRevision:0,brief:brief()});
  const hostile=await f.send('post','/api/videos/:id/content/script-skills/plan',{briefRevision:1,forcePaid:true,scriptSkillId:'shorts'});
  assert.equal(hostile.status,400);assert.equal(hostile.result.error,'SCRIPT_SKILL_PLAN_INVALID');
  const bad=await f.send('post','/api/videos/:id/content/script-skills/export',{approvedRevision:1,editedText:'forged'});
  assert.equal(bad.status,400);
  const other=f.repo.createVideo(f.repo.getVideo(f.video.id).channelId,{title:'Other'});
  assert.throws(()=>f.controllers.previewScriptSkill(other.id,{briefRevision:1}),{code:'CONTENT_REVISION_NOT_FOUND'});
 }finally{f.db.close()}
});
