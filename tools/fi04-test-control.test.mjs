import test from 'node:test';
import assert from 'node:assert/strict';
import {tapSummary,completedGreen,testArguments,runTestGroup} from './fi04-test-control.mjs';

test('FI-04-01 TAP parser rejects truncated and inconsistent reports',()=>{
 const good='# Subtest: demo\nok 1 - demo\n1..1\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n';
 assert.deepEqual(tapSummary(good),{tests:1,pass:1,fail:0,cancelled:0,skipped:0});
 assert.equal(completedGreen({exitCode:0,completePlan:true},tapSummary(good)),true);
 assert.equal(completedGreen({exitCode:0,completePlan:false},tapSummary(good)),false);
 assert.equal(completedGreen({exitCode:0,completePlan:true},tapSummary('# tests 1\n# pass 1')),false);
 assert.equal(completedGreen({exitCode:0,completePlan:true,timedOut:true},tapSummary(good)),false);
});
test('FI-04-01 validates test-runner argument boundaries',()=>{
 assert.deepEqual(testArguments(['tools/example.test.mjs'],{concurrency:2,perTestTimeoutMs:120000}).slice(0,3),['--test','--test-concurrency=2','--test-timeout=120000']);
 assert.throws(()=>testArguments(['README.md']));assert.throws(()=>testArguments(['a.test.mjs'],{concurrency:3}));
});
test('FI-04-01 watchdog reports real green and rejects a failed test',async()=>{
 const green=await runTestGroup(['tools/fi03-ffmpeg-long-smoke.test.mjs'],{cwd:process.cwd(),timeoutMs:15000,liveOutput:false});
 assert.equal(green.ok,true,JSON.stringify(green));assert.ok(green.summary.tests>0);
 const fail=await runTestGroup(['tools/fixtures/intentional-failure.test.mjs'],{cwd:process.cwd(),timeoutMs:15000,liveOutput:false});
 assert.equal(fail.ok,false);assert.ok(fail.exitCode!==0);
});
