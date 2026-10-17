import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,ContentBriefRepository,normalizeContentBrief,estimateContent} from '../src/index.mjs';
function fixture(){const db=openProjectDb(),repo=new StudioRepository(db),channel=repo.createChannel({name:'Demo'}),video=repo.createVideo(channel.id,{title:'Video',brief:'Bài kể về tương lai công nghệ.',targetMinutes:35});return {db,repo,video,channel,service:new ContentBriefRepository(repo)};}
const sample=()=>({topic:'  Việt Nam và công nghệ  ',idea:' Giới thiệu lịch sử ',sourceText:'Tài liệu quan trọng',freePrompt:'Viết ngắn gọn.',target:{mode:'duration',durationMinutes:35,wordCount:4000,wpm:145,chapterTargetWords:1100},modelIds:[],styleOverrides:{tone:'tin tức'}});
function throwsCode(fn,code){assert.throws(fn,e=>e.code===code);}
test('R1-01 defaults are inherited from THIS video, distinct from later channel changes',()=>{
 const f=fixture();try{const read=f.service.get(f.video.id);assert.equal(read.revision,0);assert.match(read.brief.idea,/tương lai/);
   assert.equal(read.estimate.targetWords,5075);assert.equal(read.estimate.chapterCount,5);assert.equal(read.inherited.style,f.video.effectivePreset.content.style);
   f.repo.updateChannel(f.channel.id,{rowVersion:f.channel.rowVersion,preset:{...f.channel.preset,content:{...f.channel.preset.content,tone:'New channel tone'}}});
   assert.equal(f.service.get(f.video.id).inherited.tone,read.inherited.tone);
 }finally{f.db.close()}
});
test('R1-01 unicode data survives restarts; immutable revision and no-op save',()=>{
 const f=fixture();try{const body=sample();const a=f.service.save(f.video.id,{expectedRevision:0,brief:body});assert.equal(a.revision,1);
   const b=f.service.save(f.video.id,{expectedRevision:1,brief:normalizeContentBrief(body)});assert.equal(b.unchanged,true);assert.equal(b.revision,1);
   body.idea='Nội dung mới';const c=f.service.save(f.video.id,{expectedRevision:1,brief:body});assert.equal(c.revision,2);
   assert.equal(f.service.revision(f.video.id,1).brief.idea,'Giới thiệu lịch sử');assert.equal(f.service.history(f.video.id).length,2);
   assert.equal(f.service.get(f.video.id).brief.idea,'Nội dung mới');
   assert.throws(()=>f.db.prepare("UPDATE content_brief_revisions SET data_json='{}' WHERE revision=1").run());
   assert.throws(()=>f.db.prepare('DELETE FROM content_brief_revisions').run());
   assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
   assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{f.db.close()}
});
test('R1-01 stale optimistic revisions reject writes and preserve last good data',()=>{
 const f=fixture();try{f.service.save(f.video.id,{expectedRevision:0,brief:sample()});
   const changed={...sample(),topic:'First winner'};f.service.save(f.video.id,{expectedRevision:1,brief:changed});
   throwsCode(()=>f.service.save(f.video.id,{expectedRevision:1,brief:{...sample(),topic:'stale'}}),'CONTENT_VERSION_CONFLICT');
   assert.equal(f.service.get(f.video.id).brief.topic,'First winner');
 }finally{f.db.close()}
});
test('R1-01 validation limits, unknown fields, roles and unsafe model ids fail closed',()=>{
 for(const payload of [{...sample(),topic:'x'.repeat(501)}, {...sample(),role:'system'}, {...sample(),target:{...sample().target,wpm:99}},
   {...sample(),modelIds:['../../secrets']},{...sample(),modelIds:['same','same']},{...sample(),modelIds:['a','b','c','d']},
   {...sample(),styleOverrides:{apikey:'bad'}},{...sample(),sourceText:'x'.repeat(100001)}])
   assert.throws(()=>normalizeContentBrief(payload));
 const x=normalizeContentBrief(sample());assert.equal(x.topic,'Việt Nam và công nghệ');assert.equal(x.styleOverrides.tone,'tin tức');
});
test('R1-01 estimate supports words and duration, no generation side effects',()=>{
 const a=normalizeContentBrief(sample());assert.deepEqual(estimateContent(a),{targetWords:5075,estimatedMinutes:35,chapterCount:5,chapterTargetWords:1100,wpm:145,isEstimate:true,recommendOutline:true});
 a.target.mode='words';a.target.wordCount=2000;assert.equal(estimateContent(a).chapterCount,2);
 const f=fixture();try{const rejected=f.service.validate(f.video.id,{...sample(),modelIds:[]});assert.equal(rejected.valid,false);assert.ok(rejected.errors.includes('CONTENT_MODEL_REQUIRED'));
   assert.equal(f.service.get(f.video.id).revision,0);
   assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM domain_events WHERE event_name='content.brief.saved'").get().n,0);
 }finally{f.db.close()}
});
test('R1-01 model validation checks active LLMs, never approves paid models',()=>{
 const f=fixture();try{
   f.db.prepare(`INSERT INTO provider_accounts(id,provider_id,name,created_at,updated_at) VALUES('a','gemini','Gemini',1,1)`).run();
   f.db.prepare(`INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,created_at,updated_at)
     VALUES('llm1','a','gemini-test','llm','remote','paid',1,1)`).run();
   assert.deepEqual(f.service.validate(f.video.id,{...sample(),modelIds:['llm1']}),{
     valid:true,errors:[],estimate:estimateContent(normalizeContentBrief(sample())),modelIdsAvailable:['llm1'],requiresPaidApproval:true,willGenerate:false});
   assert.equal(f.service.validate(f.video.id,{...sample(),modelIds:['unknown']}).valid,false);
 }finally{f.db.close()}
});
test('R1-01 missing/tombstoned video and invalid revisions handled correctly',()=>{
 const f=fixture();try{throwsCode(()=>f.service.get('unknown'),'VIDEO_NOT_FOUND');
   throwsCode(()=>f.service.revision(f.video.id,1),'CONTENT_REVISION_NOT_FOUND');
   throwsCode(()=>f.service.save(f.video.id,{expectedRevision:-1,brief:sample()}),'INVALID_CONTENT_REQUEST');
   f.repo.softDeleteVideo(f.video.id,{rowVersion:f.video.rowVersion});
   throwsCode(()=>f.service.save(f.video.id,{expectedRevision:0,brief:sample()}),'VIDEO_NOT_FOUND');
 }finally{f.db.close()}
});
test('R1-01 migrations upgrade an existing v12 SQLite file and preserve video/scene data',async()=>{
 const {mkdtempSync,rmSync,readdirSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {migrations}=await import('../src/db.mjs');
 const dir=mkdtempSync(join(tmpdir(),'studio-r101-migrate-')),file=join(dir,'studio.sqlite');
 // Use exact historical migration definitions to produce a v12 file. Never
 // rewrite published migrations/checksums just to make upgrade tests pass.
 const newer=migrations.splice(12); // Preserve historical v13 and new v14 during v12 fixture setup.
 try{
   let db=openProjectDb(file);const repo=new StudioRepository(db);
   const channel=repo.createChannel({name:'Lưu trữ cũ'}),video=repo.createVideo(channel.id,{title:'Video cũ'});
   db.close();migrations.push(...newer);
   db=openProjectDb(file);
   assert.equal(db.prepare('PRAGMA user_version').get().user_version,migrations.length);
   const service=new ContentBriefRepository(new StudioRepository(db));
   assert.ok(service.get(video.id));assert.equal(db.prepare('SELECT COUNT(*) n FROM videos').get().n,1);
   db.close();
   assert.ok(readdirSync(dir).some(name=>name.includes(`pre-v${migrations.at(-1).version}`)));
 }finally{if(migrations.length<newer.at(-1).version)migrations.push(...newer.filter(m=>!migrations.includes(m)));rmSync(dir,{recursive:true,force:true});}
});
