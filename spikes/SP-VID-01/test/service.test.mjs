import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {mkdtemp, readFile, readdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createVideoFixture} from './helpers.mjs';
import {probeVideo,saveVideoRevision,importVideoRevision} from '../src/media.mjs';
import {VideoAssetService,createVideoJobHandler} from '../src/service.mjs';
import {VideoError} from '../src/contracts.mjs';
import { JobStore } from '../../SP-04/src/store.js';
import { JobRunner } from '../../SP-04/src/runner.js';
let video;
before(async()=> {video=await createVideoFixture();});

test('ffprobe rejects random media and validates actual file duration/codec',async()=>{
  const good=await probeVideo(video.inputPath);
  assert.ok(good.durationMs >= 990 && good.durationMs <= 1010);
  assert.equal(good.width,256);assert.equal(good.height,144);
  assert.equal(good.codec,'mpeg4');assert.equal(good.hasAudio,false);
  const bad=join(video.root,'garbage.mp4');await writeFile(bad,Buffer.from('not-a-video'));
  await assert.rejects(probeVideo(bad),{code:'INVALID_VIDEO'});
});
test('manual clip import produces immutable validated revision + metadata + checksum',async()=>{
  const output=join(await mkdtemp(join(tmpdir(),'spvid-assets-')),'data');
  const a=await importVideoRevision({dataRoot:output,projectId:'project_1',sceneId:'scene_3',inputPath:video.inputPath});
  const b=await importVideoRevision({dataRoot:output,projectId:'project_1',sceneId:'scene_3',inputPath:video.inputPath});
  assert.notEqual(a.assetId,b.assetId);
  assert.equal(a.checksum,b.checksum);
  assert.equal((await readFile(a.filePath)).length,video.bytes.length);
  const metadata=JSON.parse(await readFile(a.metadataPath,'utf8'));
  assert.equal(metadata.source,'imported_video'); assert.equal(metadata.sha256,a.checksum);
});
test('manual import rejects unsafe projectId / sceneId traversal',async()=>{
  await assert.rejects(importVideoRevision({dataRoot:video.root,projectId:'../escape',sceneId:'scene_1',inputPath:video.inputPath}),{code:'INVALID_ASSET_SCOPE'});
});
test('unplayable provider result is removed; no finished asset or metadata left',async()=>{
  const output=join(await mkdtemp(join(tmpdir(),'spvid-corrupt-')),'data');
  await assert.rejects(saveVideoRevision({dataRoot:output,projectId:'abc',sceneId:'xyz',bytes:Buffer.from('not a video'),source:'ai_video'}),{code:'INVALID_VIDEO'});
  const files=await readdir(join(output,'abc','scenes','xyz','video'));
  assert.deepEqual(files,[]);
});
test('AI video service refuses paid/remote, even with arbitrary request payload',async()=>{
  const service=new VideoAssetService({dataRoot:video.root,adapter:{generate:async()=>({bytes:video.bytes,inputHash:'x'})}});
  await assert.rejects(service.generateScene({projectId:'p1',sceneId:'s1',policy:{type:'paid'},request:{mode:'text_to_video',prompt:'test',durationSeconds:1}}),{code:'PAID_APPROVAL_REQUIRED'});
});
test('save emits immutable AI revision, preserving media provenance and original bytes',async()=>{
  const service=new VideoAssetService({dataRoot:join(video.root,'generated'),adapter:{generate:async()=>({bytes:video.bytes,inputHash:'hash1'})}});
  const saved=await service.generateScene({projectId:'project_1',sceneId:'scene_1',request:{mode:'text_to_video',prompt:'A bird flies',durationSeconds:1}});
  assert.equal(saved.source,'ai_video');
  assert.equal(saved.durationMs,1000);
  assert.deepEqual(await readFile(saved.filePath),video.bytes);
  const meta=JSON.parse(await readFile(saved.metadataPath));
  assert.equal(meta.fingerprint,'hash1');
  assert.equal(meta.source,'ai_video');
});
test('SP-04 integration: 1 real MP4 saved as asset; duplicate enqueue uses existing job', async()=>{
  const root=await mkdtemp(join(tmpdir(),'spvid-queue-'));
  const store=new JobStore({path:join(root,'queue.sqlite'),leaseMs:2000,baseBackoffMs:1});
  const service=new VideoAssetService({dataRoot:join(root,'data'),adapter:{generate:async()=>({bytes:video.bytes,inputHash:'demo'})}});
  const handler=createVideoJobHandler({service,loadInput:async()=>({mode:'text_to_video',prompt:'Sailboat moving',durationSeconds:1})});
  try {
    const payload={projectId:'demo',sceneId:'scene01',revisionId:'rev01'};
    const inserted=store.enqueue({key:'rev01',kind:'video:generate',payload});
    const duplicate=store.enqueue({key:'rev01',kind:'video:generate',payload});
    assert.equal(duplicate.reused,true);
    assert.equal(inserted.job.id,duplicate.job.id);
    const runner=new JobRunner(store,{'video:generate':handler},{concurrency:1,pollMs:10,heartbeatMs:100});
    runner.start();
    await runner.waitForIdle({timeoutMs:15_000});
    await runner.stop();
    assert.equal(store.get(inserted.job.id).status,'succeeded');
    const asset=store.db.prepare('SELECT * FROM assets').all();
    assert.equal(asset.length,1);
    assert.equal(asset[0].logical_key,'video:demo:scene01:rev01');
    const bytes=await readFile(asset[0].file_path);
    assert.deepEqual(bytes,video.bytes);
  }finally{store.close();}
});
