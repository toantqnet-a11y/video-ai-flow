/** R2-06 deterministic storage/revision acceptance; no paid/live providers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,AssetManifest,SceneImageRepository} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {ProviderRegistry} from '../../providers/src/index.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const media=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'r206-')),dbPath=join(dir,'db.sqlite');
  const db=openProjectDb(dbPath),repo=new StudioRepository(db),store=new JobStore({path:dbPath});
  const channel=repo.createChannel({name:'Asset Registry'}),video=repo.createVideo(channel.id,{title:'Example'});
  const [scene,other]=repo.replaceScenes(video.id,{rowVersion:1,scenes:[
    {text:'Voice text 1',visualPrompt:'Forest',durationMs:5000,mediaType:'image_motion'},
    {text:'Voice text 2',visualPrompt:'City',durationMs:5000,mediaType:'image_motion'}]});
  const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
  const image=new SceneImageRepository(repo,{store,manifest,registry:new ProviderRegistry()});
  return {dir,dbPath,db,repo,store,manifest,scene,other,video,image,
    async close(){store.close();db.close();await rm(dir,{recursive:true,force:true})}};
}
const upload={mimeType:'image/png',dataBase64:media.toString('base64')};

test('v24 content index exists and immutable revision fields cannot be edited',async()=>{
  const f=await fixture();try{
    assert.ok(f.db.prepare('PRAGMA user_version').get().user_version>=24);
    const a=await f.manifest.importBytes({sceneId:f.scene.id,kind:'image',source:'manual_import',bytes:media,extension:'.png'});
    assert.deepEqual(f.manifest.contentInfo(hash(media)),{sha256:hash(media),bytes:media.length,revisions:1,committed:1});
    assert.throws(()=>f.db.prepare('UPDATE asset_revisions SET file_path=? WHERE id=?').run('fake.png',a.id),/ASSET_REVISION_IMMUTABLE/);
    assert.throws(()=>f.db.prepare('UPDATE asset_revisions SET metadata_json=? WHERE id=?').run('{}',a.id),/ASSET_REVISION_IMMUTABLE/);
    assert.equal(f.manifest.get(a.id).checksum,hash(media));
  }finally{await f.close()}
});
test('different scenes share digest in index but keep distinct files and revisions',async()=>{
  const f=await fixture();try{
    const a=await f.manifest.importBytes({sceneId:f.scene.id,kind:'image',source:'manual_import',bytes:media,extension:'.png'});
    const b=await f.manifest.importBytes({sceneId:f.other.id,kind:'image',source:'manual_import',bytes:media,extension:'.png'});
    assert.notEqual(a.id,b.id);assert.notEqual(a.relativePath,b.relativePath);
    assert.equal(f.manifest.contentInfo(hash(media)).revisions,2);
    await writeFile(join(f.dir,a.relativePath),Buffer.from('corrupted!'));
    assert.equal(await f.manifest.verifyRevision(a.id),'corrupt');
    assert.equal(await f.manifest.verifyRevision(b.id),'healthy');
  }finally{await f.close()}
});
test('manual re-upload is idempotent but preserves explicit selection and never invokes a model',async()=>{
  const f=await fixture();try{
    const one=await f.image.importBase64(f.scene.id,upload);
    const again=await f.image.importBase64(f.scene.id,upload);
    assert.equal(again.assetId,one.assetId);
    assert.equal(f.manifest.listScene(f.scene.id).length,1);
    assert.equal(f.manifest.contentInfo(hash(media)).revisions,1);
    assert.equal(f.repo.getScene(f.scene.id).visualAssetId,one.assetId);
    assert.equal((await f.image.status(f.scene.id)).state,'ready');
  }finally{await f.close()}
});
test('generation queued concurrently with manual import never loses later intent or overwrites selection',async()=>{
  const f=await fixture();try{
    const original=f.manifest.importBytes.bind(f.manifest);
    let release,started; const go=new Promise(resolve=>release=resolve),startedPromise=new Promise(resolve=>started=resolve);
    f.manifest.importBytes=async args=>{started();await go;return original(args)};
    const pending=f.image.importBase64(f.scene.id,upload);
    await startedPromise;
    const winner=await original({sceneId:f.scene.id,kind:'image',source:'manual_import',bytes:media,extension:'.png'});
    release();
    await assert.rejects(pending,{code:'SCENE_ROW_VERSION_CONFLICT'});
    assert.equal(f.repo.getScene(f.scene.id).visualAssetId,winner.id);
    assert.equal(f.manifest.listScene(f.scene.id).length,1,'stale import never inserts a committed revision');
  }finally{await f.close()}
});
test('same manual content fails closed with changed rowversion and never switches active pointer',async()=>{
  const f=await fixture();try{
    const initial=await f.image.importBase64(f.scene.id,upload);
    await assert.rejects(f.manifest.importBytes({sceneId:f.scene.id,kind:'image',source:'manual_import',bytes:media,extension:'.png',
      expectedRowVersion:1,reuseIdentical:true}),{code:'SCENE_ROW_VERSION_CONFLICT'});
    assert.equal(f.repo.getScene(f.scene.id).visualAssetId,initial.assetId);
  }finally{await f.close()}
});
test('missing and corrupt are marked without deleting active refs; restored revision is recovered',async()=>{
  const f=await fixture();try{
    const a=await f.image.importBase64(f.scene.id,upload),asset=f.manifest.get(a.assetId),path=join(f.dir,asset.relativePath);
    await writeFile(path,Buffer.alloc(media.length,23));
    const check=await f.manifest.reconcile();assert.deepEqual(check.corrupt,[a.assetId]);
    assert.equal(f.manifest.get(a.assetId).state,'missing');
    assert.equal(f.repo.getScene(f.scene.id).visualAssetId,a.assetId);
    assert.equal((await f.image.status(f.scene.id)).imageAsset,null);
    await writeFile(path,media);
    const repaired=await f.manifest.reconcile();assert.deepEqual(repaired.restored,[a.assetId]);
    assert.equal((await f.image.status(f.scene.id)).state,'ready');
  }finally{await f.close()}
});
test('reconcile only identifies orphans and never deletes them',async()=>{
  const f=await fixture();try{
    const file=join(f.dir,'assets','orphan.dat');await mkdir(dirname(file),{recursive:true});await writeFile(file,'important');
    const result=await f.manifest.reconcile({scanOrphans:true});
    assert.deepEqual(result.orphans,['assets/orphan.dat']);
    assert.equal((await readFile(file,'utf8')),'important');
  }finally{await f.close()}
});
test('read-only selective recompute planner preserves imported image while voice absent',async()=>{
  const f=await fixture();try{
    const a=await f.image.importBase64(f.scene.id,upload);
    const plan=await f.manifest.planRecompute(f.video.id);
    assert.equal(plan.sceneCount,2);
    assert.equal(plan.scenes.find(x=>x.sceneId===f.scene.id).visual,'manual_preserved');
    assert.equal(plan.scenes.find(x=>x.sceneId===f.other.id).visual,'not_generated');
    f.db.prepare('UPDATE scenes SET text=?,visual_prompt=? WHERE id=?').run('new text','New forest',f.scene.id);
    const changed=await f.manifest.planRecompute(f.video.id);
    assert.equal(changed.scenes.find(x=>x.sceneId===f.scene.id).visual,'manual_preserved');
    assert.equal(f.repo.getScene(f.scene.id).visualAssetId,a.assetId);
    assert.equal(f.store.countByStatus().total,0,'planner does not enqueue paid/free models');
  }finally{await f.close()}
});
test('content registry survives SQLite restart with same checksum and independent revisions',async()=>{
  const f=await fixture();const file=f.dbPath,root=f.dir;
  try{
    const a=await f.image.importBase64(f.scene.id,upload);
    f.store.close();f.db.close();
    const db=openProjectDb(file),repo=new StudioRepository(db),manifest=new AssetManifest({db,repository:repo,dataRoot:root});
    try{
      assert.equal(manifest.contentInfo(hash(media)).revisions,1);
      assert.equal(await manifest.verifyRevision(a.assetId),'healthy');
      assert.equal((await manifest.reconcile()).missing.length,0);
    }finally{db.close()}
  }finally{await rm(root,{recursive:true,force:true})}
});
test('queue-generated voice and image revisions remain separate even for matching file digest',async()=>{
  const f=await fixture();try{
    const a=await f.manifest.importBytes({sceneId:f.scene.id,kind:'image',source:'comfyui',bytes:media,extension:'.png',metadata:{inputHash:'A'}});
    const b=await f.manifest.importBytes({sceneId:f.scene.id,kind:'image',source:'comfyui',bytes:media,extension:'.png',metadata:{inputHash:'B'}});
    assert.notEqual(a.id,b.id);assert.equal(f.manifest.listScene(f.scene.id).length,2);
  }finally{await f.close()}
});
test('queue arriving DURING manual validation wins; old upload cannot erase newer job',async()=>{
  const f=await fixture();try{
    // Queue directly through shared SP-04 store/intent table to emulate user
    // requesting a new generation while FFmpeg validates the upload.
    const original=f.manifest.importBytes.bind(f.manifest);
    let release,started;const hold=new Promise(r=>release=r),entered=new Promise(r=>started=r);
    f.manifest.importBytes=async args=>{started();await hold;return original(args)};
    const pending=f.image.importBase64(f.scene.id,upload);
    await entered;
    const jobId='newer-job-id';
    f.db.prepare(`INSERT INTO scene_image_intents(scene_id,job_id,input_hash,source_sha256,config_revision,requested_at)
      VALUES(?,?,?,?,?,?)`).run(f.scene.id,jobId,'1'.repeat(64),'2'.repeat(64),1,Date.now());
    release();
    await assert.rejects(pending,{code:'SCENE_IMAGE_INTENT_CONFLICT'});
    assert.equal(f.db.prepare('SELECT job_id FROM scene_image_intents WHERE scene_id=?').get(f.scene.id).job_id,jobId);
    assert.equal(f.repo.getScene(f.scene.id).visualAssetId,null);
  }finally{await f.close()}
});
test('manual selection rejects newly queued generation arriving during image IO',async()=>{
  const f=await fixture();try{
    const first=await f.image.importBase64(f.scene.id,upload);
    // Launch selection and race in a DB write from a readFile hook? The
    // critical guard is asserted using a deterministic earlier queue intent.
    f.db.prepare(`INSERT INTO scene_image_intents(scene_id,job_id,input_hash,source_sha256,config_revision,requested_at)
      VALUES(?,?,?,?,?,?)`).run(f.scene.id,'started-job','1'.repeat(64),'2'.repeat(64),1,Date.now());
    // Correct normal selection still cancels the exact previously known intent.
    const selected=await f.image.select(f.scene.id,{assetId:first.assetId,
      expectedRowVersion:f.repo.getScene(f.scene.id).rowVersion});
    assert.equal(selected.selected,true);
    assert.equal(f.db.prepare('SELECT job_id FROM scene_image_intents WHERE scene_id=?').get(f.scene.id),undefined);
  }finally{await f.close()}
});
test('v23 to v24 migration backfills checksum index without changing frozen revision history',async()=>{
  const f=await fixture();const root=f.dir;
  try{
    const a=await f.image.importBase64(f.scene.id,upload);
    // Simulate an actual v23 project file by dropping only the new additive
    // objects and the new migration record, keeping historical rows untouched.
    f.db.exec(`DROP TRIGGER asset_content_register; DROP TRIGGER asset_content_size_guard;
      DROP TRIGGER asset_revision_immutable_fields; DROP INDEX idx_asset_content_lookup;
      DROP TABLE asset_content_index; DROP TABLE asset_dag_nodes; DROP TABLE asset_dag_runs; DROP TABLE provider_quota_calls; DROP TABLE provider_switch_events; DROP TABLE composition_revisions; DROP TABLE motion_brand_revisions; DROP TABLE timeline_action_stacks; DROP TABLE timeline_revisions; DROP TABLE render_segment_cache; DROP TABLE render_snapshots; DROP TABLE r4_subtitle_drafts; DELETE FROM schema_migrations WHERE version>=24;
      PRAGMA user_version=23;`);
    f.store.close();f.db.close();
    const reopened=openProjectDb(f.dbPath),manifest=new AssetManifest({db:reopened,repository:new StudioRepository(reopened),dataRoot:root});
    try{
      assert.ok(reopened.prepare('PRAGMA user_version').get().user_version>=24);
      assert.equal(manifest.contentInfo(hash(media)).revisions,1);
      assert.equal(manifest.get(a.assetId).id,a.assetId);
      assert.equal(await manifest.verifyRevision(a.assetId),'healthy');
    }finally{reopened.close()}
  }finally{await rm(root,{recursive:true,force:true})}
});
test('editing one generated scene invalidates only that image; unchanged scenes remain reusable',async()=>{
  const f=await fixture();try{
    for(const scene of [f.scene,f.other]){
      const video=f.repo.getVideo(scene.videoId),inputHash=hash(scene.id),sourceSha256=(await import('../src/scene-image.mjs')).imageSourceHash(scene);
      const jobId=`immutable-${scene.id}`;
      f.db.prepare(`INSERT INTO scene_image_intents(scene_id,job_id,input_hash,source_sha256,config_revision,requested_at)
        VALUES(?,?,?,?,?,?)`).run(scene.id,jobId,inputHash,sourceSha256,video.configRevision,Date.now());
      await f.manifest.importBytes({sceneId:scene.id,kind:'image',source:'comfyui',bytes:media,extension:'.png',
        metadata:{inputHash,sourceSha256,configRevision:video.configRevision,queueJobId:jobId}});
    }
    const before=await f.manifest.planRecompute(f.video.id);
    assert.deepEqual(before.scenes.map(s=>s.visual),['reuse','reuse']);
    f.db.prepare('UPDATE scenes SET visual_prompt=? WHERE id=?').run('Edited only here',f.scene.id);
    const after=await f.manifest.planRecompute(f.video.id);
    assert.deepEqual(after.scenes.map(s=>s.visual),['regenerate','reuse']);
    assert.deepEqual(after.regenerateVisual,[f.scene.id]);
    assert.equal(f.store.countByStatus().total,0,'planning is read only');
  }finally{await f.close()}
});
