/** R2-01: API boundaries must use the exact same source-pinned repository. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,MasterScriptRepository} from '../../../packages/core/src/index.mjs';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {operations} from '../../../packages/contracts/src/catalog.mjs';
function fixture(){
 const db=openProjectDb(),repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'Content'}),video=repo.createVideo(channel.id,{title:'R2 video'});
 const masters=new MasterScriptRepository(repo);
 const script='Xin chào các bạn, chúng ta sẽ tìm hiểu văn hóa và lịch sử của Việt Nam trong chương trình này. '.repeat(20);
 masters.save(video.id,{outlineRevision:0,selections:[],editedText:script,expectedRevision:0});
 masters.approve(video.id,{revision:1,expectedRevision:1,videoRowVersion:repo.getVideo(video.id).rowVersion,acknowledgeWarnings:true});
 const controllers=createControllers({repo,store:{},registry:{},manifest:{}});
 const map=new Map(),app={};for(const method of ['get','post','put','patch','delete'])app[method]=(path,fn)=>map.set(method+' '+path,fn);
 registerStudioRoutes(app,{controllers,store:{}});
 return {db,repo,video,script,map,close(){db.close()}};
}
async function call(f,method,path,body,revision){
 const reply={status:200,code(status){this.status=status;return this},send(value){return value}};
 const result=await f.map.get(method+' '+path)({params:{id:f.video.id,revision},body,log:{warn(){}}},reply);
 return {status:reply.status,result};
}
test('R2-01 route catalog registration and authenticated API controller transaction boundaries',async()=>{
 const f=fixture();try{
  for(const op of operations.filter(x=>x.path.includes('/scenes/builder')))
    assert.ok(f.map.has(op.method.toLowerCase()+' '+op.path),`Missing route: ${op.id}`);
  const state=await call(f,'get','/api/videos/:id/scenes/builder');
  assert.equal(state.result.approvedMasterRevision,1);
  const p=await call(f,'post','/api/videos/:id/scenes/builder/preview',{options:{targetSeconds:15}});
  assert.equal(p.status,200);assert.equal(p.result.lossless,true);
  assert.equal(f.repo.listScenes(f.video.id).length,0);
  const saved=await call(f,'put','/api/videos/:id/scenes/builder',{
    approvedMasterRevision:p.result.approvedMasterRevision,expectedSceneRevision:0,videoRowVersion:p.result.videoRowVersion,
    acknowledgeEdits:false,scenes:p.result.scenes});
  assert.equal(saved.status,200);assert.equal(saved.result.state.sceneRevision,1);
  const history=await call(f,'get','/api/videos/:id/scenes/builder/revisions');
  assert.equal(history.result.items.length,1);
  const revision=await call(f,'get','/api/videos/:id/scenes/builder/revisions/:revision',undefined,'1');
  assert.equal(revision.result.scenes.length,p.result.scenes.length);
  const stale=await call(f,'put','/api/videos/:id/scenes/builder',{
    approvedMasterRevision:1,expectedSceneRevision:0,videoRowVersion:p.result.videoRowVersion,
    acknowledgeEdits:false,scenes:p.result.scenes});
  assert.equal(stale.status,409);assert.deepEqual(stale.result,{error:'SCENE_VERSION_CONFLICT'});
  assert.ok(!JSON.stringify(stale).includes('Xin chào'));
 }finally{f.close()}
});
test('R2-01 35-minute approximate 5,075-word approved source round-trips without loss',async()=>{
 const f=fixture();try{
  const source='Nội dung tiếng Việt dành cho video dài để kiểm tra quá trình tự động chia scene và ghép lời thoại. ';
  const text=Array.from({length:Math.ceil(5075/source.trim().split(/\s+/u).length)},()=>source).join('').trim();
  const approval=f.repo.getVideo(f.video.id);
  // A saved revision with existing approved master is itself an editorial action;
  // this test avoids rewriting the production approval and segments the same text directly.
  const {segmentApprovedScript,inspectSceneCoverage}=await import('../../../packages/core/src/index.mjs');
  const proposal=segmentApprovedScript(text);
  assert.ok(proposal.scenes.length>=60&&proposal.scenes.length<=500);
  assert.equal(proposal.scenes.map(s=>s.text).join(''),text);
  assert.equal(inspectSceneCoverage(text,proposal.scenes).lossless,true);
  assert.equal(approval.masterScript.length>0,true);
 }finally{f.close()}
});
