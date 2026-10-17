/** API catalog and local security checks, no network calls or AI spend. */
import test from 'node:test';import assert from 'node:assert/strict';
import {operations,schemas} from '../../../packages/contracts/src/catalog.mjs';
import {inspectIncomingRequest} from '../src/request-policy.mjs';
const gate={verifyTransport:()=>null};
const raw=(url,method='POST')=>({method,url,headers:{host:'127.0.0.1:4311'},rawHeaders:['host','127.0.0.1:4311'],socket:{remoteAddress:'127.0.0.1'}});
test('EXT-01 signed composition endpoints exist and never accept secret/query path injection',()=>{
 const set=[['previewVideoComposition','POST'],['publishVideoComposition','POST'],['listVideoCompositions','GET'],['getVideoCompositionRevision','GET']];
 for(const [id,method] of set){const op=operations.find(x=>x.id===id);assert.ok(op);assert.equal(op.method,method);assert.notEqual(op.public,true);}
 assert.equal(inspectIncomingRequest(raw('/api/videos/v1/composition/preview'),{port:4311,gate}),null);
 assert.equal(inspectIncomingRequest(raw('/api/videos/v1/composition/preview?token=abc'),{port:4311,gate}),'SECRET_IN_QUERY_FORBIDDEN');
 assert.equal(inspectIncomingRequest(raw('/api/videos/v1/composition/revisions?profile=anything','GET'),{port:4311,gate}),'QUERY_NOT_ALLOWED');
 assert.equal(schemas.CompositionDocument.properties.digest.maxLength,64);
});

import {readFileSync} from 'node:fs';
import {createControllers} from '../src/controllers.mjs';
import {openProjectDb,StudioRepository,AssetManifest} from '../../../packages/core/src/index.mjs';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('standalone JSON Schema reflects canonical operation catalog exactly',()=>{
 const schema=JSON.parse(readFileSync('docs/contracts/composition-v1.schema.json','utf8'));
 assert.equal(schema.$ref,'#/$defs/CompositionDocument');
 assert.equal(schema.$defs.CompositionDocument.properties.scenes.items.$ref,'#/$defs/CompositionScene');
 assert.equal(schema.$defs.CompositionAssetPin.additionalProperties,false);
});
test('real controllers expose read-only preview and reject unavailable media publish',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'r2-ext01-api-'));
 const db=openProjectDb(join(dir,'db.sqlite'));
 try{
  const repo=new StudioRepository(db),manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
  const channel=repo.createChannel({name:'API fixture'}),video=repo.createVideo(channel.id,{title:'Video'});
  repo.replaceScenes(video.id,{rowVersion:1,scenes:[{text:'Xin chào Việt Nam!',durationMs:1200,mediaType:'image_motion'}]});
  const controller=createControllers({repo,store:null,registry:{localVoiceDefaults:{},list:()=>[]},manifest});
  const preview=await controller.previewComposition(video.id,{});
  assert.equal(preview.readiness.ready,false);
  assert.deepEqual(await controller.compositionHistory(video.id),{items:[]});
  await assert.rejects(controller.publishComposition(video.id,{expectedDigest:preview.digest,expectedVideoRowVersion:preview.source.videoRowVersion}),{code:'COMPOSITION_ASSETS_NOT_READY'});
  assert.equal(db.prepare('SELECT count(*) n FROM composition_revisions').get().n,0);
 }finally{db.close();await rm(dir,{recursive:true,force:true})}
});
