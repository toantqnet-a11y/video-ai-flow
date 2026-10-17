/** R0-02: destructive safety properties for migrations and backup/restore. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProjectDb, migrations, StudioRepository, defaultPreset } from '../src/index.mjs';

async function sandbox(fn) {
  const directory = await mkdtemp(join(tmpdir(),'cs-r002-'));
  try { return await fn(join(directory,'studio.sqlite'), directory); }
  finally { await rm(directory,{recursive:true,force:true}); }
}
/** Produce a genuine v3/v4 database using unchanged migration SQL/checksums. */
function legacy(path,version) {
  const db=new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
  db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  for (const m of migrations.slice(0,version)) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations(version,checksum,applied_at) VALUES(?,?,?)')
        .run(m.version,createHash('sha256').update(m.sql).digest('hex'),Date.now());
      db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK');db.close();throw e; }
  }
  return db;
}
async function backups(dir) { return (await readdir(dir)).filter(n=>n.includes(`.pre-v${migrations.length}-`)&&n.endsWith('.sqlite')); }

test('R0-02 fresh database bootstraps v1..v6 without redundant backup', async()=>sandbox(async(file,dir)=>{
  const db=openProjectDb(file);
  assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(x=>x.version),migrations.map(m=>m.version));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,migrations.length);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode,'wal');
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  db.close();assert.deepEqual(await backups(dir),[]);
}));

