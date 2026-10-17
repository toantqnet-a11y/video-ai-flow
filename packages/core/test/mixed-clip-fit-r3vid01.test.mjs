import test from 'node:test';import assert from 'node:assert/strict';
import {fitSceneClip,resolveClipFit} from '../src/mixed-clip-fit-r3vid01.mjs';
test('R3-VID-01 six-second clip loops within eighteen-second narration, always muted',()=>{
 const opts={startMs:5000,durationMs:18000,sourceDurationMs:6000};
 for(const [absolute,expected] of [[5000,0],[8000,3],[11000,0],[17000,0],[22999,5.96]]){
  const r=fitSceneClip({...opts,positionMs:absolute});
  assert.ok(Math.abs(r.sourceTimeSeconds-expected)<0.0015);
  assert.equal(r.muted,true);assert.equal(r.voiceDurationPreserved,true);
 }
 const last=fitSceneClip({...opts,positionMs:24000});
 assert.equal(last.sceneOffsetMs,18000);
 assert.equal(last.cycles,3);
});
test('R3-VID-01 explicit in/out visual window holds before/after without cutting audio',()=>{
 const o={startMs:0,durationMs:18000,sourceDurationMs:6000,visualInMs:2000,visualOutMs:8000,fit:'hold'};
 assert.equal(fitSceneClip({...o,positionMs:1000}).sourceTimeSeconds,0);
 assert.equal(fitSceneClip({...o,positionMs:3500}).sourceTimeSeconds,1.5);
 const tail=fitSceneClip({...o,positionMs:16000});
 assert.equal(tail.shouldPlay,false);assert.equal(tail.sourceTimeSeconds,5.96);
 assert.equal(tail.muted,true);
 assert.deepEqual(resolveClipFit({durationMs:18000,visualInMs:2000,visualOutMs:8000}),
  {fit:'hold',visualInMs:2000,visualOutMs:8000});
 assert.equal(resolveClipFit({durationMs:18000}).fit,'loop');
});
test('R3-VID-01 reject source missing, zero duration, contradictory trim, unknown fit and unsafe clocks',()=>{
 const valid={positionMs:200,durationMs:800,sourceDurationMs:300,startMs:0};
 for(const change of [{sourceDurationMs:0},{sourceDurationMs:Infinity},{durationMs:-1},
  {visualInMs:600,visualOutMs:500},{visualOutMs:810},{fit:'paid'},{startMs:-2},{positionMs:NaN}]){
  assert.throws(()=>fitSceneClip({...valid,...change}),/CLIP_FIT_INVALID/);
 }
});
