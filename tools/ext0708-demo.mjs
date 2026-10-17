/** EXT-07/08 deterministic offline FFmpeg demo: explicit local assets, never AI inference. */
import {mkdtemp,copyFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository,MotionBrandRepository,renderFfmpegComposition} from '../packages/core/src/index.mjs';
const folder=await mkdtemp(join(tmpdir(),'r2ext0708-demo-'));
const dst=process.argv[2]??'/mnt/data';
const image=new URL('../spikes/EXT-03/assets/background-01.png',import.meta.url).pathname;
const wav=new URL('../spikes/EXT-03/assets/voice-01.wav',import.meta.url).pathname;
const sha=s=>createHash('sha256').update(s).digest('hex');
let db;
try{
 db=openProjectDb(join(folder,'contentstudio.sqlite'));
 const repo=new StudioRepository(db),channel=repo.createChannel({name:'EXT07 08 Demo'});
 const video=repo.createVideo(channel.id,{title:'Demo Style - AI Video Flow'});
 const scene=repo.replaceScenes(video.id,{rowVersion:1,scenes:[{text:'Xin chào Việt Nam! Tạo video nhanh và tiết kiệm.',durationMs:2700,mediaType:'image_motion'}]})[0];
 const manifest=new AssetManifest({db,repository:repo,dataRoot:folder});
 await manifest.importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',inputPath:wav,metadata:{queueJobId:'mock',inputHash:sha('input'),textSha256:sha(scene.text),providerId:'piper'}});
 db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)').run(scene.id,'mock',sha('input'),sha(scene.text),repo.getVideo(video.id).configRevision,'piper','default',0,Date.now());
 const visual=await manifest.importFile({sceneId:scene.id,kind:'image',source:'manual_import',inputPath:image});
 db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,visual.id,Date.now());
 const composition=await new TimedCompositionRepository({compositions:new CompositionRepository({repo,manifest}),manifest}).preview(video.id);
 if(!composition.readiness.ready)throw Error('DEMO_UNREADY');
 const style=new MotionBrandRepository(repo).publish(video.id,{expectedRevision:0,style:{schemaVersion:1,presetId:'gentle',brand:{title:'AI VIDEO FLOW',accentColor:'#1377C5',captionColor:'#FFFFFF',outlineColor:'#142033',captionSize:30,showLowerThird:true},sceneOverrides:[]}}).style;
 const result=await renderFfmpegComposition({composition,motionStyle:style,dataRoot:folder});
 await copyFile(join(folder,result.relativePath),join(dst,'Video_AI_Flow_EXT07_08_Demo.mp4'));
 await copyFile(join(folder,result.thumbnail.relativePath),join(dst,'Video_AI_Flow_EXT07_08_Thumbnail.jpg'));
 await writeFile(join(dst,'Video_AI_Flow_EXT07_08_Demo_QA.json'),JSON.stringify({qa:result.qa,metadata:result.metadata,styleDigest:result.styleDigest,thumbnail:result.thumbnail,fixture:true,realAI:false},null,2)+'\n');
 console.log(JSON.stringify({output:join(dst,'Video_AI_Flow_EXT07_08_Demo.mp4'),thumbnail:join(dst,'Video_AI_Flow_EXT07_08_Thumbnail.jpg'),qa:result.qa},null,2));
}finally{db?.close();await rm(folder,{recursive:true,force:true});}
