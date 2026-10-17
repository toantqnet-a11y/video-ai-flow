import test from 'node:test';
import assert from 'node:assert/strict';
import {assessLongVideo} from './fi0406-long-render.mjs';
import {simulateProcessDeath,verifyRecoveredJob} from './fi0407-recovery.mjs';
import {safeLoopbackPort,providerInventory,inspectLocalProviders} from './fi0408-provider-e2e.mjs';
import {classifySecurityAcceptance} from './fi0409-security-performance.mjs';
import {decideRelease} from './fi0410-final-release.mjs';
import {options,sanitizeError} from './fi04-final-gate-core.mjs';
const record={platform:'win32',cliReady:true,job:{status:'succeeded',kind:'render:hyperframes'},result:{engine:'hyperframes',music:{sha256:'a'},subtitles:{cueCount:10}},
 composition:{totalFrames:63000,profile:{fps:30,width:1920,height:1080},scenes:[1,2,3,4,5]},metadata:{frameCount:63000,videoCodec:'h264',audioCodec:'aac'},quality:{passed:true},checksumMatch:true,subtitlesMatch:true,elapsedMs:300,monitorSamples:3};
test('FI0406 real render needs every independent evidence gate',()=>assert.equal(assessLongVideo(record).status,'PASS'));
for(const [k,v] of [['platform','linux'],['cliReady',false],['job',{status:'succeeded',kind:'render:ffmpeg'}],['result',{engine:'ffmpeg',music:{},subtitles:{cueCount:10}}],
 ['composition',{totalFrames:63000,profile:{fps:30,width:640,height:360},scenes:[1,2,3,4,5]}],['metadata',{frameCount:62999,videoCodec:'h264',audioCodec:'aac'}],
 ['quality',{passed:false}],['checksumMatch',false],['subtitlesMatch',false],['monitorSamples',1]])
 test(`FI0406 blocks counterfeit/missing ${k}`,()=>assert.equal(assessLongVideo({...record,[k]:v}).status,'NOT_READY'));
test('FI0407 expired lease, process death and stale-token fencing work on actual SQLite child process',async()=>{
 const result=await simulateProcessDeath();assert.equal(result.checks.staleLeaseCannotCommit,true);assert.equal(result.attempts,2);
 assert.equal(result.provesActualLongRender,false);assert.equal(result.releaseGateSatisfied,false);
});
test('FI0407 synthetic success is not accepted if lease recovery missing',()=>{
 assert.equal(verifyRecoveredJob({job:{kind:'render:hyperframes',status:'succeeded'},attempts:[{outcome:'succeeded'}],events:[]}).status,'NOT_READY');
});
test('FI0408 only valid numeric loopback ports are accepted',()=>{
 for(const x of ['80','0','65536','foo','1234/path','127.0.0.1:8188'])assert.throws(()=>safeLoopbackPort(x));
 assert.equal(safeLoopbackPort('8188'),8188);
});
test('FI0408 happy endpoint handshake still cannot claim AI model inference',()=>{
 const inv=providerInventory({ollama:true,comfyui:true});assert.equal(inv.gates.ollamaHandshake,'PASS');assert.equal(inv.actualInferenceVerified,false);assert.equal(inv.status,'NOT_READY');
});
test('FI0408 calls only loopback read-only fixed endpoints',async()=>{
 const seen=[],fake=async url=>{seen.push(url);return {ok:true,headers:new Map(),text:async()=>url.includes('tags')?'{"models":[]}':'{"system":{},"devices":[]}'}};
 const inv=await inspectLocalProviders({ollamaPort:11434,comfyPort:8188,fetchImpl:fake});
 assert.deepEqual(seen,['http://127.0.0.1:11434/api/tags','http://127.0.0.1:8188/system_stats']);
 assert.equal(inv.gates.comfyUiHandshake,'PASS');assert.equal(inv.status,'NOT_READY');
});
test('FI0409 local regression PASS cannot certify Windows or dependency audit',()=>{
 const inv=classifySecurityAcceptance({lock:'PASS',localTests:'PASS',npmAudit:'PASS'});
 assert.equal(inv.gates.securityRegression,'PASS');assert.equal(inv.status,'NOT_READY');assert.equal(inv.gates.windowsSecretExposureReview,'BLOCKED');
});
test('FI0410 final release blocks all gates without a witnessed live record',()=>{
 const x=decideRelease({fullGreenSuite:'PASS'});assert.equal(x.status,'NOT_READY');assert.equal(x.blocked.length,9);
});
test('FI04 report args reject unknown & duplicate switches',()=>{
 assert.throws(()=>options(['--inspect','--inspect'],['inspect']));assert.throws(()=>options(['--evil'],['inspect']));
 assert.match(sanitizeError(Object.assign(new Error(),{code:'BAD/path'})),/^BAD_/);
});
