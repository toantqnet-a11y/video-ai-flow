import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,ChannelAvatarService} from '../../../packages/core/src/index.mjs';
import {registerChannelAvatarRoutes} from '../src/channel-avatar.mjs';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4H6/xHwAGbQKGYmyoQQAAAABJRU5ErkJggg==','base64');
function mockApp(){const routes=new Map();const app={};for(const method of ['get','put'])app[method]=(path,fn)=>routes.set(`${method.toUpperCase()} ${path}`,fn);return {app,routes}}
function reply(){return {status:200,headers:{},code(status){this.status=status;return this},header(k,v){this.headers[k]=v;return this},type(v){this.headers['content-type']=v;return this},send(body){this.body=body;return body}}}
test('R0 avatar routes: only current revision, private image response and domain error mapping',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-avatar-routes-'));const db=openProjectDb(join(dir,'studio.sqlite'));
 try{
   const repo=new StudioRepository(db),ch=repo.createChannel({name:'Kênh học'}),avatar=new ChannelAvatarService({repo,dataRoot:dir});
   const {app,routes}=mockApp();registerChannelAvatarRoutes(app,avatar);
   const request=(body)=>({params:{id:ch.id},body,log:{warn(){}}});
   const bad=reply();await routes.get('GET /api/channels/:id/avatar')(request(),bad);
   assert.equal(bad.status,404);assert.equal(bad.body.error,'AVATAR_NOT_FOUND');
   const stored=reply();const output=await routes.get('PUT /api/channels/:id/avatar')(request({rowVersion:1,mimeType:'image/png',dataBase64:PNG.toString('base64')}),stored);
   assert.ok(output.avatarId);
   const served=reply();await routes.get('GET /api/channels/:id/avatar')(request(),served);
   assert.equal(served.headers['cache-control'],'private,no-store');assert.equal(served.headers['content-type'],'image/png');assert.deepEqual(served.body,PNG);
   const stale=reply();await routes.get('PUT /api/channels/:id/avatar')(request({rowVersion:1,mimeType:'image/png',dataBase64:PNG.toString('base64')}),stale);
   assert.equal(stale.status,409);
 }finally{db.close();await rm(dir,{recursive:true,force:true})}
});
