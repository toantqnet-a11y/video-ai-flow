import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,ContentBriefRepository,MasterScriptRepository,
  scriptSkillCatalog,buildScriptSkillPlan,exportApprovedScript} from '../src/index.mjs';
import {buildOutlinePrompt} from '../../../apps/api/src/outline-generation.mjs';
import {buildChapterPrompt} from '../../../apps/api/src/chapter-generation.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const brief=(scriptSkillId='educational')=>({topic:'Khoa học',idea:'Giải thích dễ hiểu',sourceText:'Nguồn chưa kiểm chứng',freePrompt:'Đối chiếu nguồn',
  target:{mode:'duration',durationMinutes:35,wpm:145,wordCount:4000,chapterTargetWords:1100},
  styleOverrides:{language:'vi'},modelIds:[],scriptSkillId});
const sample='Chào các bạn! 🎙️  Bạn có biết vì sao sóng wifi đi xuyên tường?\n\n'+
  'Vật lý truyền sóng là câu chuyện thú vị. Để giải thích chúng ta cần ví dụ thực tế.\n'.repeat(8)+
  'Cuối cùng, hãy kiểm chứng số liệu trước khi chia sẻ.\n';
const fixture=()=>{const db=openProjectDb(),repo=new StudioRepository(db),channel=repo.createChannel({name:'Nội dung'}),video=repo.createVideo(channel.id,{title:'Video'});
  return {db,repo,video,briefs:new ContentBriefRepository(repo),masters:new MasterScriptRepository(repo)}};

test('R1-EXT-01 has five vetted finite skill recipes and no external execution',()=>{
 const skills=scriptSkillCatalog();assert.equal(skills.length,5);
 for(const s of skills)assert.deepEqual(s.stages.map(x=>x.id),['hook','problem','explain','examples','cta']);
 assert.ok(!('remoteUrl' in skills[0]));
});
test('R1-EXT-01 pinned plan exact word budget + three-second hook',()=>{
 for(const skill of scriptSkillCatalog()){
  const p=buildScriptSkillPlan(brief(skill.id));
  assert.equal(p.steps.reduce((sum,s)=>sum+s.targetWords,0),5075);
  assert.ok(Math.abs(p.steps[0].estimatedSeconds-3)<=.5);
  assert.equal(p.willGenerate,false);assert.equal(p.noAutomaticResearch,true);
  assert.equal(p.research.status,'user_source_unverified');
  assert.deepEqual(p,buildScriptSkillPlan(brief(skill.id)));
 }
});
test('R1-EXT-01 rejects malicious or unknown recipe data; does not fabricate research',()=>{
 assert.throws(()=>buildScriptSkillPlan({...brief(),scriptSkillId:'../../secret'}),{code:'INVALID_SCRIPT_SKILL'});
 assert.throws(()=>buildScriptSkillPlan({...brief(),scriptSkillId:'__proto__'}),{code:'INVALID_SCRIPT_SKILL'});
 assert.equal(buildScriptSkillPlan({...brief(),sourceText:''}).research.status,'sources_required');
});
test('R1-EXT-01 R1 worker prompts integrate frozen, static guidance without schema drift',()=>{
 const b=brief('review'),outline={chapters:[{title:'Giới thiệu',objective:'',keyPoints:[],targetWords:300}]};
 const p=buildOutlinePrompt(b,1),c=buildChapterPrompt({brief:b,outline,chapterIndex:0});
 assert.match(p,/Review/);assert.match(c,/Review/);
 assert.match(c,/JSON \{"text","summary"\}/);
 assert.match(p,/"chapters"/);
});
test('R1-EXT-01 export preserves every byte of Vietnamese + emoji + blank lines, digest stable',()=>{
 const result=exportApprovedScript({videoId:'vid1',masterRevision:1,scriptText:sample,scriptSha256:sha(sample),wpm:145,skillId:'storytelling'});
 assert.equal(result.segments.map(x=>x.spokenText).join(''),sample);
 assert.equal(result.segments.map(x=>x.sourceEnd-x.sourceStart).reduce((a,b)=>a+b,0),sample.length);
 for(const segment of result.segments){
  assert.equal(segment.spokenText,sample.slice(segment.sourceStart,segment.sourceEnd));
  assert.equal(segment.subtitleText,segment.spokenText.trim());
  assert.equal(segment.sourceSha256,sha(segment.spokenText));
  assert.equal(segment.durationEstimated,true);
 }
 assert.equal(result.editorialReviewRequired,true);
 assert.equal(result.alignment,'estimated_only');
 assert.deepEqual(result,exportApprovedScript({videoId:'vid1',masterRevision:1,scriptText:sample,scriptSha256:sha(sample),wpm:145,skillId:'storytelling'}));
});
test('R1-EXT-01 no truncation on long source; rejects stale digest and invalid WPM',()=>{
 const long=('Dòng kịch bản tiếng Việt không mất chữ.\n').repeat(260);
 const r=exportApprovedScript({videoId:'id',masterRevision:2,scriptText:long,scriptSha256:sha(long)});
 assert.equal(r.segments.map(x=>x.spokenText).join(''),long);
 assert.throws(()=>exportApprovedScript({videoId:'id',masterRevision:1,scriptText:sample,scriptSha256:sha(sample+'bad')}),{code:'SCRIPT_SOURCE_CHANGED'});
 assert.throws(()=>exportApprovedScript({videoId:'id',masterRevision:1,scriptText:sample,scriptSha256:sha(sample),wpm:1}),{code:'SCRIPT_EXPORT_INVALID'});
});
test('R1-EXT-01 saved brief preserves immutable chosen preset and revision history',()=>{
 const f=fixture();try{
  const old=f.briefs.save(f.video.id,{expectedRevision:0,brief:brief('analysis')});
  assert.equal(old.brief.scriptSkillId,'analysis');
  f.briefs.save(f.video.id,{expectedRevision:1,brief:brief('shorts')});
  assert.equal(f.briefs.revision(f.video.id,1).brief.scriptSkillId,'analysis');
  assert.equal(f.briefs.get(f.video.id).brief.scriptSkillId,'shorts');
  assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
 }finally{f.db.close()}
});
