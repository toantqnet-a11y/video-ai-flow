/** IA-01 regression: actual five-scene pipeline and pre-dispatch fail-closed gates. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareFiveSceneAcceptance,runIntegrationAcceptance} from './integration-acceptance.mjs';
const ffmpegReady=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{stdio:'ignore'}).status===0);

test('IA-01 five real media scenes → timed v2 → durable queued render → MP4 QA',
  {skip:!ffmpegReady,timeout:180000},async()=>{
  const result=await runIntegrationAcceptance();
  assert.equal(result.result,'PASS');
  assert.equal(result.profile.aspectRatio,'9:16');
  assert.equal(result.profile.width,720);
  assert.equal(result.sceneCount,5);
  assert.equal(result.qa.h264,true);
  assert.equal(result.qa.aac,true);
  assert.equal(result.qa.duration,true);
  assert.equal(result.qa.frames,true,'exact frame count is required: duration alone can hide dropped leading frames');
  assert.equal(result.persistedQueueSucceeded,true);
  assert.equal(result.idempotencyPreventsDuplicate,true);
  assert.equal(result.paidApiCalls,0);
  assert.equal(result.realAiInference,false);
  assert.equal(result.browserWindowsGpuAccepted,false);
  assert.equal(result.longFormMp4Accepted,false);
});

test('IA-01 forged/stale voice checksum is rejected before enqueue (no paid or queued job)',
  {skip:!ffmpegReady},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ia01-tamper-'));let f;
  try{
    f=await prepareFiveSceneAcceptance({dataRoot:dir});
    const scene=f.composition.scenes[2],path=join(dir,scene.voice.asset.relativePath);
    const bytes=await readFile(path);bytes[48]^=1;await writeFile(path,bytes);
    await assert.rejects(f.renderer.enqueue(f.video.id,{requestKey:'ia01-corrupt',revision:1}),
      {code:'RENDER_ASSET_CHANGED'});
    assert.equal(f.store.countByStatus().total,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM composition_revisions').get().n,1,
      'immutable approved revision must not be rewritten by a corrupt source file');
  }finally{f?.store.close();f?.db.close();await rm(dir,{recursive:true,force:true});}
});

test('IA-01 change after publish fences a stale composition before queuing',
  {skip:!ffmpegReady},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ia01-stale-'));let f;
  try{
    f=await prepareFiveSceneAcceptance({dataRoot:dir});
    // A safe, legitimate video edit must make the old published snapshot stale.
    const v=f.repo.getVideo(f.video.id);
    f.repo.renameVideo(f.video.id,{title:'Retitled after publish',rowVersion:v.rowVersion});
    await assert.rejects(f.renderer.enqueue(f.video.id,{requestKey:'ia01-stale',revision:1}),
      {code:'RENDER_STALE_COMPOSITION'});
    assert.equal(f.store.countByStatus().total,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM asset_revisions').get().n,10,
      'editing may not delete historical verified voice/image versions');
  }finally{f?.store.close();f?.db.close();await rm(dir,{recursive:true,force:true});}
});


test('IA-01 ffprobe duration alone cannot mask a missing H.264 frame',async()=>{
  const {checkMp4Quality}=await import('../packages/core/src/index.mjs');
  const doc={totalFrames:429,profile:{width:1080,height:1920,fps:30}};
  const ok={videoCodec:'h264',audioCodec:'aac',width:1080,height:1920,
    fps:'30/1',durationSeconds:14.3,bytes:1000000,frameCount:429};
  assert.equal(checkMp4Quality(ok,doc).passed,true);
  const dropped={...ok,frameCount:428};
  const bad=checkMp4Quality(dropped,doc);
  assert.equal(bad.checks.duration,true,'format duration misleadingly still passes');
  assert.equal(bad.checks.frames,false);
  assert.equal(bad.passed,false,'one missing frame must fail acceptance');
});
