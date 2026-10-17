/** R0-12 acceptance: real SQLite v9, channel isolation and safe lifecycle. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,migrations,defaultPreset} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
const fixture=()=>{const db=openProjectDb(),repo=new StudioRepository(db);const a=repo.createChannel({name:'A'}),b=repo.createChannel({name:'B'});return {db,repo,a,b,close:()=>db.close()};};
const bad=(fn,code)=>assert.throws(fn,{code});

test('R0-12 create is atomic and snapshots preset + duration without starting jobs',()=>{
 const f=fixture();try{
  const preset=structuredClone(f.a.preset);preset.content.targetMinutes=30;
  const updated=f.repo.updateChannel(f.a.id,{rowVersion:1,preset});
  const v=f.repo.createVideo(f.a.id,{title:'Bản tin',brief:'Tin AI',targetMinutes:40});
  assert.equal(v.status,'draft');assert.equal(v.targetDurationSec,2400);assert.equal(v.actualDurationSec,null);
  assert.equal(v.preset.content.targetMinutes,30);assert.equal(v.effectivePreset.content.targetMinutes,40);
  assert.equal(v.presetSourceVersion,2);assert.equal(v.lastActiveStep,'content');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM video_config_revisions WHERE video_id=?').get(v.id).n,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM timeline_documents WHERE video_id=?').get(v.id).n,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='jobs'").get().n,0);
  const changed=structuredClone(updated.preset);changed.content.style='Narrative';f.repo.updateChannel(f.a.id,{rowVersion:updated.rowVersion,preset:changed});
  assert.equal(f.repo.getVideo(v.id).preset.content.style,preset.content.style);
  bad(()=>f.repo.createVideo(f.a.id,{title:'  '}),'INVALID_VIDEO');
  bad(()=>f.repo.createVideo(f.a.id,{title:'A',targetMinutes:121}),'INVALID_VIDEO');
 }finally{f.close()}
});

test('R0-12 create idempotency survives retries and refuses conflicting body',()=>{
 const f=fixture();try{
  const arg={title:'One',idempotencyKey:'req_create_98765'};
  const v=f.repo.createVideo(f.a.id,arg);
  const channel=f.repo.getChannel(f.a.id);const preset=structuredClone(channel.preset);preset.content.targetMinutes=48;
  f.repo.updateChannel(channel.id,{rowVersion:channel.rowVersion,preset});
  assert.equal(f.repo.createVideo(f.a.id,arg).id,v.id);
  assert.equal(f.repo.listVideos(f.a.id).length,1);
  bad(()=>f.repo.createVideo(f.a.id,{...arg,title:'Two'}),'IDEMPOTENCY_CONFLICT');
  bad(()=>f.repo.createVideo(f.b.id,arg),'IDEMPOTENCY_CONFLICT');
 }finally{f.close()}
});

test('R0-12 library isolates channels, escapes SQL wildcard, preserves cursor ties',()=>{
 const f=fixture();try{
  const ids=[];for(let i=0;i<45;i++)ids.push(f.repo.createVideo(f.a.id,{title:`Episode ${i}`} ).id);
  f.repo.createVideo(f.b.id,{title:'Episode hidden'});
  const seen=new Set();let cursor;do{
    const page=f.repo.listVideoPage(f.a.id,{limit:8,cursor});
    assert(page.items.length<=8);
    for(const v of page.items){assert.equal(v.channelId,f.a.id);assert(!seen.has(v.id));seen.add(v.id)}
    cursor=page.nextCursor??undefined;
  }while(cursor);
  assert.equal(seen.size,45);
  f.repo.createVideo(f.a.id,{title:'100% done'});f.repo.createVideo(f.a.id,{title:'100 percent done'});
  assert.equal(f.repo.listVideoPage(f.a.id,{search:'%',limit:30}).items.length,1);
  assert.equal(f.repo.listVideoPage(f.a.id,{search:'_'}).items.length,0);
  bad(()=>f.repo.listVideoPage(f.a.id,{limit:999}),'INVALID_VIDEO_FILTER');
  bad(()=>f.repo.listVideoPage(f.a.id,{cursor:'BADCURSOR'}),'INVALID_VIDEO_CURSOR');
 }finally{f.close()}
});

test('R0-12 resume step validates persisted script and scenes',()=>{
 const f=fixture();try{
  const v=f.repo.createVideo(f.a.id,{title:'Flow'});
  assert.equal(f.repo.resumeVideo(f.a.id,v.id).step,'content');
  bad(()=>f.repo.updateVideoStep(v.id,{rowVersion:v.rowVersion,step:'timeline'}),'VIDEO_STEP_NOT_READY');
  let updated=f.repo.updateScript(v.id,{rowVersion:v.rowVersion,masterScript:'Nội dung chuẩn.'});
  updated=f.repo.updateVideoStep(v.id,{rowVersion:updated.rowVersion,step:'scenes'});
  assert.equal(f.repo.resumeVideo(f.a.id,v.id).step,'scenes');
  bad(()=>f.repo.updateVideoStep(v.id,{rowVersion:updated.rowVersion,step:'timeline'}),'VIDEO_STEP_NOT_READY');
  f.repo.replaceScenes(v.id,{rowVersion:updated.rowVersion,scenes:[{text:'Nội dung chuẩn.',durationMs:18000}]});
  assert.equal(f.repo.resumeVideo(f.a.id,v.id).step,'timeline');
  bad(()=>f.repo.getScopedVideo(f.b.id,v.id),'VIDEO_NOT_FOUND');
  bad(()=>f.repo.resumeVideo(f.b.id,v.id),'VIDEO_NOT_FOUND');
 }finally{f.close()}
});

test('R0-12 rename and soft delete enforce version and restore data',()=>{
 const f=fixture();try{
  const v=f.repo.createVideo(f.a.id,{title:'Original'});
  const renamed=f.repo.renameVideo(v.id,{title:'Updated',rowVersion:v.rowVersion});
  assert.equal(renamed.title,'Updated');bad(()=>f.repo.renameVideo(v.id,{title:'Conflict',rowVersion:v.rowVersion}),'VERSION_CONFLICT');
  const deleted=f.repo.softDeleteVideo(v.id,{rowVersion:renamed.rowVersion});
  assert(deleted.deletedAt!==null);assert.equal(f.repo.listVideos(f.a.id).length,0);
  assert.equal(f.repo.listVideoPage(f.a.id,{deleted:true}).items.length,1);
  bad(()=>f.repo.getScopedVideo(f.a.id,v.id),'VIDEO_NOT_FOUND');
  bad(()=>f.repo.updateScript(v.id,{masterScript:'Edit tombstone',rowVersion:deleted.rowVersion}),'VIDEO_NOT_FOUND');
  const restored=f.repo.restoreVideo(v.id,{rowVersion:deleted.rowVersion});
  assert.equal(restored.deletedAt,null);assert.equal(restored.title,'Updated');
  assert.equal(f.repo.listVideoPage(f.a.id).items.length,1);
 }finally{f.close()}
});

test('R0-12 cloning copies script and selected settings but NEVER assets, scenes or jobs',()=>{
 const f=fixture();try{
  let v=f.repo.createVideo(f.a.id,{title:'Master'});
  v=f.repo.updateScript(v.id,{rowVersion:v.rowVersion,masterScript:'Xin chào.'});
  f.repo.replaceScenes(v.id,{rowVersion:v.rowVersion,scenes:[{text:'Xin chào.',durationMs:8000}]});
  const key='clone_12345678';const clone=f.repo.cloneVideo(v.id,{idempotencyKey:key});
  assert.notEqual(clone.id,v.id);assert.equal(clone.masterScript,'Xin chào.');
  assert.equal(clone.status,'content_ready');assert.equal(clone.lastActiveStep,'content');
  assert.equal(f.repo.listScenes(clone.id).length,0);
  assert.equal(f.repo.listVideoConfigRevisions(clone.id).length,1);
  assert.equal(f.repo.getTimeline(clone.id).document.clips.length,0);
  assert.equal(f.repo.cloneVideo(v.id,{idempotencyKey:key}).id,clone.id);
  bad(()=>f.repo.cloneVideo(v.id,{idempotencyKey:key,title:'Another'}),'IDEMPOTENCY_CONFLICT');
 }finally{f.close()}
});

test('R0-12 prevents deletion while jobs are active, retains video after rejection',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cs-r012-job-'));const file=join(directory,'db.sqlite');
 const db=openProjectDb(file),repo=new StudioRepository(db),store=new JobStore({path:file});
 try{const c=repo.createChannel({name:'C'}),v=repo.createVideo(c.id,{title:'V'});
  store.enqueue({key:'asset:video-test',kind:'asset:image',payload:{projectId:v.id}});
  bad(()=>repo.softDeleteVideo(v.id,{rowVersion:v.rowVersion}),'VIDEO_HAS_ACTIVE_JOBS');
  assert.equal(repo.getVideo(v.id).deletedAt,null);
 }finally{store.close();db.close();await rm(directory,{recursive:true,force:true})}
});

test('R0-12 migration upgrades v8 without mutating historical checksums',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cs-r012-upgrade-'));const file=join(directory,'db.sqlite');
 try{
   // Create true v8 schema with genuine old migration checksums.
   const {DatabaseSync}=await import('node:sqlite');const {createHash}=await import('node:crypto');
   const old=new DatabaseSync(file);old.exec('PRAGMA foreign_keys=ON');
   old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at INTEGER NOT NULL)');
   for(const m of migrations.slice(0,8)){old.exec(m.sql);old.prepare('INSERT INTO schema_migrations(version,checksum,applied_at) VALUES(?,?,?)').run(m.version,createHash('sha256').update(m.sql).digest('hex'),Date.now());}
   const oldLedger=old.prepare('SELECT version,checksum FROM schema_migrations ORDER BY version').all();
   old.prepare('INSERT INTO channels(id,name,description,preset_json,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('channel','Channel','',JSON.stringify(defaultPreset),1,1);
   old.prepare('INSERT INTO videos(id,channel_id,title,brief,preset_snapshot_json,preset_source_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('legacy','channel','Old video','',JSON.stringify(defaultPreset),1,1,1);
   old.prepare('INSERT INTO video_config_revisions(video_id,version,source_preset_version,overrides_json,resolved_json,impact_json,created_at) VALUES(?,?,?,?,?,?,?)').run('legacy',1,1,'{}',JSON.stringify(defaultPreset),'{}',1);
   old.close();
   const upgraded=openProjectDb(file);
   assert.deepEqual(upgraded.prepare('SELECT version,checksum FROM schema_migrations WHERE version<=8 ORDER BY version').all(),oldLedger);
   const repo=new StudioRepository(upgraded);assert.equal(repo.getVideo('legacy').targetDurationSec,defaultPreset.content.targetMinutes*60);
   assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version,migrations.at(-1).version);upgraded.close();
   assert((await readdir(directory)).some(n=>n.includes('.pre-v'+migrations.at(-1).version+'-')));
 }finally{await rm(directory,{recursive:true,force:true})}
});


test('R0-12 list payload stays light even for a long master script',()=>{
 const f=fixture();try{
  let v=f.repo.createVideo(f.a.id,{title:'Video dài'});
  v=f.repo.updateScript(v.id,{rowVersion:1,masterScript:'A'.repeat(180000)});
  const item=f.repo.listVideoPage(f.a.id).items[0];
  assert.equal(item.title,v.title);
  assert.equal(Object.hasOwn(item,'masterScript'),false);
  assert.equal(Object.hasOwn(item,'preset'),false);
  assert.equal(JSON.stringify(item).length<2500,true);
 }finally{f.close()}
});
