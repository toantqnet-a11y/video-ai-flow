/** R3-VID-02: genuine local 2-scene image + MOV normalization -> final MP4.
 * This is a short FFmpeg fixture, NOT 35-min Windows production acceptance.
 */
import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {normalizePinnedClip} from '../src/clip-normalize-r3vid02.mjs';
const cli=(bin,args)=>{
 const p=spawnSync(bin,args,{timeout:40000});
 if(p.status!==0)throw Error(bin+': '+p.stderr.toString().slice(-1500));
 return p.stdout.toString();
};
const encode=args=>cli('ffmpeg',['-hide_banner','-nostdin','-loglevel','error',...args]);
const probe=file=>{
 const x=JSON.parse(cli('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height,nb_frames,r_frame_rate','-of','json',file]));
 const v=x.streams.find(s=>s.codec_type==='video'),a=x.streams.find(s=>s.codec_type==='audio');
 return {durationSeconds:Number(x.format.duration),videoCodec:v?.codec_name,audioCodec:a?.codec_name??null,
  width:v?.width,height:v?.height,frameCount:Number(v?.nb_frames),fps:v?.r_frame_rate};
};
test('real image + MOV + two external narration tracks -> fixed frame H264/AAC and Vietnamese SRT',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hybrid-r3vid-'));
 try{
  const img=join(root,'still.png'),mov=join(root,'imported.mov'),clip=join(root,'normalized.mp4');
  const s1=join(root,'scene-0000.mp4'),s2=join(root,'scene-0001.mp4');
  const v1=join(root,'voice1.wav'),v2=join(root,'voice2.wav');
  const list=join(root,'concat.txt'),raw=join(root,'raw.mp4'),final=join(root,'final.mp4'),srt=join(root,'cues.srt');
  encode(['-f','lavfi','-i','color=c=blue:size=160x90:rate=1','-frames:v','1','-update','1','-y',img]);
  encode(['-f','lavfi','-i','testsrc2=size=160x90:rate=15',
    '-f','lavfi','-i','sine=frequency=220:sample_rate=48000','-t','1',
    '-c:v','mpeg4','-q:v','5','-c:a','aac','-y',mov]);
  encode(['-f','lavfi','-i','sine=frequency=550:sample_rate=48000','-t','1','-c:a','pcm_s16le','-y',v1]);
  encode(['-f','lavfi','-i','sine=frequency=650:sample_rate=48000','-t','3','-c:a','pcm_s16le','-y',v2]);
  const p={width:320,height:180,fps:30};
  await normalizePinnedClip({input:mov,output:clip,scene:{durationFrames:90},profile:p,
    run:async(bin,args)=>cli(bin,args),probeNormalized:async f=>probe(f)});
  encode(['-loop','1','-framerate','30','-i',img,'-i',v1,'-map','0:v:0','-map','1:a:0',
    '-vf','scale=320:180,setsar=1,fps=30,format=yuv420p','-af','apad',
    '-frames:v','30','-t','1','-r','30','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
    '-c:a','aac','-ar','48000','-ac','2','-video_track_timescale','30000','-y',s1]);
  encode(['-i',clip,'-i',v2,'-map','0:v:0','-map','1:a:0','-vf','setsar=1,format=yuv420p','-af','apad',
    '-frames:v','90','-t','3','-r','30','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
    '-c:a','aac','-ar','48000','-ac','2','-video_track_timescale','30000','-y',s2]);
  await writeFile(list,"file 'scene-0000.mp4'\nfile 'scene-0001.mp4'\n");
  await writeFile(srt,'1\n00:00:00,000 --> 00:00:01,000\nXin chào\n\n2\n00:00:01,000 --> 00:00:04,000\nĐây là clip\n\n');
  encode(['-f','concat','-safe','1','-i',list,'-c','copy','-y',raw]);
  encode(['-i',raw,'-vf','fps=30:start_time=0,tpad=stop_mode=clone:stop_duration=0.066667,subtitles='+srt,
    '-af','aresample=async=1:first_pts=0,apad,atrim=duration=4',
    '-frames:v','120','-t','4','-c:v','libx264','-preset','ultrafast',
    '-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-y',final]);
  const result=probe(final);
  assert.equal(result.videoCodec,'h264');assert.equal(result.audioCodec,'aac');
  assert.equal(result.width,320);assert.equal(result.height,180);
  assert.equal(result.frameCount,120);assert.ok(Math.abs(result.durationSeconds-4)<0.12);
  assert.equal(result.fps,'30/1');
  assert.ok((await readFile(final)).length>6000);
 }finally{await rm(root,{recursive:true,force:true})}
});
