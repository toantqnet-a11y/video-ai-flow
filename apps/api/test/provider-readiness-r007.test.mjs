/** R0-07 non-billable provider diagnostics; probes known loopback only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {providerReadiness} from '../../../packages/providers/src/readiness.mjs';

const acc=(providerId,status='active')=>({id:'account-one',providerId,status});
const model=(location='local',opts={})=>({id:'model-1',modelId:'test',location,status:'active',endpoint:null,...opts});

test('R0-07 remote readiness never performs fetch even with probe=true and credentials',async()=>{
  let calls=0;
  const r=await providerReadiness({account:acc('gemini'),models:[model('remote')],hasCredential:true,probe:true,fetchImpl:async()=>{calls++;throw new Error('should not fetch')}});
  assert.equal(calls,0);assert.equal(r.models[0].state,'UNVERIFIED');assert.equal(r.models[0].quotaVerified,false);
});
test('R0-07 unauthenticated remote account needs key but never checks its validity',async()=>{
  const r=await providerReadiness({account:acc('groq'),models:[model('remote')],probe:true});
  assert.equal(r.models[0].state,'NEEDS_KEY');assert.equal(r.models[0].inferenceVerified,false);
});
test('R0-07 safe local probe checks exact static URL without inference',async()=>{
  let target,method;
  const r=await providerReadiness({account:acc('ollama'),models:[model()],probe:true,
    fetchImpl:async(url,opts)=>{target=url;method=opts.method;return {ok:true}}});
  assert.equal(target,'http://127.0.0.1:11434/api/tags');assert.equal(method,'GET');
  assert.equal(r.models[0].state,'REACHABLE');assert.equal(r.models[0].inferenceVerified,false);
});
test('R0-07 custom endpoint never probed, disabled account never probed',async()=>{
 let count=0;const fetchImpl=async()=>{count++;return {ok:true}};
 const a=await providerReadiness({account:acc('custom'),models:[model('local',{endpoint:'http://127.0.0.1:8000/tts'})],probe:true,fetchImpl});
 const b=await providerReadiness({account:acc('ollama','disabled'),models:[model()],probe:true,fetchImpl});
 assert.equal(count,0);assert.equal(a.models[0].state,'UNVERIFIED');assert.equal(b.models[0].state,'DISABLED');
});
test('R0-07 known local probe failure reports unavailable not verified',async()=>{
 const r=await providerReadiness({account:acc('comfyui'),models:[model()],probe:true,fetchImpl:async()=>{throw new Error('offline')}});
 assert.equal(r.models[0].state,'UNAVAILABLE');assert.equal(r.models[0].quotaVerified,false);
});
