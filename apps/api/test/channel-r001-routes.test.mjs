/** R0-01 route contract test against the registered handler, no HTTP claims. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository,AssetManifest} from '../../../packages/core/src/index.mjs';
import {ProviderRegistry} from '../../../packages/providers/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

function fakeApp(){const routes=new Map(),app={};for(const name of ['get','post','patch','put','delete'])app[name]=(path,fn)=>routes.set(`${name.toUpperCase()} ${path}`,fn);return routesAndApp();function routesAndApp(){return {routes,app}}}
function makeReply(){let status=200;return {code(n){status=n;return this},send(body){return {status,body}}}}
function makeReq({params={},body,query={}}={}){return {params,body,query,log:{warn(){}}}}
test('R0-01 route lifecycle: list, summary, archive, restore, soft-delete',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'r001-routes-')),file=join(dir,'studio.sqlite');const db=openProjectDb(file),repo=new StudioRepository(db),store=new JobStore({path:file});
  const {app,routes}=fakeApp();const controllers=createControllers({repo,store,registry:new ProviderRegistry(),manifest:new AssetManifest({db,repository:repo,dataRoot:dir})});
  registerStudioRoutes(app,{controllers,store});
  const call=(method,path,request={})=>routes.get(`${method} ${path}`)(makeReq(request),makeReply());
  try{
    const created=await call('POST','/api/channels',{body:{name:'AI Podcast',idempotencyKey:'request_123456'}});
    assert.equal(created.status,201);
    const id=created.body.id;
    const second=await call('POST','/api/channels',{body:{name:'AI Podcast',idempotencyKey:'request_123456'}});
    assert.equal(second.body.id,id);
    await call('POST','/api/channels/:id/videos',{params:{id},body:{title:'Episode 01'}});
    const summary=await call('GET','/api/channels/:id/summary',{params:{id}});
    assert.equal(summary.videoCount,1);
    const archived=await call('POST','/api/channels/:id/archive',{params:{id},body:{rowVersion:1}});
    assert.equal(archived.status,'archived');
    assert.equal((await call('GET','/api/channels',{query:{status:'archived'}})).items.length,1);
    const restored=await call('POST','/api/channels/:id/restore',{params:{id},body:{rowVersion:archived.rowVersion}});
    assert.equal(restored.status,'active');
    const deleted=await call('DELETE','/api/channels/:id',{params:{id},body:{rowVersion:restored.rowVersion}});
    assert.ok(deleted.deletedAt);
    assert.equal((await call('GET','/api/channels')).items.length,0);
    assert.equal((await call('GET','/api/channels',{query:{status:'deleted'}})).items.length,1);
    assert.equal((await call('GET','/api/channels',{query:{status:'any'}})).items.length,1);
    const invalid=await call('GET','/api/channels',{query:{status:'evil'}});
    assert.equal(invalid.status,400);assert.equal(invalid.body.error,'INVALID_CHANNEL_FILTER');
    const stale=await call('POST','/api/channels/:id/restore',{params:{id},body:{rowVersion:1}});
    assert.equal(stale.status,409);
  }finally{store.close();db.close();await rm(dir,{recursive:true,force:true})}
});
