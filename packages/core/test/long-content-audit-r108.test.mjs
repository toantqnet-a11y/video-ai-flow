/** R1-08: structural QA must be deterministic, advisory and never leak text. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {auditLongContent} from '../src/long-content-audit.mjs';

const input=()=>({modelIds:['model_a','model_b'],expectedMinutes:35,wpm:145,
  plannedChapters:[{targetWords:100},{targetWords:100}],chapters:[
    {modelId:'model_a',chapterIndex:0,text:'A '.repeat(100),summary:'Đầu bài'},
    {modelId:'model_a',chapterIndex:1,text:'B '.repeat(100),summary:'Cuối bài'},
    {modelId:'model_b',chapterIndex:0,text:'C '.repeat(100),summary:'Đầu bài'},
    {modelId:'model_b',chapterIndex:1,text:'D '.repeat(100),summary:'Cuối bài'}]});

test('R1-08 audit returns only metric/warning fields, never script or summary',()=>{
 const result=auditLongContent(input());
 assert.equal(result.modelCount,2);assert.equal(result.models[0].chapterCount,2);
 assert.equal(result.models[0].words,200);
 assert.equal(result.ttsDurationVerified,false);assert.equal(result.semanticQualityVerified,false);
 assert.ok(result.models[0].warningCodes.includes('DURATION_ESTIMATE_DRIFT'));
 assert.doesNotMatch(JSON.stringify(result),/Đầu bài|Cuối bài/);
});

test('R1-08 missing chapters, length drift and missing context flagged without publishing verdict of content quality',()=>{
 const source=input();source.chapters=source.chapters.slice(0,1);
 source.chapters[0].text='Quá ngắn';source.chapters[0].summary='';
 const metrics=auditLongContent(source).models[0];
 assert.ok(metrics.warningCodes.includes('MISSING_CHAPTERS'));
 assert.ok(metrics.warningCodes.includes('CHAPTER_LENGTH_DRIFT'));
 assert.ok(metrics.warningCodes.includes('MISSING_CONTEXT_SUMMARY'));
 assert.ok(metrics.warningCodes.includes('SCRIPT_LENGTH_DRIFT'));
 assert.equal(metrics.readiness,'REVIEW_REQUIRED');
});

test('R1-08 duplicate chapter indexes and identical chapters detected',()=>{
 const source=input(),duplicate=source.chapters[0].text;
 source.chapters[1].text=duplicate;source.chapters[1].chapterIndex=0;
 const warnings=auditLongContent(source).models[0].warningCodes;
 assert.ok(warnings.includes('DUPLICATE_CHAPTER_INDEX'));
 assert.ok(warnings.includes('EXACT_CHAPTER_DUPLICATE'));
 assert.ok(warnings.includes('MISSING_CHAPTERS'));
});

test('R1-08 detects long paragraph reuse but avoids false short-phrase duplicate alerts',()=>{
 const source=input(),paragraph='chi tiết '.repeat(80);
 source.chapters[0].text=paragraph+'\n\n'+paragraph;
 const warnings=auditLongContent(source).models[0].warningCodes;
 assert.ok(warnings.includes('EXACT_PARAGRAPH_REPETITION'));
});

test('R1-08 rejects malformed audit input and never infers actual voice duration',()=>{
 assert.throws(()=>auditLongContent({...input(),wpm:0}),/INVALID_LONG_CONTENT_AUDIT/);
 assert.throws(()=>auditLongContent({...input(),chapters:[{modelId:'model_a',chapterIndex:999,text:'ok',summary:'ok'}]}),/INVALID_LONG_CONTENT_CHAPTER/);
});
