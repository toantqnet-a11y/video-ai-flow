import test from 'node:test';import assert from 'node:assert/strict';
import {moveDraft,splitDraft,mergeDraft} from './scene-editor.mjs';
const scene={sourceStart:0,sourceEnd:22,text:'Một câu chuyện rất hay.',durationMs:5000,mediaType:'image_motion',visualPrompt:''};
test('reorder controls preserve all segments without data loss',()=>{
 const list=[{...scene,id:1},{...scene,id:2},{...scene,id:3}];
 assert.deepEqual(moveDraft(list,0,2).map(s=>s.id),[2,3,1]);
 assert.deepEqual(moveDraft(list,-1,2),list);
});
test('UI split and merge round-trip preserves text and source span',()=>{
 const input={...scene,sourceEnd:scene.text.length};
 const parts=splitDraft([input],0);assert.equal(parts.length,2);
 assert.equal(parts.map(s=>s.text).join(''),input.text);
 assert.deepEqual(mergeDraft(parts,0).map(s=>s.text),[input.text]);
});
