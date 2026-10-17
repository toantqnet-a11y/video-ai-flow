/** R0-13: paid controls must go through authenticated API/contract and durable DB. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,ProviderAccountRepository,PaidPolicyRepository} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {ProviderRegistry} from '../../../packages/providers/src/index.mjs';
import {createControllers} from '../src/controllers.mjs';
import {registerStudioRoutes} from '../src/routes.mjs';
import {operations} from '../../../packages/contracts/src/catalog.mjs';

async function setup(){
 const folder=await mkdtemp(join(tmpdir(),'cs-r013-')),filename=join(folder,'db.sqlite');
 const db=openProjectDb(filename),repo=new StudioRepository(db),store=new JobStore({path:filename});
 const providers=new ProviderAccountRepository(db),account=providers.createAccount({providerId:'seedance',name:'Seedance test'});
 const model=providers.createModel(account.id,{modelId:'paid-video',kind:'video'});
 const job=store.enqueue({kind:'asset:video',key:'r013-test-job',payload:{providerModelId:model.id,providerAccountId:account.id},maxAttempts:1}).job;
 const policy=new PaidPolicyRepository(db,{jobLookup:id=>store.get(id)});
 const ctl=createControllers({repo,store,registry:new ProviderRegistry(),paidPolicy:policy});
 return {folder,db,store,repo,ctl,job,account,model,policy,async close(){store.close();db.close();await rm(folder,{recursive:true,force:true})}};
}
const body=f=>({jobId:f.job.id,accountId:f.account.id,modelId:f.model.id,maxUsd:2,perCallMaxUsd:.25,expiresMinutes:30,confirmation:'AUTHORIZE_PAID_USAGE'});

test('controller approval is blocked for unrelated or unplanned paid model',async()=>{
 const f=await setup();try{
  const accepted=f.ctl.approvePaid(body(f));assert.equal(accepted.maxUsd,2);
  assert.equal(f.ctl.paidApprovals(f.job.id).length,1);
  assert.deepEqual(f.ctl.paidAudit(f.job.id).map(e=>e.action),['approved']);
  assert.equal(f.ctl.revokePaid(accepted.id).status,'revoked');
  assert.throws(()=>f.ctl.approvePaid({...body(f),modelId:'not_planned'}),{code:'PAID_JOB_TARGET_REQUIRED'});
  assert.throws(()=>f.ctl.approvePaid({...body(f),jobId:'other_job_id'}),{code:'JOB_NOT_FOUND'});
  assert.throws(()=>f.ctl.approvePaid({...body(f),confirmation:'yes'}),{code:'EXPLICIT_PAID_CONFIRMATION_REQUIRED'});
 }finally{await f.close()}
});

test('API exposes consent, read audit and revoke but never accepts arbitrary provider invoke',()=>{
 const registered=[];const app={get:(p,h)=>registered.push(['GET',p]),post:(p,h)=>registered.push(['POST',p]),
 patch:(p,h)=>registered.push(['PATCH',p]),put:(p,h)=>registered.push(['PUT',p]),delete:(p,h)=>registered.push(['DELETE',p])};
 registerStudioRoutes(app,{controllers:{},store:{}});
 for(const [method,path] of [['POST','/api/paid/approvals'],['POST','/api/paid/approvals/:id/revoke'],
   ['GET','/api/jobs/:id/paid-approvals'],['GET','/api/jobs/:id/paid-audit']]){
  assert(registered.some(([m,p])=>m===method&&p===path));
  assert(operations.some(o=>o.method===method&&o.path===path));
 }
 assert(!registered.some(([m,p])=>p.includes('paid')&&p.includes('invoke')));
});
