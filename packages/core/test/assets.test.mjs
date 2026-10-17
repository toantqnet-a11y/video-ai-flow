import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,AssetManifest,promotePendingQueueAssets} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';

async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'cs-asset-'));const dbFile=join(dir,'studio.sqlite');const db=openProjectDb(dbFile);const repo=new StudioRepository(db);
  const v=repo.createVideo(repo.createChannel({name:'Kênh'}).id,{title:'V'});
  const [s]=repo.replaceScenes(v.id,{rowVersion:1,scenes:[{text:'Phần 1',durationMs:2500}]});
  const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
  return {dir,dbFile,db,repo,v,s,manifest,async cleanup(){db.close();await rm(dir,{recursive:true,force:true})}};
}
const tinyPng=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
test('asset import uses immutable UUID path and scene pointer',async()=>{
  const f=await fixture();try{
    const a=await f.manifest.importBytes({sceneId:f.s.id,kind:'image',source:'manual_import',bytes:tinyPng,extension:'.png'});
    assert.equal(f.repo.getScene(f.s.id).visualAssetId,a.id);
    assert.deepEqual(await readFile(join(f.dir,a.relativePath)),tinyPng);
    assert.equal(f.manifest.listScene(f.s.id).length,1);
    assert.throws(()=>f.repo.replaceScenes(f.v.id,{rowVersion:2,scenes:[{text:'Regen',durationMs:2000}]}),{code:'SCENES_HAVE_ASSETS'});
  }finally{await f.cleanup()}
});
test('manifest reconciliation marks missing files and does not delete orphans',async()=>{
  const f=await fixture();try{
    const asset=await f.manifest.importBytes({sceneId:f.s.id,kind:'image',source:'manual_import',bytes:tinyPng,extension:'.png'});
    await rm(join(f.dir,asset.relativePath));
    const results=await f.manifest.reconcile({scanOrphans:true});
    assert.deepEqual(results.missing,[asset.id]);assert.equal(f.manifest.get(asset.id).state,'missing');
    assert.equal(results.orphans.length,0);
  }finally{await f.cleanup()}
});
test('queue commit promotion is replayable and fenced without re-running provider',async()=>{
  const f=await fixture();let queue;
  try {
    queue=new JobStore({path:f.dbFile,leaseMs:500});
    const {job}=queue.enqueue({kind:'asset:video',key:'image:scene1:rev1',payload:{sceneId:f.s.id}});
    const claimed=queue.claim('worker1');
    const path=join(f.dir,'output.png');await writeFile(path,tinyPng);
    const sha=createHash('sha256').update(tinyPng).digest('hex');
    assert.equal(queue.complete(job.id,claimed.lease_token,{result:{sceneId:f.s.id,kind:'video',providerId:'local_fixture'},asset:{logicalKey:'image:scene1:rev1',filePath:path,checksum:sha}}),true);
    let promoted=await promotePendingQueueAssets(f.manifest);assert.equal(promoted.promoted.length,1);
    promoted=await promotePendingQueueAssets(f.manifest);assert.equal(promoted.promoted.length,0);
    assert.equal(f.manifest.listScene(f.s.id).length,1);
    assert.equal(f.repo.getScene(f.s.id).visualAssetId,f.manifest.listScene(f.s.id)[0].id);
  }finally{queue?.close();await f.cleanup()}
});
test('queue promotion reports mismatched checksums, does not update scene',async()=>{
  const f=await fixture();let queue;
  try {
    queue=new JobStore({path:f.dbFile,leaseMs:500});
    const {job}=queue.enqueue({kind:'asset:video',key:'bad-checksum',payload:{sceneId:f.s.id}});
    const c=queue.claim('w');const path=join(f.dir,'bad.png');await writeFile(path,tinyPng);
    queue.complete(job.id,c.lease_token,{result:{sceneId:f.s.id,kind:'video'},asset:{logicalKey:'bad-checksum',filePath:path,checksum:'0'.repeat(64)}});
    const r=await promotePendingQueueAssets(f.manifest);assert.deepEqual(r.promoted,[]);
    assert.equal(r.failed[0].code,'ASSET_CHECKSUM_MISMATCH');assert.equal(f.repo.getScene(f.s.id).visualAssetId,null);
  }finally{queue?.close();await f.cleanup()}
});
