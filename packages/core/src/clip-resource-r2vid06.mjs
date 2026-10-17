/**
 * R2-VID-06: read-only, engine-neutral AI video workload / resource budget.
 *
 * This is NOT a GPU benchmark: frame/pixel counts are deterministic, VRAM
 * numbers are operator-declared limits, and runtime projections exist only
 * when the operator supplies an empirical local calibration. No filesystem,
 * network, model inference, quota check, or external-billing side effect.
 */
import {DomainError} from './domain.mjs';

const fail=()=>{throw new DomainError('INVALID_CLIP_RESOURCE_LIMITS',400)};
const MAX_PIXEL_FRAMES=4_000_000_000;
const DEFAULT_PIXEL_FRAMES=250_000_000;
const GIB=1024**3;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validNumber=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const optional=(value,min,max)=>value===null||validNumber(value,min,max);
const round=(x,places=2)=>Math.round(x*10**places)/10**places;

/** Strictly validate server-owned hardware and workload policy, never HTTP data. */
export function normalizeClipResourceLimits(input={}) {
 if(!plain(input)||Object.keys(input).some(k=>!
   ['maxPixelFrames','availableVramGb','minimumModelVramGb','benchmarkSecondsPerMillionPixelFrames',
    'requireVramBudget'].includes(k)))fail();
 const values={maxPixelFrames:DEFAULT_PIXEL_FRAMES,availableVramGb:null,
  minimumModelVramGb:null,benchmarkSecondsPerMillionPixelFrames:null,
  requireVramBudget:false,...input};
 if(!Number.isSafeInteger(values.maxPixelFrames)||values.maxPixelFrames<1_000_000||
    values.maxPixelFrames>MAX_PIXEL_FRAMES||
    !optional(values.availableVramGb,0.5,192)||
    !optional(values.minimumModelVramGb,0.5,192)||
    !optional(values.benchmarkSecondsPerMillionPixelFrames,0.001,3600)||
    typeof values.requireVramBudget!=='boolean')fail();
 return Object.freeze({...values});
}

/** Parse optional operator-owned process configuration fail-closed at startup.
 * An environment claim is NOT a measurement of installed or free GPU VRAM.
 */
export function readClipResourceLimits(env=process.env){
 const numeric=(key)=>{
  if(env[key]===undefined||env[key]==='')return null;
  if(typeof env[key]!=='string'||!/^\d+(?:\.\d+)?$/.test(env[key]))fail();
  const n=Number(env[key]);if(!Number.isFinite(n))fail();return n;
 };
 const config={};
 const max=numeric('CONTENTSTUDIO_VIDEO_MAX_PIXEL_FRAMES');
 if(max!==null)config.maxPixelFrames=max;
 const fields=[['CONTENTSTUDIO_VIDEO_AVAILABLE_VRAM_GB','availableVramGb'],
  ['CONTENTSTUDIO_VIDEO_MODEL_MIN_VRAM_GB','minimumModelVramGb'],
  ['CONTENTSTUDIO_VIDEO_BENCHMARK_SEC_PER_MPIXEL_FRAME','benchmarkSecondsPerMillionPixelFrames']];
 for(const [envKey,key] of fields){const value=numeric(envKey);if(value!==null)config[key]=value;}
 const required=env.CONTENTSTUDIO_VIDEO_REQUIRE_VRAM_BUDGET;
 if(required!==undefined){if(!['0','1'].includes(required))fail();config.requireVramBudget=required==='1';}
 return normalizeClipResourceLimits(config);
}

/**
 * A pixel-frame cap is an APP SAFETY LIMIT, NOT a reliable predictor of VRAM.
 * Unknown VRAM requirements are never called "fits" or "verified".
 */
