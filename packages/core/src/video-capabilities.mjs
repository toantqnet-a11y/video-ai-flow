/**
 * R0-VID-01 – User-declared AI-video model capabilities and SAFE planning.
 * A model entry is NOT proof that Wan/LTX/Seedance/Veo actually runs, has a
 * free quota, or is compatible with a particular ComfyUI workflow. Capability
 * values remain editable metadata until independent runtime verification.
 *
 * All checks are pure/local: no GPU inference, outbound network request,
 * queue submission, spending authorization, or image-motion generation.
 */
import {transact} from './db.mjs';
import {DomainError} from './domain.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
const modes=['text_to_video','image_to_video'];
const sizeOk=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const own=(o,k)=>Object.hasOwn(o,k);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const allowed=(value,keys)=>plain(value)&&Object.keys(value).every(k=>keys.includes(k));

/** Validate untrusted capability metadata BEFORE writing SQLite. */
export function validateVideoCapabilities(value){
  if(!allowed(value,['modes','maxDurationSec','maxWidth','maxHeight','maxFps','minVramGb','requiresGpu']) ||
    !Array.isArray(value.modes)||value.modes.length===0||value.modes.length>2||
    new Set(value.modes).size!==value.modes.length||value.modes.some(m=>!modes.includes(m))||
    !sizeOk(value.maxDurationSec,1,600)||!sizeOk(value.maxWidth,128,8192)||
    !sizeOk(value.maxHeight,128,8192)||!sizeOk(value.maxFps,1,120)||
    typeof value.requiresGpu!=='boolean'||
    (value.minVramGb!==null && !sizeOk(value.minVramGb,0,192)))fail('INVALID_VIDEO_CAPABILITIES');
  // Store a canonical allowlisted object; ignore neither unexpected metadata nor
  // authorization flags (e.g. a forged providerVerified=true).
  return {modes:[...value.modes].sort(),maxDurationSec:value.maxDurationSec,
    maxWidth:value.maxWidth,maxHeight:value.maxHeight,maxFps:value.maxFps,
    minVramGb:value.minVramGb,requiresGpu:value.requiresGpu};
}

const mapRow=r=>r?({modelId:r.model_id,capabilities:JSON.parse(r.capabilities_json),
  source:'user_declared',verified:false,revision:r.revision,updatedAt:r.updated_at}):null;

