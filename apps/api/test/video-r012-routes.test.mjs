/** R0-12 controller/route integration without pretending Fastify is installed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository} from '../../../packages/core/src/index.mjs';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {inspectIncomingRequest} from '../src/request-policy.mjs';
import {createSecurityGate} from '../../../packages/security/src/index.mjs';
const setup=()=>{
 const db=openProjectDb(),repo=new StudioRepository(db),channel=repo.createChannel({name:'A'}),other=repo.createChannel({name:'B'});
 const store={countByStatus(){return{}},list(){return[]}};
 const controllers=createControllers({repo,store,registry:{list(){return[]}},manifest:{}});
 const handlers=new Map(),app={};
 for(const method of ['get','post','put','patch','delete'])app[method]=(path,fn)=>handlers.set(`${method} ${path}`,fn);
 registerStudioRoutes(app,{controllers,store});
 async function call(method,path,{params={},body,query={}}={}){
   const reply={status:200,code(n){this.status=n;return this},send(value){return value}};
   const result=await handlers.get(`${method} ${path}`)({params,body,query,log:{warn(){}}},reply);
   return {result,status:reply.status};
 }
 return {db,repo,channel,other,call};
};

test('R0-12 POST create and page read use stable API contract',async()=>{
 const f=setup();try{
   const body={title:'News',targetMinutes:35,idempotencyKey:'video_req_ABC12'};
   const created=await f.call('post','/api/channels/:id/videos',{params:{id:f.channel.id},body});
   assert.equal(created.status,201);assert.equal(created.result.targetDurationSec,2100);
   const repeated=await f.call('post','/api/channels/:id/videos',{params:{id:f.channel.id},body});
   assert.equal(repeated.result.id,created.result.id);
   const listing=await f.call('get','/api/channels/:id/videos',{params:{id:f.channel.id},query:{status:'draft',limit:'20'}});
   assert.equal(listing.result.items.length,1);assert.equal(listing.result.items[0].id,created.result.id);
   const outside=await f.call('get','/api/channels/:id/videos',{params:{id:f.other.id}});
   assert.equal(outside.result.items.length,0);
 }finally{f.db.close()}
});

test('R0-12 scoped resume and stale version use stable 404/409',async()=>{
 const f=setup();try{
   const video=f.repo.createVideo(f.channel.id,{title:'A'});
   const cross=await f.call('get','/api/channels/:id/videos/:videoId/resume',{params:{id:f.other.id,videoId:video.id}});
   assert.equal(cross.status,404);assert.deepEqual(cross.result,{error:'VIDEO_NOT_FOUND'});
   const safe=await f.call('get','/api/channels/:id/videos/:videoId/resume',{params:{id:f.channel.id,videoId:video.id}});
   assert.equal(safe.result.step,'content');
   const renamed=await f.call('patch','/api/videos/:id',{params:{id:video.id},body:{rowVersion:1,title:'New title'}});
   assert.equal(renamed.result.title,'New title');
   const conflict=await f.call('delete','/api/videos/:id',{params:{id:video.id},body:{rowVersion:1}});
   assert.equal(conflict.status,409);assert.deepEqual(conflict.result,{error:'VERSION_CONFLICT'});
   const deleted=await f.call('delete','/api/videos/:id',{params:{id:video.id},body:{rowVersion:2}});
   assert(deleted.result.deletedAt!==null);
   const restored=await f.call('post','/api/videos/:id/restore',{params:{id:video.id},body:{rowVersion:3}});
   assert.equal(restored.result.deletedAt,null);
 }finally{f.db.close()}
});

test('R0-12 local transport explicitly allowlists paged video query only',()=>{
 const gate=createSecurityGate({port:4311});
 function raw(url){return {method:'GET',url,headers:{host:'127.0.0.1:4311'},rawHeaders:['Host','127.0.0.1:4311'],socket:{remoteAddress:'127.0.0.1'}};}
 assert.equal(inspectIncomingRequest(raw('/api/channels/abc/videos?search=Tin%20AI&limit=20&status=all&deleted=false'),{port:4311,gate}),null);
 assert.equal(inspectIncomingRequest(raw('/api/channels/abc/videos?api_key=token'),{port:4311,gate}),'SECRET_IN_QUERY_FORBIDDEN');
 assert.equal(inspectIncomingRequest(raw('/api/channels/abc/videos?unexpected=true'),{port:4311,gate}),'QUERY_NOT_ALLOWED');
});
