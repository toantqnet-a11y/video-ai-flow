/** R2-09 acceptance: read-only bounded asset library and cost-free recompute plan. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,AssetManifest,AssetLibraryR209} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'contentstudio-r209-'));
 const file=join(dir,'db.sqlite'),db=openProjectDb(file),repo=new StudioRepository(db),store=new JobStore({path:file});
 const c=repo.createChannel({name:'Asset Library'}),video=repo.createVideo(c.id,{title:'Video'}),otherVideo=repo.createVideo(c.id,{title:'Other video'});
 const [s1,s2]=repo.replaceScenes(video.id,{rowVersion:1,scenes:[{text:'A',visualPrompt:'Sky',durationMs:4000},{text:'B',visualPrompt:'Sea',durationMs:4000}]});
 const [alien]=repo.replaceScenes(otherVideo.id,{rowVersion:1,scenes:[{text:'Other',durationMs:4000}]});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:dir}),library=new AssetLibraryR209({repo,manifest});
 const add=async(sceneId,kind='image',txt='unique')=>manifest.importBytes({sceneId,kind,source:'manual_import',bytes:Buffer.from(txt),extension:kind==='image'?'.png':kind==='voice'?'.wav':'.mp4'});
 return {dir,db,store,repo,manifest,library,video,otherVideo,s1,s2,alien,add,async close(){store.close();db.close();await rm(dir,{recursive:true,force:true})}};
}
test('R2-09 includes current + historical revisions with no disk paths, metadata or prompt text',async()=>{
 const f=await fixture();try{
  const old=await f.add(f.s1.id,'image','a');const current=await f.add(f.s1.id,'image','b');
  const p=await f.library.page(f.video.id);
  assert.equal(p.items.length,2);assert.equal(p.nextCursor,null);
  assert.equal(p.items.find(x=>x.id===current.id).selected,true);
  assert.equal(p.items.find(x=>x.id===old.id).selected,false);
  assert.ok(p.items.every(x=>x.health==='healthy'));
  assert.ok(p.items.every(x=>!('relativePath'in x)&&!('metadata'in x)&&!('text'in x)));
  assert.equal(f.store.countByStatus().total,0);
 }finally{await f.close()}
});
test('R2-09 keyset pagination is deterministic with same timestamp',async()=>{
 const f=await fixture();try{
  for(let i=0;i<6;i++)await f.add(f.s1.id,i%2?'voice':'image',`bytes-${i}`);
  const first=await f.library.page(f.video.id,{limit:2});
  assert.equal(first.items.length,2);assert.ok(first.nextCursor);
  const second=await f.library.page(f.video.id,{limit:2,cursor:first.nextCursor});
  const third=await f.library.page(f.video.id,{limit:2,cursor:second.nextCursor});
  assert.equal(third.nextCursor,null);
  assert.equal(new Set([...first.items,...second.items,...third.items].map(x=>x.id)).size,6);
  assert.deepEqual((await f.library.page(f.video.id,{kind:'image',limit:3})).items.map(x=>x.kind),['image','image','image']);
 }finally{await f.close()}
});
test('R2-09 filters by video, including from foreign cursor and alien assets',async()=>{
 const f=await fixture();try{
  await f.add(f.alien.id,'image','alien');await f.add(f.s1.id,'image','safe');await f.add(f.s2.id,'image','safe2');
  const list=await f.library.page(f.video.id,{limit:1});
  assert.equal(list.items.length,1);assert.ok(list.nextCursor);
  const foreign=await f.library.page(f.otherVideo.id);
  assert.equal(foreign.items.length,1);
  await assert.rejects(f.library.page(f.otherVideo.id,{cursor:list.nextCursor}),{code:'INVALID_ASSET_LIBRARY_QUERY'});
  assert.ok((await f.library.page(f.video.id)).items.every(x=>x.sceneId!==f.alien.id));
 }finally{await f.close()}
});
test('R2-09 rejects malformed filters, limits, cursor, and unknown parameters without full scan',async()=>{
 const f=await fixture();try{
  for(const query of [{limit:0},{limit:51},{limit:'3x'},{kind:'video;DROP'},{cursor:'@@@'},{cursor:'e30'},{probe:true},{kind:null},{limit:1.5}])
   await assert.rejects(f.library.page(f.video.id,query),{code:'INVALID_ASSET_LIBRARY_QUERY'});
  await assert.rejects(f.library.page('does-not-exist'),{code:'VIDEO_NOT_FOUND'});
 }finally{await f.close()}
});
test('R2-09 integrity check reports corrupt and missing but does not mutate active records',async()=>{
 const f=await fixture();try{
  const a=await f.add(f.s1.id,'image','asset-healthy'),file=join(f.dir,a.relativePath);
  await writeFile(file,'asset-corrupt');
  const before=f.db.prepare('SELECT state FROM asset_revisions WHERE id=?').get(a.id).state;
  assert.equal((await f.library.page(f.video.id)).items[0].health,'corrupt');
  assert.equal(f.db.prepare('SELECT state FROM asset_revisions WHERE id=?').get(a.id).state,before);
  assert.equal(f.repo.getScene(f.s1.id).visualAssetId,a.id);
 }finally{await f.close()}
});
test('R2-09 read-only recompute shows user-pinned image even when source changes',async()=>{
 const f=await fixture();try{
  const a=await f.add(f.s1.id,'image','pinned');
  f.db.prepare(`INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)`).run(f.s1.id,a.id,Date.now());
  f.db.prepare('UPDATE scenes SET text=? WHERE id=?').run('script edited',f.s1.id);
  const result=await f.library.recompute(f.video.id);
  assert.equal(result.summary.manualPreserved,1);
  assert.equal(result.summary.missingVoice,2);
  assert.equal(result.summary.missingVisual,1);
  assert.equal(result.queued,false);assert.equal(result.requiresExplicitSubmit,true);
  assert.equal(f.store.countByStatus().total,0);
  assert.equal(f.repo.getScene(f.s1.id).visualAssetId,a.id);
 }finally{await f.close()}
});
test('R2-09 restores page/query results after SQLite reconnect',async()=>{
 const f=await fixture();let closed=false;
 try{
  const a=await f.add(f.s1.id,'voice','stable');
  f.store.close();f.db.close();closed=true;
  const db=openProjectDb(join(f.dir,'db.sqlite'));try{
   const repo=new StudioRepository(db),manifest=new AssetManifest({db,repository:repo,dataRoot:f.dir});
   const list=await new AssetLibraryR209({repo,manifest}).page(f.video.id);
   assert.equal(list.items[0].id,a.id);assert.equal(list.items[0].health,'healthy');
  }finally{db.close()}
 }finally{if(!closed){f.store.close();f.db.close()}await rm(f.dir,{recursive:true,force:true})}
});
