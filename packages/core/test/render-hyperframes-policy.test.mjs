import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {makeHyperframesHtml,renderHyperframesComposition} from '../src/render-hyperframes.mjs';
import {compositionDigest} from '../src/composition-r2ext01.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const pin=(kind,path)=>({id:`asset-${kind}`,kind,relativePath:path,sha256:hash(kind),bytes:Buffer.byteLength(kind)});
function document(){
 const {digest:_,...payload}={schemaVersion:2,videoId:'my-video',source:{videoRowVersion:1,configRevision:1,sceneRevision:1,timelineRowVersion:1,scriptSha256:hash('hello')},profile:{aspectRatio:'16:9',width:1920,height:1080,fps:30,codec:'h264'},scenes:[{id:'scene-1',index:0,sceneRowVersion:1,text:'Hà Nội <script>alert(1)</script>',textSha256:hash('Hà Nội <script>alert(1)</script>'),mediaType:'image_motion',startFrame:0,endFrame:90,durationMs:3000,durationFrames:90,durationBasis:'voice_measured',voice:{asset:pin('voice','voices/asset.wav'),measuredDurationMs:2300},visual:{kind:'image',motion:'zoom',asset:pin('image','images/asset.png')},timing:{mode:'voice_measured',audioMs:2300,audioFrames:69,paddingFrames:21,tailPaddingMs:700},captions:{mode:'measured_scene',source:'scene_text',cues:[{text:'Hà Nội <script>alert(1)</script>',startFrame:0,endFrame:69}]}}],totalFrames:90,readiness:{ready:true,blockers:[]}};
 return {...payload,digest:compositionDigest(payload)};
}
test('HyperFrames emits local time-locked scene/media/captions with escaped Vietnamese text',()=>{
 const html=makeHyperframesHtml(document());
 assert.match(html,/data-composition-id="contentstudio" data-start="0" data-no-timeline/);
 assert.match(html,/data-duration="3\.000000"/);
 assert.match(html,/voice-0001\.wav" data-start="0\.000000" data-duration="2\.300000"/);
 assert.match(html,/Hà Nội &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.ok(!html.includes('<script>alert(1)</script>'));
 assert.doesNotMatch(html,/(https?:\/\/|<script\s+src)/);
});
test('HyperFrames is fail-closed: missing binary cannot silently use FFmpeg or publish output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hf-failclosed-'));
 try{
  const d=document();
  await import('node:fs/promises').then(async fs=>{await fs.mkdir(join(dir,'voices'));await fs.mkdir(join(dir,'images'));await fs.writeFile(join(dir,'voices','asset.wav'),'voice');await fs.writeFile(join(dir,'images','asset.png'),'image')});
  // This fixture pins fake byte streams; missing HyperFrames CLI is injected
  // AFTER SHA validation, so the test never pretends to run the real renderer.
  let calls=0;
  await assert.rejects(renderHyperframesComposition({composition:d,dataRoot:dir,hyperframes:'mock-hyperframes-test-only',
   renderCommand:async(binary,args,options)=>{calls++;assert.equal(binary,'mock-hyperframes-test-only');assert.equal(args[0],'render');assert.equal(options.env.HYPERFRAMES_NO_TELEMETRY,'1');
     assert.ok((await readFile(join(options.cwd,'index.html'),'utf8')).includes('data-composition-id="contentstudio"'));
     throw Object.assign(new Error('not installed'),{code:'RENDER_BINARY_UNAVAILABLE'});
   }}),{code:'HYPERFRAMES_NOT_INSTALLED'});
  assert.equal(calls,1);
  const output=await readdir(join(dir,'renders','my-video'));
  assert.equal(output.length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('reject not-ready composition before any renderer process runs',async()=>{
 const d=document();d.readiness={ready:false,blockers:[{sceneId:'scene-1',code:'VOICE_DURATION_UNAVAILABLE'}]};
 const {digest,...base}=d;d.digest=compositionDigest(base);
 await assert.rejects(renderHyperframesComposition({composition:d,dataRoot:'/does-not-exist',renderCommand:()=>{throw Error('unexpected')}}),{code:'RENDER_COMPOSITION_NOT_READY'});
});
