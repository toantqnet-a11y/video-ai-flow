import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb} from '../packages/core/src/index.mjs';
import {JobStore} from '../spikes/SP-04/src/store.js';
import {evaluateRealRenderEvidence,inspectFi04Hyperframes,prepareFi04QueuedFixture} from './fi04-hyperframes-acceptance.mjs';

const valid={origin:'PROJECT_LOCAL_CLI',rendererVersion:'0.8.159',jobKind:'render:hyperframes',jobStatus:'succeeded',sceneCount:5,
 subtitleCueCount:10,expectedFrames:360,metadata:{videoCodec:'h264',audioCodec:'aac',frameCount:360},qa:{passed:true},
 musicEnabled:true,sourceSrtVerified:true,checksumVerified:true};

test('FI-04-04 proof requires every real-render invariant and is not only a completed queue',()=>{
 assert.equal(evaluateRealRenderEvidence(valid).passed,true);
 for(const [key,replacement] of [
  ['origin','MOCK'],['rendererVersion','0.8.158'],['jobKind','render:ffmpeg'],
  ['jobStatus','failed'],['sceneCount',1],['subtitleCueCount',2],['musicEnabled',false],
  ['sourceSrtVerified',false],['checksumVerified',false],['expectedFrames',361]]){
  assert.equal(evaluateRealRenderEvidence({...valid,[key]:replacement}).passed,false,key);
 }
 assert.equal(evaluateRealRenderEvidence({...valid,metadata:{...valid.metadata,audioCodec:'mp3'}}).passed,false);
 assert.equal(evaluateRealRenderEvidence({...valid,qa:{passed:false}}).passed,false);
});
test('FI-04-04 inspector never pretends that package pin implies rendered MP4',async()=>{
 const r=await inspectFi04Hyperframes();
 assert.equal(r.rendererPin,'0.8.159');
 assert.ok(['PREREQUISITES_PRESENT','BLOCKED','FAIL'].includes(r.status));
 assert.ok(!Object.hasOwn(r,'releaseGateSatisfied'));
});
test('FI-04-04 read-only CLI inspect is not release approval; invalid arguments fail',()=>{
 const cwd=new URL('../',import.meta.url);
 const a=spawnSync(process.execPath,['tools/fi04-hyperframes-acceptance.mjs','--inspect'],{cwd,encoding:'utf8',timeout:25000});
 assert.equal(a.status,0,a.stderr);
 const report=JSON.parse(a.stdout);
 assert.equal(report.releaseGateSatisfied,false);
 assert.equal(report.mode,'inspect');
 const bad=spawnSync(process.execPath,['tools/fi04-hyperframes-acceptance.mjs','--unsupported'],{cwd,encoding:'utf8',timeout:25000});
 assert.notEqual(bad.status,0);
});
test('FI-04-04 operator runner is pinned-only, no mocked fallback or implicit npx',async()=>{
 const source=await readFile(new URL('./fi04-hyperframes-acceptance.mjs',import.meta.url),'utf8');
 const production=await readFile(new URL('../apps/api/src/render-export-r2ext0406.mjs',import.meta.url),'utf8');
 assert.match(source,/runner=new JobRunner\(store,\{'render:hyperframes':renderer\.handler\('hyperframes'\)\}/);
 assert.match(source,/await findHyperframesCli\(\)/);
 assert.doesNotMatch(source,/(?:spawnSync|execFileSync)\(['"]npx|npm install -g/);
 assert.match(production,/hyperframes:'hyperframes'/);
 assert.doesNotMatch(production,/CONTENTSTUDIO_HYPERFRAMES_BIN/);
});

test('FI-04-04 actual offline SQLite fixture queues five scenes with pinned music and immutable 10-cue subtitle draft (NOT renderer proof)',{timeout:30000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'fi04-queued-fixture-'));
 let db,store;
 try{
  db=openProjectDb(join(root,'test.db'));
  store=new JobStore({path:join(root,'test.db')});
  const {video,renderer,queued,doc,overrides,saved}=await prepareFi04QueuedFixture({root,db,store});
  assert.equal(doc.scenes.length,5);
  assert.equal(overrides.length,5);
  assert.equal(overrides.flatMap(x=>x.cues).length,10);
  assert.equal(saved.revision,1);
  assert.equal(queued.job.kind,'render:hyperframes');
  const row=db.prepare('SELECT payload_json FROM render_snapshots WHERE job_id=?').get(queued.job.id);
  assert.ok(row);
  const snapshot=JSON.parse(row.payload_json);
  assert.equal(snapshot.subtitleDraft.revision,1);
  assert.ok(snapshot.music.pin.sha256);
  assert.equal(renderer.job(video.id,queued.job.id).status,'pending');
  // This is deliberately an OFFLINE QUEUE test; never claim rendered output.
 }finally{store?.close();db?.close();await rm(root,{recursive:true,force:true});}
});
