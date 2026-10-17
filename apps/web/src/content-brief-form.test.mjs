import test from 'node:test';import assert from 'node:assert/strict';
import {previewBrief,estimateDraft,draftErrors} from './content-brief-form.mjs';
const brief={topic:'AI và cuộc sống',idea:'',sourceText:'',freePrompt:'',styleOverrides:{tone:'ấm áp'},modelIds:['a'],target:{mode:'duration',durationMinutes:35,wordCount:2000,wpm:145,chapterTargetWords:1100}};
test('R1-01 UI estimate 35 minutes 145wpm and safely preview inherited settings',()=>{
 const x=estimateDraft(brief);assert.equal(x.targetWords,5075);assert.equal(x.chapterCount,5);
 const p=previewBrief(brief,{tone:'cứng nhắc',style:'giải thích'});assert.match(p,/ấm áp/);assert.match(p,/giải thích/);assert.ok(!p.includes('system:'));
 assert.deepEqual(draftErrors(brief),[]);
});
test('R1-01 UI validation rejects no topic and no model',()=>{
 const x={...brief,topic:'',modelIds:[],target:{...brief.target,durationMinutes:200}};assert.equal(draftErrors(x).length,3);
});
