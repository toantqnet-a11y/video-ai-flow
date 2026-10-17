import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {operations,schemas} from '../../../packages/contracts/src/catalog.mjs';

test('R3-01 inspector routes/SDK contract stay local and authenticated',()=>{
 const preview=operations.find(op=>op.id==='previewSceneMutation'),save=operations.find(op=>op.id==='saveSceneMutation');
 assert.deepEqual([preview.method,preview.path],['POST','/api/scenes/:id/impacts']);
 assert.deepEqual([save.method,save.path],['PATCH','/api/scenes/:id']);
 assert.notEqual(preview.public,true);assert.notEqual(save.public,true);
 assert.deepEqual(schemas.SceneMutationInput.required,['expectedRowVersion','patch']);
 assert.equal(schemas.SceneMutationInput.additionalProperties,false);
 assert.equal(schemas.ScenePatch.additionalProperties,false);
 assert.equal(Object.hasOwn(schemas.ScenePatch.properties,'provider'),false);
 const routes=readFileSync('apps/api/src/routes.mjs','utf8');
 assert.match(routes,/controllers\.previewSceneMutation\(req.params.id,req.body\)/);
 assert.match(routes,/controllers\.saveSceneMutation\(req.params.id,req.body\)/);
});
