/** Local reproducible 3-second visual-window acceptance fixture. Does not run
 * HyperFrames, providers or paid network APIs; explicitly tests FFmpeg only.
 */
import {mkdtemp,mkdir,readFile,copyFile,rm,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {compositionDigest,renderFfmpegComposition} from '../packages/core/src/index.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const output=resolve(process.argv.find(x=>x.startsWith('--output='))?.slice(9)??'/mnt/data/Video_AI_Flow_R305_Visual_Trim_FFmpeg_Control.mp4');
const temp=await mkdtemp(join(tmpdir(),'r305-demomedia-'));
try{
 await mkdir(join(temp,'media'));
 const source=join(temp,'media','visual.mp4'),voice=join(temp,'media','voice.wav');
 for(const args of [
  ['-hide_banner','-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=30:duration=2.5','-c:v','libx264','-preset','ultrafast','-y',source],
  ['-hide_banner','-nostdin','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=8000:duration=2.3','-c:a','pcm_s16le','-y',voice]
 ]){
  const p=spawnSync('ffmpeg',args,{timeout:45000});if(p.status!==0)throw Error(`DEMO_MEDIA_GENERATION_FAILED:${p.stderr?.toString().slice(-300)}`);
 }
 const v=await readFile(source),a=await readFile(voice),text='Visual trong khoảng 0.6s – 2.4s; voice không bị cắt.';
 const scene={id:'scene-demo',index:0,sceneRowVersion:1,text,textSha256:sha(text),mediaType:'import_video',startFrame:0,endFrame:90,durationMs:3000,durationFrames:90,durationBasis:'voice_measured',voice:{asset:{id:'voice-demo',kind:'voice',sha256:sha(a),bytes:a.length,relativePath:'media/voice.wav'},measuredDurationMs:2300},visual:{kind:'video',motion:'none',asset:{id:'visual-demo',kind:'video',sha256:sha(v),bytes:v.length,relativePath:'media/visual.mp4'}},visualWindow:{inFrame:18,outFrame:72},timing:{mode:'voice_measured',audioMs:2300,audioFrames:69,paddingFrames:21,tailPaddingMs:700},captions:{mode:'measured_scene',source:'scene_text',cues:[{text,startFrame:0,endFrame:69}]}};
 const payload={schemaVersion:2,videoId:'r305-demo',source:{videoRowVersion:1,configRevision:1,sceneRevision:1,timelineRowVersion:2,scriptSha256:sha('demo')},profile:{width:1280,height:720,fps:30,aspectRatio:'16:9',codec:'h264'},scenes:[scene],totalFrames:90,readiness:{ready:true,blockers:[]}};
 const composition={...payload,digest:compositionDigest(payload)};
 const result=await renderFfmpegComposition({composition,dataRoot:temp});
 await copyFile(join(temp,result.relativePath),output);
 console.log(JSON.stringify({engine:result.engine,qa:result.qa,frames:result.metadata.frameCount,bytes:(await stat(output)).size,output},null,2));
}finally{await rm(temp,{recursive:true,force:true});}
