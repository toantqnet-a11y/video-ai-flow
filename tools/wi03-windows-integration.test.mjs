/** WI-03: the hosted Windows gate must fail closed; production stays NOT_READY. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateWi03} from './wi03-windows-integration.mjs';

const green={platform:'win32',frontendBuild:true,realSocket:{status:'PASS'},browser:{status:'PASS'}};

test('Windows build, real TCP socket and React DOM are all required',()=>{
  const result=evaluateWi03(green);
  assert.equal(result.status,'HOSTED_WINDOWS_RUNTIME_VERIFIED');
  assert.equal(result.productionRelease,'NOT_READY');
  assert(Object.values(result.gates).every(x=>x.status==='PASS'));
});
test('Non-Windows cannot claim Windows runtime acceptance',()=>{
  assert.equal(evaluateWi03({...green,platform:'linux'}).status,'BLOCKED');
});
test('Browser not installed is a blocker, not a pass',()=>{
  assert.equal(evaluateWi03({...green,browser:{status:'BLOCKED'}}).status,'BLOCKED');
});
test('Real HTTP failure is a hard failure',()=>{
  assert.equal(evaluateWi03({...green,realSocket:{status:'FAIL'}}).status,'FAIL');
});
test('Static index without successful React browser rendering is insufficient',()=>{
  assert.equal(evaluateWi03({...green,browser:{status:'FAIL'},frontendBuild:false}).status,'FAIL');
});
