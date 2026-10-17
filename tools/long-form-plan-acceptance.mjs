/**
 * IA-02: no-render stress rehearsal for a ~35-minute Composition v2.
 * Uses real FFprobe against deterministic PCM WAVs and real SQLite/filesystem
 * asset revisions; output is a PLAN, not a 35-minute rendered MP4 or AI voice.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository,defaultPreset} from '../packages/core/src/index.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const digest=v=>createHash('sha256').update(v).digest('hex');
function wave(ms){
  // Valid 16kHz mono signed PCM, intentionally SILENT; this is a load fixture.
  const bytes=16000*2*ms/1000;
  assert.equal(bytes,Math.floor(bytes));
  const wav=Buffer.alloc(44+bytes);wav.write('RIFF',0);
  wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
  wav.write('data',36);wav.writeUInt32LE(bytes,40);
  return wav;
}
export async function runLongFormPlan({sceneCount=300,voiceMs=7000,paddingMs=250}={}){
  assert.ok(Number.isInteger(sceneCount)&&sceneCount>=10&&sceneCount<=500);
  assert.ok(Number.isInteger(voiceMs)&&voiceMs>=500&&voiceMs<=120000);
  const work=await mkdtemp(join(tmpdir(),'contentstudio-ia02-'));
  let db;const start=performance.now();
  try{
    const wavPath=join(work,'measured-silent.wav');
    await writeFile(wavPath,wave(voiceMs));
    const png=resolve(root,'spikes/EXT-03/assets/background-01.png');
    db=openProjectDb(join(work,'studio.sqlite'));
    const repo=new StudioRepository(db);
    const preset={...structuredClone(defaultPreset),media:{...structuredClone(defaultPreset.media),aspectRatio:'9:16'},
      render:{...structuredClone(defaultPreset.render),width:720,height:1280,fps:30}};
    const channel=repo.createChannel({name:'IA02 35-minute nonrender load',preset});
    const video=repo.createVideo(channel.id,{title:'Long-form asset and timing rehearsal'});
    const content=i=>`Đoạn số ${i+1}. Văn bản tiếng Việt có dấu được bảo toàn ở mỗi cảnh.`;
    const rows=repo.replaceScenes(video.id,{rowVersion:1,scenes:Array.from({length:sceneCount},(_,i)=>({
      text:content(i),durationMs:voiceMs+paddingMs,mediaType:'image_motion'}))});
    const manifest=new AssetManifest({db,repository:repo,dataRoot:work});
    for(let index=0;index<rows.length;index++){
      const s=rows[index],inputHash=digest(`${s.text}|ia02`),textSha256=digest(s.text),job=`ia02_${index}`;
      await manifest.importFile({sceneId:s.id,kind:'voice',source:'mock-tts',inputPath:wavPath,
        metadata:{queueJobId:job,inputHash,textSha256,providerId:'piper'}});
      db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(s.id,job,inputHash,textSha256,repo.getVideo(video.id).configRevision,'piper','fixture',0,Date.now());
      const image=await manifest.importFile({sceneId:s.id,kind:'image',source:'manual_import',inputPath:png});
      db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)')
        .run(s.id,image.id,Date.now());
    }
    const composition=await new TimedCompositionRepository({compositions:new CompositionRepository({repo,manifest}),manifest})
      .preview(video.id,{tailPaddingMs:paddingMs});
    assert.equal(composition.schemaVersion,2);
    assert.equal(composition.readiness.ready,true,JSON.stringify(composition.readiness.blockers));
    assert.equal(composition.scenes.length,sceneCount);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM asset_revisions').get().n,2*sceneCount);
    for(let i=0;i<sceneCount;i++){
      const scene=composition.scenes[i];
      assert.equal(scene.text,content(i));
      assert.equal(scene.captions.cues[0].endFrame,scene.timing.audioFrames);
      if(i>0)assert.equal(scene.startFrame,composition.scenes[i-1].endFrame);
    }
    assert.ok(composition.totalFrames>0);
    const seconds=composition.totalFrames/composition.profile.fps;
    return {id:'IA-02',result:'PASS',releaseStatus:'PENDING_LONG_FORM_MP4',sceneCount,
      verifiedAssetCount:2*sceneCount,scenario:'long_form_composition_only',
      expectedTimelineSeconds:seconds,expectedTimelineMinutes:Number((seconds/60).toFixed(2)),
      totalFrames:composition.totalFrames,fps:composition.profile.fps,
      fixtureWaveMs:voiceMs,tailPaddingMs:paddingMs,
      sqliteAndAssetHashesVerified:true,ffprobeMeasuredAllVoices:true,
      elapsedPlanMs:Math.round(performance.now()-start),
      realAiInference:false,renderedMp4:false,realWindowsGpuAccepted:false};
  }finally{db?.close();await rm(work,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const countArg=process.argv.find(x=>x.startsWith('--scenes='));
    const count=countArg?Number(countArg.slice(9)):300;
    const result=await runLongFormPlan({sceneCount:count});
    const serialized=JSON.stringify(result,null,2)+'\n';
    const reportArg=process.argv.find(x=>x.startsWith('--report='));
    if(reportArg){const path=resolve(reportArg.slice(9));await mkdir(dirname(path),{recursive:true});await writeFile(path,serialized);}
    process.stdout.write(serialized);
  }catch(error){console.error(`IA02_FAILED: ${error?.code??error?.message??'UNKNOWN'}`);process.exitCode=1;}
}
