/** R0-07: controller and registered route handlers, no dependency on Fastify npm install. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository} from '../../../packages/core/src/index.mjs';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';

function fixture(vault={list:async()=>[]}){
 const db=openProjectDb(),repo=new StudioRepository(db),controllers=createControllers({repo,store:{},registry:{list:()=>[]},manifest:{},vault});
 const handlers=new Map(),app={};for(const verb of ['get','post','put','patch','delete'])app[verb]=(path,fn)=>handlers.set(`${verb} ${path}`,fn);
 registerStudioRoutes(app,{controllers,store:{}});
 const invoke=async(verb,path,{params={},body,query}={})=>{
   const reply={status:200,code(status){this.status=status;return this},send(body){return {status:this.status,body}}};
   const value=await handlers.get(`${verb} ${path}`)({params,body,query,log:{warn(){}}},reply);
   return value?.body!==undefined&&value?.status!==undefined?value:{status:reply.status,body:value};
 };
 return {db,repo,controllers,handlers,invoke};
}

test('R0-07 account/model routes CRUD and dry-route preview registered',async()=>{
 const f=fixture();try{
   const {invoke,handlers}=f;
   for(const path of ['/api/provider-accounts','/api/provider-models','/api/providers/templates']) assert(handlers.has(`get ${path}`));
   const templates=await invoke('get','/api/providers/templates');assert(templates.body.items.length>5);
   const account=await invoke('post','/api/provider-accounts',{body:{providerId:'ollama',name:'Local LLM'}});
   assert.equal(account.status,201);const id=account.body.id;
   const model=await invoke('post','/api/provider-accounts/:id/models',{params:{id},body:{kind:'llm',modelId:'llama3.2'}});
   assert.equal(model.status,201);const modelId=model.body.id;
   assert.equal((await invoke('get','/api/provider-accounts/:id/models',{params:{id}})).body.items.length,1);
   const plan=await invoke('post','/api/providers/route-preview',{body:{kind:'llm'}});
   assert.equal(plan.body.selected.modelId,modelId);assert.equal(plan.body.dryRun,true);
   const updated=await invoke('patch','/api/provider-models/:id',{params:{id:modelId},body:{rowVersion:1,status:'disabled'}});
   assert.equal(updated.body.status,'disabled');
   assert.equal((await invoke('post','/api/providers/route-preview',{body:{kind:'llm'}})).body.selected,null);
   const versionConflict=await invoke('patch','/api/provider-models/:id',{params:{id:modelId},body:{rowVersion:1,status:'active'}});
   assert.equal(versionConflict.status,409);assert.equal(versionConflict.body.error,'VERSION_CONFLICT');
 }finally{f.db.close()}
});

test('R0-07 controller validates bound vault credentials ownership without reading secret',async()=>{
 const f=fixture({list:async()=>[{id:'groq-key',providerId:'groq',stored:true}]});try{
   const bad=await f.invoke('post','/api/provider-accounts',{body:{providerId:'gemini',name:'Mismatch',credentialId:'groq-key'}});
   assert.equal(bad.status,409);assert.equal(bad.body.error,'CREDENTIAL_PROVIDER_MISMATCH');
   const good=await f.invoke('post','/api/provider-accounts',{body:{providerId:'groq',name:'LLM',credentialId:'groq-key'}});
   assert.equal(good.status,201);assert.equal(good.body.credentialId,'groq-key');
   assert(!JSON.stringify(good).includes('DO_NOT_LEAK'));
 }finally{f.db.close()}
});

test('R0-07 model quota input cannot forge verified quota at HTTP boundary',async()=>{
 const f=fixture();try{
   const account=(await f.invoke('post','/api/provider-accounts',{body:{providerId:'ollama',name:'Local'}})).body;
   const model=(await f.invoke('post','/api/provider-accounts/:id/models',{params:{id:account.id},body:{modelId:'llama',kind:'llm'}})).body;
   const blocked=await f.invoke('put','/api/provider-models/:id/quota',{params:{id:model.id},body:{rowVersion:1,source:'provider_verified',limit:100,used:0}});
   assert.equal(blocked.status,409);
   const estimated=await f.invoke('put','/api/provider-models/:id/quota',{params:{id:model.id},body:{rowVersion:1,source:'estimated',limit:100,used:95}});
   assert.equal(estimated.body.quota.source,'estimated');assert.equal(estimated.body.quota.used,95);
 }finally{f.db.close()}
});
