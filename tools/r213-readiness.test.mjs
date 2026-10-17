/** R2-13 readiness must never silently turn offline prerequisites into release sign-off. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {assessR213} from './r213-readiness.mjs';

test('G6 — even all binaries on Windows cannot count as production acceptance',()=>{
  const data=assessR213({platform:'win32',nodeVersion:'v22.16.0',viteAvailable:true,
    ffmpegAvailable:true,ffprobeAvailable:true});
  assert.equal(data.releaseStatus,'NOT_READY');
  assert.equal(data.result,'OFFLINE_VERIFICATION_ONLY');
  assert.equal(data.outstandingGates.length,5);
  assert.ok(data.outstandingGates.every(g=>g.status.startsWith('PENDING_')));
});
test('G6 — missing dependencies visible in snapshot without calling external services',()=>{
  const data=assessR213({platform:'linux',nodeVersion:'v22.16.0'});
  assert.equal(data.prerequisites.viteAvailable,false);
  assert.equal(data.prerequisites.ffmpegAvailable,false);
  assert.match(data.warning,/no AI inference/);
});
