/** R2-10: the quota UI's read service must not settle or refund holds. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,ProviderAccountRepository,QuotaLedgerRepository} from '../src/index.mjs';
import {quotaLedgerView} from '../../../apps/web/src/quota-ledger-view.mjs';
test('R2-10 real SQLite read reflects holds without changing the ledger or provider quota',()=>{
 const db=openProjectDb();
 try{
  const p=new ProviderAccountRepository(db);const a=p.createAccount({providerId:'groq',name:'Internal only'});
  let m=p.createModel(a.id,{modelId:'offline-local-ui',kind:'llm'});
  m=p.setQuota(m.id,{rowVersion:m.rowVersion,source:'estimated',limit:100,used:7});
  const ledger=new QuotaLedgerRepository(db);
  ledger.reserve(m.id,{invocationKey:'quota_inspection_000001',estimatedUnits:40});
  ledger.uncertain('quota_inspection_000001');
  const before=db.prepare('SELECT status,reserved_units,updated_at FROM provider_quota_calls').get();
  const s=quotaLedgerView({modelId:m.id,summary:ledger.snapshot(m.id),...ledger.list(m.id,{limit:20})},m.id);
  assert.equal(s.remaining,53);assert.equal(s.pending,40);assert.equal(s.uncertainCount,1);
  assert.deepEqual(db.prepare('SELECT status,reserved_units,updated_at FROM provider_quota_calls').get(),before);
  assert.equal(p.getModel(m.id).quota.used,7);
 }finally{db.close()}
});
