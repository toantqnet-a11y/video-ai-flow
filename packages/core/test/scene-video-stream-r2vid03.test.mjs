import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {spawnSync} from 'node:child_process';
import {importSceneVideoStream,MAX_STREAM_CLIP_BYTES} from '../src/scene-video-stream-r2vid03.mjs';

test('R2VID03 streaming enforces byte limit before FFprobe and cleans scratch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r2vid03-stream-'));
 const clips={manifest:{dataRoot:root},input:()=>({policy:{mediaType:'import_video'},scene:{rowVersion:3}})};
 try{
  await assert.rejects(importSceneVideoStream({clips,sceneId:'s',container:'mp4',expectedRowVersion:3,
   stream:Readable.from([Buffer.alloc(MAX_STREAM_CLIP_BYTES),Buffer.alloc(1)])}),
   e=>e.code==='VIDEO_STREAM_IMPORT_TOO_LARGE');
  assert.equal((await readdir(root)).length,0);
  await assert.rejects(importSceneVideoStream({clips,sceneId:'s',container:'mov',expectedRowVersion:2,
   stream:Readable.from([Buffer.from('invalid')])}),e=>e.code==='SCENE_ROW_VERSION_CONFLICT');
 }finally{await rm(root,{recursive:true,force:true})}
});

test('R2VID03 actual FFmpeg tiny MOV streams to verified H264 and immutable manifest contract',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r2vid03-real-'));
 try{
  const file=join(root,'fixture.mov');
  const cmd=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',
   'testsrc=size=160x120:rate=12','-t','1','-c:v','mpeg4','-q:v','5',file],{timeout:30000});
  assert.equal(cmd.status,0);
  const calls=[];
  const clips={manifest:{dataRoot:root,importBytes:async args=>{calls.push(args);args.onCommitted('asset-01');return {id:'asset-01'}}},
   db:{prepare:()=>({run:()=>{}})},clock:()=>123,input:()=>({policy:{mediaType:'import_video'},scene:{rowVersion:1}})};
  const result=await importSceneVideoStream({clips,sceneId:'scene-01',stream:Readable.from([await readFile(file)]),
   expectedRowVersion:1,container:'mov'});
  assert.equal(result.verified,true);assert.equal(calls[0].extension,'.mp4');
  assert.equal(calls[0].metadata.sourceCodec,'mpeg4');assert.equal(calls[0].metadata.locallyNormalized,true);
  assert.equal(calls[0].metadata.sourceHasAudio,false);
  assert.equal(calls[0].bytes.subarray(4,8).toString(),'ftyp');
  assert.equal((await readdir(root)).filter(x=>x.startsWith('clip-stream-')).length,0);
 }finally{await rm(root,{recursive:true,force:true})}
});
