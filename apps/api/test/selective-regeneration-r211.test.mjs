/** Public route/SDK drift is checked without live provider access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {operations,schemas} from '../../../packages/contracts/src/catalog.mjs';
import {createStudioClient} from '../../../packages/sdk/src/client.mjs';

test('R2-11 explicit request & voice restore are authenticated POST contract operations',()=>{
 const a=operations.find(o=>o.id==='selectiveRegenerate');
 const b=operations.find(o=>o.id==='selectSceneVoice');
 assert.deepEqual([a.method,a.path],['POST','/api/scenes/:id/assets/regenerate']);
 assert.deepEqual([b.method,b.path],['POST','/api/scenes/:id/voice/select']);
 assert.notEqual(a.public,true); // must not be a public unauthenticated route
 assert.notEqual(b.public,true);
 assert.deepEqual(schemas.SelectiveRegenerateInput.required,
  ['kind','requestKey','expectedRowVersion','options']);
 assert.equal(schemas.SelectiveRegenerateInput.additionalProperties,false);
 assert.equal(schemas.SelectiveRegenerateInput.properties.kind.enum.includes('video'),false);
 assert.equal(schemas.SceneVoiceSelect.required.includes('expectedRowVersion'),true);
});

test('R2-11 no extra paid router or queue: only main controllers and existing SP-04',()=>{
 const routes=readFileSync('apps/api/src/routes.mjs','utf8');
 const core=readFileSync('packages/core/src/selective-regeneration-r211.mjs','utf8');
 assert.equal(routes.includes("controllers.selectiveRegenerate(req.params.id,req.body)"),true);
 assert.equal(core.includes('new JobStore'),false);
 assert.equal(core.includes('remoteConsent:true'),false);
 assert.equal(core.includes('sceneVoices.queue'),true);
 assert.equal(core.includes('sceneImages.queue'),true);
});
