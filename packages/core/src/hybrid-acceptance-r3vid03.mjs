/** R3-VID-03: evidence gate for genuine 35min mixed-media acceptance.
 * A mock job, metadata-only AI label, or 4-second FFmpeg fixture is NOT a real
 * GPU provenance test. Read-only assessment never initiates paid/local inference.
 */
export const MIN_HYBRID_SECONDS=2100;
export const MAX_HYBRID_SECONDS=2400;
const finite=x=>Number.isFinite(x)&&x>0;
export function assessHybridVideoGate({composition,renderMetadata,nativeAiEvidence=null,
 verifiedLocalAssets=false,windowsOperatorApproved=false,recoveryApproved=false,
 paidRequestCount=null,actualDurationToleranceSec=1}={}){
 const blockers=[];
 const scenes=Array.isArray(composition?.scenes)?composition.scenes:[];
 const fps=composition?.profile?.fps;
 const seconds=Number.isSafeInteger(composition?.totalFrames)&&finite(fps)?composition.totalFrames/fps:null;
 if(!finite(seconds)||seconds<MIN_HYBRID_SECONDS||seconds>MAX_HYBRID_SECONDS)
  blockers.push('R3VID03_REAL_35MIN_COMPOSITION_REQUIRED');
 if(!scenes.some(s=>s.mediaType==='image_motion')||!scenes.some(s=>s.mediaType==='ai_video')||
   !scenes.some(s=>s.mediaType==='import_video'))blockers.push('R3VID03_MIXED_IMAGE_AI_IMPORT_REQUIRED');
 if(!scenes.every(s=>s.voice?.asset?.sha256&&s.visual?.asset?.sha256))
  blockers.push('R3VID03_PINNED_MEDIA_REQUIRED');
 const m=renderMetadata;
 if(!m||m.videoCodec!=='h264'||m.audioCodec!=='aac'||
   m.width!==composition?.profile?.width||m.height!==composition?.profile?.height||
   m.fps!==`${fps}/1`||m.frameCount!==composition?.totalFrames||
   !finite(m.durationSeconds)||!finite(seconds)||Math.abs(m.durationSeconds-seconds)>actualDurationToleranceSec)
  blockers.push('R3VID03_REAL_MP4_FFPROBE_QA_REQUIRED');
 // Explicit origin provenance from SP-04 + actual local ComfyUI checkpoint
 // must be reviewed independently. Arbitrary scene.mediaType is not proof.
 if(!nativeAiEvidence||nativeAiEvidence.kind!=='native_gpu_operator_witnessed'||
  nativeAiEvidence.providerId!=='comfyui-video'||
  nativeAiEvidence.assetChecksumVerified!==true||
  nativeAiEvidence.checkpointLicenseReviewed!==true)
  blockers.push('R3VID03_NATIVE_AI_INFERENCE_UNVERIFIED');
 if(verifiedLocalAssets!==true)blockers.push('R3VID03_ASSET_SHA_NOT_REVALIDATED');
 if(windowsOperatorApproved!==true)blockers.push('R3VID03_WINDOWS11_AV_REVIEW_REQUIRED');
 if(recoveryApproved!==true)blockers.push('R3VID03_ACTUAL_RENDER_RESTART_REQUIRED');
 if(paidRequestCount!==0)blockers.push('R3VID03_ZERO_UNAUTHORIZED_PAID_CALLS_UNVERIFIED');
 return {taskId:'R3-VID-03',status:blockers.length?'NOT_READY':'ACCEPTANCE_EVIDENCE_COMPLETE',
  accepted:blockers.length===0,blockers,sceneCount:scenes.length,actualVideoSeconds:seconds,
  dryRun:true,willCallProvider:false};
}
