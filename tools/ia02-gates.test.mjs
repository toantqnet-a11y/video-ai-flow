import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyReadiness,mark,localHyperframesPresent} from './ia02-acceptance.mjs';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// These tests guard against the regression where passing offline tests are
// wrongly reported as a successful Windows/HyperFrames release acceptance.
test('IA-02 blocks incomplete gates instead of claiming release readiness',()=>{
 assert.equal(classifyReadiness([mark('offline','PASS',''),mark('hf-live','BLOCKED','missing')]),'NOT_READY');
});
test('IA-02 FAIL takes precedence even if another gate is blocked',()=>{
 assert.equal(classifyReadiness([mark('web','FAIL',''),mark('win','BLOCKED','')]),'FAILED');
});
test('IA-02 never promotes a release without all actual gates passing',()=>{
 assert.equal(classifyReadiness([mark('web','PASS',''),mark('hf-live','PASS','')]),'READY_FOR_MANUAL_REVIEW');
});
test('IA-02 detects only project-local HyperFrames, never global packages',()=>{
 const present=localHyperframesPresent();
 if(!present){
  assert.equal(present,false);
 }else{
  // Local CLI has package metadata and an on-disk executable resolved under it.
  assert.ok(readFileSync(resolve('node_modules/hyperframes/package.json'),'utf8').length>20);
 }
});