export class VideoCapabilityRepository {
  constructor(db,{clock=()=>Date.now()}={}){this.db=db;this.clock=clock;}
  get(modelId){return mapRow(this.db.prepare('SELECT * FROM video_model_capabilities WHERE model_id=?').get(modelId));}
  list(){
    // No secrets or endpoint credentials are included in capability listings.
    return this.db.prepare(`SELECT m.id,m.model_id,m.account_id,m.location,m.cost_tier,m.status,m.quota_source,m.quota_limit,m.quota_used,
       a.provider_id,a.name AS account_name,a.status AS account_status,c.capabilities_json,c.revision,c.updated_at
       FROM provider_models m JOIN provider_accounts a ON a.id=m.account_id
       LEFT JOIN video_model_capabilities c ON c.model_id=m.id
       WHERE m.kind='video' ORDER BY m.priority+a.priority,m.created_at`).all().map(row=>({
      id:row.id,modelName:row.model_id,accountId:row.account_id,accountName:row.account_name,
      providerId:row.provider_id,location:row.location,costTier:row.cost_tier,status:row.status,
      accountStatus:row.account_status,quota:{source:row.quota_source,limit:row.quota_limit,used:row.quota_used},
      configured:row.capabilities_json!==null,
      capability:row.capabilities_json?{capabilities:JSON.parse(row.capabilities_json),source:'user_declared',verified:false,revision:row.revision,updatedAt:row.updated_at}:null
    }));
  }
  /** Revision 0 means first write; later writes need the latest revision. */
  save(modelId,{revision,capabilities}={}){
    const model=this.db.prepare('SELECT kind FROM provider_models WHERE id=?').get(modelId);
    if(!model)fail('PROVIDER_MODEL_NOT_FOUND',404);
    if(model.kind!=='video')fail('NOT_VIDEO_MODEL',409);
    if(!sizeOk(revision,0,1e9))fail('INVALID_CAPABILITY_REVISION');
    const normalized=validateVideoCapabilities(capabilities);
    const now=this.clock();
    transact(this.db,()=>{
      const prev=this.get(modelId);
      if((prev?.revision??0)!==revision)fail('VERSION_CONFLICT',409);
      // Always write a new revision, even when values match: UI must receive a
      // fresh explicit configuration confirmation, not inferred model support.
      this.db.prepare(`INSERT INTO video_model_capabilities(model_id,capabilities_json,revision,updated_at)
        VALUES(?,?,?,?) ON CONFLICT(model_id) DO UPDATE SET capabilities_json=excluded.capabilities_json,
        revision=excluded.revision,updated_at=excluded.updated_at`).run(modelId,JSON.stringify(normalized),revision+1,now);
      this.db.prepare(`INSERT INTO domain_events(entity_type,entity_id,event_name,created_at,detail_json)
        VALUES('video_model_capability',?,'video_capability.configured',?,?)`).run(modelId,now,JSON.stringify({revision:revision+1}));
    });
    return this.get(modelId);
  }
  /**
   * Dry run only: `canPlan` means configuration passes declared limits, NOT
   * that the real provider can generate a clip or a billed call is approved.
   */
  preflight(input={}){
    if(!allowed(input,['modelId','mode','durationSec','width','height','fps','allowRemote','fallbackImageMotion'])||
      typeof input.modelId!=='string'||input.modelId.length>80||!modes.includes(input.mode)||
      !sizeOk(input.durationSec,1,600)||!sizeOk(input.width,128,8192)||
      !sizeOk(input.height,128,8192)||!sizeOk(input.fps,1,120)||
      typeof input.allowRemote!=='boolean'||typeof input.fallbackImageMotion!=='boolean')fail('INVALID_VIDEO_PREFLIGHT');
    const candidate=this.list().find(m=>m.id===input.modelId);
    if(!candidate)fail('VIDEO_MODEL_NOT_FOUND',404);
    const blockers=[],warnings=[];
    if(candidate.status!=='active'||candidate.accountStatus!=='active')blockers.push('MODEL_DISABLED');
    const caps=candidate.capability?.capabilities;
    if(!caps)blockers.push('CAPABILITIES_NOT_CONFIGURED');
    else {
      if(!caps.modes.includes(input.mode))blockers.push('MODE_NOT_SUPPORTED');
      if(input.durationSec>caps.maxDurationSec)blockers.push('DURATION_EXCEEDED');
      if(input.width>caps.maxWidth||input.height>caps.maxHeight)blockers.push('RESOLUTION_EXCEEDED');
      if(input.fps>caps.maxFps)blockers.push('FPS_EXCEEDED');
      // The app has not proven Windows VRAM or actual model inference yet.
      if(caps.requiresGpu)warnings.push('GPU_NOT_VERIFIED');
    }
    if(candidate.quota.source!=='unknown'&&candidate.quota.limit!==null&&
      candidate.quota.used>=candidate.quota.limit)blockers.push('QUOTA_EXHAUSTED');
    if(candidate.quota.source!=='provider_verified')warnings.push('QUOTA_UNVERIFIED');
    if(candidate.location==='remote'&&!input.allowRemote)blockers.push('REMOTE_CONSENT_REQUIRED');
    if(candidate.costTier==='paid')blockers.push('PAID_APPROVAL_REQUIRED');
    if(candidate.costTier==='free_unverified'&&candidate.location==='remote')blockers.push('FREE_TIER_NOT_VERIFIED');
    warnings.push('INFERENCE_NOT_VERIFIED');
    const canPlan=blockers.length===0;
    return {modelId:candidate.id,providerId:candidate.providerId,mode:input.mode,canPlan,blockers,warnings,
      proposedFallback:!canPlan&&input.fallbackImageMotion?'image_motion':null,
      dryRun:true,willQueue:false,willBill:false,
      message:'Kiểm tra metadata do người dùng khai báo; chưa sinh clip, chưa xác minh năng lực model, không cấp quyền trả phí.'};
  }
}
