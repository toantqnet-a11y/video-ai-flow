import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {importMusicTrackStream,listMusicTracks} from '../src/music-import-r406.mjs';
import {runBinary} from '../src/render-ffmpeg-r2ext04.mjs';
test('R4-06 streaming music validates actual FFmpeg WAV, immutably reuses SHA pin',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'music-stream-'));
 try{
  const file=join(dir,'audio.wav');
  await runBinary('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=500:duration=0.4',
   '-c:a','pcm_s16le','-y',file],{timeoutMs:30000});
  const {readFile}=await import('node:fs/promises');const bytes=await readFile(file);
  const args={videoId:'video1',dataRoot:dir,extension:'wav'};
  const first=await importMusicTrackStream({...args,stream:Readable.from([bytes])});
  const second=await importMusicTrackStream({...args,stream:Readable.from([bytes])});
  assert.deepEqual(first.pin,second.pin);
  assert.ok(first.durationSeconds>0);
  const list=await listMusicTracks(args);assert.equal(list.items.length,1);
  await assert.rejects(importMusicTrackStream({...args,extension:'mp3',stream:Readable.from([bytes])}),
    {code:'R4_MUSIC_FORMAT_INVALID'});
 }finally{await rm(dir,{recursive:true,force:true})}
});
