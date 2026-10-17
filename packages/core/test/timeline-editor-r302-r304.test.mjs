import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,TimelineEditorR304,CompositionRepository} from '../src/index.mjs';
function fixture(n=6){
 const db=openProjectDb(),repo=new StudioRepository(db),channel=repo.createChannel({name:'R3 thử nghiệm'}),
  video=repo.createVideo(channel.id,{title:'Video tiếng Việt'});
 const scenes=repo.replaceScenes(video.id,{rowVersion:video.rowVersion,
  scenes:Array.from({length:n},(_,i)=>({text:`Hà Nội Scene ${i+1} — xin chào`,durationMs:1500+i*100,visualPrompt:'Đường phố'}))});
 const editor=new TimelineEditorR304(repo);return {db,repo,video,scenes,editor,close:()=>db.close()};
}
test('R3-02 manifest has 4 lanes, contiguous offsets, captions and original source index',()=>{
 const f=fixture(120);try{
  const m=f.editor.manifest(f.video.id);
  assert.deepEqual(m.tracks,['media','text','voice','music']);
  assert.equal(m.scenes.length,120);assert.equal(m.scenes[119].endMs,m.totalDurationMs);
  for(let i=0;i<120;i++){
   assert.equal(m.scenes[i].startMs,i===0?0:m.scenes[i-1].endMs);
   assert.equal(m.scenes[i].text,f.scenes[i].text);
   assert.equal(m.scenes[i].captionEndMs,m.scenes[i].durationMs);
   assert.equal(m.scenes[i].sourceIndex,i);
  }
 }finally{f.close()}
});
test('R3-04 reorder persists after reload and only alters presentation; master and asset untouched',()=>{
 const f=fixture();try{
  const original=f.editor.manifest(f.video.id),order=original.scenes.map(s=>s.id);
  const target=[order[3],...order.slice(0,3),...order.slice(4)];
  const before=f.scenes.map(s=>f.repo.getScene(s.id));
  const out=f.editor.reorder(f.video.id,{expectedRowVersion:original.rowVersion,sceneOrder:target});
  assert.equal(out.changed,true);assert.equal(out.rowVersion,original.rowVersion+1);
  assert.deepEqual(new TimelineEditorR304(f.repo).manifest(f.video.id).scenes.map(s=>s.id),target);
  assert.equal(f.editor.manifest(f.video.id).scenes[0].sourceIndex,3);
  assert.deepEqual(f.scenes.map(s=>f.repo.getScene(s.id)),before);
  assert.throws(()=>f.editor.reorder(f.video.id,{expectedRowVersion:original.rowVersion,sceneOrder:order}),e=>e.code==='TIMELINE_VERSION_CONFLICT');
  assert.equal(f.editor.reorder(f.video.id,{expectedRowVersion:out.rowVersion,sceneOrder:target}).changed,false);
  const saved=f.repo.getTimeline(f.video.id);assert.deepEqual(saved.document.sceneOrder,target);
  assert.throws(()=>f.repo.updateTimeline(f.video.id,{rowVersion:saved.rowVersion,document:{...saved.document,sceneOrder:order}}),e=>e.code==='TIMELINE_ORDER_ENDPOINT_REQUIRED');
 }finally{f.close()}
});
test('R3-04 atomic rejects missing, duplicate, foreign, extra fields and secret routing',()=>{
 const f=fixture(3),other=fixture(2);try{
  const current=f.editor.manifest(f.video.id),ids=current.scenes.map(s=>s.id);
  for(const sceneOrder of [[ids[0],ids[0],ids[2]],[ids[0],ids[1],other.scenes[0].id],ids.slice(1),[...ids,ids[0]]])
   assert.throws(()=>f.editor.reorder(f.video.id,{expectedRowVersion:current.rowVersion,sceneOrder}),e=>e.status===409||e.status===400);
  assert.throws(()=>f.editor.reorder(f.video.id,{expectedRowVersion:current.rowVersion,sceneOrder:ids,providerAccountId:'paid'}),e=>e.code==='INVALID_TIMELINE_REORDER');
  assert.equal(f.repo.getTimeline(f.video.id).rowVersion,current.rowVersion);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM domain_events WHERE event_name='timeline.scenes_reordered'").get().n,0);
 }finally{f.close();other.close()}
});
test('R3-04 rebase manual locked clip offset when scene order changes',()=>{
 const f=fixture(3);try{
  const first=f.editor.manifest(f.video.id),a=first.scenes[0],b=first.scenes[1];
  const row=f.repo.getTimeline(f.video.id);
  f.repo.updateTimeline(f.video.id,{rowVersion:row.rowVersion,document:{...row.document,clips:[
    {sceneId:a.id,startMs:0,durationMs:2200,timingLocked:true,captionStartMs:0,captionEndMs:1700},
    {sceneId:b.id,startMs:2200,durationMs:1500,timingLocked:false}
  ]}});
  const curr=f.editor.manifest(f.video.id),ids=curr.scenes.map(s=>s.id);
  const out=f.editor.reorder(f.video.id,{expectedRowVersion:curr.rowVersion,sceneOrder:[ids[2],ids[0],ids[1]]});
  const clips=f.repo.getTimeline(f.video.id).document.clips;
  assert.equal(clips.find(c=>c.sceneId===a.id).startMs,f.scenes[2].durationMs);
  assert.equal(clips.find(c=>c.sceneId===b.id).startMs,f.scenes[2].durationMs+2200);
  assert.equal(out.scenes[1].captionEndMs,1700);
 }finally{f.close()}
});
test('R3-04 invalidates previous composition digest and puts reordered scene first in preview',async()=>{
 const f=fixture(3);try{
  const manifest={async planRecompute(videoId){return {videoId,scenes:[]}},get(){return null}};
  const compositions=new CompositionRepository({repo:f.repo,manifest});
  const first=await compositions.preview(f.video.id),order=f.editor.manifest(f.video.id);
  const target=[order.scenes[2].id,order.scenes[0].id,order.scenes[1].id];
  f.editor.reorder(f.video.id,{expectedRowVersion:order.rowVersion,sceneOrder:target});
  const second=await compositions.preview(f.video.id);
  assert.equal(second.scenes[0].id,target[0]);assert.notEqual(first.digest,second.digest);
  assert.ok(second.source.timelineRowVersion>first.source.timelineRowVersion);
 }finally{f.close()}
});
test('R3-02/04 500-scene stress keeps ordered SQLite rows and linear manifest',()=>{
 const f=fixture(500);try{
  const initial=f.editor.manifest(f.video.id);
  assert.equal(initial.scenes.length,500);
  const next=[initial.scenes[499].id,...initial.scenes.slice(0,499).map(s=>s.id)];
  const updated=f.editor.reorder(f.video.id,{expectedRowVersion:initial.rowVersion,sceneOrder:next});
  assert.equal(updated.scenes[0].sourceIndex,499);
  assert.equal(updated.scenes[499].sourceIndex,498);
  assert.equal(updated.totalDurationMs,initial.totalDurationMs);
  assert.equal(f.repo.listScenes(f.video.id)[0].id,initial.scenes[0].id); // Master source offsets unchanged.
 }finally{f.close()}
});
