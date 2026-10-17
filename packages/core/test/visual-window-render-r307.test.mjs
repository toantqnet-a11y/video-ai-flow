/** R3-05/07: preview/publish and render must honor the same visual window,
 * without changing narration, captions, source order, or historical v2 docs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openProjectDb,StudioRepository,AssetManifest,CompositionRepository,TimedCompositionRepository,TimelineEditorR304,compositionDigest,validateTimedComposition,makeHyperframesHtml,renderHyperframesComposition,renderFfmpegComposition,makeSrt} from '../src/index.mjs';
import {hasVisualWindow,videoWindowFilter,imageMotionKeyframes} from '../src/visual-window-r307.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const available=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0 && spawnSync('ffprobe',['-version'],{stdio:'ignore'}).status===0;
const sampleImage=join(import.meta.dirname,'../../../spikes/EXT-03/assets/background-01.png');
function fakeDoc({type='image',durationFrames=90,window=true}={}){
 const text='Xin chào Việt Nam';
 const visual={kind:type,motion:type==='image'?'zoom':'none',asset:{id:'visual-1',kind:type,sha256:hash(type),bytes:type.length,relativePath:`media/visual.${type==='image'?'png':'mp4'}`}};
 const voice={asset:{id:'voice-1',kind:'voice',sha256:hash('voice'),bytes:5,relativePath:'media/voice.wav'},measuredDurationMs:2300};
 const scene={id:'scene-1',index:0,sceneRowVersion:1,text,textSha256:hash(text),mediaType:type==='image'?'image_motion':'import_video',startFrame:0,endFrame:durationFrames,durationMs:durationFrames*1000/30,durationFrames,durationBasis:'voice_measured',voice,visual,timing:{mode:'voice_measured',audioMs:2300,audioFrames:69,paddingFrames:durationFrames-69,tailPaddingMs:durationFrames*1000/30-2300},captions:{mode:'measured_scene',source:'scene_text',cues:[{text,startFrame:0,endFrame:69}]}};
 if(window)scene.visualWindow={inFrame:18,outFrame:72};
 const payload={schemaVersion:2,videoId:'trim-test',source:{videoRowVersion:1,configRevision:1,sceneRevision:1,timelineRowVersion:2,scriptSha256:hash('source')},profile:{width:1280,height:720,fps:30,aspectRatio:'16:9',codec:'h264'},scenes:[scene],totalFrames:durationFrames,readiness:{ready:true,blockers:[]}};
 return {...payload,digest:compositionDigest(payload)};
}
function refresh(doc){const {digest:_,...rest}=doc;return {...rest,digest:compositionDigest(rest)};}
function wav(ms=2400){const count=Math.ceil(ms*8),buf=Buffer.alloc(44+count);buf.write('RIFF',0);buf.writeUInt32LE(36+count,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(8000,24);buf.writeUInt32LE(8000,28);buf.writeUInt16LE(1,32);buf.writeUInt16LE(8,34);buf.write('data',36);buf.writeUInt32LE(count,40);return buf;}
async function project(){
 const root=await mkdtemp(join(tmpdir(),'r307-preview-'));
 const db=openProjectDb(join(root,'project.db'));const repo=new StudioRepository(db);
 const channel=repo.createChannel({name:'R307 local'}),video=repo.createVideo(channel.id,{title:'Visual trim'});
 const [scene]=repo.replaceScenes(video.id,{rowVersion:video.rowVersion,scenes:[{text:'Xin chào',durationMs:3000,mediaType:'image_motion'}]});
 const manifest=new AssetManifest({db,repository:repo,dataRoot:root}),compositions=new CompositionRepository({repo,manifest});
 const timed=new TimedCompositionRepository({compositions,manifest}),timeline=new TimelineEditorR304(repo);
 await manifest.importBytes({sceneId:scene.id,kind:'voice',source:'mock-tts',bytes:wav(2400),extension:'.wav',metadata:{queueJobId:'one',inputHash:hash('one'),textSha256:hash(scene.text),providerId:'piper'}});
 db.prepare('INSERT INTO scene_voice_intents(scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at) VALUES(?,?,?,?,?,?,?,?,?)').run(scene.id,'one',hash('one'),hash(scene.text),repo.getVideo(video.id).configRevision,'piper','default',0,Date.now());
 const visual=await manifest.importFile({sceneId:scene.id,kind:'image',source:'manual_import',inputPath:sampleImage});
 db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)').run(scene.id,visual.id,Date.now());
 return {root,db,repo,video,scene,timed,timeline,async close(){db.close();await rm(root,{force:true,recursive:true});}};
}
test('v2 visualWindow field is validated and digest-pinned; legacy v2 remains valid',()=>{
 const legacy=fakeDoc({window:false});assert.equal(hasVisualWindow(legacy.scenes[0]),false);validateTimedComposition(legacy);
 const document=fakeDoc();assert.equal(hasVisualWindow(document.scenes[0]),true);validateTimedComposition(document);
 for(const invalid of [{inFrame:-1,outFrame:72},{inFrame:72,outFrame:72},{inFrame:0,outFrame:90},{inFrame:18,outFrame:91},{inFrame:18,outFrame:72,evil:1}]){
  const modified=structuredClone(document);modified.scenes[0].visualWindow=invalid;
  assert.throws(()=>validateTimedComposition(refresh(modified)),{code:'INVALID_VISUAL_WINDOW'});
 }
 const tampered=structuredClone(document);tampered.scenes[0].visualWindow.inFrame=20;
 assert.throws(()=>validateTimedComposition(tampered),{code:'COMPOSITION_DIGEST_MISMATCH'});
});
test('saved trim projects into immutable v2, frame-quantized, without shortening voice or subtitles',{skip:!available},async()=>{
 const f=await project();try{
  const before=await f.timed.preview(f.video.id);
  assert.equal(before.readiness.ready,true,JSON.stringify(before.readiness.blockers));
  const timeline=f.timeline.manifest(f.video.id);
  const saved=f.timeline.trimVisual(f.video.id,{expectedRowVersion:timeline.rowVersion,sceneId:f.scene.id,inMs:300,outMs:1800});
  const after=await f.timed.preview(f.video.id);
  assert.equal(after.readiness.ready,true,JSON.stringify(after.readiness.blockers));
  assert.deepEqual(after.scenes[0].visualWindow,{inFrame:9,outFrame:54});
  assert.equal(after.totalFrames,before.totalFrames);
  assert.equal(after.scenes[0].timing.audioFrames,before.scenes[0].timing.audioFrames);
  assert.deepEqual(after.scenes[0].captions,before.scenes[0].captions);
  assert.notEqual(after.digest,before.digest);
  const published=await f.timed.publish(f.video.id,{expectedDigest:after.digest,expectedVideoRowVersion:after.source.videoRowVersion});
  assert.deepEqual(published.composition.scenes[0].visualWindow,{inFrame:9,outFrame:54});
  const conflict=f.timeline.trimVisual(f.video.id,{expectedRowVersion:saved.rowVersion,sceneId:f.scene.id,inMs:1500,outMs:2900});
  const blocked=await f.timed.preview(f.video.id);
  assert.equal(blocked.readiness.ready,false);
  assert.ok(blocked.readiness.blockers.some(b=>b.code==='VISUAL_WINDOW_CONFLICT'));
  assert.equal(blocked.scenes[0].visualWindow,undefined);
  await assert.rejects(f.timed.publish(f.video.id,{expectedDigest:blocked.digest,expectedVideoRowVersion:blocked.source.videoRowVersion}),{code:'COMPOSITION_ASSETS_NOT_READY'});
  assert.equal(f.repo.getTimeline(f.video.id).rowVersion,conflict.rowVersion);
 }finally{await f.close();}
});
test('HyperFrames HTML freezes image effect outside visual window; voice/caption clocks unchanged',()=>{
 const document=fakeDoc();const html=makeHyperframesHtml(document);
 assert.match(html,/@keyframes hf-window-0001/);
 assert.match(html, /20\.22472%\{transform:scale\(1\)\}/);
 assert.match(html, /79\.77528%,100%\{transform:scale\(1\.04\)\}/);
 assert.match(html,/voice-0001\.wav" data-start="0\.000000" data-duration="2\.300000"/);
 assert.match(html,/caption-0001-0" class="clip caption-holder" data-start="0\.000000" data-duration="2\.300000"/);
 assert.equal(imageMotionKeyframes(document.scenes[0],'none'),null);
});
test('FFmpeg local trimmed-video filter freezes first/last frames and produces exact frame count',{skip:!available},async()=>{
 const root=await mkdtemp(join(tmpdir(),'r307-ffmpeg-'));try{
  const source=join(root,'source.mp4'),output=join(root,'out.mkv');
  let r=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=64x36:rate=10:duration=2','-c:v','libx264','-y',source],{timeout:15000});assert.equal(r.status,0,String(r.stderr));
  const scene={durationFrames:30,visualWindow:{inFrame:10,outFrame:25}};
  const filter=videoWindowFilter(scene,{width:64,height:36,fps:10});
  r=spawnSync('ffmpeg',['-v','error','-i',source,'-vf',filter,'-frames:v','30','-fps_mode','passthrough','-c:v','ffv1','-y',output],{timeout:15000});assert.equal(r.status,0,String(r.stderr));
  const md=spawnSync('ffmpeg',['-v','error','-i',output,'-f','framemd5','-'],{encoding:'utf8',timeout:15000});assert.equal(md.status,0);
  const checks=md.stdout.split('\n').filter(s=>s&&!s.startsWith('#')).map(s=>s.split(',').at(-1).trim());
  assert.equal(checks.length,30);assert.equal(new Set(checks.slice(0,10)).size,1);assert.equal(new Set(checks.slice(25)).size,1);
  assert.notEqual(checks[12],checks[16],'visual advances within active window');
 }finally{await rm(root,{force:true,recursive:true});}
});
test('HyperFrames adapter stages edited clip with ffmpeg but fails closed rather than spoofing real engine',{skip:!available,timeout:90000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'r307-hf-stage-'));try{
  await mkdir(join(root,'media'));
  const videoPath=join(root,'media','visual.mp4'),audioPath=join(root,'media','voice.wav');
  const r=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=30:duration=2.5','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-y',videoPath],{timeout:40000});assert.equal(r.status,0,String(r.stderr));
  await writeFile(audioPath,'voice');
  const v=await readFile(videoPath),a=await readFile(audioPath);
  const doc=fakeDoc({type:'video'});
  doc.scenes[0].visual.asset.sha256=hash(v);doc.scenes[0].visual.asset.bytes=v.length;
  doc.scenes[0].voice.asset.sha256=hash(a);doc.scenes[0].voice.asset.bytes=a.length;
  const composition=refresh(doc);validateTimedComposition(composition);
  let checked=false;
  await assert.rejects(renderHyperframesComposition({composition,dataRoot:root,hyperframes:'mock-hyperframes-test-only',renderCommand:async(_bin,_args,options)=>{
   const staged=join(options.cwd,'assets','visual-0001.mp4');
   const info=spawnSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','csv=p=0',staged],{encoding:'utf8'});
   assert.equal(Number(info.stdout.trim()),90);
   const html=await readFile(join(options.cwd,'index.html'),'utf8');
   assert.match(html, /src="assets\/visual-0001\.mp4"/);
   checked=true;
   throw new Error('MOCK_ONLY__REAL_HYPERFRAMES_NOT_INSTALLED');
  }}),/MOCK_ONLY__REAL_HYPERFRAMES_NOT_INSTALLED/);
  assert.equal(checked,true);
  const published=await stat(join(root,'renders','trim-test'));
  assert.ok(published.isDirectory());
  assert.equal((await (await import('node:fs/promises')).readdir(join(root,'renders','trim-test'))).filter(x=>x.endsWith('.mp4')).length,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('FFmpeg fallback renders a visually trimmed real MP4 at unchanged voice/caption duration',{skip:!available,timeout:90000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'r307-export-'));try{
  await mkdir(join(root,'media'));
  const clipPath=join(root,'media','visual.mp4'),voicePath=join(root,'media','voice.wav');
  const enc=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=30:duration=2.5','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-y',clipPath],{timeout:40000});assert.equal(enc.status,0,String(enc.stderr));
  await writeFile(voicePath,wav(2300));
  const picture=await readFile(clipPath),sound=await readFile(voicePath),doc=fakeDoc({type:'video'});
  doc.scenes[0].visual.asset.sha256=hash(picture);doc.scenes[0].visual.asset.bytes=picture.length;
  doc.scenes[0].voice.asset.sha256=hash(sound);doc.scenes[0].voice.asset.bytes=sound.length;
  const composition=refresh(doc);validateTimedComposition(composition);
  assert.match(makeSrt(composition),/00:00:02,300/);
  const out=await renderFfmpegComposition({composition,dataRoot:root});
  assert.equal(out.engine,'ffmpeg-fastpath');assert.equal(out.qa.passed,true,JSON.stringify(out.qa));
  assert.equal(out.metadata.frameCount,90);assert.equal(out.metadata.audioCodec,'aac');
  const stats=await stat(join(root,out.relativePath));assert.ok(stats.size>2000);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('FFmpeg renders edited image zoom without touching 90-frame narration clock',{skip:!available,timeout:90000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'r307-image-export-'));try{
  await mkdir(join(root,'media'));
  const picture=await readFile(sampleImage),sound=wav(2300);
  await writeFile(join(root,'media','visual.png'),picture);await writeFile(join(root,'media','voice.wav'),sound);
  const doc=fakeDoc({type:'image'});
  doc.scenes[0].visual.asset.sha256=hash(picture);doc.scenes[0].visual.asset.bytes=picture.length;
  doc.scenes[0].voice.asset.sha256=hash(sound);doc.scenes[0].voice.asset.bytes=sound.length;
  const composition=refresh(doc);const rendered=await renderFfmpegComposition({composition,dataRoot:root});
  assert.equal(rendered.qa.passed,true,JSON.stringify(rendered.qa));
  assert.equal(rendered.metadata.frameCount,90);
 }finally{await rm(root,{force:true,recursive:true});}
});
test('HyperFrames fails closed when source clip cannot cover active visual window',{skip:!available,timeout:60000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'r307-shortclip-'));try{
  await mkdir(join(root,'media'));
  const source=join(root,'media','visual.mp4'),voice=join(root,'media','voice.wav');
  const enc=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=30:duration=1','-c:v','libx264','-preset','ultrafast','-y',source],{timeout:25000});assert.equal(enc.status,0);
  await writeFile(voice,'voice');
  const a=await readFile(source),b=await readFile(voice),doc=fakeDoc({type:'video'});
  doc.scenes[0].visual.asset.sha256=hash(a);doc.scenes[0].visual.asset.bytes=a.length;
  doc.scenes[0].voice.asset.sha256=hash(b);doc.scenes[0].voice.asset.bytes=b.length;
  let called=false;
  await assert.rejects(renderHyperframesComposition({composition:refresh(doc),dataRoot:root,renderCommand:async()=>{called=true;}}),{code:'RENDER_VISUAL_WINDOW_SHORT_SOURCE'});
  assert.equal(called,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
