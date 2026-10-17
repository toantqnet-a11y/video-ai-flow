/** R2-10: quota UI remains behind the already hardened R2-08 GET route. */
import test from 'node:test';import assert from 'node:assert/strict';
import {inspectIncomingRequest} from '../src/request-policy.mjs';
const gate={verifyTransport:()=>null};
const inspect=(url,method='GET')=>inspectIncomingRequest({method,url,headers:{host:'127.0.0.1:4000'},
 rawHeaders:['host','127.0.0.1:4000'],socket:{remoteAddress:'127.0.0.1'}},{port:4000,gate});
test('R2-10 quota inspector only allows declared bounded pagination GET shape',()=>{
 assert.equal(inspect('/api/provider-models/model-1/quota-ledger?limit=20'),null);
 assert.equal(inspect('/api/provider-models/model-1/quota-ledger?secret=hello'),'SECRET_IN_QUERY_FORBIDDEN');
 assert.equal(inspect('/api/provider-models/model-1/quota-ledger?release=true'),'QUERY_NOT_ALLOWED');
 assert.equal(inspect('/api/provider-models/model-1/quota-ledger?api_key=hidden'),'SECRET_IN_QUERY_FORBIDDEN');
});
test('R2-10 no quota write/reconciliation endpoint was added by the UX',()=>{
 assert.equal(inspect('/api/provider-models/model-1/quota-ledger?release=1','POST'),'QUERY_NOT_ALLOWED');
 assert.equal(inspect('/api/provider-models/model-1/quota-ledger?force=1','DELETE'),'QUERY_NOT_ALLOWED');
});
