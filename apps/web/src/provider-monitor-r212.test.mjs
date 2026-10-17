/** R2-12 dashboard presentation must never invent free quota or switches. */
import test from 'node:test';import assert from 'node:assert/strict';
import {providerMonitorView,monitoringStatusLabel} from './provider-monitor-r212.mjs';
const obj=(overrides={})=>({asOf:1700000000000,items:[],truncated:false,switches:[],
 switchCoverage:'remote_llm_success_only',billingVerified:false,liveQuotaChecked:false,...overrides});
const item=(overrides={})=>({id:'m1',modelId:'llama',accountId:'a1',accountName:'Example',providerId:'groq',kind:'llm',
 location:'remote',costTier:'free_unverified',status:'local_limit_near',quotaSource:'estimated',
 limit:100,used:50,pendingUnits:41,pendingCalls:1,remainingUnits:9,nearLimit:true,exhausted:false,
 requiresPaidApproval:false,billingVerified:false,observedAt:1700000000000,...overrides});
const event=(overrides={})=>({seq:1,jobId:'job_123',attempt:1,fromModelId:'m1',toModelId:'m2',accountId:'a2',
 providerId:'groq',status:'succeeded',consent:'explicit_remote_runtime',billingGate:'confirmed_free_allowlist',
 createdAt:1700000000000,...overrides});
test('R2-12 renders local near-limit badge not provider-authorized quota',()=>{
 const v=providerMonitorView(obj({items:[item()]}));assert.equal(v.nearCount,1);
 assert.equal(v.items[0].remainingUnits,9);assert.match(v.items[0].label,/nội bộ/);
 assert.equal(monitoringStatusLabel.quota_unverified,'Chưa rõ quota');
});
test('R2-12 unknown balance and paid warnings are preserved',()=>{
 const v=providerMonitorView(obj({items:[item({quotaSource:'unknown',limit:null,used:null,remainingUnits:null,
 status:'quota_unverified',nearLimit:false,requiresPaidApproval:true,costTier:'paid'})]}));
 assert.equal(v.items[0].remainingUnits,null);assert.equal(v.unknownCount,1);assert.equal(v.paidCount,1);
});
test('R2-12 successful recorded switch has safe narrow UI fields',()=>{
 const v=providerMonitorView(obj({switches:[event({secret:'not for browser',prompt:'secret'})]}));
 assert.equal(v.switches.length,1);assert.equal(v.switches[0].providerId,'groq');
 assert.ok(!JSON.stringify(v).includes('secret'));assert.ok(!JSON.stringify(v).includes('prompt'));
});
test('R2-12 fails closed on false billing evidence, mismatched arithmetic and unverified switches',()=>{
 for(const bad of [obj({billingVerified:true}),obj({liveQuotaChecked:true}),obj({items:[item({remainingUnits:100})]}),
   obj({items:[item({quotaSource:'unknown',remainingUnits:9})]}),obj({switches:[event({status:'pending'})]}),
   obj({switches:[event({billingGate:'user_said_free'})]}),obj({items:Array.from({length:101},()=>item())})])
   assert.throws(()=>providerMonitorView(bad),/INVALID_PROVIDER_MONITOR_RESPONSE/);
});
