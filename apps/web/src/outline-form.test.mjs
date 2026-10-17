import test from 'node:test';import assert from 'node:assert/strict';
import {outlineStats,moveChapter,outlineClientErrors} from './outline-form.mjs';
test('R1-02 UI drag reorder immutable and keyboard move',()=>{
 const input=[{id:'a',title:'A',objective:'Why',targetWords:500},{id:'b',title:'B',objective:'Why',targetWords:700}];
 const output=moveChapter(input,0,1);assert.deepEqual(output.map(x=>x.id),['b','a']);assert.equal(input[0].id,'a');
 assert.equal(moveChapter(input,-1,2),input);assert.equal(outlineClientErrors(output).length,0);
});
test('R1-02 UI estimation handles long chapter outlines and errors',()=>{
 assert.deepEqual(outlineStats([{targetWords:1500},{targetWords:1500}],150,3200),{words:3000,minutes:20,delta:-200,count:2});
 assert.equal(outlineClientErrors([]).length,1);assert.equal(outlineClientErrors([{id:'a',title:'',objective:'b',targetWords:40}]).length,1);
});
