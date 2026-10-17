import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openProjectDb,StudioRepository,ContentBriefRepository,ContentOutlineRepository,
  MasterScriptRepository,SceneBuilderRepository,analyzeMasterScript,migrations} from '../../../packages/core/src/index.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {operations} from '../../../packages/contracts/src/catalog.mjs';

// Insert a completed generation result directly into the canonical immutable
// tables, not into an alternate mock source outside the real repository.
function fixture({file=false}={}){
  const dir=file?mkdtempSync(join(tmpdir(),'studio-r106-')):null,path=dir?join(dir,'data.sqlite'):':memory:';
  const db=openProjectDb(path),repo=new StudioRepository(db),channel=repo.createChannel({name:'Kênh nội dung'}),video=repo.createVideo(channel.id,{title:'Chương trình dài'});
  const brief=new ContentBriefRepository(repo);
  brief.save(video.id,{expectedRevision:0,brief:{topic:'Lịch sử công nghệ',idea:'Chuyện kể có kiểm chứng',modelIds:[],target:{mode:'words',durationMinutes:30,wordCount:800,wpm:140,chapterTargetWords:500}}});
  const outlines=new ContentOutlineRepository(repo);
  outlines.save(video.id,{expectedRevision:0,outline:{chapters:[
    {title:'Khởi đầu',objective:'Lịch sử',targetWords:400,keyPoints:['Nguồn gốc']},
    {title:'Hiện tại',objective:'Ứng dụng',targetWords:400,keyPoints:['Các phát minh']}]}});
  const makeVariant=(index,content='')=>{
    const id=randomUUID(),model=`model-${index}`,batch=randomUUID(),variant=randomUUID();
    db.prepare(`INSERT INTO content_generation_batches(id,video_id,request_key,brief_revision,outline_revision,
      model_ids_json,brief_json,outline_json,created_at) VALUES(?,?,?,1,1,'[]','{}','{}',?)`)
      .run(batch,video.id,id,Date.now());
    const text=content||`Đây là nội dung chương ${index+1}, cung cấp kiến thức và câu chuyện có ý nghĩa. `.repeat(35);
    db.prepare(`INSERT INTO content_chapter_drafts(batch_id,model_id,chapter_idx,text,summary,word_count,created_at)
      VALUES(?,?,?,?,?,?,?)`).run(batch,model,index,text,'Tóm tắt nội dung đủ độ dài.',text.trim().split(/\s+/u).length,Date.now());
    db.prepare('INSERT INTO content_draft_variants(id,batch_id,model_id,chapter_idx) VALUES(?,?,?,?)')
      .run(variant,batch,model,index);
    return {variant,text};
  };
  const left=makeVariant(0),right=makeVariant(1);
  const master=new MasterScriptRepository(repo);
  const input={outlineRevision:1,selections:[{chapterIndex:0,variantId:left.variant},{chapterIndex:1,variantId:right.variant}]};
  return {db,repo,video,channel,master,outlines,input,left,right,makeVariant,dir,path,
    close(){db.close();if(dir)rmSync(dir,{recursive:true,force:true})}};
}

test('R1-06 v18 migration has immutable approvals and persisted schema',()=>{
  const f=fixture();try{
    assert.ok(migrations.some(m=>m.version===18)); // Older module migration remains immutable across later releases.
    assert.equal(f.db.prepare('PRAGMA user_version').get().user_version,migrations.at(-1).version);
    assert.ok(f.db.prepare("SELECT 1 FROM sqlite_master WHERE name='content_master_approvals'").get());
  }finally{f.close()}
});

