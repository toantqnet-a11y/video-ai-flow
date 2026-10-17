import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,ContentBriefRepository,ContentOutlineRepository,normalizeOutline,normalizeGeneratedOutline,migrations} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
const sample=(modelIds=[])=>({topic:'Lịch sử công nghệ Việt Nam',idea:'Các giai đoạn chuyển đổi số',target:{mode:'duration',durationMinutes:35,wordCount:5075,wpm:145,chapterTargetWords:1100},modelIds});
const draft=(titles=['Mở đầu','Sự phát triển'])=>({chapters:titles.map((title,i)=>({id:`ch${i}`,title,objective:'Giải thích rõ',keyPoints:['Dẫn chứng'],targetWords:500}))});
function fixture(){
 const db=openProjectDb(),repo=new StudioRepository(db),channel=repo.createChannel({name:'Documentary'}),video=repo.createVideo(channel.id,{title:'Long video'}),store=new JobStore({path:':memory:'});
 db.prepare("INSERT INTO provider_accounts(id,provider_id,name,created_at,updated_at) VALUES('a','ollama','Ollama',1,1)").run();
 db.prepare("INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,created_at,updated_at) VALUES('local1','a','qwen2.5','llm','local','local',1,1)").run();
 const briefs=new ContentBriefRepository(repo),service=new ContentOutlineRepository(repo,{store});
 const b=briefs.save(video.id,{expectedRevision:0,brief:sample(['local1'])});
 return {db,repo,video,store,briefs,service,b,close(){store.close();db.close()}};
}
const code=(fn,wanted)=>assert.throws(fn,e=>e.code===wanted);

test('R1-02 new schema 14 and outline revisions never rewrite an approved master script',()=>{
 const f=fixture();try{
  assert.equal(f.db.prepare('PRAGMA user_version').get().user_version,migrations.at(-1).version);
  assert.equal(f.service.get(f.video.id).revision,0);
  const saved=f.service.save(f.video.id,{expectedRevision:0,outline:draft()});assert.equal(saved.revision,1);assert.equal(saved.totalWords,1000);
  assert.equal(f.service.save(f.video.id,{expectedRevision:1,outline:draft()}).unchanged,true);
  const moved={chapters:[...draft().chapters].reverse()};assert.equal(f.service.save(f.video.id,{expectedRevision:1,outline:moved}).revision,2);
  assert.equal(f.service.revision(f.video.id,1).outline.chapters[0].title,'Mở đầu');
  assert.equal(f.service.history(f.video.id).length,2);
  assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
  assert.throws(()=>f.db.prepare('DELETE FROM content_outline_revisions').run());
  assert.throws(()=>f.db.prepare("UPDATE content_outline_revisions SET data_json='{}'").run());
  assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{f.close()}
});

test('R1-02 strict editable shape, Unicode, boundary checks, stale revision',()=>{
 const f=fixture();try{
  for(const value of [undefined,{chapters:[]},{chapters:[{title:'',objective:'yes',targetWords:100}]},
     {chapters:[{title:'A',objective:'B',targetWords:49}]},{chapters:[{title:'A',objective:'B',targetWords:100,credential:'secret'}]},
     {chapters:[{id:'same',title:'A',objective:'B',targetWords:100},{id:'same',title:'B',objective:'B',targetWords:100}]},
     {chapters:Array(51).fill({title:'A',objective:'B',targetWords:100})}])assert.throws(()=>normalizeOutline(value));
  const saved=f.service.save(f.video.id,{expectedRevision:0,outline:draft(['Kiến thức Việt Nam'])});
  code(()=>f.service.save(f.video.id,{expectedRevision:0,outline:draft(['Stale'])}),'OUTLINE_VERSION_CONFLICT');
  assert.equal(f.service.get(f.video.id).revision,saved.revision);
 }finally{f.close()}
});

test('R1-02 generated plan conserves word budget and rejects malformed provider output',()=>{
 const b={target:{mode:'duration',durationMinutes:35,wpm:145,chapterTargetWords:1100}};
 const proposal=normalizeGeneratedOutline({chapters:Array.from({length:5},(_,i)=>({title:`Chương ${i+1}`,objective:'Kết cấu',keyPoints:['Lý do'],targetWords:1500}))},b);
 assert.equal(proposal.chapters.reduce((s,c)=>s+c.targetWords,0),5075);
 assert.deepEqual(proposal.chapters.map(x=>x.index),[0,1,2,3,4]);
 assert.throws(()=>normalizeGeneratedOutline({chapters:[{title:'x',objective:'',targetWords:1}]},b));
});

test('R1-02 queued run is idempotent, freezes brief revision and disallows paid/remote provider',()=>{
 const f=fixture();try{
  const input={briefRevision:1,expectedOutlineRevision:0,modelId:'local1',requestKey:'my-request-0001'};
  const created=f.service.requestRun(f.video.id,input);assert.equal(created.status,'queued');
  assert.ok(created.jobId);assert.equal(f.service.requestRun(f.video.id,input).jobId,created.jobId);
  code(()=>f.service.requestRun(f.video.id,{...input,expectedOutlineRevision:1}),'OUTLINE_REQUEST_CONFLICT');
  const saved=f.briefs.save(f.video.id,{expectedRevision:1,brief:{...sample(['local1']),topic:'Changed topic'}});
  assert.equal(saved.revision,2);
  const pinned=JSON.parse(f.db.prepare('SELECT brief_json FROM content_outline_runs WHERE id=?').get(created.id).brief_json);
  assert.equal(pinned.topic,'Lịch sử công nghệ Việt Nam');
  f.db.prepare("UPDATE provider_models SET cost_tier='paid',location='remote' WHERE id='local1'").run();
  code(()=>f.service.requestRun(f.video.id,{briefRevision:2,expectedOutlineRevision:0,modelId:'local1',requestKey:'other'}),'OUTLINE_LOCAL_MODEL_REQUIRED');
 }finally{f.close()}
});

test('R1-02 original brief/history remains unchanged after edits and generation requests',()=>{
 const f=fixture();try{
  f.service.requestRun(f.video.id,{briefRevision:1,expectedOutlineRevision:0,modelId:'local1',requestKey:'run1'});
  assert.equal(f.briefs.get(f.video.id).revision,1);
  assert.deepEqual(f.service.get(f.video.id).outline,{chapters:[]});
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM content_outline_revisions').get().n,0);
  code(()=>f.service.acceptRun(f.video.id,'wrong',{expectedRevision:0}),'OUTLINE_RUN_NOT_FOUND');
 }finally{f.close()}
});

test('R1-02 tombstoned video and unknown revisions/runs cannot be accessed',()=>{
 const f=fixture();try{
  code(()=>f.service.revision(f.video.id,1),'OUTLINE_REVISION_NOT_FOUND');
  code(()=>f.service.getRun(f.video.id,'missing'),'OUTLINE_RUN_NOT_FOUND');
  f.repo.softDeleteVideo(f.video.id,{rowVersion:f.video.rowVersion});
  code(()=>f.service.get(f.video.id),'VIDEO_NOT_FOUND');
 }finally{f.close()}
});
