/** R3-08/09/10 — real FFmpeg segment reuse, digest-pinned SRT and cache tamper QA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openProjectDb,StudioRepository,renderFfmpegComposition,renderSegmentHash,makeSrt,compositionDigest,validateTimedComposition,probeMp4} from '../src/index.mjs';
const h=x=>createHash('sha256').update(x).digest('hex');
const ffmpegAvailable=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0 && spawnSync('ffprobe',['-version'],{stdio:'ignore'}).status===0;
function wav(ms=780){const count=Math.ceil(ms*8),buf=Buffer.alloc(44+count);buf.write('RIFF',0);buf.writeUInt32LE(36+count,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(8000,24);buf.writeUInt32LE(8000,28);buf.writeUInt16LE(1,32);buf.writeUInt16LE(8,34);buf.write('data',36);buf.writeUInt32LE(count,40);return buf;}
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'r308-ffmpeg-')),db=openProjectDb(join(dir,'project.sqlite'));
 const repo=new StudioRepository(db),channel=repo.createChannel({name:'Cache integration'}),video=repo.createVideo(channel.id,{title:'Cache video'});
 await mkdir(join(dir,'media'));
 const img=await readFile(join(import.meta.dirname,'../../../spikes/EXT-03/assets/background-01.png'));
 const audio=wav();await writeFile(join(dir,'media','image.png'),img);await writeFile(join(dir,'media','voice.wav'),audio);
 const profile={width:1280,height:720,fps:30,aspectRatio:'16:9',codec:'h264'};
 const makeScene=(i,motion='none')=>{
  const text=i===0?'Tiếng Việt: Hà Nội':'Xin chào, Đà Nẵng!';
  return {id:`scene-${i}`,index:i,sceneRowVersion:1,text,textSha256:h(text),mediaType:'image_motion',startFrame:i*30,endFrame:(i+1)*30,
   durationMs:1000,durationFrames:30,durationBasis:'voice_measured',
   voice:{asset:{id:`voice-${i}`,kind:'voice',sha256:h(audio),bytes:audio.length,relativePath:'media/voice.wav'},measuredDurationMs:780},
   visual:{kind:'image',motion,asset:{id:`image-${i}`,kind:'image',sha256:h(img),bytes:img.length,relativePath:'media/image.png'}},
   timing:{mode:'voice_measured',audioMs:780,audioFrames:24,paddingFrames:6,tailPaddingMs:220},
   captions:{mode:'measured_scene',source:'scene_text',cues:[{text,startFrame:0,endFrame:24}]}};
 };
 const makeDoc=(motion='none')=>{
  const payload={schemaVersion:2,videoId:video.id,source:{videoRowVersion:1,configRevision:1,sceneRevision:1,timelineRowVersion:1,scriptSha256:h('master')},profile,scenes:[makeScene(0),makeScene(1,motion)],totalFrames:60,readiness:{ready:true,blockers:[]}};
  const doc={...payload,digest:compositionDigest(payload)};validateTimedComposition(doc);return doc;
 };
 return {dir,db,video,makeDoc,async close(){db.close();await rm(dir,{recursive:true,force:true})}};
}
test('R3-08 hash ignores absolute scene start, but changes local motion / source asset fingerprint',async()=>{
 const f=await fixture();try{
  const doc=f.makeDoc(),a=doc.scenes[1];
  const hash=renderSegmentHash({scene:a,profile:doc.profile});
  assert.equal(renderSegmentHash({scene:{...a,startFrame:9999,index:1234,captionText:'new title'},profile:doc.profile}),hash);
  assert.notEqual(renderSegmentHash({scene:{...a,visual:{...a.visual,motion:'zoom'}},profile:doc.profile}),hash);
  assert.notEqual(renderSegmentHash({scene:{...a,voice:{asset:{...a.voice.asset,sha256:h('different')},measuredDurationMs:780}},profile:doc.profile}),hash);
  assert.notEqual(renderSegmentHash({scene:a,profile:{...doc.profile,fps:25}}),hash);
 }finally{await f.close()}
});
test('R3-10 SRT UTF-8, frame clock and independently positioned cues are exact',async()=>{
 const f=await fixture();try{
  const s=makeSrt(f.makeDoc());
  assert.match(s,/1\n00:00:00,000 --> 00:00:00,800\nTiếng Việt: Hà Nội/);
  assert.match(s,/2\n00:00:01,000 --> 00:00:01,800\nXin chào, Đà Nẵng!/);
  assert.equal(s.match(/ --> /g).length,2);
  const periods=[...s.matchAll(/(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})/g)];
  assert.equal(periods.length,2);assert.ok(periods[0][2]<periods[1][1]);
 }finally{await f.close()}
});
test('R3-08/09 2-scene actual MP4, next composition reuses 1 segment and only encodes changed one',{skip:!ffmpegAvailable,timeout:180000},async()=>{
 const f=await fixture();try{
  const first=f.makeDoc();const out1=await renderFfmpegComposition({composition:first,dataRoot:f.dir,cacheDb:f.db});
  assert.deepEqual(out1.segmentCache,{encoded:2,reused:0,total:2});assert.ok(out1.qa.passed);
  const second=f.makeDoc('zoom');const out2=await renderFfmpegComposition({composition:second,dataRoot:f.dir,cacheDb:f.db});
  assert.deepEqual(out2.segmentCache,{encoded:1,reused:1,total:2});assert.ok(out2.qa.passed);
  const qa=await probeMp4(join(f.dir,out2.relativePath));
  assert.equal(qa.frameCount,60);assert.equal(qa.videoCodec,'h264');assert.equal(qa.audioCodec,'aac');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM render_segment_cache').get().n,3);
  const noChange=await renderFfmpegComposition({composition:second,dataRoot:f.dir,cacheDb:f.db});
  assert.deepEqual(noChange.segmentCache,{encoded:0,reused:2,total:2});
  assert.equal(out1.compositionDigest,first.digest);assert.equal(out2.compositionDigest,second.digest);
 }finally{await f.close()}
});
test('R3-08 checksum mismatch of stored cache record fails closed',{skip:!ffmpegAvailable,timeout:180000},async()=>{
 const f=await fixture();try{
  const doc=f.makeDoc();await renderFfmpegComposition({composition:doc,dataRoot:f.dir,cacheDb:f.db});
  const row=f.db.prepare('SELECT relative_path FROM render_segment_cache LIMIT 1').get();
  const target=join(f.dir,row.relative_path);await writeFile(target,'tampered bytes');
  await assert.rejects(renderFfmpegComposition({composition:doc,dataRoot:f.dir,cacheDb:f.db}),{code:'RENDER_CACHE_CORRUPT'});
  assert.ok((await stat(join(f.dir,'renders',f.video.id))).isDirectory());
 }finally{await f.close()}
});
