/** Acceptance policy regression: real OS/media artifacts never equal release approval. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifiedEvidenceFile} from './fi04-final-gate-core.mjs';
import {inspectRecoveredMedia} from './fi0407-recovery.mjs';
import {inspectExistingLocalVoice} from './fi0408-provider-e2e.mjs';
import {classifyHostedMatrix} from './fi0410-hosted-matrix.mjs';
test('FI0406: only a canonical local immutable media file is accepted',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fi04-hosted-files-'));
 try{
  await mkdir(join(root,'renders'));await writeFile(join(root,'renders','real.mp4'),Buffer.alloc(512));
  const good=await verifiedEvidenceFile(root,'renders/real.mp4');assert.equal(good.bytes,512);
  for(const path of ['../secret.mp4','/tmp/secret.mp4','renders/../../secret.mp4','renders\\back.mp4'])
   await assert.rejects(()=>verifiedEvidenceFile(root,path));
  await symlink(join(root,'renders','real.mp4'),join(root,'renders','alias.mp4'));
  await assert.rejects(()=>verifiedEvidenceFile(root,'renders/alias.mp4'));
 }finally{await rm(root,{recursive:true,force:true})}
});
test('FI0407: no synthetic recovery can masquerade as actual output',async()=>{
 const x=await inspectRecoveredMedia({root:'/tmp/invalid',job:{kind:'render:hyperframes',status:'succeeded',result:{engine:'hyperframes'}}});
 assert.equal(x.status,'BLOCKED');
});
test('FI0408: an existing local file never proves inference or Vietnamese speech',async()=>{
 const x=await inspectExistingLocalVoice({dataRoot:'/tmp/invalid',relativeVoicePath:'../secret.mp3'});
 assert.equal(x.status,'BLOCKED');
});
test('FI0410: hosted Windows CI PASS does not bypass manual or local provider gates',()=>{
 const x=classifyHostedMatrix({hostedWindows:true,frontendAndApi:true,media14s:true,
  focusedTests:true,syntheticRecovery:true,securityRegression:true,npmAudit:true});
 assert.equal(x.releaseStatus,'NOT_READY');
 assert.equal(x.gates.windows11AuthenticatedTimeline,'BLOCKED');
 assert.equal(x.gates.longFullHd35Min,'BLOCKED');
 assert.equal(x.gates.witnessedLongRenderRecovery,'BLOCKED');
 assert.equal(x.gates.realAiInference,'BLOCKED');
 assert.equal(x.gates.manualAudioVideoApproval,'BLOCKED');
 assert.equal(x.hostedTechnicalStatus,'PASS');
 assert.equal(classifyHostedMatrix({hostedWindows:false,frontendAndApi:true}).hostedTechnicalStatus,'PARTIAL');
});

test('FI0408: local WAV metadata is evidence of bytes only, never provider inference',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fi04-voice-probe-'));
 try{
  await writeFile(join(root,'demo.wav'),Buffer.alloc(512));
  const result=await inspectExistingLocalVoice({dataRoot:root,relativeVoicePath:'demo.wav',
    probe:async()=>({audioCodec:'pcm_s16le',durationSeconds:1.2})});
  assert.equal(result.status,'LOCAL_AUDIO_FILE_VERIFIED');
  assert.equal(result.actualInferenceVerified,false);
  assert.equal(result.requiresHumanVietnameseAudioApproval,true);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('FI0407: pure media QA needs 35m, codec and real bytes even after succeeded queue',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fi04-recovery-probe-'));
 try{
  const bytes=Buffer.alloc(512);await writeFile(join(root,'final.mp4'),bytes);
  const job={kind:'render:hyperframes',status:'succeeded',result:{engine:'hyperframes',relativePath:'final.mp4',bytes:bytes.length}};
  const good=await inspectRecoveredMedia({root,job,probe:async()=>({durationSeconds:2100,frameCount:63000,videoCodec:'h264',audioCodec:'aac'})});
  assert.equal(good.status,'MEDIA_INTEGRITY_PASS'); // Pure injected probe, NEVER operator/release evidence.
  const bad=await inspectRecoveredMedia({root,job,probe:async()=>({durationSeconds:12,frameCount:360,videoCodec:'h264',audioCodec:'aac'})});
  assert.equal(bad.status,'BLOCKED');
 }finally{await rm(root,{recursive:true,force:true})}
});
