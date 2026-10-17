import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectZipServiceR311} from '../src/project-zip-r311.mjs';
import {operationById} from '../../../packages/contracts/src/catalog.mjs';
test('R3-11 project ZIP is a versioned authenticated binary contract',()=>{
 const op=operationById.get('downloadProjectZip');assert.equal(op.method,'GET');
 assert.equal(op.path,'/api/videos/:id/exports/project.zip');assert.ok(op.query.revision);
});
test('R3-11 refuses invalid, unavailable and cross-video revisions before writing a ZIP',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r311-api-'));
 try{
  let lookedUp=0;
  const svc=new ProjectZipServiceR311({repo:{getVideo:id=>id==='vid-one'?{title:'Title'}:null},
   compositions:{revision:()=>{lookedUp++;return {composition:{videoId:'elsewhere'}};}},manifest:{dataRoot:root}});
  await assert.rejects(svc.export('vid-one',0),{code:'PROJECT_ZIP_INVALID_REVISION'});
  await assert.rejects(svc.export('does-not-exist',1),{code:'PROJECT_ZIP_VIDEO_NOT_FOUND'});
  await assert.rejects(svc.export('vid-one',1),{code:'PROJECT_ZIP_WRONG_VIDEO'});
  assert.equal(lookedUp,1);
  assert.deepEqual(await readdir(root),[]);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('R3-11 service creates a private complete archive from one approved revision and does not persist user credentials',async()=>{
 const {createHash}=await import('node:crypto');const {mkdir,writeFile,lstat}=await import('node:fs/promises');
 const {compositionDigest,validateTimedComposition}=await import('../../../packages/core/src/index.mjs');
 const h=x=>createHash('sha256').update(x).digest('hex');
 const root=await mkdtemp(join(tmpdir(),'r311-api-happy-'));
 try{
  await mkdir(join(root,'media'));
  const a=Buffer.from('audio-test'),p=Buffer.from('image-test'),text='Hà Nội xin chào';
  await writeFile(join(root,'media','a.wav'),a);await writeFile(join(root,'media','a.png'),p);
  const payload={schemaVersion:2,videoId:'vid-one',source:{videoRowVersion:1,configRevision:1,sceneRevision:1,timelineRowVersion:1,scriptSha256:h('script')},
   profile:{width:1280,height:720,fps:30,aspectRatio:'16:9',codec:'h264'},scenes:[{
    id:'scene-one',index:0,sceneRowVersion:1,text,textSha256:h(text),mediaType:'image_motion',startFrame:0,endFrame:30,durationMs:1000,durationFrames:30,
    durationBasis:'voice_measured',voice:{asset:{id:'v1',kind:'voice',sha256:h(a),bytes:a.length,relativePath:'media/a.wav'},measuredDurationMs:780},
    visual:{kind:'image',motion:'none',asset:{id:'i1',kind:'image',sha256:h(p),bytes:p.length,relativePath:'media/a.png'}},
    timing:{mode:'voice_measured',audioMs:780,audioFrames:24,paddingFrames:6,tailPaddingMs:220},
    captions:{mode:'measured_scene',source:'scene_text',cues:[{text,startFrame:0,endFrame:24}]}
   }],totalFrames:30,readiness:{ready:true,blockers:[]}};
  const composition={...payload,digest:compositionDigest(payload)};validateTimedComposition(composition);
  const svc=new ProjectZipServiceR311({repo:{getVideo:()=>({title:'Approved Project'})},
   compositions:{revision:(_id,revision)=>{assert.equal(revision,7);return {composition}}},manifest:{dataRoot:root}});
  const out=await svc.export('vid-one',7);
  assert.ok(out.filename.includes('r7.zip'));
  assert.ok((await lstat(out.path)).isFile());
  const chunks=[];for await(const chunk of out.stream)chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).length,out.size);
  assert.ok(out.size>500);
  // API response layer unlinks the private staging archive after download.
  await rm(out.path);assert.equal((await readdir(join(root,'exports','vid-one'))).length,0);
 }finally{await rm(root,{recursive:true,force:true})}
});