test('R1-06 preview only, save candidate only, explicit approve publishes canonical video',()=>{
  const f=fixture();try{
    const before=f.repo.getVideo(f.video.id);
    const preview=f.master.assemble(f.video.id,f.input);
    assert.equal(preview.sources.length,2);
    assert.ok(preview.text.includes(f.left.text.trim())&&preview.text.includes(f.right.text.trim()));
    assert.equal(f.db.prepare('SELECT count(*) n FROM content_master_revisions').get().n,0);
    const rev=f.master.save(f.video.id,{...f.input,expectedRevision:0});
    assert.equal(rev.revision,1);assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
    assert.equal(f.master.state(f.video.id).approvedRevision,null);
    assert.throws(()=>f.master.approve(f.video.id,{revision:1,expectedRevision:1,videoRowVersion:before.rowVersion}),e=>e.code==='MASTER_WARNINGS_REQUIRE_ACK');
    const done=f.master.approve(f.video.id,{revision:1,expectedRevision:1,videoRowVersion:before.rowVersion,acknowledgeWarnings:true});
    assert.equal(done.state.approvedRevision,1);assert.equal(done.state.hasApprovedScript,true);
    assert.equal(f.repo.getVideo(f.video.id).masterScript,rev.text);
    assert.equal(f.repo.getVideo(f.video.id).status,'content_ready');
  }finally{f.close()}
});

test('R1-06 selects any saved immutable revision per chapter and keeps full lineage',()=>{
  const f=fixture();try{
    const alt=f.makeVariant(0,'Bản mô tả mới đã được cải thiện. '.repeat(60));
    const input={...f.input,selections:[{chapterIndex:1,variantId:f.right.variant},{chapterIndex:0,variantId:alt.variant}]};
    const revision=f.master.save(f.video.id,{...input,expectedRevision:0});
    assert.equal(revision.sources[0].variantId,alt.variant);
    assert.equal(revision.sources[1].variantId,f.right.variant);
    assert.equal(revision.sources[0].sourceSha256,createHash('sha256').update(alt.text).digest('hex'));
    assert.ok(revision.text.indexOf('Bản mô tả mới')<revision.text.indexOf('Đây là nội dung chương 2'));
    assert.equal(f.master.history(f.video.id).items[0].sha256,revision.sha256);
  }finally{f.close()}
});

test('R1-06 blocks incomplete, repeated, wrong chapter and foreign video selection',()=>{
  const f=fixture();try{
    const broken=[
      {outlineRevision:1,selections:[]},
      {outlineRevision:1,selections:[f.input.selections[0],f.input.selections[0]]},
      {outlineRevision:1,selections:[{chapterIndex:0,variantId:f.right.variant},f.input.selections[1]]}];
    for(const x of broken)assert.throws(()=>f.master.assemble(f.video.id,x));
    const other=f.repo.createVideo(f.channel.id,{title:'Other'});
    f.outlines.save(other.id,{expectedRevision:0,outline:{chapters:[{title:'Khởi đầu',objective:'Lịch sử',targetWords:400,keyPoints:[]},{title:'Hiện tại',objective:'Ứng dụng',targetWords:400,keyPoints:[]}]}});
    assert.throws(()=>f.master.assemble(other.id,f.input),e=>e.code==='MASTER_SOURCE_MISMATCH');
    assert.throws(()=>f.master.assemble(f.video.id,{...f.input,selections:[{chapterIndex:0,variantId:'nonexisting'},f.input.selections[1]]}));
  }finally{f.close()}
});

test('R1-06 cannot choose drafts built against other outline revisions',()=>{
  const f=fixture();try{
    f.outlines.save(f.video.id,{expectedRevision:1,outline:{chapters:[
      {title:'Khởi đầu mới',objective:'Mốc',targetWords:400,keyPoints:[]},
      {title:'Hiện tại',objective:'Lĩnh vực',targetWords:400,keyPoints:[]}]}});
    assert.throws(()=>f.master.assemble(f.video.id,{...f.input,outlineRevision:2}),e=>e.code==='MASTER_SOURCE_MISMATCH');
    assert.throws(()=>f.master.save(f.video.id,{...f.input,expectedRevision:0}),e=>e.code==='MASTER_OUTLINE_STALE');
  }finally{f.close()}
});