export function estimateClipResources(policy,config={}){
 const c=normalizeClipResourceLimits(config);
 if(!plain(policy)||!
  Number.isSafeInteger(policy.width)||policy.width<128||policy.width>4096||
  Number.isSafeInteger(policy.height)===false||policy.height<128||policy.height>4096||
  !Number.isSafeInteger(policy.fps)||policy.fps<1||policy.fps>120||
  !Number.isSafeInteger(policy.durationSec)||policy.durationSec<1||policy.durationSec>300||
  !['image_motion','ai_video','import_video'].includes(policy.mediaType))
  throw new DomainError('VIDEO_POLICY_INVALID',400);
 const frames=policy.durationSec*policy.fps;
 const pixelFrames=frames*policy.width*policy.height;
 const megapixelFrames=round(pixelFrames/1e6,3);
 const blockers=[];
 const warnings=[];
 if(pixelFrames>c.maxPixelFrames)blockers.push('VIDEO_PIXEL_FRAME_BUDGET_EXCEEDED');
 if(c.requireVramBudget&&c.availableVramGb===null)blockers.push('VIDEO_VRAM_BUDGET_NOT_SET');
 if(c.availableVramGb!==null&&c.minimumModelVramGb===null)
  blockers.push('VIDEO_MODEL_VRAM_REQUIREMENT_UNKNOWN');
 if(c.availableVramGb!==null&&c.minimumModelVramGb!==null&&
   c.availableVramGb<c.minimumModelVramGb)blockers.push('VIDEO_DECLARED_VRAM_INSUFFICIENT');
 if(c.availableVramGb===null)warnings.push('VIDEO_AVAILABLE_VRAM_UNKNOWN');
 if(c.minimumModelVramGb===null)warnings.push('VIDEO_MODEL_VRAM_REQUIREMENT_UNKNOWN');
 // Both values being set still isn't physical proof: the operator typed them.
 warnings.push('VIDEO_HARDWARE_UNVERIFIED');
 const calibrated=c.benchmarkSecondsPerMillionPixelFrames!==null;
 if(!calibrated)warnings.push('VIDEO_RUNTIME_NOT_CALIBRATED');
 const seconds=calibrated?pixelFrames/1e6*c.benchmarkSecondsPerMillionPixelFrames:null;
 return {
  status:blockers.length?'BLOCKED':'ESTIMATE_ONLY',
  canPassConfiguredLimits:blockers.length===0,
  blockers,warnings,mode:policy.mediaType,
  workload:{width:policy.width,height:policy.height,fps:policy.fps,
   durationSec:policy.durationSec,frames,pixelFrames,megapixelFrames,
   rgbaFrameEquivalentGiB:round(pixelFrames*4/GIB,3),
   rgbaMeaning:'UNCOMPRESSED_FRAME_EQUIVALENT_NOT_GPU_VRAM_OR_DISK_FORECAST'},
  gpu:{availableVramGb:c.availableVramGb,minimumModelVramGb:c.minimumModelVramGb,
   source:'OPERATOR_DECLARED_UNVERIFIED',measured:false,modelPeakVramGb:null},
  runtime:{source:calibrated?'OPERATOR_BENCHMARK_UNVERIFIED':'NOT_CALIBRATED',
   projectedSeconds:seconds===null?null:round(seconds,1),
   likelySecondsRange:seconds===null?null:[round(seconds*0.5,1),round(seconds*2,1)]},
  price:{directPaidProviderCalls:0,directProviderApiCostUsd:0,
   totalOperatingCostUsd:null,electricityAndHardwareExcluded:true,remoteProviderAllowed:false},
  limit:{maxPixelFrames:c.maxPixelFrames,requireVramBudget:c.requireVramBudget},
  estimateOnly:true,dryRun:true,willDispatch:false,willBill:false,verifiedGpu:false
 };
}

/** Summarize only estimates returned from the server; no client-side spoofing. */
export function aggregateClipResources(items){
 if(!Array.isArray(items)||items.length<1||items.length>40||
   items.some(x=>!plain(x)||!plain(x.workload)||
     !Number.isSafeInteger(x.workload.pixelFrames)||x.workload.pixelFrames<0))
  throw new DomainError('VIDEO_RESOURCE_BATCH_INVALID',400);
 const blockers=[...new Set(items.flatMap(x=>x.blockers??[]))];
 const warnings=[...new Set(items.flatMap(x=>x.warnings??[]))];
 const totalPixelFrames=items.reduce((n,x)=>n+x.workload.pixelFrames,0);
 // Ordered GPU jobs run serially; minimum VRAM is max, not a sum.
 const declaredMinVram=items.map(x=>x.gpu?.minimumModelVramGb).filter(x=>x!==null&&x!==undefined);
 const times=items.map(x=>x.runtime?.projectedSeconds);
 return {scenes:items.length,totalPixelFrames,totalMegapixelFrames:round(totalPixelFrames/1e6,2),
  declaredMinimumVramGb:declaredMinVram.length===items.length?Math.max(...declaredMinVram):null,
  projectedTotalSeconds:times.every(x=>typeof x==='number')?round(times.reduce((a,b)=>a+b,0),1):null,
  blockers,warnings,canPassConfiguredLimits:blockers.length===0,
  dryRun:true,willDispatch:false,willBill:false,estimateOnly:true};
}
