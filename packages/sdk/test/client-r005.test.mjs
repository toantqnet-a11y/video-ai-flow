/** SDK tests verify memory-only session, CSRF headers, typed routes and robust SSE. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioClient,StudioApiError,readJobEventStream} from '../src/client.mjs';

const response=(body,status=200,contentType='application/json')=>({status,ok:status>=200&&status<300,headers:{get:(key)=>key.toLowerCase()==='content-type'?contentType:null},json:async()=>body});
const stream=(parts)=>new ReadableStream({start(controller){for(const p of parts)controller.enqueue(typeof p==='string'?new TextEncoder().encode(p):p);controller.close();}});
const err=async(promise,code)=>assert.rejects(promise,e=>e instanceof StudioApiError&&e.code===code);

async function paired({requests=[],requestHook}={}){
 const calls=requests;
 const client=createStudioClient({fetchImpl:async(url,opts)=>{
   calls.push({url,opts});
   if(requestHook)return requestHook(url,opts);
   return url.endsWith('/session/pair')?response({bearer:'secretBearer',csrf:'secretCsrf'}):response({items:[]});
 }});
 await client.pair('terminal-code');return {client,calls};
}

test('session uses in-memory bearer + mutation CSRF; never leaks token in path/body',async()=>{
 const {client,calls}=await paired();
 assert(client.authenticated());
 await client.request('listChannels',{query:{status:'any'}});
 await client.request('createChannel',{body:{name:'Video Channel'}});
 assert.equal(calls[0].url,'/api/session/pair');
 assert(!calls[0].opts.headers.authorization);
 assert.equal(calls[1].url,'/api/channels?status=any');
 assert.equal(calls[1].opts.headers.authorization,'Bearer secretBearer');
 assert(!('x-contentstudio-csrf' in calls[1].opts.headers));
 assert.equal(calls[2].opts.headers['x-contentstudio-csrf'],'secretCsrf');
 assert(!JSON.stringify(calls.map(c=>c.url)).includes('secretBearer'));
 assert(!calls[2].opts.body.includes('secretBearer'));
 client.clear();assert(!client.authenticated());
 await err(client.request('listChannels',{}),'PAIRING_REQUIRED');
});

test('runtime catalog blocks unknown paths, query secrets and path traversal',async()=>{
 const {client}=await paired();
 await err(client.request('getChannel',{id:'../../credentials'}),'INVALID_PATH_PARAMETER');
 await err(client.request('listChannels',{query:{apiKey:'abc'}}),'QUERY_NOT_ALLOWED');
 await err(client.request('listChannels',{query:{status:'unsafe'}}),'INVALID_QUERY');
 await err(client.requestPath('/security/credentials/private-key'),'UNKNOWN_OPERATION');
 await err(client.requestPath('/channels?status=any&token=abc'),'QUERY_NOT_ALLOWED');
 await err(client.requestPath('/channels?status=any&status=active'),'INVALID_QUERY');
 await err(client.request('streamJobEvents',{}),'USE_STREAM_JOB_EVENTS');
});

test('existing channel/video/screens compatibility uses contract operations',async()=>{
 const {client,calls}=await paired();
 await client.requestPath('/channels/abcd123/videos',{method:'POST',body:{title:'Video'}});
 await client.requestPath('/videos/abc-12/timeline',{method:'PUT',body:{rowVersion:1,document:{tracks:[],clips:[]}}});
 await client.requestPath('/system/diagnostics/refresh',{method:'POST',body:{}});
 assert.equal(calls[1].url,'/api/channels/abcd123/videos');
 assert.equal(calls[2].url,'/api/videos/abc-12/timeline');
 assert.equal(calls[3].url,'/api/system/diagnostics/refresh');
});

test('stable machine-code error and 401 expires the session; no server text reflection',async()=>{
 const {client}=await paired({requestHook:(url)=>url.endsWith('/session/pair')?response({bearer:'b',csrf:'c'}):response({error:'AUTH_REQUIRED'},401)});
 await err(client.request('listJobs',{}),'AUTH_REQUIRED');
 assert.equal(client.authenticated(),false);
 await err(client.request('listJobs',{}),'PAIRING_REQUIRED');
 const second=await paired({requestHook:(url)=>url.endsWith('/session/pair')?response({bearer:'b',csrf:'c'}):response({error:'raw\n stack /secret'},500)});
 await err(second.client.request('listJobs',{}),'HTTP_500');
});

test('SSE parser handles UTF-8 split bytes, data fragments, comments and cursor',async()=>{
 const event1={seq:10,type:'job.updated',caption:'Đã tạo'};
 const event2={seq:11,type:'job.updated'};
 const full=`: connected\r\n\r\nid: 10\r\nevent: job\r\ndata: ${JSON.stringify(event1)}\r\n\r\n: heartbeat\r\n\r\nid: 11\nevent: job\ndata: ${JSON.stringify(event2)}\n\n`;
 const bytes=new TextEncoder().encode(full);
 const pieces=[];for(let i=0;i<bytes.length;i+=3)pieces.push(bytes.slice(i,i+3));
 const found=[];
 const result=await readJobEventStream(stream(pieces),e=>found.push(e));
 assert.deepEqual(found,[event1,event2]);
 assert.equal(result.lastEventId,11);
});

test('SSE drops unfinished tail; detects bad payload and oversize frames',async()=>{
 const seen=[];
 const partial=await readJobEventStream(stream(['id: 5\nevent: job\ndata: {"seq":5}\n\n','id: 6\nevent: job\ndata: {"seq":6}']),e=>seen.push(e));
 assert.deepEqual(seen,[{seq:5}]);assert.equal(partial.lastEventId,5);
 await err(readJobEventStream(stream(['id: 7\nevent: job\ndata: badly-json\n\n']),()=>{}),'INVALID_EVENT_PAYLOAD');
 await err(readJobEventStream(stream(['id: 8\nevent: job\ndata: '+ 'x'.repeat(1000)]),()=>{},{maxFrameBytes:64}),'EVENT_TOO_LARGE');
});

test('SSE resume after interrupted fetch sends last-event-id as header (not URL)',async()=>{
 const calls=[];
 let gets=0;
 const client=createStudioClient({fetchImpl:async(url,options)=>{
   calls.push({url,options});
   if(url.endsWith('/session/pair'))return response({bearer:'B',csrf:'C'});
   gets++;
   const n=gets===1?20:21;
   return {...response(null,200,'text/event-stream'),body:stream([`id: ${n}\nevent: job\ndata: {"seq":${n}}\n\n`])};
 }});
 await client.pair('test');
 const received=[];
 const result=await client.streamJobs(e=>received.push(e.seq),{lastEventId:19,retries:1,retryDelayMs:1});
 assert.equal(result.lastEventId,21);
 assert.deepEqual(received,[20,21]);
 assert.equal(calls[1].options.headers['Last-Event-ID'],'19');
 assert.equal(calls[2].options.headers['Last-Event-ID'],'20');
 assert(calls.every(c=>!c.url.includes('Bearer')&&!c.url.includes('B')));
});

test('SDK must never send bearer to arbitrary network origin',()=>{
 assert.throws(()=>createStudioClient({baseUrl:'https://remote.example/api'}),{code:'UNSAFE_API_BASE'});
 assert.throws(()=>createStudioClient({baseUrl:'http://localhost:4311/api'}),{code:'UNSAFE_API_BASE'});
});

test('SSE avoids duplicate replay and rejects mismatched transport cursor',async()=>{
 const found=[];
 const data=['id: 1\nevent: job\ndata: {"seq":1}\n\n',
   'id: 2\nevent: job\ndata: {"seq":2}\n\n',
   'id: 2\nevent: job\ndata: {"seq":2}\n\n'];
 const result=await readJobEventStream(stream(data),e=>found.push(e.seq));
 assert.deepEqual(found,[1,2]);assert.equal(result.lastEventId,2);
 await err(readJobEventStream(stream(['id: 1000\nevent: job\ndata: {"seq":3}\n\n']),()=>{}),'INVALID_EVENT_CURSOR');
});

test('unauthenticated /health resolves outside /api and needs no authorization header',async()=>{
 const calls=[];
 const client=createStudioClient({fetchImpl:async(url,options)=>{
   calls.push({url,options});return response({status:'ok',service:'contentstudio',version:'arc01'});
 }});
 assert.equal((await client.request('getHealth',{})).status,'ok');
 assert.equal(calls[0].url,'/health');
 assert(!calls[0].options.headers.authorization);
});
