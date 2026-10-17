import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,migrations,StudioRepository,defaultPreset} from '../src/index.mjs';

function fixture(){const db=openProjectDb();return {db,repo:new StudioRepository(db)};}
test('migration creates canonical tables and is repeatable',()=>{
  const {db}=fixture();assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(x=>x.version),migrations.map(m=>m.version));
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='channels'").get().n,1);db.close();
});
test('channel create/list/archive with preset revision and optimistic locking',()=>{
  const {db,repo}=fixture();const c=repo.createChannel({name:'Tin công nghệ'});
  assert.equal(c.presetVersion,1);assert.equal(repo.listChannels().length,1);
  const altered=structuredClone(c.preset);altered.content.style='chuyên nghiệp';
  const updated=repo.updateChannel(c.id,{rowVersion:c.rowVersion,preset:altered,name:'Tin tức AI'});
  assert.equal(updated.presetVersion,2);assert.equal(repo.listPresetRevisions(c.id).length,2);
  assert.throws(()=>repo.updateChannel(c.id,{rowVersion:1,name:'Từ chối'}),{code:'VERSION_CONFLICT'});
  repo.updateChannel(c.id,{rowVersion:updated.rowVersion,status:'archived'});
  assert.equal(repo.listChannels().length,0);assert.equal(repo.listChannels({includeArchived:true}).length,1);
  db.close();
});
test('video freezes preset snapshot when channel changes',()=>{
  const {db,repo}=fixture();const c=repo.createChannel({name:'Kênh A'}),v=repo.createVideo(c.id,{title:'Video 01'});
  const p=structuredClone(c.preset);p.voice.voice='vi-VN-NamMinhNeural';
  repo.updateChannel(c.id,{rowVersion:c.rowVersion,preset:p});
  assert.equal(repo.getVideo(v.id).preset.voice.voice,'vi-VN-HoaiMyNeural');
  assert.equal(repo.getVideo(v.id).presetSourceVersion,1);
  assert.equal(repo.createVideo(c.id,{title:'Video 02'}).preset.voice.voice,'vi-VN-NamMinhNeural');
  db.close();
});
test('video cannot be added to archived channel or missing channel',()=>{
  const {db,repo}=fixture();const c=repo.createChannel({name:'A'});
  repo.updateChannel(c.id,{status:'archived',rowVersion:c.rowVersion});
  assert.throws(()=>repo.createVideo(c.id,{title:'X'}),{code:'CHANNEL_ARCHIVED'});
  assert.throws(()=>repo.createVideo('x',{title:'X'}),{code:'CHANNEL_NOT_FOUND'});
  db.close();
});
test('script and scenes state progress with version check',()=>{
  const {db,repo}=fixture();const v=repo.createVideo(repo.createChannel({name:'A'}).id,{title:'B'});
  const w=repo.updateScript(v.id,{masterScript:'Xin chào thế giới.',rowVersion:v.rowVersion});
  assert.equal(w.status,'content_ready');
  const scenes=repo.replaceScenes(v.id,{rowVersion:w.rowVersion,scenes:[{text:'Xin chào.',durationMs:1000},{text:'Thế giới.',durationMs:2000}]});
  assert.equal(scenes.length,2);assert.equal(scenes[0].index,0);
  assert.equal(repo.getVideo(v.id).status,'scenes_ready');
  assert.throws(()=>repo.replaceScenes(v.id,{rowVersion:w.rowVersion,scenes:[{text:'no',durationMs:1000}]}),{code:'VERSION_CONFLICT'});
  db.close();
});
test('invalid scene batch rolls back without deleting earlier scenes',()=>{
  const {db,repo}=fixture();const v=repo.createVideo(repo.createChannel({name:'A'}).id,{title:'B'});
  const initial=repo.replaceScenes(v.id,{rowVersion:1,scenes:[{text:'Scene 1',durationMs:2000}]});
  assert.throws(()=>repo.replaceScenes(v.id,{rowVersion:2,scenes:[{text:' ',durationMs:2000}]}),{code:'INVALID_SCENE'});
  assert.equal(repo.listScenes(v.id)[0].id,initial[0].id);db.close();
});
test('timeline saves versioned clips and rejects foreign scenes',()=>{
  const {db,repo}=fixture();const c=repo.createChannel({name:'Kênh'}),v=repo.createVideo(c.id,{title:'V'});
  const [s]=repo.replaceScenes(v.id,{rowVersion:1,scenes:[{text:'Scene 1',durationMs:5000}]});
  const t=repo.getTimeline(v.id);
  assert.equal(t.rowVersion,2); // Replacing scenes invalidates the prior timeline snapshot.
  const t2=repo.updateTimeline(v.id,{rowVersion:t.rowVersion,document:{tracks:['media','text','voice','music'],clips:[{sceneId:s.id,startMs:0,durationMs:5000}]}});
  assert.equal(t2.rowVersion,3);
  assert.throws(()=>repo.updateTimeline(v.id,{rowVersion:1,document:t2.document}),{code:'VERSION_CONFLICT'});
  assert.throws(()=>repo.updateTimeline(v.id,{rowVersion:3,document:{tracks:[],clips:[{sceneId:'other',startMs:0,durationMs:5000}]}}),{code:'FOREIGN_SCENE'});
  db.close();
});
test('paid/remote cannot be enabled by directly editing preset',()=>{
  const {db,repo}=fixture();const p=structuredClone(defaultPreset);p.models.paidEnabled=true;
  assert.throws(()=>repo.createChannel({name:'A',preset:p}),{code:'PAID_CONFIG_REQUIRES_APPROVAL'});
  p.models.paidEnabled=false;p.models.remoteEnabled=true;
  assert.throws(()=>repo.createChannel({name:'A',preset:p}),{code:'REMOTE_CONFIG_REQUIRES_APPROVAL'});
  db.close();
});
test('domain tables persist across new processes / reopening db file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'cs-domain-'));
  try {
    const path=join(dir,'db.sqlite');let db=openProjectDb(path);const repo=new StudioRepository(db);const c=repo.createChannel({name:'Persistent'});db.close();
    db=openProjectDb(path);assert.equal(new StudioRepository(db).getChannel(c.id).name,'Persistent');db.close();
  }finally{await rm(dir,{recursive:true,force:true})}
});
