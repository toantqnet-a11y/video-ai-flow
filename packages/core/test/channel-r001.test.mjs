/** R0-01: complete channel lifecycle + durable safety behavior without UI deps. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,migrations,StudioRepository,defaultPreset} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';

const fixture=()=>{const db=openProjectDb();return {db,repo:new StudioRepository(db)};};
test('R0-01 idempotent create is persisted in SQLite and detects payload mismatch',()=>{
  const {db,repo}=fixture();try{
    const args={name:' Kênh AI ',idempotencyKey:'create_12345678'};
    const first=repo.createChannel(args),second=repo.createChannel(args);
    assert.equal(first.id,second.id);assert.equal(repo.listChannels().length,1);
    assert.throws(()=>repo.createChannel({...args,name:'Khác'}),{code:'IDEMPOTENCY_CONFLICT',status:409});
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM preset_revisions').get().n,1);
  }finally{db.close()}
});
test('R0-01 preset saves version only when content changes, old video snapshot stays frozen',()=>{
  const {db,repo}=fixture();try{
    const ch=repo.createChannel({name:'Tin chính sách'}),video=repo.createVideo(ch.id,{title:'Tập 1'});
    const renamed=repo.updateChannel(ch.id,{rowVersion:ch.rowVersion,name:'Tin AI',preset:ch.preset});
    assert.equal(renamed.presetVersion,1);
    const p=structuredClone(renamed.preset);p.content.basePrompt='Ưu tiên thông tin xác thực.';
    p.voice.characterName='MC Minh';p.media.motionEffect='pan';
    const newer=repo.updateChannel(ch.id,{rowVersion:renamed.rowVersion,preset:p});
    assert.equal(newer.presetVersion,2);assert.equal(repo.listPresetRevisions(ch.id).length,2);
    assert.equal(repo.getVideo(video.id).presetSourceVersion,1);
    assert.equal(repo.getVideo(video.id).preset.content.basePrompt,undefined);
    assert.throws(()=>repo.updateChannel(ch.id,{rowVersion:renamed.rowVersion,preset:p}),{code:'VERSION_CONFLICT'});
  }finally{db.close()}
});
test('R0-01 archive/restore/delete preserve video assets and hide tombstones',()=>{
  const {db,repo}=fixture();try{
    const ch=repo.createChannel({name:'A'}),video=repo.createVideo(ch.id,{title:'Video cũ'});
    assert.equal(repo.getChannelSummary(ch.id).videoCount,1);
    const archived=repo.archiveChannel(ch.id,{rowVersion:ch.rowVersion});
    assert.equal(repo.listChannels().length,0);
    assert.equal(repo.listChannels({status:'archived'}).length,1);
    assert.throws(()=>repo.createVideo(ch.id,{title:'không cho'}),{code:'CHANNEL_ARCHIVED'});
    const restored=repo.restoreChannel(ch.id,{rowVersion:archived.rowVersion});
    assert.equal(restored.status,'active');
    const deleted=repo.softDeleteChannel(ch.id,{rowVersion:restored.rowVersion});
    assert.ok(deleted.deletedAt);assert.equal(repo.listChannels({status:'all'}).length,0);
    assert.equal(repo.listChannels({status:'deleted'}).length,1);
    assert.equal(repo.getVideo(video.id).title,'Video cũ');
    assert.throws(()=>repo.updateChannel(ch.id,{rowVersion:deleted.rowVersion,name:'Not allowed'}),{code:'CHANNEL_NOT_FOUND'});
    assert.throws(()=>repo.createVideo(ch.id,{title:'Not allowed'}),{code:'CHANNEL_NOT_FOUND'});
    const recovered=repo.restoreChannel(ch.id,{rowVersion:deleted.rowVersion});
    assert.equal(recovered.deletedAt,null);assert.equal(repo.listChannels().length,1);
    assert.equal(repo.listVideos(ch.id).length,1);
  }finally{db.close()}
});
test('R0-01 rejects unknown nested preset fields and accidental paid settings',()=>{
  const {db,repo}=fixture();try{
    const p=structuredClone(defaultPreset);p.voice.apiKey='must-not-be-saved';
    assert.throws(()=>repo.createChannel({name:'A',preset:p}),{code:'UNKNOWN_PRESET_FIELD'});
    delete p.voice.apiKey;p.models.paidEnabled=true;
    assert.throws(()=>repo.createChannel({name:'A',preset:p}),{code:'PAID_CONFIG_REQUIRES_APPROVAL'});
    p.models.paidEnabled=false;p.media.sceneSeconds=121;
    assert.throws(()=>repo.createChannel({name:'A',preset:p}),{code:'INVALID_SCENE_SECONDS'});
  }finally{db.close()}
});
test('R0-01 queued or running media job blocks archive and deletion',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'r001-jobs-'));const filename=join(dir,'studio.sqlite');
  const db=openProjectDb(filename),repo=new StudioRepository(db),store=new JobStore({path:filename});
  try{
    const ch=repo.createChannel({name:'Kênh'}),v=repo.createVideo(ch.id,{title:'V'});
    store.enqueue({key:'image-test-01',kind:'asset:image',payload:{projectId:v.id}});
    assert.equal(repo.getChannelSummary(ch.id).activeJobs,1);
    assert.throws(()=>repo.archiveChannel(ch.id,{rowVersion:ch.rowVersion}),{code:'CHANNEL_HAS_ACTIVE_JOBS'});
    assert.throws(()=>repo.softDeleteChannel(ch.id,{rowVersion:ch.rowVersion}),{code:'CHANNEL_HAS_ACTIVE_JOBS'});
    assert.equal(repo.getChannel(ch.id).status,'active');
    assert.equal(repo.getChannel(ch.id).deletedAt,null);
  }finally{store.close();db.close();await rm(dir,{recursive:true,force:true})}
});
test('R0-01 state survives restart and migrations preserve versions',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'r001-db-'));const file=join(dir,'studio.sqlite');
  try{
    let db=openProjectDb(file),repo=new StudioRepository(db);
    const ch=repo.createChannel({name:'Persistent'}),video=repo.createVideo(ch.id,{title:'Episode 1'});
    repo.softDeleteChannel(ch.id,{rowVersion:ch.rowVersion});db.close();
    db=openProjectDb(file);repo=new StudioRepository(db);
    assert.equal(repo.listChannels({status:'deleted'}).length,1);
    assert.equal(repo.getVideo(video.id).title,'Episode 1');
    assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row=>row.version),migrations.map(m=>m.version));
    db.close();
  }finally{await rm(dir,{recursive:true,force:true})}
});
test('R0-01 portrait/square render presets must match selected media aspect',()=>{
  const {db,repo}=fixture();try{
    const p=structuredClone(defaultPreset);p.media.aspectRatio='9:16';p.render.width=1080;p.render.height=1920;
    assert.equal(repo.createChannel({name:'Shorts',preset:p}).preset.media.aspectRatio,'9:16');
    const mismatched=structuredClone(p);mismatched.render.width=1920;mismatched.render.height=1080;
    assert.throws(()=>repo.createChannel({name:'Bad',preset:mismatched}),{code:'INVALID_RENDER_PRESET'});
    const square=structuredClone(p);square.media.aspectRatio='1:1';square.render.width=1080;square.render.height=1080;
    assert.equal(repo.createChannel({name:'Square',preset:square}).preset.render.width,1080);
  }finally{db.close()}
});
test('R0-01 upgrades existing v3 database without data loss',async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {migrations}=await import('../src/db.mjs');
  const {createHash}=await import('node:crypto');
  const dir=await mkdtemp(join(tmpdir(),'r001-migrate-'));const file=join(dir,'studio.sqlite');
  try{
    let old=new DatabaseSync(file);old.exec('PRAGMA foreign_keys=ON');
    old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)');
    for(const {version,sql} of migrations.slice(0,3)){
      old.exec(sql);old.prepare('INSERT INTO schema_migrations(version,checksum,applied_at) VALUES(?,?,?)').run(version,createHash('sha256').update(sql).digest('hex'),Date.now());
    }
    old.prepare("INSERT INTO channels(id,name,description,preset_json,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run('legacy-01','Old channel','',JSON.stringify(defaultPreset),1,1);
    old.close();
    let db=openProjectDb(file),repo=new StudioRepository(db);
    assert.equal(repo.getChannel('legacy-01').name,'Old channel');
    assert.equal(repo.getChannel('legacy-01').deletedAt,null);
    assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(r=>r.version),migrations.map(m=>m.version));
    db.close();
  }finally{await rm(dir,{recursive:true,force:true})}
});
