import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {keepCurrentRenderJob,hydrateRenderHistory,reconcileRenderHistory} from './render-job-sync.mjs';
const job=(id,status)=>({id,status});
test('pending old HTTP/SSE job cannot override newly queued explicit render',()=>{
 const second=job('second','queued'),lateOld=job('first','succeeded');
 assert.strictEqual(keepCurrentRenderJob(second,lateOld,'first'),second);
 assert.strictEqual(keepCurrentRenderJob(second,job('wrong','failed'),'second'),second);
 assert.strictEqual(keepCurrentRenderJob(null,second,'second'),null);
 assert.deepEqual(keepCurrentRenderJob(second,job('second','running'),'second'),job('second','running'));
});
test('late polling response cannot regress succeeded or cancelled output',()=>{
 const ready=job('one','succeeded');
 assert.strictEqual(keepCurrentRenderJob(ready,job('one','running'),'one'),ready);
 assert.strictEqual(keepCurrentRenderJob(job('one','failed'),job('one','queued'),'one').status,'failed');
 assert.strictEqual(keepCurrentRenderJob(job('one','cancelled'),job('one','running'),'one').status,'cancelled');
 assert.strictEqual(keepCurrentRenderJob(ready,job('one','failed'),'one'),ready);
});
test('late render-history hydration cannot replace a job queued after mount',()=>{
 const current=job('fresh','queued');
 assert.strictEqual(hydrateRenderHistory(current,[job('older','succeeded')]),current);
 assert.deepEqual(hydrateRenderHistory(null,[job('older','succeeded')]),job('older','succeeded'));
 assert.equal(hydrateRenderHistory(null,[]),null);
});
test('durable history reconciliation updates the selected active job without changing its identity',()=>{
 const now=job('new','running'),completed=job('new','succeeded'),older=job('old','succeeded');
 assert.deepEqual(reconcileRenderHistory(now,[completed,older]),completed);
 assert.strictEqual(reconcileRenderHistory(older,[completed,older]),older);
 assert.strictEqual(reconcileRenderHistory(now,[older]),now);
 assert.deepEqual(reconcileRenderHistory(null,[completed]),completed);
 assert.strictEqual(reconcileRenderHistory(completed,[now]),completed);
});
test('Timeline auto-polls safe job IDs, refreshes visible tab and cleans up',async()=>{
 const content=await readFile(new URL('./TimelineRenderWorkspace.jsx',import.meta.url),'utf8');
 const drawer=await readFile(new URL('./RenderDrawerR312.jsx',import.meta.url),'utf8');
 assert.match(content,/setRender\(current=>keepCurrentRenderJob\(current,out,watchedId\)\)/);
 assert.match(content,/document\.addEventListener\('visibilitychange',onVisible\)/);
 assert.match(content,/abort\.abort\(\);clearInterval\(timer\)/);
 assert.match(content,/setRender\(current=>hydrateRenderHistory\(current,items\)\)/);
 assert.match(content,/setRender\(current=>reconcileRenderHistory\(current,items\)\)/);
 assert.match(drawer,/setRender\(current=>keepCurrentRenderJob\(current,out,watchedId\)\)/);
});
