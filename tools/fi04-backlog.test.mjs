import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseVideoRoadmap,mergeBacklog,expectedVideoIds} from './fi04-backlog.mjs';
const get=async path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('FI-04 backlog: roadmap has 14 unambiguous AI video tasks with dependencies',async()=>{
 const tasks=parseVideoRoadmap(await get('docs/reference/VIDEO_AI_FLOW_EXECUTION_PLAN_V3.md'));
 assert.equal(tasks.length,14);assert.deepEqual(tasks.map(x=>x.id),expectedVideoIds);
 assert.equal(tasks.find(x=>x.id==='R0-VID-01').status,'CODE_COMPLETE_TESTED_OFFLINE__PROVIDER_REAL_BLOCKED');
 assert.ok(tasks.find(x=>x.id==='R2-VID-04').dependsOn.includes('R2-VID-02'));
 assert.ok(tasks.find(x=>x.id==='R3-VID-03').dependsOn.includes('R3-14'));
 assert.ok(tasks.find(x=>x.id==='R4-VID-02').status.includes('PAID_OFF'));
});
test('FI-04 backlog preserves every old task and refuses duplicate IDs or missing roadmap',async()=>{
 const base=JSON.parse(await get('docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json'));
 const video=parseVideoRoadmap(await get('docs/reference/VIDEO_AI_FLOW_EXECUTION_PLAN_V3.md'));
 const merged=mergeBacklog(base,video);
 assert.equal(merged.taskCount,base.tasks.length+27);assert.equal(new Set(merged.tasks.map(x=>x.id)).size,merged.taskCount);
 assert.deepEqual(merged.tasks.slice(0,base.tasks.length),base.tasks);
 assert.equal(merged.groups.windowsAcceptance,3);
 assert.equal(merged.releaseStatus,'NOT_READY');
 assert.equal(merged.tasks.find(x=>x.id==='FI-04-04').status,'HOSTED_WINDOWS_REAL_HYPERFRAMES_MP4_AUTOMATION_PASS__MANUAL_AV_REVIEW_PENDING');
 assert.ok(merged.statusEvidence.fi0404WindowsHosted.includes('39022682686'));
 assert.equal(merged.tasks.find(x=>x.id==='FI-04-05').status,'HOSTED_WINDOWS_TIMELINE_REGRESSIONS_PASS__AUTHENTICATED_UX_PENDING');
 assert.equal(merged.tasks.find(x=>x.id==='FI-04-10').status,'HOSTED_WINDOWS_FAIL_CLOSED_RELEASE_MATRIX_PASS__NOT_READY');
 assert.ok(merged.statusEvidence.fi0405to10WindowsHosted.includes('39024552073'));
 assert.equal(merged.tasks.at(-1).id,'WI-03');
 assert.throws(()=>mergeBacklog({...base,tasks:[...base.tasks,video[0]]},video),/DUPLICATE/);
 assert.throws(()=>parseVideoRoadmap(''),/INCOMPLETE/);
});
test('FI-04 backlog output matches generated artifact',async()=>{
 const base=JSON.parse(await get('docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json'));
 const video=parseVideoRoadmap(await get('docs/reference/VIDEO_AI_FLOW_EXECUTION_PLAN_V3.md'));
 assert.deepEqual(JSON.parse(await get('docs/VIDEO_AI_FLOW_MASTER_BACKLOG.json')),mergeBacklog(base,video));
});
