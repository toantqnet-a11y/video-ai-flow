/** R2-09 HTTP surface and source catalog security regression. */
import test from 'node:test';import assert from 'node:assert/strict';
import {inspectIncomingRequest} from '../src/request-policy.mjs';
import {operations,schemas} from '../../../packages/contracts/src/catalog.mjs';
const gate={verifyTransport:()=>null};
const raw=url=>({method:'GET',url,headers:{host:'127.0.0.1:4311'},rawHeaders:['host','127.0.0.1:4311'],socket:{remoteAddress:'127.0.0.1'}});
test('R2-09 safe video asset filter/cursor queries accepted, secret keys rejected',()=>{
 const base='/api/videos/uuid-123/assets/library';
 assert.equal(inspectIncomingRequest(raw(base+'?kind=image&limit=20&cursor=eyJhIjoxfQ'),{port:4311,gate}),null);
 assert.equal(inspectIncomingRequest(raw(base+'?api_key=x'),{port:4311,gate}),'SECRET_IN_QUERY_FORBIDDEN');
 assert.equal(inspectIncomingRequest(raw(base+'?path=/etc/passwd'),{port:4311,gate}),'QUERY_NOT_ALLOWED');
 assert.equal(inspectIncomingRequest(raw('/api/videos/uuid-123/assets/recompute-plan?limit=1'),{port:4311,gate}),'QUERY_NOT_ALLOWED');
});
test('R2-09 authenticated read-only operations are in API contract with bounded query',()=>{
 for(const id of ['listVideoAssetLibrary','getVideoAssetRecompute']){
  const op=operations.find(o=>o.id===id);assert.ok(op);assert.equal(op.method,'GET');assert.notEqual(op.public,true);
 }
 assert.ok(schemas.AssetLibraryPage.properties.nextCursor);
 assert.equal(schemas.AssetLibraryItem.properties.health.enum.includes('unsafe'),true);
});
