/** R0-08: canonical preset revision, immutability and safety acceptance tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,migrations,StudioRepository,defaultPreset,validPreset} from '../src/index.mjs';
import {matchesPresetSchema,presetSchema,presetCapabilities,stablePresetJson} from '../src/preset-schema.mjs';

const setup=()=>{const db=openProjectDb();return {db,repo:new StudioRepository(db)};};

test('R0-08 schema is canonical and validates the default on both layers',()=>{
  assert(matchesPresetSchema(defaultPreset,presetSchema));
  assert.deepEqual(validPreset(defaultPreset),defaultPreset);
  assert.equal(presetCapabilities.paidEnabledByDefault,false);
  assert.equal(presetCapabilities.remoteEnabledByDefault,false);
});

test('R0-08 saves each semantic preset change as an immutable, ordered revision',()=>{
  const {db,repo}=setup();try{
    let c=repo.createChannel({name:'Kênh'});
    const old=repo.createVideo(c.id,{title:'Video snapshot v1'});
    const changed=structuredClone(c.preset);
    changed.content.style='Tường thuật báo chí';changed.voice.voice='vi-VN-NamMinhNeural';
    const result=repo.savePresetRevision(c.id,{preset:changed,rowVersion:c.rowVersion});
    assert.equal(result.version,2);assert.equal(result.changed,true);
    assert.equal(result.rowVersion,c.rowVersion+1);
    assert.equal(repo.listPresetRevisions(c.id).length,2);
    assert.equal(repo.getPresetRevision(c.id,1).preset.voice.voice,'vi-VN-HoaiMyNeural');
    assert.equal(repo.getVideo(old.id).presetSourceVersion,1);
    assert.equal(repo.getVideo(old.id).preset.content.style,defaultPreset.content.style);
    const newer=repo.createVideo(c.id,{title:'Video v2'});
    assert.equal(repo.getVideo(newer.id).presetSourceVersion,2);
    assert.equal(repo.getVideo(newer.id).preset.voice.voice,'vi-VN-NamMinhNeural');
    assert.throws(()=>db.prepare('UPDATE preset_revisions SET preset_json=? WHERE channel_id=? AND version=1')
      .run('{}',c.id),/PRESET_REVISION_IMMUTABLE/);
    assert.throws(()=>db.prepare('DELETE FROM preset_revisions WHERE channel_id=? AND version=1')
      .run(c.id),/PRESET_REVISION_IMMUTABLE/);
  }finally{db.close()}
});

test('R0-08 stable serialization avoids duplicate revisions on reordered keys',()=>{
  const {db,repo}=setup();try{
    const ch=repo.createChannel({name:'No-op'});
    const shuffled=Object.fromEntries(Object.entries(ch.preset).reverse()
      .map(([k,v])=>[k,Object.fromEntries(Object.entries(v).reverse())]));
    assert.equal(stablePresetJson(ch.preset),stablePresetJson(shuffled));
    const result=repo.savePresetRevision(ch.id,{rowVersion:ch.rowVersion,preset:shuffled});
    assert.equal(result.changed,false);assert.equal(result.version,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM preset_revisions').get().n,1);
  }finally{db.close()}
});

test('R0-08 schema rejects unknown nested secret keys, arbitrary objects, invalid numbers',()=>{
  const examples=[
    p=>{p.voice.apiKey='DO_NOT_STORE';},
    p=>{p.models.secret='token';},
    p=>{p.content.basePrompt={nested:'not text'};},
    p=>{p.voice.speed=Number.NaN;},
    p=>{p.voice.speed=Number.POSITIVE_INFINITY;},
    p=>{p.render.width=1920.5;},
    p=>{p.render.fps=31;},
    p=>{p.media.motionEffect='exec';},
    p=>{p.media.mode='unsupported';},
    p=>{p.voice.provider='not-configured';},
  ];
  for(const modify of examples){
    const p=structuredClone(defaultPreset);modify(p);
    assert.equal(matchesPresetSchema(p),false);
    assert.throws(()=>validPreset(p));
  }
});

test('R0-08 paid/remote flags require approval outside channel preset',()=>{
  for(const key of ['paidEnabled','remoteEnabled']){
    const p=structuredClone(defaultPreset);p.models[key]=true;
    assert.throws(()=>validPreset(p),{code:key==='paidEnabled'?'PAID_CONFIG_REQUIRES_APPROVAL':'REMOTE_CONFIG_REQUIRES_APPROVAL'});
  }
});

test('R0-08 rejects stale row version without creating orphan revision or activity',()=>{
  const {db,repo}=setup();try{
    const c=repo.createChannel({name:'Versioned'});
    const update=structuredClone(c.preset);update.content.tone='Đĩnh đạc';
    repo.savePresetRevision(c.id,{preset:update,rowVersion:c.rowVersion});
    const other=structuredClone(c.preset);other.content.style='Đa chiều';
    assert.throws(()=>repo.savePresetRevision(c.id,{preset:other,rowVersion:c.rowVersion}),{code:'VERSION_CONFLICT',status:409});
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM preset_revisions').get().n,2);
    assert.equal(repo.getChannel(c.id).preset.content.style,c.preset.content.style);
    assert.throws(()=>repo.getPresetRevision(c.id,99),{code:'PRESET_REVISION_NOT_FOUND'});
    assert.throws(()=>repo.getPresetRevision(c.id,0),{code:'INVALID_PRESET_VERSION'});
  }finally{db.close()}
});

test('R0-08 revisions and snapshot survive SQLite process restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'cs-r008-'));const file=join(dir,'studio.sqlite');
  try{
    let db=openProjectDb(file);let repo=new StudioRepository(db);
    let c=repo.createChannel({name:'Persist'});let p=structuredClone(c.preset);
    p.media.mode='ai_video';repo.savePresetRevision(c.id,{rowVersion:c.rowVersion,preset:p});
    const v=repo.createVideo(c.id,{title:'Demo'});db.close();
    db=openProjectDb(file);repo=new StudioRepository(db);
    assert.equal(repo.getVideo(v.id).presetSourceVersion,2);
    assert.equal(repo.getPresetRevision(c.id,2).preset.media.mode,'ai_video');
    assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(r=>r.version),migrations.map(m=>m.version));
    db.close();
  }finally{await rm(dir,{recursive:true,force:true})}
});

test('R0-08 upgrades existing v5 to immutable v6 without changing prior checksums',async()=>{
  const {migrations}=await import('../src/db.mjs');
  const {DatabaseSync}=await import('node:sqlite');
  const {createHash}=await import('node:crypto');
  const dir=await mkdtemp(join(tmpdir(),'cs-r008-upgrade-'));const file=join(dir,'studio.sqlite');
  try{
    const previous=new DatabaseSync(file);
    previous.exec('PRAGMA foreign_keys=ON');
    previous.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at INTEGER NOT NULL)');
    for(const migration of migrations.slice(0,5)){
      previous.exec(migration.sql);
      previous.prepare('INSERT INTO schema_migrations(version,checksum,applied_at) VALUES(?,?,?)')
        .run(migration.version,createHash('sha256').update(migration.sql).digest('hex'),1);
    }
    previous.prepare('INSERT INTO channels (id,name,preset_json,created_at,updated_at) VALUES(?,?,?,?,?)')
      .run('legacy','V5 channel',JSON.stringify(defaultPreset),1,1);
    previous.prepare('INSERT INTO preset_revisions (channel_id,version,preset_json,created_at) VALUES(?,?,?,?)')
      .run('legacy',1,JSON.stringify(defaultPreset),1);
    previous.close();
    const migrated=openProjectDb(file);
    assert.equal(new StudioRepository(migrated).getPresetRevision('legacy',1).preset.voice.provider,'edge');
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n,migrations.length);
    assert.throws(()=>migrated.prepare('DELETE FROM preset_revisions WHERE channel_id=?').run('legacy'),/PRESET_REVISION_IMMUTABLE/);
    migrated.close();
    const entries=await (await import('node:fs/promises')).readdir(dir);
    assert(entries.some(name=>name.includes(`.pre-v${migrations.length}-`)));
  }finally{await rm(dir,{recursive:true,force:true})}
});
