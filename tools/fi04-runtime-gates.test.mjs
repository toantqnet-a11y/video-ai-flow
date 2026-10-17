import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyDependencyGate,safeGateReportPath,acceptanceStatus,inspectRuntime,moduleInstalled} from './fi04-runtime-gates.mjs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
test('FI-04-02 missing lock/dependencies are BLOCKED, not PASS',()=>{
 assert.equal(classifyDependencyGate({lockStatus:'BLOCKED',installed:true}),'BLOCKED');
 assert.equal(classifyDependencyGate({lockStatus:'PASS',installed:false}),'BLOCKED');
 assert.equal(classifyDependencyGate({lockStatus:'FAIL',installed:true}),'FAIL');
 assert.equal(classifyDependencyGate({lockStatus:'PASS',installed:true}),'PASS');
});
test('FI-04-02 reports cannot escape evidence folder',()=>{
 assert.match(safeGateReportPath(root,'docs/evidence/FI04_runtime.json'),/FI04_runtime\.json$/);
 for(const invalid of ['docs/../package.json','./docs/evidence/../WORKLOG.md','docs/evidence/.','/tmp/report.json'])assert.throws(()=>safeGateReportPath(root,invalid));
});
test('FI-04-03 runtime verdict cannot be PASS if HTTP or Vite blocked',()=>{
 assert.equal(acceptanceStatus({frontend:{status:'PASS'},liveHttp:{status:'BLOCKED'}}),'NOT_READY');
 assert.equal(acceptanceStatus({frontend:{status:'PASS'},liveHttp:{status:'PASS'}}),'PASS');
});
test('FI-04-02 inspects real workspace without modifying it',async()=>{
 const value=await inspectRuntime(root);
 assert.ok(['PASS','BLOCKED','FAIL'].includes(value.lock.status));
 assert.ok(['PASS','BLOCKED','FAIL'].includes(value.hyperframes.status));
 assert.equal(typeof moduleInstalled(join(root,'apps','web'),'vite'),'boolean');
});
