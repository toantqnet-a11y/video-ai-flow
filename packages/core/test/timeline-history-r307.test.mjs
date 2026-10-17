/** Offline persistence, immutable history, version fencing and branch guards. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,TimelineEditorR304,TimelineHistoryR307,CompositionRepository} from '../src/index.mjs';
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'r307-history-')),path=join(dir,'project.sqlite');
 const db=openProjectDb(path),repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'Timeline history'}),video=repo.createVideo(channel.id,{title:'History example'});
 repo.replaceScenes(video.id,{rowVersion:video.rowVersion,scenes:['Hà Nội','Đà Nẵng','Tiếng Việt'].map(text=>({text,durationMs:1500}))});
 return {dir,path,db,repo,video,editor:new TimelineEditorR304(repo),history:new TimelineHistoryR307(repo),async close(){db.close();await rm(dir,{recursive:true,force:true})}};
}
test('R3-07 undo/redo reorder and visual trim persist as immutable new row versions',async()=>{
 const f=await fixture();try{
  const first=f.editor.manifest(f.video.id),ids=first.scenes.map(s=>s.id);
  const trimmed=f.editor.trimVisual(f.video.id,{expectedRowVersion:first.rowVersion,sceneId:ids[1],inMs:250,outMs:1250});
  const reordered=f.editor.reorder(f.video.id,{expectedRowVersion:trimmed.rowVersion,sceneOrder:[ids[1],ids[0],ids[2]]});
  const snapshot=f.history.state(f.video.id);assert.equal(snapshot.canUndo,true);assert.equal(snapshot.canRedo,false);
  assert.equal(reordered.scenes[0].visualInMs,250);
  let result=f.history.move(f.video.id,{expectedRowVersion:reordered.rowVersion,direction:'undo'});
  assert.deepEqual(result.manifest??f.editor.manifest(f.video.id),f.editor.manifest(f.video.id));
  assert.deepEqual(f.editor.manifest(f.video.id).scenes.map(s=>s.id),ids);
  assert.equal(f.editor.manifest(f.video.id).scenes[1].visualInMs,250);
  result=f.history.move(f.video.id,{expectedRowVersion:result.rowVersion,direction:'undo'});
  assert.equal(f.editor.manifest(f.video.id).scenes[1].visualInMs,0);
  assert.equal(f.history.state(f.video.id).canRedo,true);
  result=f.history.move(f.video.id,{expectedRowVersion:result.rowVersion,direction:'redo'});
  assert.equal(f.editor.manifest(f.video.id).scenes[1].visualInMs,250);
  assert.throws(()=>f.history.move(f.video.id,{expectedRowVersion:reordered.rowVersion,direction:'redo'}),{code:'TIMELINE_VERSION_CONFLICT'});
  assert.throws(()=>f.history.move(f.video.id,{expectedRowVersion:result.rowVersion,direction:'redo',paid:true}),{code:'INVALID_TIMELINE_HISTORY'});
  const rows=f.db.prepare('SELECT row_version,action FROM timeline_revisions WHERE video_id=? ORDER BY row_version').all(f.video.id);
  assert.equal(rows.length,6);
  assert.deepEqual(rows.map(r=>r.action),['baseline','trim','reorder','undo','undo','redo']);
  assert.throws(()=>f.db.prepare('UPDATE timeline_revisions SET action=? WHERE video_id=?').run('bad',f.video.id),/IMMUTABLE/);
  assert.throws(()=>f.db.prepare('DELETE FROM timeline_revisions WHERE video_id=?').run(f.video.id),/IMMUTABLE/);
  const reopened=openProjectDb(f.path);try{
   const r=new StudioRepository(reopened),h=new TimelineHistoryR307(r);
   assert.equal(h.state(f.video.id).canUndo,true);assert.equal(h.state(f.video.id).canRedo,true);
  }finally{reopened.close();}
 }finally{await f.close()}
});
test('R3-07 new change after undo clears redo; external edit invalidates obsolete stack',async()=>{
 const f=await fixture();try{
  const first=f.editor.manifest(f.video.id),ids=first.scenes.map(s=>s.id);
  const a=f.editor.reorder(f.video.id,{expectedRowVersion:first.rowVersion,sceneOrder:[ids[2],ids[0],ids[1]]});
  const b=f.history.move(f.video.id,{expectedRowVersion:a.rowVersion,direction:'undo'});
  assert.equal(f.history.state(f.video.id).canRedo,true);
  f.editor.trimVisual(f.video.id,{expectedRowVersion:b.rowVersion,sceneId:ids[0],inMs:100,outMs:900});
  assert.equal(f.history.state(f.video.id).canRedo,false);
  const timeline=f.repo.getTimeline(f.video.id);
  const updated=f.repo.updateTimeline(f.video.id,{rowVersion:timeline.rowVersion,document:{...timeline.document,clips:[{sceneId:ids[0],startMs:0,durationMs:1400,timingLocked:true,captionStartMs:0,captionEndMs:1200}]}});
  assert.equal(f.history.state(f.video.id).canUndo,true);
  assert.equal(f.history.state(f.video.id).canRedo,false);
  const restored=f.history.move(f.video.id,{expectedRowVersion:updated.rowVersion,direction:'undo'});
  assert.equal(restored.document.clips.length,0);
  // A scene rebuild changes timeline externally and retires the stack.
  const videoRow=f.repo.getVideo(f.video.id);
  f.repo.replaceScenes(f.video.id,{rowVersion:videoRow.rowVersion,scenes:[{text:'New source scene',durationMs:1000}]});
  assert.equal(f.history.state(f.video.id).canUndo,false);
  assert.throws(()=>f.history.move(f.video.id,{expectedRowVersion:f.repo.getTimeline(f.video.id).rowVersion,direction:'undo'}),{code:'TIMELINE_HISTORY_STALE'});
 }finally{await f.close()}
});
test('R3-07 undo recomputes source revision; stale approved composition cannot silently follow edits',async()=>{
 const f=await fixture();try{
  const compositions=new CompositionRepository({repo:f.repo,manifest:{async planRecompute(){return {scenes:[]}},get(){return null}}});
  const old=await compositions.preview(f.video.id),m=f.editor.manifest(f.video.id),ids=m.scenes.map(s=>s.id);
  const edited=f.editor.reorder(f.video.id,{expectedRowVersion:m.rowVersion,sceneOrder:[...ids].reverse()});
  const intermediate=await compositions.preview(f.video.id);assert.notEqual(intermediate.digest,old.digest);
  f.history.move(f.video.id,{expectedRowVersion:edited.rowVersion,direction:'undo'});
  const after=await compositions.preview(f.video.id);
  assert.notEqual(after.digest,old.digest,'undo is new timeline version; a new approval is required');
  assert.deepEqual(after.scenes.map(s=>s.id),old.scenes.map(s=>s.id));
 }finally{await f.close()}
});
