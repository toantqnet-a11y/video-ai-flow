import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,TimelineEditorR304,CompositionRepository,snapVisualWindow} from '../src/index.mjs';
function fixture(){
 const db=openProjectDb(),repo=new StudioRepository(db),channel=repo.createChannel({name:'R305'}),video=repo.createVideo(channel.id,{title:'Visual only'});
 const scenes=repo.replaceScenes(video.id,{rowVersion:video.rowVersion,scenes:[{text:'Xin chào',durationMs:2200},{text:'Hà Nội',durationMs:1800}]});
 return {db,repo,video,scenes,editor:new TimelineEditorR304(repo)};
}
test('R3-05 visual in/out persists but narration, captions, total duration, source order never change',()=>{
 const f=fixture();try{
  const before=f.editor.manifest(f.video.id),s=before.scenes[0],sceneRow=f.repo.getScene(s.id);
  const out=f.editor.trimVisual(f.video.id,{expectedRowVersion:before.rowVersion,sceneId:s.id,inMs:300,outMs:1800});
  assert.equal(out.changed,true);assert.equal(out.rowVersion,before.rowVersion+1);
  assert.deepEqual([out.scenes[0].visualInMs,out.scenes[0].visualOutMs],[300,1800]);
  assert.equal(out.totalDurationMs,before.totalDurationMs);
  assert.equal(out.scenes[0].captionEndMs,before.scenes[0].captionEndMs);
  assert.equal(out.scenes[0].startMs,before.scenes[0].startMs);
  assert.deepEqual(f.repo.getScene(s.id),sceneRow);
  assert.deepEqual(new TimelineEditorR304(f.repo).manifest(f.video.id).scenes[0],out.scenes[0]);
  assert.equal(f.editor.trimVisual(f.video.id,{expectedRowVersion:out.rowVersion,sceneId:s.id,inMs:300,outMs:1800}).changed,false);
  assert.equal(f.editor.manifest(f.video.id).rowVersion,out.rowVersion);
  const doc=f.repo.getTimeline(f.video.id);
  assert.throws(()=>f.repo.updateTimeline(f.video.id,{rowVersion:doc.rowVersion,document:{...doc.document,visualEdits:[]}}),e=>e.code==='TIMELINE_VISUAL_EDIT_ENDPOINT_REQUIRED');
 }finally{f.db.close()}
});
test('R3-05 strict optimistic conflict, scope, invalid visual cut, reset and reorder persist',()=>{
 const f=fixture();try{
  const m=f.editor.manifest(f.video.id),s=m.scenes[0];
  for(const bounds of [[100,200],[0,2201],[-1,1500],[1600,1500]])
   assert.throws(()=>f.editor.trimVisual(f.video.id,{expectedRowVersion:m.rowVersion,sceneId:s.id,inMs:bounds[0],outMs:bounds[1]}),e=>e.status===422);
  assert.throws(()=>f.editor.trimVisual(f.video.id,{expectedRowVersion:m.rowVersion,sceneId:'foreign',inMs:0,outMs:1000}),e=>e.status===404);
  assert.throws(()=>f.editor.trimVisual(f.video.id,{expectedRowVersion:m.rowVersion,sceneId:s.id,inMs:0,outMs:1000,paid:true}),e=>e.code==='INVALID_VISUAL_TRIM');
  const a=f.editor.trimVisual(f.video.id,{expectedRowVersion:m.rowVersion,sceneId:s.id,inMs:100,outMs:1500});
  assert.throws(()=>f.editor.trimVisual(f.video.id,{expectedRowVersion:m.rowVersion,sceneId:s.id,inMs:0,outMs:1500}),e=>e.status===409);
  const reordered=f.editor.reorder(f.video.id,{expectedRowVersion:a.rowVersion,sceneOrder:[f.scenes[1].id,f.scenes[0].id]});
  assert.equal(reordered.scenes[1].visualInMs,100);
  const reset=f.editor.trimVisual(f.video.id,{expectedRowVersion:reordered.rowVersion,sceneId:s.id,inMs:0,outMs:s.durationMs});
  assert.equal(reset.scenes[1].visualInMs,0);
  assert.deepEqual(f.repo.getTimeline(f.video.id).document.visualEdits,[]);
 }finally{f.db.close()}
});
test('R3-05 visual edits invalidate old composition digest and are not silence/audio trim',async()=>{
 const f=fixture();try{
  const compositions=new CompositionRepository({repo:f.repo,manifest:{async planRecompute(){return {scenes:[]}},get(){return null}}});
  const original=await compositions.preview(f.video.id),state=f.editor.manifest(f.video.id);
  f.editor.trimVisual(f.video.id,{expectedRowVersion:state.rowVersion,sceneId:state.scenes[0].id,inMs:200,outMs:1600});
  const changed=await compositions.preview(f.video.id);
  assert.notEqual(original.digest,changed.digest);
  assert.equal(original.totalFrames,changed.totalFrames);
 }finally{f.db.close()}
});
test('R3-05 30fps snapping chooses nearby caption boundaries and never exceeds scene',()=>{
 assert.equal(snapVisualWindow(116,{durationMs:1200,fps:30,markers:[120]}),120);
 assert.equal(snapVisualWindow(1203,{durationMs:1200}),1200);
 assert.equal(snapVisualWindow(-30,{durationMs:1200}),0);
 assert.ok(Math.abs(snapVisualWindow(577,{durationMs:3000,thresholdMs:10})-567)<2);
});
test('R3-05 changing scene duration retires stale visual-only edit atomically, leaves voice selection untouched',async()=>{
 const {SceneInspectorR301}=await import('../src/scene-inspector-r301.mjs');
 const f=fixture();try{
  const first=f.editor.manifest(f.video.id);
  f.editor.trimVisual(f.video.id,{expectedRowVersion:first.rowVersion,sceneId:first.scenes[0].id,inMs:600,outMs:1800});
  const previous=f.editor.manifest(f.video.id),s=f.repo.getScene(first.scenes[0].id);
  new SceneInspectorR301(f.repo).save(s.id,{expectedRowVersion:s.rowVersion,patch:{durationMs:900}});
  const now=f.editor.manifest(f.video.id);
  assert.equal(now.scenes[0].visualInMs,0);assert.equal(now.scenes[0].visualOutMs,900);
  assert.equal(now.scenes[0].durationMs,900);assert.equal(now.rowVersion,previous.rowVersion+1);
  assert.deepEqual(f.repo.getTimeline(f.video.id).document.visualEdits,[]);
 }finally{f.db.close()}
});
