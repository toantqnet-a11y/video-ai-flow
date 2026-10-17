import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,readFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {inspectNativeVideoReadiness} from '../src/native-video-diagnostics-r2vid02.mjs';
import {verifyHybridArtifacts} from '../src/hybrid-evidence-r3vid03.mjs';
import {runBinary} from '../src/render-ffmpeg-r2ext04.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fakeWorkflow={"1":{class_type:'CLIPTextEncode',inputs:{text:'placeholder',seed:1}}};
const bindings={prompt:{nodeId:'1',input:'text'},seed:{nodeId:'1',input:'seed'}};
test('R2VID02 real local workflow hash, optional GET status but never POST inference',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-wan-check-'));
 try{
  const workflow=join(root,'api-workflow.json');
  await writeFile(workflow,JSON.stringify(fakeWorkflow));
  const called=[];
  const fetchImpl=async(url,options)=>{
   called.push({url,method:options.method});
   return new Response(JSON.stringify({devices:[{type:'cuda',vram_total:10_000_000_000}]}),{
    status:200,headers:{'content-type':'application/json'}});
  };
  const inspected=await inspectNativeVideoReadiness({workflowPath:workflow,bindings,probeLocal:true,fetchImpl});
  assert.equal(inspected.workflowValidated,true);
  assert.equal(inspected.localApiReachable,true);
  assert.equal(inspected.deviceReported,true);
  assert.equal(inspected.nativeInferenceVerified,false);
  assert(inspected.blockers.includes('R2VID02_NATIVE_INFERENCE_NOT_WITNESSED'));
  assert.deepEqual(called.map(x=>x.method),['GET']);
  assert.match(called[0].url,/^http:\/\/127\.0\.0\.1:8188\/system_stats$/);
  const blocked=await inspectNativeVideoReadiness({workflowPath:workflow,bindings,origin:'https://paid.example',probeLocal:true,fetchImpl});
  assert(blocked.blockers.includes('R2VID02_LOOPBACK_ONLY'));
  assert.equal(called.length,1);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('R3VID03 checks real 1s H264/AAC and SHA, never accepts it as a 35min render',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r3vid03-proof-'));
 try{
  const videoId='test-video',renderDir=join(root,'renders',videoId);
  await mkdir(renderDir,{recursive:true});await mkdir(join(root,'voices'));await mkdir(join(root,'images'));
  const voice=Buffer.from('voice pin'),visual=Buffer.from('visual pin');
  await writeFile(join(root,'voices','pin.wav'),voice);await writeFile(join(root,'images','pin.png'),visual);
  const render=join(renderDir,'a'.repeat(64)+'.mp4');
  await runBinary('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-f','lavfi',
   '-i','color=c=blue:s=320x240:r=30:d=1','-f','lavfi','-i','sine=frequency=440:duration=1',
   '-frames:v','30','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
   '-c:a','aac','-ar','48000','-ac','2','-y',render],{timeoutMs:60000});
  const outSha=sha(await readFile(render));
  const make=(kind,path,bytes)=>({kind,relativePath:path,sha256:sha(bytes),bytes:bytes.length});
  const voicePin=make('voice','voices/pin.wav',voice),visualPin=make('image','images/pin.png',visual);
  const comp={videoId,profile:{fps:30,width:320,height:240},totalFrames:30,
   scenes:['image_motion','ai_video','import_video'].map(mediaType=>({mediaType,
    voice:{asset:voicePin},visual:{asset:visualPin}}))};
  const verified=await verifyHybridArtifacts({composition:comp,dataRoot:root,renderPath:render,expectedRenderSha256:outSha});
  assert.equal(verified.fileChecks.checksumVerified,true);
  assert.equal(verified.fileChecks.ffprobeQa,true);
  assert.equal(verified.fileChecks.verifiedLocalAssets,true);
  assert.equal(verified.accepted,false);
  assert(verified.blockers.includes('R3VID03_REAL_35MIN_COMPOSITION_REQUIRED'));
  const wrong=await verifyHybridArtifacts({composition:comp,dataRoot:root,renderPath:render,expectedRenderSha256:'b'.repeat(64)});
  assert.equal(wrong.fileChecks.checksumVerified,false);
  assert(wrong.blockers.includes('R3VID03_OUTPUT_SHA256_UNVERIFIED'));
  await writeFile(join(root,'voices','pin.wav'),Buffer.from('changed'));
  const dirty=await verifyHybridArtifacts({composition:comp,dataRoot:root,renderPath:render,expectedRenderSha256:outSha});
  assert.equal(dirty.fileChecks.verifiedLocalAssets,false);
 }finally{await rm(root,{recursive:true,force:true})}
});
