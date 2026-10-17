/** R2-12: real SQLite aggregate, conservative quota interpretation, immutable switch feed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,ProviderAccountRepository,ProviderMonitorR212,QuotaLedgerRepository,migrations} from '../src/index.mjs';
const fixture=()=>{
 const db=openProjectDb();const providers=new ProviderAccountRepository(db);const monitor=new ProviderMonitorR212(db,{clock:()=>1700000000000});
 return {db,providers,monitor,ledger:new QuotaLedgerRepository(db),close:()=>db.close()};
};
const add=(f,id,tier='free_unverified')=>{
 const a=f.providers.createAccount({providerId:'groq',name:`Account ${id}`});
 const m=f.providers.createModel(a.id,{modelId:'llama-70b',kind:'llm'});
 if(tier==='paid')f.db.prepare("UPDATE provider_models SET cost_tier='paid' WHERE id=?").run(m.id);
 return {a,m:{...m,id:m.id}};
};
const switchArgs=(from,to)=>({jobId:'job_00000001',attempt:1,fromModelId:from.m.id,
 toModelId:to.m.id,accountId:to.a.id,providerId:'groq'});
test('v27 migration applies after v26 and switch table exists',()=>{
 const f=fixture();try{assert.ok(migrations.some(m=>m.version===27));
 assert.ok(f.db.prepare('PRAGMA user_version').get().user_version>=27);
 assert.ok(f.db.prepare("SELECT name FROM sqlite_master WHERE name='provider_switch_events'").get());}finally{f.close()}
});
test('empty dashboard read is safe, bounded, and contains no imaginary switches',()=>{
 const f=fixture();try{assert.deepEqual(f.monitor.snapshot().items,[]);assert.deepEqual(f.monitor.snapshot().switches,[]);
 assert.equal(f.monitor.snapshot().switchCoverage,'remote_llm_success_only');
 assert.equal(f.monitor.snapshot().billingVerified,false);assert.equal(f.monitor.snapshot().liveQuotaChecked,false);}finally{f.close()}
});
test('local reservations make near-limit and exhausted badges, without changing state',()=>{
 const f=fixture();try{
 const {m}=add(f,'one');let changed=f.providers.setQuota(m.id,{source:'estimated',limit:100,used:50,rowVersion:m.rowVersion});
 f.ledger.reserve(m.id,{invocationKey:'monitor_hold_0001',estimatedUnits:42});
 let row=f.monitor.snapshot().items[0];assert.equal(row.remainingUnits,8);assert.equal(row.nearLimit,true);assert.equal(row.status,'local_limit_near');
 f.ledger.uncertain('monitor_hold_0001');assert.equal(f.monitor.snapshot().items[0].pendingUnits,42);
 f.providers.setQuota(m.id,{source:'estimated',limit:92,used:50,rowVersion:changed.rowVersion});
 row=f.monitor.snapshot().items[0];assert.equal(row.exhausted,true);assert.equal(row.status,'local_limit_exhausted');
 assert.equal(row.billingVerified,false);assert.equal(f.ledger.list(m.id).items[0].status,'uncertain');
 }finally{f.close()}
});
test('unknown quota and paid model show warning without fabricated balance/entitlement',()=>{
 const f=fixture();try{const {m}=add(f,'two','paid');const row=f.monitor.snapshot().items[0];
 assert.equal(row.quotaSource,'unknown');assert.equal(row.remainingUnits,null);assert.equal(row.requiresPaidApproval,true);
 assert.equal(row.status,'quota_unverified');assert.equal(row.billingVerified,false);
 assert.equal(JSON.stringify(f.monitor.snapshot()).includes('credentialId'),false);
 assert.equal(JSON.stringify(f.monitor.snapshot()).includes('endpoint'),false);
 }finally{f.close()}
});
test('disabled account not presented as runnable, but no automatic update',()=>{
 const f=fixture();try{const {a}=add(f,'three');f.providers.updateAccount(a.id,{rowVersion:a.rowVersion,status:'disabled'});
 assert.equal(f.monitor.snapshot().items[0].status,'disabled');}finally{f.close()}
});
test('recorded successful, equivalent, free switch is append-only and idempotent',()=>{
 const f=fixture();try{const one=add(f,'four'),two=add(f,'five');const args=switchArgs(one,two);
 f.monitor.recordFreeSwitch(args);f.monitor.recordFreeSwitch(args);
 assert.equal(f.monitor.snapshot().switches.length,1);const item=f.monitor.snapshot().switches[0];
 assert.equal(item.status,'succeeded');assert.equal(item.fromModelId,one.m.id);assert.equal(item.consent,'explicit_remote_runtime');
 assert.equal(item.billingGate,'confirmed_free_allowlist');
 assert.throws(()=>f.db.prepare("UPDATE provider_switch_events SET status='succeeded'").run(),/IMMUTABLE_SWITCH_EVENT/);
 assert.throws(()=>f.db.prepare('DELETE FROM provider_switch_events').run(),/IMMUTABLE_SWITCH_EVENT/);
 }finally{f.close()}
});
test('switch recording refuses paid target, mismatched model and invalid args',()=>{
 const f=fixture();try{const one=add(f,'six'),two=add(f,'seven','paid');
 assert.throws(()=>f.monitor.recordFreeSwitch(switchArgs(one,two)),e=>e.code==='PROVIDER_SWITCH_NOT_EQUIVALENT');
 assert.throws(()=>f.monitor.recordFreeSwitch({...switchArgs(one,two),jobId:'bad/key'}),e=>e.code==='INVALID_PROVIDER_SWITCH');
 assert.throws(()=>f.monitor.recordFreeSwitch({...switchArgs(one,two),fromModelId:two.m.id,toModelId:two.m.id}),e=>e.code==='INVALID_PROVIDER_SWITCH');
 assert.equal(f.monitor.snapshot().switches.length,0);
 }finally{f.close()}
});
test('bounded event feed rejects oversized/invalid page requests',()=>{
 const f=fixture();try{for(const limit of [0,51,-1,1.5,Number.NaN,'20'])
  assert.throws(()=>f.monitor.snapshot({limit}),e=>e.code==='INVALID_MONITOR_LIMIT');
 assert.deepEqual(f.monitor.snapshot({limit:1}).switches,[]);}finally{f.close()}
});
