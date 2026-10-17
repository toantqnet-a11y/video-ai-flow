/**
 * R1-08 — deterministic, privacy-safe long-form CONTENT readiness audit.
 * Purpose: measure coverage, length drift and exact repetitions before R2
 * scene splitting. This is NOT an LLM fact-check, editorial score or TTS
 * timing validation; only measured audio can certify video duration.
 * Never include raw script/prompt/summary in report output or logs.
 */
import {createHash} from 'node:crypto';

const digest=s=>createHash('sha256').update(s).digest('hex');
const countWords=s=>s.trim().split(/\s+/u).filter(Boolean).length;
const canon=s=>s.trim().replace(/\s+/gu,' ').toLocaleLowerCase('vi');
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;

/**
 * @param {{modelIds:string[], plannedChapters:{targetWords:number}[],
 * chapters:{modelId:string,chapterIndex:number,text:string,summary:string}[],
 * expectedMinutes:number,wpm:number}} input
 * @returns {object} Metric-only report; never contains generated text.
 */
export function auditLongContent(input){
  if(!input||!Array.isArray(input.modelIds)||input.modelIds.length<1||
     new Set(input.modelIds).size!==input.modelIds.length||
     input.modelIds.some(m=>typeof m!=='string'||!m)||
     !Array.isArray(input.plannedChapters)||input.plannedChapters.length<1||
     input.plannedChapters.some(c=>!integer(c.targetWords,1,20000))||
     !Array.isArray(input.chapters)||!integer(input.wpm,1,500)||
     !Number.isFinite(input.expectedMinutes)||input.expectedMinutes<=0)
    throw new TypeError('INVALID_LONG_CONTENT_AUDIT');
  const plannedWords=input.plannedChapters.reduce((n,c)=>n+c.targetWords,0);
  const groups=[];
  for(const modelId of input.modelIds){
    const rows=input.chapters.filter(c=>c.modelId===modelId);
    const seen=new Set(),indexes=new Set(),paragraphHashes=new Set();
    const flags=new Set(); let words=0, repeatedParagraphs=0;
    for(const row of rows){
      if(!integer(row.chapterIndex,0,input.plannedChapters.length-1)||
         typeof row.text!=='string'||typeof row.summary!=='string')
        throw new TypeError('INVALID_LONG_CONTENT_CHAPTER');
      if(indexes.has(row.chapterIndex))flags.add('DUPLICATE_CHAPTER_INDEX');
      indexes.add(row.chapterIndex);
      const actual=countWords(row.text);words+=actual;
      if(Math.abs(actual-input.plannedChapters[row.chapterIndex].targetWords)/
          input.plannedChapters[row.chapterIndex].targetWords>0.2)
        flags.add('CHAPTER_LENGTH_DRIFT');
      if(!row.summary.trim())flags.add('MISSING_CONTEXT_SUMMARY');
      const chapterHash=digest(canon(row.text));
      if(seen.has(chapterHash))flags.add('EXACT_CHAPTER_DUPLICATE');
      seen.add(chapterHash);
      // This heuristic detects only exact repetition of long paragraphs.
      // Similar-but-paraphrased content requires later editorial/AI review.
      for(const paragraph of row.text.split(/\n\s*\n/u)){
        const normalized=canon(paragraph);
        if(normalized.length<120)continue;
        const hash=digest(normalized);
        if(paragraphHashes.has(hash))repeatedParagraphs++;
        paragraphHashes.add(hash);
      }
    }
    if(indexes.size!==input.plannedChapters.length)flags.add('MISSING_CHAPTERS');
    if(repeatedParagraphs)flags.add('EXACT_PARAGRAPH_REPETITION');
    if(Math.abs(words-plannedWords)/plannedWords>0.2)flags.add('SCRIPT_LENGTH_DRIFT');
    const estimatedMinutes=Number((words/input.wpm).toFixed(2));
    if(Math.abs(estimatedMinutes-input.expectedMinutes)/input.expectedMinutes>0.2)
      flags.add('DURATION_ESTIMATE_DRIFT');
    groups.push({modelId,chapterCount:indexes.size,expectedChapters:input.plannedChapters.length,
      words,plannedWords,estimatedMinutes,warningCodes:[...flags].sort(),
      readiness:flags.size===0?'METRIC_CHECKS_PASS':'REVIEW_REQUIRED'});
  }
  return {wpm:input.wpm,expectedMinutes:input.expectedMinutes,
    modelCount:input.modelIds.length,plannedWords,
    models:groups,semanticQualityVerified:false,ttsDurationVerified:false,
    methodology:'Deterministic structural/length and exact-repeat checks; not a factual or editorial review.'};
}
