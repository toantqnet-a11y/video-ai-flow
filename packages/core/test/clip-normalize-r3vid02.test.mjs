/** Real local FFmpeg/FFprobe fixtures, no mocked output and no providers. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {clipNormalizationPlan,normalizePinnedClip,probeClipSource,inspectClipProbe} from '../src/clip-normalize-r3vid02.mjs';
const ff=(args,timeout=30000)=>{
 const r=spawnSync('ffmpeg',['-hide_banner','-nostdin','-loglevel','error',...args],{timeout});
 assert.equal(r.status,0,r.stderr?.toString().slice(-2500));
};
const exec=(bin,args,{timeoutMs=30000}={})=>{
 const r=spawnSync(bin,args,{timeout:timeoutMs});
 if(r.status!==0)throw Error('BINARY_ERROR');return r.stdout.toString();
};
const qa=async file=>{
 const raw=exec('ffprobe',['-v','error','-show_entries',
  'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames','-of','json',file]);
 const p=JSON.parse(raw),v=p.streams.find(s=>s.codec_type==='video'),a=p.streams.find(s=>s.codec_type==='audio');
 return {durationSeconds:Number(p.format.duration),videoCodec:v?.codec_name,
  audioCodec:a?.codec_name??null,width:v?.width,height:v?.height,
  fps:v?.r_frame_rate,frameCount:Number(v?.nb_frames)};
};
const temp=async()=>mkdtemp(join(tmpdir(),'r3vid-hybrid-'));
const scene=n=>({id:'test',durationFrames:n});
test('R3-VID-02 FFprobe validates real MP4/MOV and rejects malicious/mislabelled assets',async()=>{
 const root=await temp();try{
  const mov=join(root,'clip.mov'),audio=join(root,'only.mp4'),junk=join(root,'fake.mp4');
  ff(['-f','lavfi','-i','testsrc2=size=160x90:rate=12','-t','1',
   '-c:v','mpeg4','-q:v','5','-y',mov]);
  ff(['-f','lavfi','-i','sine=frequency=410:sample_rate=44100','-t','1',
   '-vn','-c:a','aac','-y',audio]);
  await writeFile(junk,'garbage masquerading as MP4');
  const p=await probeClipSource(mov,{run:exec});
  assert.equal(p.container,'mov/mp4');assert.equal(p.sourceCodec,'mpeg4');
  await assert.rejects(()=>probeClipSource(audio,{run:exec}),/CLIP_VIDEO_CODEC_UNSUPPORTED/);
  await assert.rejects(()=>probeClipSource(junk,{run:exec}),/CLIP_PROBE_FAILED/);
  assert.throws(()=>inspectClipProbe({streams:[],format:{format_name:'image2',duration:'1'}}),/CLIP_CONTAINER_UNSUPPORTED/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('R3-VID-02 real 1-sec MOV with source audio -> 3-sec 90-frame muted H264 MP4 loop; external voice retained',async()=>{
 const root=await temp();try{
  const mov=join(root,'with-audio.mov'),out=join(root,'normalized.mp4'),voice=join(root,'voice.wav'),final=join(root,'combined.mp4');
  ff(['-f','lavfi','-i','testsrc2=size=160x90:rate=12','-f','lavfi','-i',
   'sine=frequency=230:sample_rate=48000','-t','1','-c:v','mpeg4','-q:v','6',
   '-c:a','aac','-shortest','-y',mov]);
  ff(['-f','lavfi','-i','sine=frequency=650:sample_rate=48000','-t','3',
   '-c:a','pcm_s16le','-y',voice]);
  const result=await normalizePinnedClip({input:mov,output:out,scene:scene(90),
   profile:{width:320,height:180,fps:30},run:exec,probeNormalized:qa});
  assert.equal(result.fit,'loop');assert.equal(result.source.embeddedAudio,true);
  assert.equal(result.sourceAudioDiscarded,true);assert.equal(result.qa.frameCount,90);
  assert.equal(result.qa.audioCodec,null);assert.equal(result.qa.durationSeconds,3);
  // Actual output mux takes ONLY the external narrated voice, never MOV audio.
  ff(['-i',out,'-i',voice,'-map','0:v:0','-map','1:a:0',
   '-frames:v','90','-t','3','-c:v','libx264','-c:a','aac','-y',final]);
  const rendered=await qa(final);assert.equal(rendered.videoCodec,'h264');
  assert.equal(rendered.audioCodec,'aac');assert.equal(rendered.frameCount,90);
  assert.ok(Math.abs(rendered.durationSeconds-3)<0.1);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('R3-VID-02 visual-window must fail closed on insufficient source; valid hold normalizes exact frames',async()=>{
 const root=await temp();try{
  const mp4=join(root,'short.mp4'),out=join(root,'held.mp4');
  ff(['-f','lavfi','-i','testsrc2=size=192x108:rate=30','-t','1',
   '-c:v','libx264','-pix_fmt','yuv420p','-y',mp4]);
  const profile={width:320,height:180,fps:30},p=await probeClipSource(mp4,{run:exec});
  assert.throws(()=>clipNormalizationPlan({scene:{durationFrames:90,visualWindow:{inFrame:20,outFrame:80}},profile,source:p}),/CLIP_WINDOW_SOURCE_TOO_SHORT/);
  const rendered=await normalizePinnedClip({input:mp4,output:out,
   scene:{durationFrames:90,visualWindow:{inFrame:20,outFrame:44}},profile,run:exec,probeNormalized:qa});
  assert.equal(rendered.fit,'hold');assert.equal(rendered.qa.frameCount,90);
  assert.equal(rendered.qa.audioCodec,null);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('R3-VID-02 exact H264 30fps MP4 without source audio uses no-encode passthrough',async()=>{
 const root=await temp();try{
  const source=join(root,'ready.mp4'),out=join(root,'copy.mp4');
  ff(['-f','lavfi','-i','testsrc2=size=320x180:rate=30','-t','1',
    '-c:v','libx264','-pix_fmt','yuv420p','-an','-movflags','+faststart','-y',source]);
  let invokes=0;
  const checking=(bin,args,options)=>{if(bin==='ffmpeg')invokes++;return exec(bin,args,options)};
  const result=await normalizePinnedClip({input:source,output:out,scene:scene(30),
    profile:{width:320,height:180,fps:30},run:checking,probeNormalized:qa});
  assert.equal(result.passthrough,true);assert.equal(invokes,0);
  assert.deepEqual(await readFile(out),await readFile(source));
 }finally{await rm(root,{recursive:true,force:true})}
});
