import test from 'node:test';
import assert from 'node:assert/strict';
import {operations,schemas} from '../../../packages/contracts/src/catalog.mjs';
import {readFileSync} from 'node:fs';
test('R3-02/04 authenticated GET manifest and PATCH order use typed request/response',()=>{
 const manifest=operations.find(o=>o.id==='getTimelineManifestR302'),reorder=operations.find(o=>o.id==='reorderTimelineR304');
 assert.deepEqual([manifest.method,manifest.path],['GET','/api/videos/:id/timeline/manifest']);
 assert.deepEqual([reorder.method,reorder.path],['PATCH','/api/videos/:id/timeline/order']);
 assert.deepEqual(schemas.TimelineReorderInput.required,['expectedRowVersion','sceneOrder']);
 assert.notEqual(manifest.public,true);assert.notEqual(reorder.public,true);
 for(const file of ['apps/api/src/routes.mjs','apps/api/src/controllers.mjs','apps/web/src/TimelineEditorR302.jsx']){
  assert.ok(readFileSync(file,'utf8').includes('timeline/manifest')||readFileSync(file,'utf8').includes('timelineManifest'));
 }
});
