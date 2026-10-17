/** R2-01: exact Vietnamese script bytes must survive splitting and DB commits. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openProjectDb,StudioRepository,MasterScriptRepository,SceneBuilderRepository,segmentApprovedScript,
  inspectSceneCoverage,splitSceneAt,mergeAdjacentScenes,migrations} from '../src/index.mjs';

const realistic=`   Tại Hà Nội, hôm nay trời đẹp.  Chúng ta tìm hiểu AI ở Việt Nam!\n\nNăm 2026, công nghệ thay đổi nhanh. Tuy nhiên 3.14 vẫn là số pi.\r\nChương tiếp theo giải thích về TTS, ảnh và video…  Kết thúc. 😊  `;
const filler=`Xin chào các bạn. Hãy cùng nhau tìm hiểu về trí tuệ nhân tạo và ứng dụng trong đời sống hàng ngày!  `;
function setup({file=false}={}){
  const dir=file?mkdtempSync(join(tmpdir(),'r201-')):null;
  const path=dir?join(dir,'studio.sqlite'):':memory:';
  const db=openProjectDb(path),repo=new StudioRepository(db);
  const channel=repo.createChannel({name:'Kênh học hỏi'}),video=repo.createVideo(channel.id,{title:'Video một'});
  const master=new MasterScriptRepository(repo),builder=new SceneBuilderRepository(repo);
  const text=(realistic+filler.repeat(9));
  const candidate=master.save(video.id,{outlineRevision:0,selections:[],editedText:text,expectedRevision:0});
  master.approve(video.id,{revision:1,expectedRevision:1,videoRowVersion:repo.getVideo(video.id).rowVersion,acknowledgeWarnings:true});
  return {db,repo,video,channel,master,builder,dir,path,text,candidate,
    close(){db.close();if(dir)rmSync(dir,{recursive:true,force:true})}};
}
test('R2-01 migration 19: immutable scene plan snapshots',()=>{
  const f=setup();try{
    // R2-02 adds v20; v19 must remain present and immutable as earlier history.
    assert.ok(migrations.some(m=>m.version===19));
    assert.ok(f.db.prepare('PRAGMA user_version').get().user_version>=19);
    assert.ok(f.db.prepare("SELECT 1 FROM sqlite_master WHERE name='scene_build_revisions'").get());
  }finally{f.close()}
});
test('lossless UTF-16 segmentation covers Vietnamese punctuation, emoji, CRLF and whitespace exactly',()=>{
  const proposal=segmentApprovedScript(realistic+filler.repeat(25));
  assert.ok(proposal.scenes.length>2);
  assert.equal(proposal.scenes.map(s=>s.text).join(''),realistic+filler.repeat(25));
  assert.equal(proposal.scenes[0].sourceStart,0);
  assert.equal(proposal.scenes.at(-1).sourceEnd,(realistic+filler.repeat(25)).length);
  assert.equal(inspectSceneCoverage(realistic+filler.repeat(25),proposal.scenes).lossless,true);
  assert.ok(proposal.scenes.every(s=>s.durationMs>=500&&s.durationMs<=120000));
  assert.ok(proposal.scenes.some(s=>s.text.includes('3.14')));
});
test('very long sentence splits at word boundaries without dropped characters',()=>{
  const long=`Một câu không có dấu câu ` .repeat(1500);
  const p=segmentApprovedScript(long,{targetSeconds:18});
  assert.ok(p.scenes.length>30);assert.equal(p.scenes.map(s=>s.text).join(''),long);
  assert.ok(p.scenes.every(s=>s.text.length<=20000));
});
test('short input, invalid options, too many scenes and empty script fail safely',()=>{
  assert.throws(()=>segmentApprovedScript('  '),e=>e.code==='INVALID_APPROVED_SCRIPT');
  assert.throws(()=>segmentApprovedScript(filler,{minSeconds:30,maxSeconds:10}),e=>e.code==='INVALID_SCENE_OPTIONS');
  const p=segmentApprovedScript('Xin chào!   ');assert.equal(p.scenes.length,1);assert.equal(p.scenes[0].text,'Xin chào!   ');
});
test('split and merge preserve exact original text and offsets',()=>{
  const source=segmentApprovedScript(filler.repeat(4)).scenes[0];
  const at=source.text.indexOf(' Hãy')+1;
  const [left,right]=splitSceneAt(source,at);
  assert.equal(left.text+right.text,source.text);
  const merged=mergeAdjacentScenes(left,right);
  assert.deepEqual([merged.sourceStart,merged.sourceEnd],[source.sourceStart,source.sourceEnd]);
  assert.equal(merged.text,source.text);
  assert.throws(()=>mergeAdjacentScenes(right,left),e=>e.code==='SCENES_NOT_MERGEABLE');
});
test('builder refuses to read unapproved master even if legacy script exists',()=>{
  const db=openProjectDb(),repo=new StudioRepository(db);
  try{const channel=repo.createChannel({name:'Kênh'}),video=repo.createVideo(channel.id,{title:'Video'});
    repo.updateScript(video.id,{masterScript:filler.repeat(5),rowVersion:video.rowVersion});
    const builder=new SceneBuilderRepository(repo);
    assert.throws(()=>builder.preview(video.id),e=>e.code==='MASTER_NOT_APPROVED');
  }finally{db.close()}
});
test('read-only preview creates no scenes and commit captures immutable approved script lineage',()=>{
  const f=setup();try{
    const p=f.builder.preview(f.video.id);assert.equal(p.sceneRevision,0);
    assert.equal(f.builder.history(f.video.id).items.length,0);
    assert.equal(f.repo.listScenes(f.video.id).length,0);
    const result=f.builder.apply(f.video.id,{approvedMasterRevision:p.approvedMasterRevision,expectedSceneRevision:0,
      videoRowVersion:p.videoRowVersion,acknowledgeEdits:false,scenes:p.scenes});
    assert.equal(result.state.sceneRevision,1);
    assert.equal(result.scenes.length,p.scenes.length);
    assert.equal(f.repo.getVideo(f.video.id).status,'scenes_ready');
    assert.equal(f.builder.revision(f.video.id,1).scenes.map(x=>x.text).join(''),f.candidate.text);
    assert.equal(f.builder.history(f.video.id).items[0].coverage.lossless,true);
    assert.throws(()=>f.db.prepare('UPDATE scene_build_revisions SET revision=20').run(),/SCENE_REVISION_IMMUTABLE/);
  }finally{f.close()}
});
test('explicit text edit or scene reorder requires acknowledgement and remains auditable',()=>{
  const f=setup();try{
    const p=f.builder.preview(f.video.id);
    const scenes=p.scenes.map(x=>({...x}));scenes[0].text+=' (chỉnh sửa)';
    const params={approvedMasterRevision:1,expectedSceneRevision:0,videoRowVersion:p.videoRowVersion,scenes,acknowledgeEdits:false};
    assert.throws(()=>f.builder.apply(f.video.id,params),e=>e.code==='SCENE_EDIT_REQUIRES_ACK');
    assert.equal(f.repo.listScenes(f.video.id).length,0);
    const saved=f.builder.apply(f.video.id,{...params,acknowledgeEdits:true});
    assert.equal(saved.coverage.intentionalEdits,true);
    assert.equal(saved.coverage.lossless,false);
    const reordered=[...scenes].reverse();
    const state=f.builder.state(f.video.id);
    assert.throws(()=>f.builder.apply(f.video.id,{approvedMasterRevision:1,expectedSceneRevision:1,videoRowVersion:state.videoRowVersion,
      scenes:reordered,acknowledgeEdits:false}),e=>e.code==='SCENE_EDIT_REQUIRES_ACK');
  }finally{f.close()}
});
test('reject gaps/overlaps/foreign offsets with transaction rollback',()=>{
  const f=setup();try{const p=f.builder.preview(f.video.id);
    for(const mutate of [a=>{a[0].sourceEnd-=1},a=>{a[1].sourceStart-=1},a=>{a.pop()}]){
      const scenes=p.scenes.map(x=>({...x}));mutate(scenes);
      assert.throws(()=>f.builder.apply(f.video.id,{approvedMasterRevision:1,expectedSceneRevision:0,
        videoRowVersion:p.videoRowVersion,scenes,acknowledgeEdits:true}),e=>e.code==='SCENE_SOURCE_COVERAGE');
      assert.equal(f.db.prepare('SELECT count(*) n FROM scenes').get().n,0);
    }
  }finally{f.close()}
});
test('stale revision and source guards: two tabs cannot overwrite each other',()=>{
  const f=setup();try{const p=f.builder.preview(f.video.id);
    const body={approvedMasterRevision:p.approvedMasterRevision,expectedSceneRevision:0,videoRowVersion:p.videoRowVersion,
      acknowledgeEdits:false,scenes:p.scenes};
    f.builder.apply(f.video.id,body);
    assert.throws(()=>f.builder.apply(f.video.id,body),e=>e.code==='SCENE_VERSION_CONFLICT');
    assert.throws(()=>f.builder.apply(f.video.id,{...body,approvedMasterRevision:99}),e=>e.code==='SCENE_VERSION_CONFLICT');
  }finally{f.close()}
});
test('asset already committed blocks destructive scene replacement and preserves state',()=>{
  const f=setup();try{const p=f.builder.preview(f.video.id);
    const a=f.builder.apply(f.video.id,{approvedMasterRevision:1,expectedSceneRevision:0,
      videoRowVersion:p.videoRowVersion,acknowledgeEdits:false,scenes:p.scenes});
    f.db.prepare(`INSERT INTO asset_revisions(id,video_id,scene_id,kind,source,file_path,sha256,bytes,state,metadata_json,created_at)
      VALUES('asset-1',?,?,'image','manual','sample.png',?,1,'committed','{}',?)`)
      .run(f.video.id,a.scenes[0].id,'a'.repeat(64),Date.now());
    assert.throws(()=>f.builder.apply(f.video.id,{approvedMasterRevision:1,expectedSceneRevision:1,
      videoRowVersion:a.state.videoRowVersion,acknowledgeEdits:false,scenes:p.scenes}),e=>e.code==='SCENES_HAVE_ASSETS');
    assert.equal(f.builder.state(f.video.id).sceneRevision,1);
    assert.equal(f.db.prepare('SELECT count(*) n FROM asset_revisions').get().n,1);
  }finally{f.close()}
});
test('SQLite restart retains accepted scene plan + immutable source hash',()=>{
  const f=setup({file:true});let reopened;
  try{const p=f.builder.preview(f.video.id);f.builder.apply(f.video.id,{approvedMasterRevision:1,expectedSceneRevision:0,
    videoRowVersion:p.videoRowVersion,acknowledgeEdits:false,scenes:p.scenes});
    f.db.close();reopened=openProjectDb(f.path);const builder=new SceneBuilderRepository(new StudioRepository(reopened));
    assert.equal(builder.state(f.video.id).sceneRevision,1);
    assert.equal(builder.revision(f.video.id,1).sourceSha256,p.sourceSha256);
  }finally{reopened?.close();if(f.dir)rmSync(f.dir,{recursive:true,force:true})}
});

test('legacy raw scene replace cannot bypass R2-01 approved source/offset checks',()=>{
  const f=setup();try{
    assert.throws(()=>f.repo.replaceScenes(f.video.id,{rowVersion:f.repo.getVideo(f.video.id).rowVersion,
      scenes:[{text:'Bỏ qua văn bản duyệt',durationMs:5000,mediaType:'image_motion'}]}),e=>e.code==='SCENE_BUILDER_REQUIRED');
    assert.equal(f.repo.listScenes(f.video.id).length,0);
  }finally{f.close()}
});
