/**
 * IA-01: real local media acceptance via the same SQLite/revisions, timed
 * composition, SP-04 queue and FFmpeg renderer used by the application.
 * The five WAV/PNG files are bundled fixtures, NOT AI provider output.
 * No browser, GPU, network, API secret or billable provider is touched.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir,copyFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository,
  defaultPreset,makeSrt,probeMp4,checkMp4Quality,safePinnedPath} from '../packages/core/src/index.mjs';
import {RenderExportService} from '../apps/api/src/render-export-r2ext0406.mjs';
import {JobStore} from '../spikes/SP-04/src/store.js';
import {JobRunner} from '../spikes/SP-04/src/runner.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const digest=s=>createHash('sha256').update(s).digest('hex');
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const sceneTexts=[
  'Cảnh một: Xin chào Việt Nam! Đón xem hành trình học hỏi.',
  'Cảnh hai: Hà Nội, Huế và Đà Nẵng có những nét đẹp riêng.',
  'Cảnh ba: Nội dung được phân chia theo từng đoạn rõ ràng.',
  'Cảnh bốn: Hình ảnh và âm thanh được đồng bộ theo thời gian.',
  'Cảnh năm: Cảm ơn bạn đã theo dõi! Hẹn gặp lại.'
];
function confirmBinaries(){
  for(const name of ['ffmpeg','ffprobe']){
    const p=spawnSync(name,['-version'],{stdio:'ignore',timeout:5000});
    assert.equal(p.status,0,`Required binary ${name} missing`);
  }
}
function presetFor(profile){
  // A channel preset is the owner of aspect ratio; overriding only render
  // dimensions would correctly be rejected by the composition contract.
  const portrait=profile==='portrait-hd'||profile==='portrait-full';
  return {...structuredClone(defaultPreset),
    media:{...structuredClone(defaultPreset.media),aspectRatio:portrait?'9:16':'16:9',motionEffect:'none'},
    render:{...structuredClone(defaultPreset.render),width:profile==='portrait-full'?1080:portrait?720:1280,
      height:profile==='portrait-full'?1920:portrait?1280:720,fps:30}};
}
/** Build the complete persisted selection workflow, not a hand-forged composition. */
export async function prepareFiveSceneAcceptance({dataRoot,profile='portrait-hd'}={}){
  const dbPath=join(dataRoot,'studio.sqlite');
  const db=openProjectDb(dbPath);let store;
  try{
    const repo=new StudioRepository(db);
    const channel=repo.createChannel({name:'IA01 offline fixture',preset:presetFor(profile)});
    const video=repo.createVideo(channel.id,{title:'Five-scene FFmpeg acceptance fixture'});
    const scenes=repo.replaceScenes(video.id,{rowVersion:1,scenes:sceneTexts.map(text=>({text,durationMs:3000,mediaType:'image_motion'}))});
    const manifest=new AssetManifest({db,repository:repo,dataRoot});
    store=new JobStore({path:dbPath,leaseMs:120000,baseBackoffMs:25,maxBackoffMs:100});
    for(let i=0;i<scenes.length;i++){
      const scene=scenes[i],index=String(i+1).padStart(2,'0');
      const voice=resolve(root,`spikes/EXT-03/assets/voice-${index}.wav`);
      const visual=resolve(root,`spikes/EXT-03/assets/background-${index}.png`);
      const inputHash=digest(`ia01:${i}:${scene.text}`),textSha=digest(scene.text);
      const voiceAsset=await manifest.importFile({sceneId:scene.id,kind:'voice',source:'mock-tts',inputPath:voice,
        metadata:{queueJobId:`ia01-voice-${i}`,inputHash,textSha256:textSha,providerId:'piper'}});
      db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(scene.id,`ia01-voice-${i}`,inputHash,textSha,repo.getVideo(video.id).configRevision,'piper','fixture',0,Date.now());
      const image=await manifest.importFile({sceneId:scene.id,kind:'image',source:'manual_import',inputPath:visual});
      db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,image.id,Date.now());
      assert.equal(await manifest.verifyRevision(voiceAsset.id),'healthy');
      assert.equal(await manifest.verifyRevision(image.id),'healthy');
    }
    const compositions=new CompositionRepository({repo,manifest});
    const timed=new TimedCompositionRepository({compositions,manifest});
    const preview=await timed.preview(video.id,{tailPaddingMs:250});
    assert.equal(preview.schemaVersion,2);assert.equal(preview.readiness.ready,true,
      `Missing media: ${JSON.stringify(preview.readiness.blockers)}`);
    assert.equal(preview.scenes.length,5);
    assert.equal(preview.profile.aspectRatio,presetFor(profile).media.aspectRatio);
    for(const [index,s] of preview.scenes.entries()){
      assert.equal(s.text,sceneTexts[index]);
      assert.equal(s.captions.cues[0].text,s.text);
      assert.equal(s.captions.cues[0].endFrame,s.timing.audioFrames);
      assert.ok(s.timing.audioFrames<=s.durationFrames);
      if(index)assert.equal(s.startFrame,preview.scenes[index-1].endFrame);
      await safePinnedPath(dataRoot,s.voice.asset);
      await safePinnedPath(dataRoot,s.visual.asset);
    }
    const publication=await timed.publish(video.id,{expectedDigest:preview.digest,
      expectedVideoRowVersion:preview.source.videoRowVersion,tailPaddingMs:250});
    assert.equal(publication.revision,1);
    assert.equal(compositions.revision(video.id,1).composition.digest,preview.digest);
    const renderer=new RenderExportService({repo,compositions,store,manifest});
    return {db,store,repo,manifest,renderer,video,scenes,composition:preview,publication,dbPath};
  }catch(err){try{store?.close()}finally{db.close()}throw err;}
}
/** Returns sanitized and machine-readable release gate evidence. */
export async function runIntegrationAcceptance({profile='portrait-hd',outputPath=null,maxWaitMs=240000}={}){
  confirmBinaries();
  const dir=await mkdtemp(join(tmpdir(),'contentstudio-ia01-'));
  let session,runner;const started=Date.now();
  try{
    session=await prepareFiveSceneAcceptance({dataRoot:dir,profile});
    const {renderer,store,video,composition,publication,dbPath}=session;
    const before=store.countByStatus().total;
    const queued=await renderer.enqueue(video.id,{requestKey:'ia01-render-five-scenes',revision:publication.revision,engine:'ffmpeg-fastpath'});
    assert.equal(queued.reused,false);
    const duplicate=await renderer.enqueue(video.id,{requestKey:'ia01-render-five-scenes',revision:publication.revision,engine:'ffmpeg-fastpath'});
    assert.equal(duplicate.reused,true);
    assert.equal(duplicate.job.id,queued.job.id);
    assert.equal(store.countByStatus().total,before+1,'idempotency must prevent a second render job');
    runner=new JobRunner(store,{'render:ffmpeg':renderer.handler()},{concurrency:1,pollMs:50,heartbeatMs:1000});
    runner.start();
    const deadline=Date.now()+maxWaitMs;
    let state;
    do{
      await sleep(200);
      state=renderer.job(video.id,queued.job.id);
      if(['succeeded','failed','cancelled'].includes(state.status))break;
    }while(Date.now()<deadline);
    assert.equal(state?.status,'succeeded',`Render did not succeed: ${state?.status??'timeout'} (${store.get(queued.job.id)?.last_error_code??'unknown'})`);
    await runner.stop();runner=null;
    assert.equal(state.output.qa.passed,true);
    assert.equal(state.progress.completedScenes,5);
    assert.equal(state.progress.totalScenes,5);
    const artifact=store.get(queued.job.id).result;
    const path=join(dir,artifact.relativePath);
    const mp4=await probeMp4(path);
    const qa=checkMp4Quality(mp4,composition);
    assert.equal(qa.passed,true,JSON.stringify(qa));
    const srt=makeSrt(composition);
    for(const text of sceneTexts)assert.ok(srt.includes(text),'Missing Vietnamese captions');
    assert.equal((srt.match(/\n\d+\n/g)??[]).length,4,'Five cue entries expected');
    assert.equal((await stat(path)).size,artifact.bytes);
    const out=outputPath?resolve(outputPath):null;
    if(out){await mkdir(dirname(out),{recursive:true});await copyFile(path,out);}
    // Reopening the SQLite connections proves the job remains durable after
    // the worker has stopped (not just an in-memory successful status).
    const expectedId=queued.job.id;
    session.store.close();session.store=null;
    session.db.close();session.db=null;
    const reopenedStore=new JobStore({path:dbPath});
    assert.equal(reopenedStore.get(expectedId).status,'succeeded');
    assert.equal(reopenedStore.countByStatus().total,before+1);
    reopenedStore.close();
    return {id:'IA-01',result:'PASS',platform:process.platform,profile:composition.profile,
      sceneCount:composition.scenes.length,totalFrames:composition.totalFrames,
      expectedSeconds:composition.totalFrames/composition.profile.fps,
      durationSeconds:mp4.durationSeconds,driftSeconds:qa.driftSeconds,
      qa:qa.checks,mp4Bytes:artifact.bytes,renderSha256:digest(await readFile(path)),
      renderDurationMs:Date.now()-started,
      persistedQueueSucceeded:true,idempotencyPreventsDuplicate:true,
      localFixtureOnly:true,realAiInference:false,paidApiCalls:0,
      browserWindowsGpuAccepted:false,longFormMp4Accepted:false,
      outputPath:out??null};
  }finally{
    if(runner)await runner.stop({abort:true});
    session?.store?.close();session?.db?.close();
    await rm(dir,{recursive:true,force:true});
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const full=process.argv.includes('--full-res');
    const output=process.argv.find(x=>x.startsWith('--output='))?.slice('--output='.length)||null;
    const report=process.argv.find(x=>x.startsWith('--report='))?.slice('--report='.length)||null;
    const result=await runIntegrationAcceptance({profile:full?'portrait-full':'portrait-hd',outputPath:output});
    const json=JSON.stringify(result,null,2)+'\n';
    if(report){const target=resolve(report);await mkdir(dirname(target),{recursive:true});await writeFile(target,json);}
    process.stdout.write(json);
  }catch(error){
    console.error(`IA01_FAILED: ${error?.code??error?.message??'UNKNOWN'}`);
    process.exitCode=1;
  }
}
