import test from 'node:test';import assert from 'node:assert/strict';
import {assessHybridVideoGate} from '../src/hybrid-acceptance-r3vid03.mjs';
const pin={sha256:'a'.repeat(64)};
const composition={profile:{width:1920,height:1080,fps:30},totalFrames:63000,
 scenes:['image_motion','ai_video','import_video'].map(mediaType=>({mediaType,voice:{asset:pin},visual:{asset:pin}}))};
const renderMetadata={videoCodec:'h264',audioCodec:'aac',width:1920,height:1080,
 fps:'30/1',frameCount:63000,durationSeconds:2100};
test('R3VID03 gate refuses mock 4s, unlabeled clip or mere FFprobe 35min',()=>{
 const report=assessHybridVideoGate({composition,renderMetadata,paidRequestCount:0});
 assert.equal(report.accepted,false);
 assert(report.blockers.includes('R3VID03_NATIVE_AI_INFERENCE_UNVERIFIED'));
 assert(report.blockers.includes('R3VID03_WINDOWS11_AV_REVIEW_REQUIRED'));
 assert(report.blockers.includes('R3VID03_ACTUAL_RENDER_RESTART_REQUIRED'));
 const short=assessHybridVideoGate({composition:{...composition,totalFrames:120},renderMetadata});
 assert(short.blockers.includes('R3VID03_REAL_35MIN_COMPOSITION_REQUIRED'));
 assert(assessHybridVideoGate({composition:{...composition,scenes:composition.scenes.slice(0,2)},renderMetadata})
  .blockers.includes('R3VID03_MIXED_IMAGE_AI_IMPORT_REQUIRED'));
});
test('R3VID03 gate permits completed independently witnessed evidence only',()=>{
 const a=assessHybridVideoGate({composition,renderMetadata,paidRequestCount:0,verifiedLocalAssets:true,
  windowsOperatorApproved:true,recoveryApproved:true,nativeAiEvidence:{kind:'native_gpu_operator_witnessed',
   providerId:'comfyui-video',assetChecksumVerified:true,checkpointLicenseReviewed:true}});
 assert.equal(a.accepted,true);
 assert.equal(a.actualVideoSeconds,2100);
});
