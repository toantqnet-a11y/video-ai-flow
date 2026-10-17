import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVisualPrompts} from './scene-editor.mjs';
const scenes=[{sourceStart:0,sourceEnd:10,text:'same',visualPrompt:'Original designer prompt'},
  {sourceStart:10,sourceEnd:21,text:'same',visualPrompt:''},{sourceStart:21,sourceEnd:29,text:'same',visualPrompt:''}];
const run={status:'succeeded',stale:false,items:[{index:0,prompt:'Replace'},{index:1,prompt:'AI Proposal'},{index:2,prompt:'Next'}],
  sceneRefs:scenes.map((s,index)=>({index,sourceStart:s.sourceStart,sourceEnd:s.sourceEnd,text:s.text??'same'}))};
test('R2-02 cannot overwrite manually edited prompt and only changes local draft',()=>{
  const result=applyVisualPrompts(scenes,run);
  assert.equal(result.applied,2);assert.equal(result.skipped,1);
  assert.equal(result.scenes[0].visualPrompt,'Original designer prompt');
  assert.equal(result.scenes[1].visualPrompt,'AI Proposal');
  assert.equal(scenes[1].visualPrompt,'');
});
test('R2-02 rejects stale proposals and moved/split text source references',()=>{
  assert.equal(applyVisualPrompts(scenes,{...run,stale:true}).applied,0);
  assert.equal(applyVisualPrompts(scenes,{...run,status:'queued'}).applied,0);
  const result=applyVisualPrompts([{...scenes[0]},{...scenes[1],sourceEnd:20},scenes[2]],run);
  assert.equal(result.applied,1);assert.equal(result.skipped,2);
  assert.equal(applyVisualPrompts([{...scenes[0]},{...scenes[1],text:'changed'},{...scenes[2]}],run).applied,1);
});
