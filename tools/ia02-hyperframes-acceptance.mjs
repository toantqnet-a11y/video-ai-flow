/**
 * IA-02 live HyperFrames gate. Runs the selected production renderer on real
 * local PNG/WAV fixtures through the same persisted queue as the API.
 * Never substitutes FFmpeg, never calls a network provider or uses npx.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm,copyFile,mkdir,stat,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareFiveSceneAcceptance} from './integration-acceptance.mjs';
import {probeMp4,checkMp4Quality} from '../packages/core/src/render-ffmpeg-r2ext04.mjs';
import {JobStore} from '../spikes/SP-04/src/store.js';
import {JobRunner} from '../spikes/SP-04/src/runner.js';

const digest=data=>createHash('sha256').update(data).digest('hex');
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));

export async function runIa02HyperframesAcceptance({outputPath=null,maxWaitMs=300000}={}){
 const dir=await mkdtemp(join(tmpdir(),'contentstudio-ia02-hf-'));
 let session,runner;
 try{
  session=await prepareFiveSceneAcceptance({dataRoot:dir,profile:'portrait-hd'});
  const {renderer,video,publication,composition,store,dbPath}=session;
  const queued=await renderer.enqueue(video.id,{requestKey:'ia02-real-hyperframes',revision:publication.revision});
  assert.equal(queued.reused,false);
  const duplicate=await renderer.enqueue(video.id,{requestKey:'ia02-real-hyperframes',revision:publication.revision});
  assert.equal(duplicate.reused,true);
  assert.equal(duplicate.job.id,queued.job.id);
  assert.equal(store.get(queued.job.id).kind,'render:hyperframes','Never silently switch engine');
  runner=new JobRunner(store,{'render:hyperframes':renderer.handler('hyperframes')},{concurrency:1,pollMs:50,heartbeatMs:1000});
  runner.start();
  let state;
  const deadline=Date.now()+maxWaitMs;
  do{
   await sleep(250);
   state=renderer.job(video.id,queued.job.id);
   if(['succeeded','failed','cancelled'].includes(state.status))break;
  }while(Date.now()<deadline);
  assert.equal(state?.status,'succeeded',`HyperFrames render did not succeed: ${state?.status??'timeout'} (${store.get(queued.job.id)?.last_error_code??'unknown'})`);
  await runner.stop();runner=null;
  const artifact=store.get(queued.job.id).result;
  assert.equal(artifact.engine,'hyperframes');
  const source=join(dir,artifact.relativePath);
  const qa=checkMp4Quality(await probeMp4(source),composition);
  assert.equal(qa.passed,true,JSON.stringify(qa));
  assert.equal((await stat(source)).size,artifact.bytes);
  const fileSha=digest(await readFile(source));
  if(outputPath){await mkdir(dirname(resolve(outputPath)),{recursive:true});await copyFile(source,resolve(outputPath));}
  // A successful job remains completed after durable SQLite recovery.
  store.close();session.store=null;
  session.db.close();session.db=null;
  const reopened=new JobStore({path:dbPath});
  try{assert.equal(reopened.get(queued.job.id).status,'succeeded');}
  finally{reopened.close();}
  return {status:'PASS',engine:'hyperframes',sceneCount:composition.scenes.length,
   frames:composition.totalFrames,sha256:fileSha,mp4Bytes:artifact.bytes,
   localFixturesOnly:true,paidApiCalls:0,idempotencyVerified:true,
   persistedQueueVerified:true,outputPath:outputPath?resolve(outputPath):null};
 }finally{
  if(runner)await runner.stop({abort:true});
  session?.store?.close();session?.db?.close();
  await rm(dir,{recursive:true,force:true});
 }
}
