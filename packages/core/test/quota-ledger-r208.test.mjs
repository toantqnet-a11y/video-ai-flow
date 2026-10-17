/** R2-08: actual Node SQLite transaction tests. No provider is called. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openProjectDb,ProviderAccountRepository,QuotaLedgerRepository,migrations} from '../src/index.mjs';

const create=()=>{
  const db=openProjectDb(),provider=new ProviderAccountRepository(db);
  const account=provider.createAccount({providerId:'groq',name:'Quota verified? no'});
  const model=provider.createModel(account.id,{modelId:'llama-remote',kind:'llm'});
  return {db,provider,model,ledger:new QuotaLedgerRepository(db),close:()=>db.close()};
};
const key=n=>`quota_reservation_${String(n).padStart(5,'0')}`;
const set=(f,limit,used=0)=>f.provider.setQuota(f.model.id,{rowVersion:f.provider.getModel(f.model.id).rowVersion,source:'estimated',limit,used});

test('v26 schema is additive, versioned, and exposes no secrets',()=>{
 const f=create();try{
   assert.equal(f.db.prepare('PRAGMA user_version').get().user_version,migrations.length);
   assert.ok(migrations.some(m=>m.version===26));
   assert.deepEqual(f.ledger.snapshot(f.model.id).remainingUnits,null);
   assert.equal(f.ledger.snapshot(f.model.id).billingVerified,false);
   assert.equal(f.db.prepare('SELECT COUNT(*) n FROM provider_quota_calls').get().n,0);
 }finally{f.close()}
});

test('reserve prevents concurrent oversubscription before remote completion',()=>{
 const f=create();try{
   set(f,10,3);
   f.ledger.reserve(f.model.id,{invocationKey:key(1),estimatedUnits:5});
   assert.equal(f.ledger.snapshot(f.model.id).remainingUnits,2);
   assert.throws(()=>f.ledger.reserve(f.model.id,{invocationKey:key(2),estimatedUnits:3}),{code:'QUOTA_EXHAUSTED'});
   assert.equal(f.db.prepare('SELECT COUNT(*) n FROM provider_quota_calls').get().n,1);
   assert.equal(f.provider.planRoute({kind:'llm',allowRemote:true}).candidates[0].reason,'CREDENTIAL_REQUIRED');
   f.ledger.reserve(f.model.id,{invocationKey:key(3),estimatedUnits:2});
   assert.equal(f.ledger.snapshot(f.model.id).remainingUnits,0);
   assert.equal(f.provider.planRoute({kind:'llm',allowRemote:true}).candidates[0].reason,'QUOTA_RESERVED');
 }finally{f.close()}
});

test('a completed invocation atomically consumes actual (not estimated) units exactly once',()=>{
 const f=create();try{
   set(f,30,2);
   f.ledger.reserve(f.model.id,{invocationKey:key(4),estimatedUnits:10});
   assert.equal(f.ledger.settle(key(4),{actualUnits:3}).status,'settled');
   assert.equal(f.ledger.settle(key(4),{actualUnits:3}).status,'settled');
   assert.equal(f.provider.getModel(f.model.id).quota.used,5);
   assert.equal(f.ledger.snapshot(f.model.id).remainingUnits,25);
   assert.equal(f.db.prepare('SELECT COUNT(*) n FROM provider_usage_events').get().n,1);
   assert.throws(()=>f.ledger.settle(key(4),{actualUnits:4}),{code:'QUOTA_SETTLEMENT_CONFLICT'});
   assert.throws(()=>f.ledger.uncertain(key(4)),{code:'QUOTA_ALREADY_SETTLED'});
 }finally{f.close()}
});

test('uncertain upstream outcomes retain holds and cannot be silently retried',()=>{
 const f=create();try{
   set(f,20);f.ledger.reserve(f.model.id,{invocationKey:key(5),estimatedUnits:12});
   assert.equal(f.ledger.uncertain(key(5)).status,'uncertain');
   assert.equal(f.ledger.uncertain(key(5)).status,'uncertain');
   assert.equal(f.ledger.snapshot(f.model.id).pendingUnits,12);
   assert.throws(()=>f.ledger.reserve(f.model.id,{invocationKey:key(5),estimatedUnits:12}),{code:'QUOTA_INVOCATION_ALREADY_RESERVED'});
   assert.throws(()=>f.ledger.settle(key(5),{actualUnits:1}),{code:'QUOTA_RESERVATION_UNCERTAIN'});
   assert.equal(f.ledger.list(f.model.id).items[0].status,'uncertain');
 }finally{f.close()}
});

test('same key different model or size cannot overwrite existing reservation',()=>{
 const f=create();try{
   set(f,20);f.ledger.reserve(f.model.id,{invocationKey:key(6),estimatedUnits:4});
   assert.throws(()=>f.ledger.reserve(f.model.id,{invocationKey:key(6),estimatedUnits:5}),{code:'QUOTA_IDEMPOTENCY_CONFLICT'});
   const second=f.provider.createModel(f.provider.listAccounts()[0].id,{modelId:'other-remote',kind:'llm'});
   assert.throws(()=>f.ledger.reserve(second.id,{invocationKey:key(6),estimatedUnits:4}),{code:'QUOTA_IDEMPOTENCY_CONFLICT'});
 }finally{f.close()}
});

test('provider labels are user-estimated, never elevated to verified',()=>{
 const f=create();try{
   set(f,5);const r=f.ledger.reserve(f.model.id,{invocationKey:key(7),estimatedUnits:5});
   assert.equal(r.status,'reserved');
   assert.equal(f.ledger.snapshot(f.model.id).quotaVerified,false);
   assert.equal(f.ledger.snapshot(f.model.id).billingVerified,false);
   assert.throws(()=>f.provider.setQuota(f.model.id,{rowVersion:2,source:'provider_verified',limit:999,used:0}),{code:'PROVIDER_QUOTA_VERIFICATION_REQUIRED'});
 }finally{f.close()}
});

test('disabled models and accounts cannot claim new capacity',()=>{
 const f=create();try{
   set(f,20);f.provider.updateModel(f.model.id,{status:'disabled',rowVersion:2});
   assert.throws(()=>f.ledger.reserve(f.model.id,{invocationKey:key(8),estimatedUnits:1}),{code:'QUOTA_EXHAUSTED'});
   f.provider.updateModel(f.model.id,{status:'active',rowVersion:3});
   const account=f.provider.listAccounts()[0];f.provider.updateAccount(account.id,{status:'disabled',rowVersion:1});
   assert.throws(()=>f.ledger.reserve(f.model.id,{invocationKey:key(9),estimatedUnits:1}),{code:'QUOTA_EXHAUSTED'});
 }finally{f.close()}
});

test('bad identifiers, estimates, paging and unknown model fail without writes',()=>{
 const f=create();try{
   for(const bad of [0,-1,1.5,1e10,null])assert.throws(()=>f.ledger.reserve(f.model.id,{invocationKey:key(10),estimatedUnits:bad}),{code:'INVALID_QUOTA_RESERVATION'});
   assert.throws(()=>f.ledger.reserve(f.model.id,{invocationKey:'bad/key',estimatedUnits:1}),{code:'INVALID_QUOTA_RESERVATION'});
   assert.throws(()=>f.ledger.snapshot('missing'),{code:'PROVIDER_MODEL_NOT_FOUND'});
   assert.throws(()=>f.ledger.list(f.model.id,{limit:101}),{code:'INVALID_QUOTA_LEDGER_LIMIT'});
   assert.throws(()=>f.ledger.uncertain(key(11)),{code:'QUOTA_RESERVATION_NOT_FOUND'});
   assert.equal(f.db.prepare('SELECT COUNT(*) n FROM provider_quota_calls').get().n,0);
 }finally{f.close()}
});

test('unknown quota does not magically grant verified billing or a numeric ceiling',()=>{
 const f=create();try{
   f.ledger.reserve(f.model.id,{invocationKey:key(12),estimatedUnits:900});
   assert.equal(f.ledger.snapshot(f.model.id).remainingUnits,null);
   f.ledger.settle(key(12),{actualUnits:800});
   assert.equal(f.provider.getModel(f.model.id).quota.used,null);
   assert.equal(f.ledger.list(f.model.id).items.length,1);
 }finally{f.close()}
});

test('actual usage above reserved estimate blocks subsequent calls instead of hiding the overdraft',()=>{
 const f=create();try{
   set(f,10);f.ledger.reserve(f.model.id,{invocationKey:key(13),estimatedUnits:3});
   f.ledger.settle(key(13),{actualUnits:12});
   assert.equal(f.provider.getModel(f.model.id).quota.used,12);
   assert.equal(f.ledger.snapshot(f.model.id).remainingUnits,0);
   assert.throws(()=>f.ledger.reserve(f.model.id,{invocationKey:key(14),estimatedUnits:1}),{code:'QUOTA_EXHAUSTED'});
 }finally{f.close()}
});

test('database prevents destroying identity or deleting reservation history',()=>{
 const f=create();try{
   f.ledger.reserve(f.model.id,{invocationKey:key(15),estimatedUnits:1});
   assert.throws(()=>f.db.prepare('DELETE FROM provider_quota_calls').run(),/QUOTA_CALL_IMMUTABLE/);
   assert.throws(()=>f.db.prepare('UPDATE provider_quota_calls SET reserved_units=2').run(),/QUOTA_CALL_IMMUTABLE/);
   assert.equal(f.ledger.snapshot(f.model.id).pendingCalls,1);
 }finally{f.close()}
});

test('pending calls survive closing SQLite and are conservatively marked uncertain on restart',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r208-recover-'));const file=join(root,'studio.sqlite');
 try{
   let db=openProjectDb(file),providers=new ProviderAccountRepository(db);
   const acc=providers.createAccount({providerId:'groq',name:'Restart'});
   const m=providers.createModel(acc.id,{modelId:'llama-test',kind:'llm'});
   providers.setQuota(m.id,{source:'estimated',limit:8,used:0,rowVersion:1});
   const l=new QuotaLedgerRepository(db);l.reserve(m.id,{invocationKey:key(16),estimatedUnits:8});db.close();
   db=openProjectDb(file);const restored=new QuotaLedgerRepository(db);
   assert.equal(restored.recover(),1);assert.equal(restored.recover(),0);
   assert.equal(restored.snapshot(m.id).remainingUnits,0);
   assert.equal(restored.list(m.id).items[0].status,'uncertain');db.close();
 }finally{await rm(root,{recursive:true,force:true})}
});

test('v25 to v26 migration retains provider quota config and checkpoint backup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r208-migrate-')),file=join(root,'project.sqlite');
 try{
   const old=new DatabaseSync(file);old.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at INTEGER NOT NULL)');
   for(const m of migrations.slice(0,25)){
     old.exec('BEGIN IMMEDIATE');try{old.exec(m.sql);old.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(m.version,createHash('sha256').update(m.sql).digest('hex'),1);old.exec('COMMIT')}catch(e){old.exec('ROLLBACK');throw e}
   }
   old.prepare(`INSERT INTO provider_accounts(id,provider_id,name,created_at,updated_at) VALUES ('quota_test','groq','Old quota',1,1)`).run();
   old.prepare(`INSERT INTO provider_models(id,account_id,model_id,kind,location,cost_tier,quota_source,quota_limit,quota_used,created_at,updated_at)
     VALUES ('model_one','quota_test','llama','llm','remote','free_unverified','estimated',200,35,1,1)`).run();old.close();
   const migrated=openProjectDb(file);try{
     const state=new QuotaLedgerRepository(migrated).snapshot('model_one');
     assert.equal(state.remainingUnits,165);assert.ok(migrated.prepare('PRAGMA user_version').get().user_version>=26);
   }finally{migrated.close()}
   assert((await readdir(root)).some(x=>x.includes(`pre-v${migrations.at(-1).version}`)));
 }finally{await rm(root,{recursive:true,force:true})}
});
