/** R2-10: use the existing authenticated allowlisted GET (no new mutation). */
import test from 'node:test';import assert from 'node:assert/strict';
import {createStudioClient} from '../src/client.mjs';
const valid={modelId:'model-1',summary:{modelId:'model-1',source:'unknown',limit:null,
 used:null,pendingUnits:0,pendingCalls:0,remainingUnits:null,admitted:false,quotaVerified:false,billingVerified:false},items:[]};
test('R2-10 quota lookup requires in-memory paired session and sends no model content',async()=>{
 const calls=[];const client=createStudioClient({fetchImpl:async(url,opts)=>{
   calls.push({url,opts});
   if(url==='/api/session/pair')return new Response(JSON.stringify({bearer:'ephemeral',csrf:'token'}),{headers:{'content-type':'application/json'}});
   return new Response(JSON.stringify(valid),{headers:{'content-type':'application/json'}});
 }});
 await assert.rejects(client.requestPath('/provider-models/model-1/quota-ledger?limit=20'),{code:'PAIRING_REQUIRED'});
 await client.pair('onetime');
 const v=await client.requestPath('/provider-models/model-1/quota-ledger?limit=20');
 assert.equal(v.modelId,'model-1');assert.equal(calls[1].opts.method,'GET');
 assert.equal(calls[1].opts.headers.authorization,'Bearer ephemeral');
 assert.equal(calls[1].url,'/api/provider-models/model-1/quota-ledger?limit=20');
 assert(!('body' in calls[1].opts));assert(!calls[1].url.includes('ephemeral'));
});
test('R2-10 refuses query credential injection and unknown operations',async()=>{
 const client=createStudioClient({fetchImpl:async()=>new Response('{}')});
 await assert.rejects(client.requestPath('/provider-models/model-1/quota-ledger?api_key=x'),{code:'PAIRING_REQUIRED'});
 await assert.rejects(client.requestPath('/provider-models/model-1/quota-ledger?limit=20&limit=21'),{code:'INVALID_QUERY'});
 await assert.rejects(client.requestPath('/provider-models/model-1/quota-ledger?action=release'),{code:'PAIRING_REQUIRED'});
});
