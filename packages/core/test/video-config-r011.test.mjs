/** EP10 / R0-11 acceptance tests. Real SQLite and immutable migration data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,defaultPreset,migrations} from '../src/index.mjs';

function setup(){const db=openProjectDb(),repo=new StudioRepository(db);const ch=repo.createChannel({name:'Kênh'}),video=repo.createVideo(ch.id,{title:'Video'});return {db,repo,ch,video};}
const changeVoice={voice:{voice:'vi-VN-NamMinhNeural'}};

test('R0-11 new video has immutable original snapshot and initial config revision',()=>{
  const {db,repo,ch,video}=setup();try{
    assert.equal(video.configRevision,1);assert.deepEqual(video.overrides,{});
    assert.deepEqual(video.effectivePreset,video.preset);
    assert.equal(repo.getVideoConfig(video.id).sourcePresetVersion,ch.presetVersion);
    const old=repo.getVideoConfig(video.id,1);assert.equal(old.version,1);
    assert.equal(repo.listVideoConfigRevisions(video.id).length,1);
    assert.throws(()=>db.prepare('DELETE FROM video_config_revisions WHERE video_id=?').run(video.id),/VIDEO_CONFIG_REVISION_IMMUTABLE/);
    assert.throws(()=>db.prepare('UPDATE video_config_revisions SET overrides_json=? WHERE video_id=?').run('{}',video.id),/VIDEO_CONFIG_REVISION_IMMUTABLE/);
    assert.throws(()=>db.prepare('UPDATE videos SET preset_snapshot_json=? WHERE id=?').run('{}',video.id),/VIDEO_SOURCE_SNAPSHOT_IMMUTABLE/);
  }finally{db.close()}
});

test('R0-11 preview has no write, save uses row lock, no-op creates no revision',()=>{
  const {db,repo,video}=setup();try{
    const preview=repo.previewVideoConfig(video.id,{rowVersion:1,overrides:changeVoice});
    assert.deepEqual(preview.impact.changedPaths,['voice.voice']);
    assert.deepEqual(preview.impact.affected,['render','voice']);
    assert.equal(preview.impact.requiresReview,false);
    assert.equal(repo.listVideoConfigRevisions(video.id).length,1);
    const saved=repo.updateVideoConfig(video.id,{rowVersion:1,overrides:changeVoice});
    assert.equal(saved.changed,true);assert.equal(saved.version,2);
    assert.equal(saved.rowVersion,2);
    const same=repo.updateVideoConfig(video.id,{rowVersion:2,overrides:{voice:{voice:'vi-VN-NamMinhNeural'}}});
    assert.equal(same.changed,false);
    assert.equal(repo.listVideoConfigRevisions(video.id).length,2);
    assert.throws(()=>repo.updateVideoConfig(video.id,{rowVersion:1,overrides:{}}),{code:'VERSION_CONFLICT'});
    assert.equal(repo.getVideoConfig(video.id,1).effectivePreset.voice.voice,defaultPreset.voice.voice);
    assert.equal(repo.getVideo(video.id).preset.voice.voice,defaultPreset.voice.voice);
  }finally{db.close()}
});

test('R0-11 field-level changes can reset to original channel source',()=>{
  const {db,repo,video}=setup();try{
    repo.updateVideoConfig(video.id,{rowVersion:1,overrides:changeVoice});
    const result=repo.updateVideoConfig(video.id,{rowVersion:2,overrides:{}});
    assert.equal(result.version,3);
    assert.deepEqual(result.overrides,{});
    assert.equal(result.effectivePreset.voice.voice,defaultPreset.voice.voice);
    assert.equal(repo.getVideoConfig(video.id,2).effectivePreset.voice.voice,'vi-VN-NamMinhNeural');
  }finally{db.close()}
});

test('R0-11 rejects paid/remote activation and arbitrary secret/unknown fields',()=>{
  const {db,repo,video}=setup();try{
    for(const overrides of [
      {models:{paidEnabled:true}}, {models:{remoteEnabled:true}},
      {voice:{apiKey:'NOT_ALLOWED'}}, {content:{__protoSecret:'x'}},
      {models:{credentials:'X'}}, {render:{fps:25.8}},
      {content:{targetMinutes:500}}, {voice:{speed:3}},
      {media:{style:{nested:'bad'}}},{render:{width:1080}},
      {content:{basePrompt:null}}, {badGroup:{value:1}}
    ]) assert.throws(()=>repo.previewVideoConfig(video.id,{rowVersion:1,overrides}));
    assert.equal(repo.listVideoConfigRevisions(video.id).length,1);
  }finally{db.close()}
});

test('R0-11 existing assets require explicit review, never alter assets or queue',()=>{
  const {db,repo,video}=setup();try{
    repo.updateScript(video.id,{rowVersion:1,masterScript:'Xin chào, đây là nội dung.'});
    const [scene]=repo.replaceScenes(video.id,{rowVersion:2,scenes:[{text:'Xin chào.',durationMs:2000}]});
    db.prepare(`INSERT INTO asset_revisions
      (id,video_id,scene_id,kind,source,file_path,sha256,bytes,state,metadata_json,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run('asset1',video.id,scene.id,'voice','local','voice.wav','sha',50,'committed','{}',1);
    const before=repo.getVideo(video.id),preview=repo.previewVideoConfig(video.id,{rowVersion:before.rowVersion,overrides:changeVoice});
    assert.equal(preview.impact.requiresReview,true);
    assert.equal(preview.impact.existing.assetCounts.voice,1);
    assert.throws(()=>repo.updateVideoConfig(video.id,{rowVersion:before.rowVersion,overrides:changeVoice}),{code:'CONFIG_CHANGE_REVIEW_REQUIRED',status:409});
    assert.equal(repo.listVideoConfigRevisions(video.id).length,1);
    const updated=repo.updateVideoConfig(video.id,{rowVersion:before.rowVersion,overrides:changeVoice,confirmImpact:true});
    assert.equal(updated.impact.requiresReview,true);
    assert.equal(db.prepare('SELECT count(*) n FROM asset_revisions WHERE video_id=?').get(video.id).n,1);
    assert.equal(repo.getScene(scene.id).voiceAssetId,null);
    assert.equal(repo.getVideo(video.id).masterScript,before.masterScript);
    assert.equal(repo.getTimeline(video.id).document.clips.length,0);
  }finally{db.close()}
});

test('R0-11 script/content change flagged for review if master script exists',()=>{
  const {db,repo,video}=setup();try{
    repo.updateScript(video.id,{rowVersion:1,masterScript:'Xin chào!'});
    const proposed={content:{style:'Nghiêm túc'}};
    assert.equal(repo.previewVideoConfig(video.id,{rowVersion:2,overrides:proposed}).impact.requiresReview,true);
    assert.throws(()=>repo.updateVideoConfig(video.id,{rowVersion:2,overrides:proposed}),{code:'CONFIG_CHANGE_REVIEW_REQUIRED'});
  }finally{db.close()}
});

test('R0-11 editing one video does not mutate another or subsequent channel snapshots',()=>{
  const {db,repo,ch,video}=setup();try{
    const second=repo.createVideo(ch.id,{title:'Video 2'});
    repo.updateVideoConfig(video.id,{rowVersion:1,overrides:changeVoice});
    const original=structuredClone(ch.preset);original.media.style='Watercolor';
    repo.savePresetRevision(ch.id,{rowVersion:ch.rowVersion,preset:original});
    const third=repo.createVideo(ch.id,{title:'Video 3'});
    assert.equal(repo.getVideo(video.id).presetSourceVersion,1);
    assert.equal(repo.getVideo(video.id).effectivePreset.voice.voice,'vi-VN-NamMinhNeural');
    assert.equal(repo.getVideo(second.id).effectivePreset.voice.voice,defaultPreset.voice.voice);
    assert.equal(repo.getVideo(third.id).presetSourceVersion,2);
    assert.equal(repo.getVideo(second.id).effectivePreset.media.style,defaultPreset.media.style);
  }finally{db.close()}
});

test('R0-11 editing video config refuses jobs still pending/running',()=>{
  const {db,repo,video}=setup();try{
    db.exec("CREATE TABLE jobs(id TEXT PRIMARY KEY,status TEXT NOT NULL,payload_json TEXT NOT NULL)");
    db.prepare('INSERT INTO jobs VALUES(?,?,?)').run('job','pending',JSON.stringify({projectId:video.id}));
    assert.throws(()=>repo.updateVideoConfig(video.id,{rowVersion:1,overrides:changeVoice}),{code:'VIDEO_HAS_ACTIVE_JOBS',status:409});
    db.prepare("UPDATE jobs SET status='succeeded'").run();
    assert.equal(repo.updateVideoConfig(video.id,{rowVersion:1,overrides:changeVoice}).version,2);
  }finally{db.close()}
});

test('R0-11 v6 -> v7 migration backfills legacy videos, preserves v1-v6 checksums',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'r011-migrate-')),file=join(dir,'studio.sqlite');try{
    const old=new DatabaseSync(file);old.exec('PRAGMA foreign_keys=ON');
    old.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at INTEGER NOT NULL)');
    for(const m of migrations.slice(0,6)){
      old.exec(m.sql);old.prepare('INSERT INTO schema_migrations(version,checksum,applied_at) VALUES(?,?,?)').run(m.version,createHash('sha256').update(m.sql).digest('hex'),1);
    }
    old.prepare('INSERT INTO channels(id,name,preset_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('legacy','Legacy',JSON.stringify(defaultPreset),1,1);
    old.prepare('INSERT INTO preset_revisions(channel_id,version,preset_json,created_at) VALUES(?,?,?,?)').run('legacy',1,JSON.stringify(defaultPreset),1);
    old.prepare('INSERT INTO videos(id,channel_id,title,preset_snapshot_json,preset_source_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run('legacy-video','legacy','Old video',JSON.stringify(defaultPreset),1,1,1);
    old.close();
    const db=openProjectDb(file);const repo=new StudioRepository(db);
    assert.equal(repo.getVideoConfig('legacy-video').version,1);
    assert.equal(repo.getVideo('legacy-video').presetSourceVersion,1);
    assert.equal(db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v,migrations.length);
    for (const m of migrations.slice(0,6))assert.equal(db.prepare('SELECT checksum FROM schema_migrations WHERE version=?').get(m.version).checksum,createHash('sha256').update(m.sql).digest('hex'));
    db.close();
    assert((await readdir(dir)).some(name=>name.includes(`.pre-v${migrations.length}-`)));
    const reopened=openProjectDb(file);assert.equal(new StudioRepository(reopened).getVideoConfig('legacy-video').version,1);reopened.close();
  }finally{await rm(dir,{recursive:true,force:true})}
});

test('R0-11 rejected override cannot mutate SQLite or append audit event',()=>{
  const {db,repo,video}=setup();try{
    const before=db.prepare('SELECT count(*) n FROM domain_events').get().n;
    assert.throws(()=>repo.updateVideoConfig(video.id,{rowVersion:1,overrides:{models:{paidEnabled:true}},confirmImpact:true}));
    assert.equal(db.prepare('SELECT count(*) n FROM domain_events').get().n,before);
    assert.equal(repo.getVideo(video.id).configRevision,1);
  }finally{db.close()}
});
