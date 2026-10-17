import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,MasterScriptRepository,SceneBuilderRepository,SceneInspectorR301,sceneMutationImpact} from '../src/index.mjs';
import {imageIntentMatches} from '../src/scene-image.mjs';

const hash='a'.repeat(64);
function setup(){
 const db=openProjectDb(),repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'Kiểm thử'}),video=repo.createVideo(channel.id,{title:'Video'});
 const [first,second]=repo.replaceScenes(video.id,{rowVersion:video.rowVersion,scenes:[
  {text:'Xin chào Việt Nam!',visualPrompt:'cánh đồng',durationMs:2000},
  {text:'Scene nguyên vẹn',visualPrompt:'biển xanh',durationMs:2000}
 ]});
 const inspector=new SceneInspectorR301(repo);
 const asset=(scene,kind,id)=>db.prepare(`INSERT INTO asset_revisions
  (id,video_id,scene_id,kind,source,file_path,sha256,bytes,state,metadata_json,created_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,video.id,scene.id,kind,'test',`${id}.png`,hash,123,'committed','{}',Date.now());
 const setPointers=(sceneId,voice,image)=>db.prepare('UPDATE scenes SET voice_asset_id=?,visual_asset_id=? WHERE id=?').run(voice,image,sceneId);
 const imageIntent=(scene)=>db.prepare(`INSERT INTO scene_image_intents(scene_id,job_id,input_hash,source_sha256,config_revision,requested_at)
 VALUES(?,?,?,?,?,?)`).run(scene.id,'job-image',hash,'b'.repeat(64),1,Date.now());
 const voiceIntent=(scene)=>db.prepare(`INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at)
 VALUES(?,?,?,?,?,?,?,?,?)`).run(scene.id,'job-voice',hash,'b'.repeat(64),1,'edge','vi-VN-HoaiMyNeural',0,Date.now());
 return {db,repo,video,first,second,inspector,asset,setPointers,imageIntent,voiceIntent,close:()=>db.close()};
}
const body=(scene,patch,acknowledgeTextEdit=false)=>({expectedRowVersion:scene.rowVersion,patch,acknowledgeTextEdit});

test('R3-01 impact preview is read-only, prompt edit preserves unrelated voice and other scene',()=>{
 const f=setup();try{
  f.asset(f.first,'voice','voice1');f.asset(f.first,'image','image1');
  f.setPointers(f.first.id,'voice1','image1');f.voiceIntent(f.first);f.imageIntent(f.first);
  const start=f.repo.getScene(f.first.id),other=f.repo.getScene(f.second.id);
  const payload=body(start,{visualPrompt:'đường phố Hà Nội'});
  const preview=f.inspector.inspect(start.id,payload);
  assert.equal(preview.impact.voiceStale,false);assert.equal(preview.impact.imageStale,true);
  assert.equal(preview.impact.providerCallsScheduled,0);
  assert.deepEqual(f.repo.getScene(start.id),start);
  const saved=f.inspector.save(start.id,payload);
  assert.equal(saved.changed,true);assert.equal(saved.scene.rowVersion,start.rowVersion+1);
  assert.equal(saved.scene.voiceAssetId,'voice1');assert.equal(saved.scene.visualAssetId,null);
  assert.equal(f.db.prepare('SELECT * FROM scene_voice_intents WHERE scene_id=?').get(start.id).job_id,'job-voice');
  assert.equal(f.db.prepare('SELECT * FROM scene_image_intents WHERE scene_id=?').get(start.id),undefined);
  assert.ok(f.db.prepare('SELECT id FROM asset_revisions WHERE id=?').get('image1')); // immutable history
  assert.deepEqual(f.repo.getScene(other.id),other);
  // Neither inspect nor save enqueues a provider job in this repository.
  assert.equal(imageIntentMatches(f.repo,{sceneId:start.id,videoId:start.videoId,inputHash:hash,
    sourceSha256:'b'.repeat(64),configRevision:1},'job-image'),false);
 }finally{f.close()}
});

test('R3-01 text edits require acknowledgment, retire voice+generated image, keep Vietnamese text and version',()=>{
 const f=setup();try{
  f.asset(f.first,'voice','voice2');f.asset(f.first,'image','image2');
  f.setPointers(f.first.id,'voice2','image2');f.voiceIntent(f.first);f.imageIntent(f.first);
  const start=f.repo.getScene(f.first.id),text='Tôi đang ở Đà Nẵng 😊\nXin chào!';
  assert.equal(f.inspector.inspect(start.id,body(start,{text})).requiresAcknowledgement,true);
  assert.throws(()=>f.inspector.save(start.id,body(start,{text})),e=>e.code==='SCENE_TEXT_EDIT_REQUIRES_ACK');
  assert.equal(f.repo.getScene(start.id).voiceAssetId,'voice2');
  const result=f.inspector.save(start.id,body(start,{text},true));
  assert.equal(result.scene.text,text);assert.equal(result.scene.voiceAssetId,null);
  assert.equal(result.scene.visualAssetId,null);
  assert.equal(f.db.prepare('SELECT count(*) n FROM scene_voice_intents').get().n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM scene_image_intents').get().n,0);
  const event=f.db.prepare("SELECT detail_json FROM domain_events WHERE event_name='scene.editor_saved'").get();
  assert.ok(event);assert.equal(event.detail_json.includes('Đà Nẵng'),false); // no raw narration in events
 }finally{f.close()}
});

test('R3-01 user-pinned image survives prompt+text edit, voice becomes stale',()=>{
 const f=setup();try{
  f.asset(f.first,'image','userImage');f.asset(f.first,'voice','originalVoice');
  f.setPointers(f.first.id,'originalVoice','userImage');f.voiceIntent(f.first);
  f.db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(f.first.id,'userImage',Date.now());
  const s=f.repo.getScene(f.first.id);
  const out=f.inspector.save(s.id,body(s,{visualPrompt:'mới',text:'Bản mới tiếng Việt.'},true));
  assert.equal(out.impact.manualImagePreserved,true);assert.equal(out.impact.imageStale,false);
  assert.equal(out.scene.visualAssetId,'userImage');assert.equal(out.scene.voiceAssetId,null);
  assert.equal(f.db.prepare('SELECT asset_id FROM scene_image_manual_selections WHERE scene_id=?').get(s.id).asset_id,'userImage');
 }finally{f.close()}
});

test('R3-01 moving from still image to video detaches incompatible manual selection but retains revision',()=>{
 const f=setup();try{
  f.asset(f.first,'image','pinnedImage');f.setPointers(f.first.id,null,'pinnedImage');
  f.db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)')
    .run(f.first.id,'pinnedImage',Date.now());
  const scene=f.repo.getScene(f.first.id),result=f.inspector.save(scene.id,body(scene,{mediaType:'import_video'}));
  assert.equal(result.impact.manualImagePreserved,false);
  assert.equal(result.impact.imageStale,true);
  assert.equal(result.scene.visualAssetId,null);
  assert.equal(f.db.prepare('SELECT asset_id FROM scene_image_manual_selections WHERE scene_id=?').get(scene.id),undefined);
  assert.ok(f.db.prepare('SELECT id FROM asset_revisions WHERE id=?').get('pinnedImage'));
 }finally{f.close()}
});

test('R3-01 duration-only and no-op leave media intact, conflicts never overwrite',()=>{
 const f=setup();try{
  const s=f.repo.getScene(f.first.id),result=f.inspector.save(s.id,body(s,{durationMs:2400}));
  assert.equal(result.impact.imageStale,false);assert.equal(result.impact.voiceStale,false);
  assert.deepEqual(result.impact.changedFields,['durationMs']);
  const noChange=f.inspector.save(s.id,body(result.scene,{durationMs:2400}));
  assert.equal(noChange.changed,false);assert.equal(noChange.scene.rowVersion,result.scene.rowVersion);
  assert.throws(()=>f.inspector.save(s.id,body(s,{visualPrompt:'stale edit'})),e=>e.code==='SCENE_ROW_VERSION_CONFLICT');
  assert.equal(f.repo.getScene(s.id).visualPrompt,s.visualPrompt);
 }finally{f.close()}
});

test('R3-01 approved source and immutable scene builder revision never get rewritten by inspector',()=>{
 const db=openProjectDb(),repo=new StudioRepository(db);
 try{
  const c=repo.createChannel({name:'Kênh'}),v=repo.createVideo(c.id,{title:'Đã duyệt'});
  const master=new MasterScriptRepository(repo),builder=new SceneBuilderRepository(repo);
  const script=('Hà Nội yên bình. Đây là kịch bản được duyệt chính thức! '.repeat(8)).trim();
  master.save(v.id,{outlineRevision:0,selections:[],editedText:script,expectedRevision:0});
  master.approve(v.id,{revision:1,expectedRevision:1,videoRowVersion:repo.getVideo(v.id).rowVersion,acknowledgeWarnings:true});
  const proposal=builder.preview(v.id);
  const result=builder.apply(v.id,{approvedMasterRevision:1,expectedSceneRevision:0,
    videoRowVersion:proposal.videoRowVersion,acknowledgeEdits:false,scenes:proposal.scenes});
  const scene=result.scenes[0],inspector=new SceneInspectorR301(repo);
  inspector.save(scene.id,body(scene,{text:'Đã chỉnh sửa scene, không thay Master Script.'},true));
  assert.equal(repo.getVideo(v.id).masterScript,script);
  assert.equal(builder.revision(v.id,1).scenes.map(x=>x.text).join(''),script);
  assert.equal(repo.getScene(scene.id).text,'Đã chỉnh sửa scene, không thay Master Script.');
  assert.equal(builder.state(v.id).sceneRevision,1);
 }finally{db.close()}
});

test('R3-01 rejects unknown fields, invalid ranges, prototype pollution and undeclared paid routing',()=>{
 const f=setup();try{
  const scene=f.repo.getScene(f.first.id);
  for(const patch of [{provider:'paid'},{text:' '},{visualPrompt:'x'.repeat(4001)},{durationMs:15},
    {mediaType:'nonexistent'},{__proto__:null,text:'x'}]){
    assert.throws(()=>f.inspector.save(scene.id,body(scene,patch)),e=>e.code==='INVALID_SCENE_PATCH');
  }
  assert.throws(()=>sceneMutationImpact(scene,{text:'x',remoteConsent:true}),e=>e.code==='INVALID_SCENE_PATCH');
  assert.equal(f.repo.getScene(scene.id).rowVersion,scene.rowVersion);
 }finally{f.close()}
});