test('R1-06 changed selection/manual edits create immutable history, no auto approval',()=>{
  const f=fixture();try{
    const first=f.master.save(f.video.id,{...f.input,expectedRevision:0});
    const edited=first.text+'\n\nĐây là lời kết được người biên tập bổ sung sau khi kiểm chứng nguồn.';
    const second=f.master.save(f.video.id,{...f.input,editedText:edited,expectedRevision:1});
    assert.equal(second.revision,2);
    assert.equal(f.master.revision(f.video.id,1).text,first.text);
    assert.equal(f.master.revision(f.video.id,2).text,edited);
    assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
    assert.throws(()=>f.db.prepare('UPDATE content_master_revisions SET script_text=?').run('change'),/MASTER_REVISION_IMMUTABLE/);
    assert.throws(()=>f.db.prepare('DELETE FROM content_master_revisions').run(),/MASTER_REVISION_IMMUTABLE/);
  }finally{f.close()}
});

test('R1-06 optimistic revisions and stale video rows are rejected',()=>{
  const f=fixture();try{
    f.master.save(f.video.id,{...f.input,expectedRevision:0});
    assert.throws(()=>f.master.save(f.video.id,{...f.input,expectedRevision:0}),e=>e.code==='MASTER_VERSION_CONFLICT');
    assert.throws(()=>f.master.approve(f.video.id,{revision:1,expectedRevision:0,videoRowVersion:1}),e=>e.code==='INVALID_MASTER_APPROVAL');
    assert.throws(()=>f.master.approve(f.video.id,{revision:1,expectedRevision:1,videoRowVersion:900,acknowledgeWarnings:true}),e=>e.code==='MASTER_VERSION_CONFLICT');
    assert.equal(f.db.prepare('SELECT count(*) n FROM content_master_approvals').get().n,0);
  }finally{f.close()}
});

test('R1-06 warnings include repeated long paragraphs and require explicit acknowledgement',()=>{
  const long='Thông tin đã được kiểm tra và đối chiếu nhiều nguồn, tránh trùng nội dung khác ở các chương. '.repeat(3);
  const result=analyzeMasterScript(`${long}\n\n${long}`,800);
  assert.ok(result.warnings.includes('DUPLICATE_LONG_PARAGRAPH'));
  assert.ok(result.warnings.includes('WORD_COUNT_OUTSIDE_TARGET'));
});

test('R1-06 approving a new candidate with existing scenes fails safely, no partial approval',()=>{
  const f=fixture();try{
    const first=f.master.save(f.video.id,{...f.input,expectedRevision:0});
    f.master.approve(f.video.id,{revision:1,expectedRevision:1,videoRowVersion:f.video.rowVersion,acknowledgeWarnings:true});
    const now=f.repo.getVideo(f.video.id);
    // R2-01 requires source coverage for approved scripts. Simulate an existing
    // scene through the canonical builder, not the former unsafe raw replace.
    const builder=new SceneBuilderRepository(f.repo),preview=builder.preview(f.video.id);
    builder.apply(f.video.id,{approvedMasterRevision:preview.approvedMasterRevision,
      expectedSceneRevision:0,videoRowVersion:now.rowVersion,acknowledgeEdits:false,scenes:preview.scenes});
    const second=f.master.save(f.video.id,{...f.input,editedText:first.text+'\n\nLời bổ sung độc lập.',expectedRevision:1});
    const latest=f.repo.getVideo(f.video.id);
    assert.throws(()=>f.master.approve(f.video.id,{revision:2,expectedRevision:2,videoRowVersion:latest.rowVersion,acknowledgeWarnings:true}),
      e=>e.code==='SCENES_EXIST_REQUIRE_REBUILD');
    assert.equal(f.repo.getVideo(f.video.id).masterScript,first.text);
    assert.equal(f.db.prepare('SELECT count(*) n FROM content_master_approvals').get().n,1);
    assert.equal(second.revision,2);
  }finally{f.close()}
});

