/**
 * EXT-07: deterministic, read-only visual routing. This module never starts a
 * provider job. Paid AI-video remains a non-dispatchable option until the
 * existing R0-13 authorization and a dedicated paid adapter gate approve it.
 * Unknown provider prices are ALWAYS null, never displayed as an estimate.
 */
import {DomainError} from './domain.mjs';
import {validateTimedComposition} from './composition-timing-r2ext02.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
export const VISUAL_COST_MODES=Object.freeze(['saving','balanced','quality']);
const blockedScene=(doc,sceneId)=>doc.readiness.blockers.some(b=>b.sceneId===sceneId&&b.code.startsWith('VISUAL_'));

export function routeVisuals({composition,mode='balanced',localComfyConfigured=false,includePaidCandidates=false}={}){
  validateTimedComposition(composition);
  if(!VISUAL_COST_MODES.includes(mode)||typeof localComfyConfigured!=='boolean'||typeof includePaidCandidates!=='boolean')fail('VISUAL_ROUTE_INVALID_OPTIONS');
  const scenes=composition.scenes.map(scene=>{
    const verified=!!scene.visual.asset&&!blockedScene(composition,scene.id);
    const reuse=verified;
    // The manual import recommendation is intentional when the local provider
    // is missing: it does not invent a free cloud image-generation capability.
    const action=reuse?'reuse_verified':(scene.mediaType==='image_motion'&&mode!=='saving'&&localComfyConfigured)?'generate_local_image':'import_media';
    const reason=reuse?'verified_selection':action==='generate_local_image'?'local_provider_configured':scene.mediaType!=='image_motion'?'video_media_requires_import':'local_provider_missing';
    const alternatives=includePaidCandidates&&mode==='quality'?[{action:'paid_ai_video',status:'blocked_requires_explicit_approval_and_adapter',estimatedUsd:null}]:[];
    return {sceneId:scene.id,sceneIndex:scene.index,action,reason,existingAssetId:reuse?scene.visual.asset.id:null,
      // An estimated number of jobs is NOT a billed usage observation.
      estimatedNewLocalImageJobs:action==='generate_local_image'?1:0,
      paidDispatchAllowed:false,alternatives};
  });
  const summary={reused:scenes.filter(s=>s.action==='reuse_verified').length,
    manualImportRequired:scenes.filter(s=>s.action==='import_media').length,
    localImageCandidates:scenes.filter(s=>s.action==='generate_local_image').length,
    paidCallsScheduled:0,estimatedApiUsd:0,actualApiUsd:null};
  return {schemaVersion:1,mode,videoId:composition.videoId,compositionDigest:composition.digest,
    scenes,summary,costEvidence:{source:'deterministic_preflight_only',apiUsdBasis:'no_remote_dispatch',
      actualCost:'unknown_not_observed',localComputeCost:'not_estimated',
      note:'Read-only proposal. API cost zero for this preview, not a claim about subsequent provider charges or local electricity.'}};
}
