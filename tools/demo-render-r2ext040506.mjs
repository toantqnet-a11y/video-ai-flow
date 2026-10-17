/** Offline integration sample: provided POC PNG+WAV only, never synthetic AI claims. */
import {mkdtemp,copyFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository,renderFfmpegComposition} from '../packages/core/src/index.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const tmp=await mkdtemp(join(tmpdir(),'contentstudio-render-demo-'));
const output=resolve(process.argv[2]??'docs/evidence/EXT040506_demo.mp4');
let db;
try{
 db=openProjectDb(join(tmp,'studio.sqlite'));const repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'Offline POC'}),video=repo.createVideo(channel.id,{title:'Proof-of-concept FFmpeg MP4'});
 const lines=['Xin chào Việt Nam. Đây là bản thử nghiệm FFmpeg.','Nội dung tiếng Việt có dấu: Hà Nội, Huế, Đà Nẵng.','Giọng đọc minh họa là WAV mẫu, không phải AI TTS thực tế.'];
 const scenes=repo.replaceScenes(video.id,{rowVersion:1,scenes:lines.map(text=>({text,durationMs:2500,mediaType:'image_motion'}))});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:tmp});
 for(const [i,scene] of scenes.entries()){
  const voice=await manifest.importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',inputPath:resolve(`spikes/EXT-03/assets/voice-0${i+1}.wav`),
   metadata:{queueJobId:'demo-'+i,inputHash:sha('input-'+i),textSha256:sha(scene.text),providerId:'piper'}});
  db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(scene.id,'demo-'+i,sha('input-'+i),sha(scene.text),repo.getVideo(video.id).configRevision,'piper','default',0,Date.now());
  const image=await manifest.importFile({sceneId:scene.id,kind:'image',inputPath:resolve(`spikes/EXT-03/assets/background-0${i+1}.png`)});
  db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,image.id,Date.now());
 }
 const compositions=new CompositionRepository({repo,manifest}),timed=new TimedCompositionRepository({compositions,manifest});
 const snap=await timed.preview(video.id);if(!snap.readiness.ready)throw Error(JSON.stringify(snap.readiness.blockers));
 const result=await renderFfmpegComposition({composition:snap,dataRoot:tmp,onProgress:x=>process.stdout.write(`scene ${x.completedScenes}/${x.totalScenes}\n`)});
 await copyFile(join(tmp,result.relativePath),output);
 await writeFile(output+'.json',JSON.stringify({testFixture:true,modelInference:false,source:'spikes/EXT-03/assets',result},null,2));
 console.log('EXPORTED',output,JSON.stringify(result.qa));
}finally{db?.close();await rm(tmp,{recursive:true,force:true})}
