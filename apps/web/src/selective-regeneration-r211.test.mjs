import test from 'node:test';import assert from 'node:assert/strict';
import {selectiveBody,assertSourceUnchanged} from './selective-regeneration-view.mjs';
test('explicit single-asset request never includes adjacent scenes or other media',()=>{
 const image=selectiveBody('image',3,{seed:14,width:512,height:512},'click-id');
 assert.deepEqual(Object.keys(image).sort(),['expectedRowVersion','kind','options','requestKey']);
 assert.equal(image.kind,'image');assert.equal(image.expectedRowVersion,3);
 assert.equal(image.requestKey,'click-id');
});
test('invalid kind/row lock/idempotency key cannot produce a request',()=>{
 for(const input of [['video',1,'valid'],['voice',0,'valid'],['image',1,'x y'],['image',2,'']])
  assert.throws(()=>selectiveBody(input[0],input[1],{},input[2]),/INVALID_SELECTIVE_REGENERATION/);
});

test('editor refuses stale scene text/prompt even with a newer rowVersion from another tab',()=>{
 const seen={id:'s1',text:'Old',visualPrompt:'A forest',mediaType:'image_motion',rowVersion:1};
 assert.throws(()=>assertSourceUnchanged(seen,{...seen,text:'Updated',rowVersion:3},'voice'),/SCENE_CHANGED_RELOAD_REQUIRED/);
 assert.throws(()=>assertSourceUnchanged(seen,{...seen,visualPrompt:'City',rowVersion:3},'image'),/SCENE_CHANGED_RELOAD_REQUIRED/);
 assert.doesNotThrow(()=>assertSourceUnchanged(seen,{...seen,rowVersion:3},'image'));
});
