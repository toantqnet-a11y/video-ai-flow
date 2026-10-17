/** R4-04: public Job Center query may pass ONLY its bounded server filters.
 * The raw ingress security gate runs before the route and must stay in sync.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectIncomingRequest} from '../src/request-policy.mjs';
const gate={verifyTransport:()=>null};
const inbound=(url)=>({method:'GET',url,
 headers:{host:'127.0.0.1:4317'},
 rawHeaders:['Host','127.0.0.1:4317'],
 socket:{remoteAddress:'127.0.0.1'}
});
const inspect=url=>inspectIncomingRequest(inbound(url),{port:4317,gate});
test('Job Center cursor, status, kind, video and scene filters pass local ingress',()=>{
 assert.equal(inspect('/api/jobs?limit=50&cursor=0'),null);
 assert.equal(inspect('/api/jobs?limit=50&cursor=50&status=failed&kind=render%3Ahyperframes&videoId=video-1&sceneId=scene-1'),null);
});
test('Job Center cannot bypass the original query and credential restrictions',()=>{
 assert.equal(inspect('/api/jobs?secret=leak'),'SECRET_IN_QUERY_FORBIDDEN');
 assert.equal(inspect('/api/jobs?externalUrl=https%3A%2F%2Fevil.example'),'QUERY_NOT_ALLOWED');
 assert.equal(inspect('/api/videos/vid-1?kind=render'),'QUERY_NOT_ALLOWED');
 assert.equal(inspect('/api/jobs?status=running&bad=yes'),'QUERY_NOT_ALLOWED');
});
