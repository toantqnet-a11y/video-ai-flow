import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compositionDigest} from '../src/composition-r2ext01.mjs';
import {renderCachedHyperframesComposition} from '../src/render-hf-scene-cache-r308.mjs';
import {runBinary} from '../src/render-ffmpeg-r2ext04.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const pin=(kind,idx,bytes)=>({id:'asset-'+kind+'-'+idx,kind,
 relativePath:kind==='voice'?'voice/voice.wav':'images/picture.png',
 bytes:Buffer.byteLength(bytes),sha256:hash(bytes)});
function fixture(){
 const scenes=Array.from({length:2},(_,i)=>{
  const text='Câu '+(i+1);
  return {id:'scene-'+(i+1),index:i,sceneRowVersion:1,text,textSha256:hash(text),
   mediaType:'image_motion',startFrame:i*30,endFrame:(i+1)*30,
   durationMs:1000,durationFrames:30,durationBasis:'voice_measured',
   voice:{asset:pin('voice',i,'voice'),measuredDurationMs:1000},
   visual:{kind:'image',motion:'none',asset:pin('image',i,'picture')},
   timing:{mode:'voice_measured',audioFrames:30,audioMs:1000,paddingFrames:0,tailPaddingMs:0},
   captions:{mode:'measured_scene',source:'scene_text',cues:[{text,startFrame:0,endFrame:30}]}};
 });
 const payload={schemaVersion:2,videoId:'cache-fixture',
  source:{videoRowVersion:1,configRevision:1,sceneRevision:1,timelineRowVersion:1,scriptSha256:hash('story')},
  profile:{width:1280,height:720,fps:30,aspectRatio:'16:9',codec:'h264'},
  scenes,totalFrames:60,readiness:{ready:true,blockers:[]}};
 return {...payload,digest:compositionDigest(payload)};
}
test('R3-08 two real FFmpeg segments: immutable cache hit avoids new renderer work',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'r308-hf-cache-')),db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE render_segment_cache(video_id TEXT, segment_hash TEXT, file_sha256 TEXT, frames INTEGER, bytes INTEGER, relative_path TEXT, created_at INTEGER, PRIMARY KEY(video_id,segment_hash))');
 try{
  await mkdir(join(dir,'voice'));await mkdir(join(dir,'images'));
  await writeFile(join(dir,'voice','voice.wav'),'voice');
  await writeFile(join(dir,'images','picture.png'),'picture');
  let rendered=0;
  // Inject a local FFmpeg encoder instead of pretending the native HyperFrames
  // binary executed. This proves cache fencing, concat, and real MP4 QA only.
  const renderCommand=async(_bin,args)=>{
   rendered++;
   const output=args[args.indexOf('--output')+1];
   await runBinary('ffmpeg',['-hide_banner','-nostdin','-loglevel','error',
    '-f','lavfi','-i','color=c=blue:s=1280x720:r=30:d=1',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1',
    '-frames:v','30','-t','1','-c:v','libx264','-preset','ultrafast','-crf','30',
    '-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-y',output],
    {timeoutMs:60000});
  };
  const config={composition:fixture(),dataRoot:dir,cacheDb:db,
   hyperframes:'synthetic-test-renderer',renderCommand};
  const a=await renderCachedHyperframesComposition(config);
  assert.equal(a.qa.passed,true);assert.equal(a.segmentCache.encoded,2);
  assert.equal(a.segmentCache.reused,0);assert.equal(rendered,2);
  const b=await renderCachedHyperframesComposition(config);
  assert.equal(b.qa.passed,true);assert.equal(b.segmentCache.encoded,0);
  assert.equal(b.segmentCache.reused,2);assert.equal(rendered,2);
  assert.equal(b.relativePath,a.relativePath);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