test('R0-02 upgrade v4 with data in WAL creates verified private pre-upgrade snapshot',async()=>sandbox(async(file,dir)=>{
  const original=legacy(file,4);
  original.prepare('INSERT INTO channels(id,name,description,preset_json,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('old-channel','Dữ liệu cũ','',JSON.stringify(defaultPreset),123,123);
  // Keep writer connection open: VACUUM INTO must read committed WAL frames.
  const upgraded=openProjectDb(file);
  assert.equal(new StudioRepository(upgraded).getChannel('old-channel').name,'Dữ liệu cũ');
  assert.equal(upgraded.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n,migrations.length);
  upgraded.close();original.close();
  const files=await backups(dir); assert.equal(files.length,1);
  const backupFile=join(dir,files[0]);
  const old=new DatabaseSync(backupFile,{readOnly:true});
  assert.equal(old.prepare('PRAGMA quick_check').get().quick_check,'ok');
  assert.equal(old.prepare('SELECT name FROM channels WHERE id=?').get('old-channel').name,'Dữ liệu cũ');
  assert.deepEqual(old.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(x=>x.version),[1,2,3,4]);
  old.close();
  if(process.platform!=='win32')assert.equal((await stat(backupFile)).mode & 0o777,0o600);
  // Reopening at the current version never makes another backup.
  const reopened=openProjectDb(file);reopened.close();assert.equal((await backups(dir)).length,1);
}));

test('R0-02 upgrades v3 through v4+v5 without replacing preset history',async()=>sandbox(async(file,dir)=>{
  const db=legacy(file,3);
  db.prepare('INSERT INTO channels(id,name,description,preset_json,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('legacy','Legacy','',JSON.stringify(defaultPreset),1,1);
  db.prepare('INSERT INTO preset_revisions(channel_id,version,preset_json,created_at) VALUES(?,?,?,?)')
    .run('legacy',1,JSON.stringify(defaultPreset),1);
  db.close();
  const upgraded=openProjectDb(file);
  assert.equal(upgraded.prepare('SELECT COUNT(*) AS n FROM preset_revisions WHERE channel_id=?').get('legacy').n,1);
  assert.equal(new StudioRepository(upgraded).getChannel('legacy').deletedAt,null);
  upgraded.close();
  assert.equal((await backups(dir)).length,1);
}));

test('R0-02 altered history checksum is rejected without modifying or backing up DB',async()=>sandbox(async(file,dir)=>{
  const db=legacy(file,4);
  db.prepare('UPDATE schema_migrations SET checksum=? WHERE version=3').run('tampered');db.close();
  assert.throws(()=>openProjectDb(file),/MIGRATION_CHANGED_3/);
  assert.deepEqual(await backups(dir),[]);
  const read=new DatabaseSync(file,{readOnly:true});
  assert.equal(read.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v,4);read.close();
}));

test('R0-02 unknown newer schema is refused, no attempt to downgrade',async()=>sandbox(async(file,dir)=>{
  const db=legacy(file,4);
  db.prepare('INSERT INTO schema_migrations(version,checksum,applied_at) VALUES(?,?,?)').run(999,'next-version',1);db.close();
  assert.throws(()=>openProjectDb(file),/DATABASE_SCHEMA_NEWER_OR_UNKNOWN_999/);
  assert.deepEqual(await backups(dir),[]);
}));

test('R0-02 schema ledger gap is rejected',async()=>sandbox(async(file)=>{
  const db=legacy(file,4);
  db.prepare('DELETE FROM schema_migrations WHERE version=2').run();db.close();
  assert.throws(()=>openProjectDb(file),/MIGRATION_HISTORY_GAP/);
}));

test('R0-02 missing ledger with domain tables fails closed, without creating ledger',async()=>sandbox(async(file)=>{
  const db=new DatabaseSync(file);db.exec('CREATE TABLE channels(id TEXT)');db.close();
  assert.throws(()=>openProjectDb(file),/UNVERSIONED_DOMAIN_SCHEMA/);
  const read=new DatabaseSync(file,{readOnly:true});
  assert.equal(read.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='schema_migrations'").get().n,0);read.close();
}));

test('R0-02 refuses unrelated SQLite files but supports queue-only database',async()=>sandbox(async(file)=>{
  const random=new DatabaseSync(file);random.exec('CREATE TABLE unrelated (id)');random.close();
  assert.throws(()=>openProjectDb(file),/UNVERSIONED_FOREIGN_SCHEMA/);
}));

test('R0-02 migration failure is atomic and previous backup can be restored',async()=>sandbox(async(file,dir)=>{
  const db=legacy(file,4);
  db.prepare('INSERT INTO channels(id,name,description,preset_json,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('keep','Keep','',JSON.stringify(defaultPreset),1,1);
  // Force v5 DDL to fail after creating its triggers: index name clashes.
  db.exec('CREATE TABLE idx_videos_status_updated (id INTEGER)');db.close();
  assert.throws(()=>openProjectDb(file),/already (?:exists|a table)/i);
  const raw=new DatabaseSync(file);
  assert.equal(raw.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v,4);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name='asset_scene_video_insert'").get().n,0);
  assert.equal(raw.prepare('SELECT name FROM channels WHERE id=?').get('keep').name,'Keep');
  raw.exec('DROP TABLE idx_videos_status_updated');raw.close();
  assert.equal((await backups(dir)).length,1);
  const migrated=openProjectDb(file);assert.equal(migrated.prepare('SELECT MAX(version) v FROM schema_migrations').get().v,migrations.length);migrated.close();
}));

test('R0-02 v5 cross-video asset mismatch rejected at DB boundary',async()=>sandbox(async(file)=>{
  const db=openProjectDb(file),repo=new StudioRepository(db),c=repo.createChannel({name:'A'});
  const v1=repo.createVideo(c.id,{title:'one'}),v2=repo.createVideo(c.id,{title:'two'});
  const scene=repo.replaceScenes(v1.id,{rowVersion:1,scenes:[{text:'Text',durationMs:2000}]})[0];
  const insertion=db.prepare(`INSERT INTO asset_revisions
    (id,video_id,scene_id,kind,source,file_path,sha256,bytes,state,metadata_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  assert.throws(()=>insertion.run('bad',v2.id,scene.id,'voice','local','bad.wav','abc',123,'committed','{}',1),/ASSET_VIDEO_SCENE_MISMATCH/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM asset_revisions').get().n,0);
  db.close();
}));

test('R0-02 detects foreign key violation before upgrades',async()=>sandbox(async(file,dir)=>{
  const db=legacy(file,4);
  db.exec('PRAGMA foreign_keys=OFF');
  db.prepare('INSERT INTO videos(id,channel_id,title,preset_snapshot_json,preset_source_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('invalid-video','missing-channel','bad','{}',1,1,1);db.close();
  assert.throws(()=>openProjectDb(file),/DATABASE_FOREIGN_KEY_FAILED/);
  assert.deepEqual(await backups(dir),[]);
}));


test('R0-02 existing queue-only database is retained and backed up before domain install',async()=>sandbox(async(file,dir)=>{
  const { JobStore } = await import('../../../spikes/SP-04/src/store.js');
  const store=new JobStore({path:file});
  const {job}=store.enqueue({key:'restore-me',kind:'system:test',payload:{projectId:'old'}});
  store.close();
  const db=openProjectDb(file);
  assert.equal(db.prepare('SELECT id FROM jobs WHERE idem_key=?').get('restore-me').id,job.id);
  db.close();
  const [snapshot]=await backups(dir);assert.ok(snapshot);
  const backup=new DatabaseSync(join(dir,snapshot),{readOnly:true});
  assert.equal(backup.prepare('SELECT id FROM jobs WHERE idem_key=?').get('restore-me').id,job.id);
  assert.equal(backup.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='channels'").get().n,0);
  backup.close();
}));

test('R0-02 existing schema with valid checksums but altered required columns is rejected',async()=>sandbox(async(file,dir)=>{
  const db=legacy(file,4);
  db.exec('ALTER TABLE channels RENAME COLUMN name TO incorrect_name');db.close();
  assert.throws(()=>openProjectDb(file),/DATABASE_SCHEMA_INCOMPLETE/);
  assert.deepEqual(await backups(dir),[]);
}));

test('R0-02 backup is restorable into a separate data root (manual recovery proof)',async()=>sandbox(async(file,dir)=>{
  const db=legacy(file,4);db.close();
  const upgraded=openProjectDb(file);upgraded.close();
  const [filename]=await backups(dir);
  const { copyFile } = await import('node:fs/promises');
  const restored=join(dir,'recovered.sqlite');
  await copyFile(join(dir,filename),restored);
  const old=new DatabaseSync(restored,{readOnly:true});
  assert.equal(old.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,4);
  assert.equal(old.prepare('PRAGMA quick_check').get().quick_check,'ok');old.close();
}));

test('R0-02 refuses cross-video asset associations in older schema',async()=>sandbox(async(file,dir)=>{
  const db=legacy(file,4);
  const preset=JSON.stringify(defaultPreset);
  for(const [id,channel] of [['first','c'],['second','c']]){
    if(channel==='c'&&!db.prepare('SELECT 1 FROM channels WHERE id=?').get(channel)){
      db.prepare('INSERT INTO channels(id,name,preset_json,created_at,updated_at) VALUES(?,?,?,?,?)')
        .run(channel,'Channel',preset,1,1);
    }
    db.prepare('INSERT INTO videos(id,channel_id,title,preset_snapshot_json,preset_source_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(id,channel,'Title',preset,1,1,1);
  }
  db.prepare('INSERT INTO scenes(id,video_id,idx,text,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('scene1','first',0,'Hello',1,1);
  db.prepare(`INSERT INTO asset_revisions(id,video_id,scene_id,kind,source,file_path,sha256,bytes,state,metadata_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run('bad','second','scene1','image','import','/asset.png','hash',23,'committed','{}',1);
  db.close();
  assert.throws(()=>openProjectDb(file),/ASSET_VIDEO_SCENE_MISMATCH/);
  assert.deepEqual(await backups(dir),[]);
}));

test('R0-02 maintenance CLI reports metadata only; creates verified manual snapshot',async()=>sandbox(async(file,dir)=>{
  const db=openProjectDb(file);db.close();
  const {execFileSync}=await import('node:child_process');
  const script=new URL('../../../tools/db-maintenance.mjs',import.meta.url).pathname;
  const inspect=JSON.parse(execFileSync(process.execPath,[script,'inspect',file],{encoding:'utf8'}));
  assert.equal(inspect.schemaVersion,migrations.length);
  assert.equal(inspect.quickCheck,'ok');
  const backup=JSON.parse(execFileSync(process.execPath,[script,'backup',file],{encoding:'utf8'}));
  assert.equal(backup.ok,true);assert.match(backup.backup,/\.pre-vmanual-/);
  assert.ok((await readdir(dir)).some(name=>name.includes('pre-vmanual-')));
}));
