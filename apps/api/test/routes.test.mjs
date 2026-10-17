import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,AssetManifest} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {ProviderRegistry} from '../../../packages/providers/src/index.mjs';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {registerVaultRoutes} from '../src/vault-routes.mjs';
import {PassphraseVault} from '../../../packages/security/src/index.mjs';

/** Only verifies route registration/handlers, not the Fastify HTTP network stack. */
function fakeApp(){const routes=new Map();const app={};for(const method of ['get','post','put','patch','delete'])app[method]=(route,handler)=>routes.set(`${method.toUpperCase()} ${route}`,handler);return {app,routes};}
function reply(){let status=200;return {code(v){status=v;return this},header(){return this},send(value){return {status,body:value}}}}
test('route contract: create channel → video, API errors mapped to 409',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'cs-routes-')),file=join(dir,'db.sqlite');
  const db=openProjectDb(file),repo=new StudioRepository(db),store=new JobStore({path:file});
  const manifest=new AssetManifest({db,repository:repo,dataRoot:dir});const {app,routes}=fakeApp();
  registerStudioRoutes(app,{controllers:createControllers({repo,store,registry:new ProviderRegistry(),manifest}),store});
  try{
    const channel=await routes.get('POST /api/channels')({body:{name:'Tutorial AI'},log:{warn(){}}},reply());
    assert.equal(channel.status,201);assert.equal(channel.body.name,'Tutorial AI');
    const video=await routes.get('POST /api/channels/:id/videos')({params:{id:channel.body.id},body:{title:'My First Video'},log:{warn(){}}},reply());
    assert.equal(video.status,201);assert.equal(video.body.presetSourceVersion,1);
    const stale=await routes.get('PATCH /api/channels/:id')({params:{id:channel.body.id},body:{rowVersion:0,name:'Invalid'},log:{warn(){}}},reply());
    assert.deepEqual(stale,{status:409,body:{error:'VERSION_CONFLICT'}});
  }finally{store.close();db.close();await rm(dir,{recursive:true,force:true})}
});
test('vault routes: encrypt secret, list without key, lock then block writes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'cs-vault-route-'));const {app,routes}=fakeApp();
  const vault=new PassphraseVault(dir);registerVaultRoutes(app,{vault});
  try {
    const res=await routes.get('POST /api/security/vault/init')({body:{passphrase:'a-very-long-passphrase'}},reply());
    assert.equal(res.status,201);
    const put=await routes.get('POST /api/security/credentials')({body:{id:'gemini-1',providerId:'gemini',apiKey:'secret-value'}},reply());
    assert.equal(put.status,201);assert.equal('apiKey' in put.body,false);
    const listed=await routes.get('GET /api/security/credentials')({},reply());
    assert.deepEqual(listed.items,[{id:'gemini-1',providerId:'gemini',stored:true}]);
    assert.equal(await vault.getSecret('gemini-1'),'secret-value');
    await routes.get('POST /api/security/vault/lock')({},reply());
    await assert.rejects(vault.getSecret('gemini-1'),{code:'VAULT_LOCKED'});
    const locked=await routes.get('POST /api/security/credentials')({body:{id:'other',providerId:'gemini',apiKey:'abc'}},reply());
    assert.equal(locked.status,423);
  }finally{vault.lock();await rm(dir,{recursive:true,force:true})}
});