test('R1-06 legacy script route cannot bypass candidate review or approval',()=>{
  const f=fixture();try{
    f.master.save(f.video.id,{...f.input,expectedRevision:0});
    let v=f.repo.getVideo(f.video.id);
    assert.throws(()=>f.repo.updateScript(f.video.id,{rowVersion:v.rowVersion,masterScript:'Trying to bypass candidate'}),
      e=>e.code==='MASTER_APPROVAL_REQUIRED');
    f.master.approve(f.video.id,{revision:1,expectedRevision:1,videoRowVersion:f.video.rowVersion,acknowledgeWarnings:true});
    v=f.repo.getVideo(f.video.id);
    assert.throws(()=>f.repo.updateScript(f.video.id,{rowVersion:v.rowVersion,masterScript:'Changed without approval'}),
      e=>e.code==='MASTER_APPROVAL_REQUIRED');
    assert.throws(()=>f.db.prepare('UPDATE videos SET master_script=? WHERE id=?').run('Direct SQL bypass',f.video.id),
      /MASTER_APPROVAL_REQUIRED/);
  }finally{f.close()}
});

test('R1-06 persisted history/approval survives SQLite restart',()=>{
  const f=fixture({file:true});const id=f.video.id;
  try{
    const revision=f.master.save(id,{...f.input,expectedRevision:0});
    f.master.approve(id,{revision:1,expectedRevision:1,videoRowVersion:f.video.rowVersion,acknowledgeWarnings:true});
    f.db.close();
    const db=openProjectDb(f.path),repo=new StudioRepository(db),master=new MasterScriptRepository(repo);
    try{assert.equal(master.state(id).approvedRevision,1);
      assert.equal(master.revision(id,1).sha256,revision.sha256);
      assert.equal(master.history(id).items[0].approved,true);
      assert.throws(()=>db.prepare('DELETE FROM content_master_approvals').run(),/MASTER_APPROVAL_IMMUTABLE/);
    }finally{db.close()}
  }finally{if(f.dir)rmSync(f.dir,{recursive:true,force:true})}
});

test('R1-06 route catalog covers every master operation with no duplicates',()=>{
  const paths=[];const app={};for(const m of ['get','post','put','patch','delete'])app[m]=(path)=>paths.push(`${m.toUpperCase()} ${path}`);
  const controllers=new Proxy({}, {get:()=>()=>({})});registerStudioRoutes(app,{controllers,store:{},diagnostics:{}});
  for(const op of operations.filter(x=>x.id.toLowerCase().includes('master')))
    assert.ok(paths.includes(`${op.method} ${op.path}`),`${op.method} ${op.path}`);
  assert.equal(new Set(operations.map(x=>x.id)).size,operations.length);
});

test('R1-06 manual script import follows exact same save-then-explicit-approval boundary',()=>{
  const f=fixture();try{
    const script='Đây là phần nội dung thủ công do người biên tập cung cấp để sản xuất video chuyên đề. '.repeat(8).trim();
    const input={outlineRevision:0,selections:[],editedText:script};
    assert.equal(f.master.assemble(f.video.id,input).text,script);
    assert.throws(()=>f.master.assemble(f.video.id,{...input,selections:f.input.selections}),e=>e.code==='INVALID_MASTER_INPUT');
    assert.throws(()=>f.master.assemble(f.video.id,{...input,editedText:'Một câu ngắn.'}),e=>e.code==='INVALID_MASTER_TEXT');
    const saved=f.master.save(f.video.id,{...input,expectedRevision:0});
    assert.equal(saved.outlineRevision,0);assert.deepEqual(saved.sources,[]);
    assert.equal(f.repo.getVideo(f.video.id).masterScript,'');
    f.master.approve(f.video.id,{revision:1,expectedRevision:1,videoRowVersion:f.video.rowVersion});
    assert.equal(f.repo.getVideo(f.video.id).masterScript,script);
  }finally{f.close()}
});
