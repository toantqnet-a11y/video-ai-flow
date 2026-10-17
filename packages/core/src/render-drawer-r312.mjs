/** R3-12 pure helpers. Render resolution is a derivative of an immutable approved
 * Composition, never an edit to the user's source/timeline or frame clock. */
import {compositionDigest} from './composition-r2ext01.mjs';
import {validateTimedComposition} from './composition-timing-r2ext02.mjs';
import {DomainError} from './domain.mjs';
const fail=code=>{throw new DomainError(code,400)};
export const RENDER_RESOLUTIONS=Object.freeze(['source','720p','1080p']);
export const RENDER_STAGES=Object.freeze(['queued','preparing','encoding','finalizing','verifying','completed','failed']);
/** Choose one of the explicitly schema-supported sizes; 1:1 is 1080 only. */
export function renderProfileVariant(composition,resolution='source'){
 validateTimedComposition(composition);
 if(!RENDER_RESOLUTIONS.includes(resolution))fail('RENDER_INVALID_RESOLUTION');
 if(resolution==='source')return composition;
 const dims=composition.profile.aspectRatio==='16:9'?([['720p',1280,720],['1080p',1920,1080]]):
  composition.profile.aspectRatio==='9:16'?([['720p',720,1280],['1080p',1080,1920]]):
  [['1080p',1080,1080]];
 const found=dims.find(x=>x[0]===resolution);
 if(!found)fail('RENDER_RESOLUTION_UNSUPPORTED');
 const derivative=structuredClone(composition);
 derivative.profile={...derivative.profile,width:found[1],height:found[2]};
 const {digest,...rest}=derivative;
 derivative.digest=compositionDigest(rest);
 validateTimedComposition(derivative);
 return derivative;
}
/** Only real scene-completion measurements are returned; no fabricated ETA. */
export function renderDrawerProgress(job){
 const total=job?.progress?.totalScenes,done=job?.progress?.completedScenes;
 const measured=Number.isSafeInteger(done)&&Number.isSafeInteger(total)&&total>0&&done>=0&&done<=total;
 const terminal=job?.status==='succeeded'?'completed':job?.status==='failed'||job?.status==='cancelled'?'failed':null;
 const stage=terminal??(RENDER_STAGES.includes(job?.progress?.stage)?job.progress.stage:
   job?.status==='running'?'preparing':'queued');
 return {stage,completedScenes:measured?done:null,totalScenes:measured?total:null,
  // This fraction measures finished SCENES only; final mux/QA can still be running.
  sceneFraction:measured?done/total:null,completed:terminal==='completed'};
}
