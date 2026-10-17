/** R0-13: payments must be explicit, scoped, auditable and fail closed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,PaidPolicyRepository,ProviderAccountRepository,createPaidInvocationPolicy} from '../src/index.mjs';
import {ProviderRegistry} from '../../../packages/providers/src/index.mjs';

const now=1_800_000_000_000;
function setup(){
  const db=openProjectDb(':memory:');
  const accounts=new ProviderAccountRepository(db,{clock:()=>now});
  const account=accounts.createAccount({providerId:'seedance',name:'Pay account'});
  const model=accounts.createModel(account.id,{modelId:'seedance-api',kind:'video',costTier:'paid'});
  let time=now;
  const policy=new PaidPolicyRepository(db,{clock:()=>time,jobLookup:id=>id==='job_paid_001'?{kind:'asset:video',status:'running',payload:{providerModelId:model.id,providerAccountId:account.id}}:null});
  const props={jobId:'job_paid_001',accountId:account.id,modelId:model.id,
    maxUsd:1.00,perCallMaxUsd:0.40,expiresMinutes:15,confirmation:'AUTHORIZE_PAID_USAGE'};
  return {db,accounts,account,model,policy,props,tick:ms=>{time+=ms},close:()=>db.close()};
}
function okGrant(f){return f.policy.approve(f.props);}
function callInput(f,g,key='invocation_001',estimateMicroUsd=250000){return {approvalId:g.id,jobId:f.props.jobId,accountId:f.account.id,
  modelId:f.model.id,providerId:'seedance',invocationKey:key,estimateMicroUsd};}

test('v10 database creates paid tables without plaintext key columns',()=>{
  const f=setup();try {assert(f.db.prepare('PRAGMA user_version').get().user_version>=10); // Future additive migrations preserve R0-13 tables.
    const cols=f.db.prepare('PRAGMA table_info(paid_approvals)').all().map(x=>x.name).join(',');
    assert.doesNotMatch(cols,/prompt|api_key|password|card/);
  }finally{f.close()}
});
test('requires explicit typed confirmation and a real configured paid model',()=>{
 const f=setup();try{
  assert.throws(()=>f.policy.approve({...f.props,confirmation:'yes'}),{code:'EXPLICIT_PAID_CONFIRMATION_REQUIRED'});
  assert.throws(()=>f.policy.approve({...f.props,jobId:'not_found_job'}),{code:'JOB_NOT_FOUND'});
  assert.throws(()=>f.policy.approve({...f.props,maxUsd:0}),{code:'INVALID_PAID_BUDGET'});
  assert.throws(()=>f.policy.approve({...f.props,perCallMaxUsd:1.01}),{code:'INVALID_PAID_BUDGET'});
  assert.throws(()=>f.policy.approve({...f.props,expiresMinutes:99999}),{code:'INVALID_PAID_BUDGET'});
  assert.throws(()=>f.policy.approve({...f.props,apiKey:'do-not-save'}),{code:'EXPLICIT_PAID_CONFIRMATION_REQUIRED'});
 }finally{f.close()}
});
test('approval is scoped to job/account/model, with strict per-call and aggregate ceiling',()=>{
 const f=setup();try{
  const g=okGrant(f);assert.equal(g.remainingUsd,1);
  assert.throws(()=>f.policy.reserve({...callInput(f,g),jobId:'different_job'}),{code:'PAID_JOB_NOT_RUNNING'});
  assert.throws(()=>f.policy.reserve(callInput(f,g,'too_big_call',450000)),{code:'PAID_BUDGET_EXCEEDED'});
  assert.equal(f.policy.reserve(callInput(f,g)).status,'reserved');
  assert.equal(f.policy.get(g.id).remainingUsd,.75);
  assert.equal(f.policy.reserve(callInput(f,g,'invocation_002',400000)).estimateUsd,.4);
  assert.throws(()=>f.policy.reserve(callInput(f,g,'invocation_003',400000)),{code:'PAID_BUDGET_EXCEEDED'});
  assert.equal(f.policy.get(g.id).remainingUsd,.35);
 }finally{f.close()}
});
test('duplicate network attempt cannot replay a reserved invocation after restart',()=>{
 const f=setup();try{
  const g=okGrant(f),payload=callInput(f,g);
  f.policy.reserve(payload);
  const restored=new PaidPolicyRepository(f.db,{clock:()=>now+1000});
  assert.throws(()=>restored.reserve(payload),{code:'PAID_INVOCATION_ALREADY_RESERVED'});
  assert.equal(restored.finish(payload.invocationKey,'uncertain').status,'uncertain');
  assert.equal(restored.finish(payload.invocationKey,'settled').status,'uncertain');
  assert.equal(restored.get(g.id).reservedUsd,.25);
 }finally{f.close()}
});
test('revoke and expiry prevent new paid dispatch without deleting past audit',()=>{
 const f=setup();try{
  const g=okGrant(f);f.policy.reserve(callInput(f,g));
  f.policy.revoke(g.id);
  assert.throws(()=>f.policy.reserve(callInput(f,g,'new_invocation')),{code:'PAID_APPROVAL_REVOKED'});
  assert.deepEqual(f.policy.audit(f.props.jobId).map(x=>x.action),['revoked','reserved','approved']);
  const fresh=okGrant(f);f.tick(15*60*1000);
  assert.throws(()=>f.policy.reserve(callInput(f,fresh,'other_invocation')),{code:'PAID_APPROVAL_EXPIRED'});
  assert.throws(()=>f.db.prepare('DELETE FROM paid_policy_audit').run(),/IMMUTABLE_PAID_AUDIT/);
 }finally{f.close()}
});
test('disabled or changed model/account invalidates a grant at invocation time',()=>{
 const f=setup();try{
  const g=okGrant(f);
  const m=f.accounts.getModel(f.model.id);
  f.accounts.updateModel(f.model.id,{status:'disabled',rowVersion:m.rowVersion});
  assert.throws(()=>f.policy.reserve(callInput(f,g)),{code:'PAID_MODEL_MISMATCH'});
 }finally{f.close()}
});
test('paid ProviderRegistry cannot be bypassed by forged paidApproval JSON',async()=>{
 const f=setup();let calls=0;try{
  const registry=new ProviderRegistry();
  registry.register({id:'seedance',kind:'video',location:'remote',costTier:'paid',
    estimateCostMicroUsd:()=>250000,invoke:async()=>{calls++;return 'real-request'}});
  await assert.rejects(registry.invoke('seedance',{}, {allowRemote:true,paidApproval:{approved:true,providerId:'seedance',maxUsd:100}}),/PAID_APPROVAL_REQUIRED/);
  assert.equal(calls,0);
  registry.setPaidPolicy(createPaidInvocationPolicy(f.policy));
  const grant=okGrant(f),ctx=callInput(f,grant);
  const paidContext={approvalId:ctx.approvalId,jobId:ctx.jobId,accountId:ctx.accountId,modelId:ctx.modelId,invocationKey:ctx.invocationKey};
  assert.equal(await registry.invoke('seedance',{}, {allowRemote:true,paidContext}),'real-request');
  assert.equal(calls,1);
  await assert.rejects(registry.invoke('seedance',{}, {allowRemote:true,paidContext}),/PAID_INVOCATION_ALREADY_RESERVED/);
  assert.equal(calls,1);
 }finally{f.close()}
});
test('provider errors are conservatively held as uncertain cost (no automatic refund)',async()=>{
 const f=setup();try{
  const registry=new ProviderRegistry().setPaidPolicy(createPaidInvocationPolicy(f.policy));
  registry.register({id:'seedance',kind:'video',location:'remote',costTier:'paid',
    estimateCostMicroUsd:()=>100000,invoke:async()=>{throw new Error('NETWORK_TIMEOUT')}});
  const grant=okGrant(f),c=callInput(f,grant,'failed_invocation');
  await assert.rejects(registry.invoke('seedance',{}, {allowRemote:true,paidContext:c}),/NETWORK_TIMEOUT/);
  assert.equal(f.policy.get(grant.id).reservedUsd,.1);
  assert.equal(f.policy.audit(f.props.jobId)[0].action,'uncertain');
 }finally{f.close()}
});
test('unknown-pricing provider remains blocked even with fake approval',async()=>{
 const reg=new ProviderRegistry();let calls=0;
 reg.register({id:'unknownx',kind:'video',location:'remote',costTier:'unknown',estimateCostMicroUsd:()=>100000,invoke:async()=>calls++});
 await assert.rejects(reg.invoke('unknownx',{}, {allowRemote:true,paidContext:{approvalId:'a'}}),/PRICING_UNVERIFIED/);
 assert.equal(calls,0);
});

test('user-labeled free tier cannot trigger unverified remote billing',async()=>{
 let requests=0;const reg=new ProviderRegistry();
 reg.register({id:'untrusted',kind:'image',location:'remote',costTier:'free_unverified',invoke:async()=>++requests});
 await assert.rejects(reg.invoke('untrusted',{}, {allowRemote:true}),/FREE_TIER_NOT_VERIFIED/);
 assert.equal(requests,0);
});

test('paid reservations persist across closing and reopening a disk-backed SQLite database',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'r013-payment-restart-')),file=join(dir,'studio.sqlite');
 let db;
 try{
   db=openProjectDb(file);const catalog=new ProviderAccountRepository(db);
   const a=catalog.createAccount({providerId:'seedance',name:'A'}),m=catalog.createModel(a.id,{modelId:'video-prod',kind:'video'});
   const jobId='job_restart_001';
   const lookup=id=>id===jobId?{status:'running',kind:'asset:video',payload:{providerModelId:m.id,providerAccountId:a.id}}:null;
   const p1=new PaidPolicyRepository(db,{jobLookup:lookup,clock:()=>now});
   const g=p1.approve({jobId,accountId:a.id,modelId:m.id,maxUsd:1,perCallMaxUsd:.4,expiresMinutes:30,confirmation:'AUTHORIZE_PAID_USAGE'});
   const context={approvalId:g.id,jobId,accountId:a.id,modelId:m.id,providerId:'seedance',invocationKey:'once_only_replay',estimateMicroUsd:100000};
   p1.reserve(context);db.close();db=null;
   db=openProjectDb(file);
   const p2=new PaidPolicyRepository(db,{jobLookup:lookup,clock:()=>now+5000});
   assert.equal(p2.get(g.id).reservedUsd,.1);
   assert.throws(()=>p2.reserve(context),{code:'PAID_INVOCATION_ALREADY_RESERVED'});
   assert.deepEqual(p2.audit(jobId).map(e=>e.action),['reserved','approved']);
 }finally{db?.close();await rm(dir,{recursive:true,force:true})}
});

test('migration v10 preserves prior schema ledger and takes a WAL-safe snapshot',async()=>{
 const {mkdtemp,rm,readdir}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {createHash}=await import('node:crypto');
 const {DatabaseSync}=await import('node:sqlite');
 const {migrations}=await import('../src/index.mjs');
 const folder=await mkdtemp(join(tmpdir(),'r013-upgrade-')),file=join(folder,'test.sqlite');
 try{
   const old=new DatabaseSync(file);old.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL');
   old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at INTEGER NOT NULL)');
   for(const m of migrations.slice(0,9)){
     old.exec(m.sql);old.prepare('INSERT INTO schema_migrations(version,checksum,applied_at) VALUES(?,?,?)')
       .run(m.version,createHash('sha256').update(m.sql).digest('hex'),now);
   }
   const prev=old.prepare('SELECT version,checksum FROM schema_migrations ORDER BY version').all();old.close();
   const upgraded=openProjectDb(file);
   assert.deepEqual(upgraded.prepare('SELECT version,checksum FROM schema_migrations WHERE version<=9 ORDER BY version').all(),prev);
   assert(upgraded.prepare('PRAGMA user_version').get().user_version>=10);upgraded.close();
   assert((await readdir(folder)).some(x=>x.includes(`.pre-v${migrations.at(-1).version}-`))); // Snapshot targets the newest migration; additive versions are valid.
 }finally{await rm(folder,{recursive:true,force:true})}
});
