/** R2-VID-06 pure resource guard tests: no GPU, HTTP, npm or provider calls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateClipResources,aggregateClipResources,readClipResourceLimits,
 normalizeClipResourceLimits} from '../src/clip-resource-r2vid06.mjs';
const standard={mediaType:'ai_video',mode:'text_to_video',durationSec:4,
 width:768,height:432,fps:24,seed:1};

test('R2VID06 clean local estimate does not claim GPU, runtime or electricity-cost verification',()=>{
 const result=estimateClipResources(standard);
 assert.equal(result.workload.frames,96);
 assert.equal(result.workload.pixelFrames,31_850_496);
 assert.equal(result.canPassConfiguredLimits,true);
 assert.equal(result.status,'ESTIMATE_ONLY');
 assert.equal(result.gpu.measured,false);
 assert.equal(result.gpu.modelPeakVramGb,null);
 assert.equal(result.runtime.projectedSeconds,null);
 assert.equal(result.price.directProviderApiCostUsd,0);
 assert.equal(result.price.totalOperatingCostUsd,null);
 assert.equal(result.price.remoteProviderAllowed,false);
 assert.equal(result.willDispatch,false);
 assert.equal(result.willBill,false);
 assert.ok(result.warnings.includes('VIDEO_HARDWARE_UNVERIFIED'));
});

test('R2VID06 rejects oversized pixel-frame request before any AI inference',()=>{
 const huge={...standard,width:1920,height:1080,durationSec:12,fps:30};
 const x=estimateClipResources(huge);
 assert.equal(x.workload.pixelFrames,746_496_000);
 assert.equal(x.canPassConfiguredLimits,false);
 assert.deepEqual(x.blockers,['VIDEO_PIXEL_FRAME_BUDGET_EXCEEDED']);
 assert.equal(x.limit.maxPixelFrames,250_000_000);
});

test('R2VID06 strict known-VRAM policy distinguishes model requirements from available capacity',()=>{
 const denied=estimateClipResources(standard,{availableVramGb:6,minimumModelVramGb:8});
 assert.ok(denied.blockers.includes('VIDEO_DECLARED_VRAM_INSUFFICIENT'));
 const unknown=estimateClipResources(standard,{availableVramGb:16});
 assert.ok(unknown.blockers.includes('VIDEO_MODEL_VRAM_REQUIREMENT_UNKNOWN'));
 const required=estimateClipResources(standard,{requireVramBudget:true});
 assert.ok(required.blockers.includes('VIDEO_VRAM_BUDGET_NOT_SET'));
 const accepted=estimateClipResources(standard,{availableVramGb:16,minimumModelVramGb:8});
 assert.equal(accepted.canPassConfiguredLimits,true);
 assert.equal(accepted.gpu.measured,false,'operator metadata is never a hardware measurement');
});

test('R2VID06 calibration is operator-supplied, not invented model benchmark',()=>{
 const x=estimateClipResources(standard,{benchmarkSecondsPerMillionPixelFrames:10});
 assert.equal(x.runtime.source,'OPERATOR_BENCHMARK_UNVERIFIED');
 assert.equal(x.runtime.projectedSeconds,318.5);
 assert.deepEqual(x.runtime.likelySecondsRange,[159.3,637]);
 assert.equal(x.gpu.modelPeakVramGb,null);
});

test('R2VID06 no untrusted limits, fake provider costs, infinity or negative values',()=>{
 for(const config of [{remoteConsent:true},{maxPixelFrames:1},{maxPixelFrames:1e30},
  {availableVramGb:-1},{minimumModelVramGb:'8'},{benchmarkSecondsPerMillionPixelFrames:Infinity},
  {requireVramBudget:'true'},{__proto__:null,unknown:'secret'}]){
   assert.throws(()=>normalizeClipResourceLimits(config),/INVALID_CLIP_RESOURCE_LIMITS/);
 }
 for(const policy of [{...standard,width:-1},{...standard,fps:1.2},{...standard,durationSec:301},
  {...standard,mediaType:'veo_paid'},{...standard,height:'432'}]){
  assert.throws(()=>estimateClipResources(policy),/VIDEO_POLICY_INVALID/);
 }
});

test('R2VID06 strict operator environment options (no network and no implicit authorization)',()=>{
 const good=readClipResourceLimits({CONTENTSTUDIO_VIDEO_MAX_PIXEL_FRAMES:'100000000',
  CONTENTSTUDIO_VIDEO_AVAILABLE_VRAM_GB:'12',CONTENTSTUDIO_VIDEO_MODEL_MIN_VRAM_GB:'8',
  CONTENTSTUDIO_VIDEO_REQUIRE_VRAM_BUDGET:'1',
  CONTENTSTUDIO_VIDEO_BENCHMARK_SEC_PER_MPIXEL_FRAME:'14.5'});
 assert.equal(good.availableVramGb,12);
 assert.equal(good.requireVramBudget,true);
 assert.equal(good.maxPixelFrames,100000000);
 for(const env of [{CONTENTSTUDIO_VIDEO_REQUIRE_VRAM_BUDGET:'yes'},
  {CONTENTSTUDIO_VIDEO_AVAILABLE_VRAM_GB:'NaN'},
  {CONTENTSTUDIO_VIDEO_MAX_PIXEL_FRAMES:'10000'},
  {CONTENTSTUDIO_VIDEO_MODEL_MIN_VRAM_GB:'-8'},
  {CONTENTSTUDIO_VIDEO_BENCHMARK_SEC_PER_MPIXEL_FRAME:'1e309'}]){
  assert.throws(()=>readClipResourceLimits(env),/INVALID_CLIP_RESOURCE_LIMITS/);
 }
});

test('R2VID06 batch aggregate serial GPU load, mixed readiness and no paid call',()=>{
 const a=estimateClipResources(standard,{availableVramGb:16,minimumModelVramGb:8,
  benchmarkSecondsPerMillionPixelFrames:10});
 const b=estimateClipResources({...standard,durationSec:6},{availableVramGb:16,minimumModelVramGb:8,
  benchmarkSecondsPerMillionPixelFrames:10});
 const sum=aggregateClipResources([a,b]);
 assert.equal(sum.scenes,2);
 assert.equal(sum.totalPixelFrames,a.workload.pixelFrames+b.workload.pixelFrames);
 assert.equal(sum.declaredMinimumVramGb,8);
 assert.equal(sum.canPassConfiguredLimits,true);
 assert.equal(sum.willDispatch,false);
 assert.throws(()=>aggregateClipResources(Array(41).fill(a)),/VIDEO_RESOURCE_BATCH_INVALID/);
 const unsafe=aggregateClipResources([a,estimateClipResources(standard,{availableVramGb:4,minimumModelVramGb:8})]);
 assert.equal(unsafe.canPassConfiguredLimits,false);
});
