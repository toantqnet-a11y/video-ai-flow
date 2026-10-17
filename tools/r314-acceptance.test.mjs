import test from 'node:test';import assert from 'node:assert/strict';
import {buildR314Gates,checkLongMp4} from './r314-acceptance.mjs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
test('R3-14: gates cannot mark HyperFrames/Windows/35min PASS on Linux mock only',{timeout:120000},async()=>{
 const report=await buildR314Gates({withMedia:false,withLongPlan:false,withTests:false});
 assert.equal(report.release,'NOT_READY');
 assert.equal(report.gates.find(x=>x.id==='long-mp4-technical-qa').status,'BLOCKED');
 assert.equal(report.gates.find(x=>x.id==='35min-app-job-provenance').status,'BLOCKED');
 assert.equal(report.primaryEngine,'hyperframes');
 assert.equal(report.ffmpegManualFallbackOnly,true);
});
test('R3-14: random .mp4 file does not count as 35-minute proof',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r314-'));try{
  const file=join(root,'video.mp4');await writeFile(file,Buffer.alloc(1000));
  const result=await checkLongMp4(file);assert.equal(result.status,'FAIL');
 }finally{await rm(root,{recursive:true,force:true});}
});
