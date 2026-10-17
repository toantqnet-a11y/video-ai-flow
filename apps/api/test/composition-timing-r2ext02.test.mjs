import test from 'node:test';import assert from 'node:assert/strict';
import {operations,schemas} from '../../../packages/contracts/src/catalog.mjs';
import {inspectIncomingRequest} from '../src/request-policy.mjs';
import {readFileSync} from 'node:fs';
test('timing preview and publish are authenticated POSTs; v1 routes still intact',()=>{
 for(const id of ['previewTimedVideoComposition','publishTimedVideoComposition','previewVideoComposition','publishVideoComposition']){
  const op=operations.find(x=>x.id===id);assert.equal(op.method,'POST');assert.notEqual(op.public,true);
 }
 const req={method:'POST',url:'/api/videos/id/composition/timing/preview?token=abc',headers:{host:'127.0.0.1:4311'},rawHeaders:['host','127.0.0.1:4311'],socket:{remoteAddress:'127.0.0.1'}};
 assert.equal(inspectIncomingRequest(req,{port:4311,gate:{verifyTransport:()=>null}}),'SECRET_IN_QUERY_FORBIDDEN');
 assert.equal(schemas.TimedCompositionDocument.properties.schemaVersion.const,2);
 const document=JSON.parse(readFileSync('docs/contracts/composition-v2.schema.json','utf8'));
 assert.equal(document.$defs.TimedCompositionScene.properties.timing.$ref,'#/$defs/TimedCompositionTiming');
 assert.equal(document.$defs.TimedCompositionScene.additionalProperties,false);
});

import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {openProjectDb,StudioRepository,AssetManifest} from '../../../packages/core/src/index.mjs';
import {createControllers} from '../src/controllers.mjs';
test('controller exposes v2 without requiring provider or altering v1 preview',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ext02-api-'));
 const db=openProjectDb(join(dir,'db.sqlite'));
 try{
  const repo=new StudioRepository(db),channel=repo.createChannel({name:'Controller timing'});
  const video=repo.createVideo(channel.id,{title:'Script'});
  repo.replaceScenes(video.id,{rowVersion:1,scenes:[{text:'Xin chào Việt Nam!',durationMs:1500,mediaType:'image_motion'}]});
  const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});
  const ctl=createControllers({repo,store:null,registry:{localVoiceDefaults:{},list:()=>[]},manifest});
  const old=await ctl.previewComposition(video.id,{});
  const timed=await ctl.previewTimedComposition(video.id,{});
  assert.equal(old.schemaVersion,1);assert.equal(timed.schemaVersion,2);
  assert.equal(timed.readiness.ready,false);
  await assert.rejects(ctl.publishTimedComposition(video.id,{expectedDigest:timed.digest,expectedVideoRowVersion:timed.source.videoRowVersion}),{code:'COMPOSITION_ASSETS_NOT_READY'});
  assert.equal(db.prepare('SELECT count(*) n FROM composition_revisions').get().n,0);
 }finally{db.close();await rm(dir,{recursive:true,force:true})}
});
