/** R2-10 view contract: no monetary/billing inference from a local token ledger. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {quotaLedgerView,quotaUnitLabel,quotaTimeLabel,QUOTA_LEDGER_PAGE_LIMIT,quotaCallLabels} from './quota-ledger-view.mjs';
const modelId='quota-model-1';
const make=(summary={},items=[])=>( {modelId,summary:{modelId,source:'estimated',limit:100,used:20,
 pendingUnits:30,pendingCalls:2,remainingUnits:50,admitted:true,quotaVerified:false,billingVerified:false,...summary},items});
const row=(status='reserved',fields={})=>({modelId,invocationKey:'opaque_00001',reservedUnits:9,
 actualUnits:status==='settled'?6:null,status,createdAt:1700000000000,updatedAt:1700000000010,...fields});

test('R2-10 honors held reservations in local remaining units',()=>{
 const v=quotaLedgerView(make(),modelId);
 assert.equal(v.remaining,50);assert.equal(v.used,20);assert.equal(v.pending,30);
 assert.equal(v.percentUsed,20);assert.equal(v.percentHeld,30);
});
test('R2-10 does not assert free entitlement when admitted locally',()=>{
 const v=quotaLedgerView(make({billingVerified:true}),modelId);
 assert.equal(v.billingVerified,false);assert.match(v.admissionNotice,/KHÔNG/);
});
test('R2-10 unknown limits never become numeric free balances',()=>{
 const v=quotaLedgerView(make({source:'unknown',limit:null,used:null,remainingUnits:null}),modelId);
 assert.equal(v.known,false);assert.equal(v.remaining,null);assert.equal(v.limit,null);
 assert.match(v.sourceNotice,/Chưa biết/);assert.equal(quotaUnitLabel(v.remaining),'Không xác định');
});
test('R2-10 provider_verified source does not imply billing verification',()=>{
 const v=quotaLedgerView(make({source:'provider_verified',quotaVerified:true,billingVerified:true}),modelId);
 assert.equal(v.billingVerified,false);assert.match(v.sourceNotice,/không đối soát/);
});
test('R2-10 fails closed when internal source claims untrusted limit as known',()=>{
 const v=quotaLedgerView(make({source:'unknown'}),modelId);
 assert.equal(v.known,false);assert.equal(v.remaining,null);
});
test('R2-10 shows opaque call metadata only, never keys, prompts or provider messages',()=>{
 const v=quotaLedgerView(make({},[row('settled',{prompt:'private text',invocationKey:'secret_key'})]),modelId);
 assert.deepEqual(Object.keys(v.items[0]).sort(),['actualUnits','createdAt','label','reservedUnits','status'].sort());
 assert.equal(JSON.stringify(v).includes('private text'),false);assert.equal(JSON.stringify(v).includes('secret_key'),false);
});
test('R2-10 reports uncertain holds without refunding',()=>{
 const v=quotaLedgerView(make({},[row('uncertain'),row('settled'),row('reserved')]),modelId);
 assert.equal(v.uncertainCount,1);assert.match(v.items[0].label,/vẫn giữ hạn mức/);
 assert.equal(v.remaining,50);
});
test('R2-10 cannot be confused by stale cross-model HTTP response',()=>{
 assert.throws(()=>quotaLedgerView({...make(),modelId:'other-model'},modelId),/INVALID_QUOTA_LEDGER_RESPONSE/);
 assert.throws(()=>quotaLedgerView(make({modelId:'other-model'}),modelId),/INVALID_QUOTA_LEDGER_RESPONSE/);
});
test('R2-10 bounds list size and refuses malformed numeric payloads',()=>{
 assert.equal(QUOTA_LEDGER_PAGE_LIMIT,20);
 assert.throws(()=>quotaLedgerView(make({},Array.from({length:21},()=>row())),modelId));
 for(const change of [{pendingUnits:-1},{limit:'100'},{remainingUnits:-3},{pendingCalls:1.25},{used:NaN}])
  assert.throws(()=>quotaLedgerView(make(change),modelId));
});
test('R2-10 refuses unexpected statuses, models, negative and missing actual units',()=>{
 for(const wrong of [row('cancelled'),row('reserved',{modelId:'other'}),row('reserved',{reservedUnits:-1}),
   row('settled',{actualUnits:null}),row('reserved',{createdAt:'today'})])
   assert.throws(()=>quotaLedgerView(make({},[wrong]),modelId));
});
test('R2-10 percentages stay bounded after operator decreases limit',()=>{
 const v=quotaLedgerView(make({limit:10,used:20,pendingUnits:100,remainingUnits:0,admitted:false}),modelId);
 assert.equal(v.percentUsed,100);assert.equal(v.percentHeld,100);
 assert.match(v.admissionNotice,/Không đủ điều kiện/);
});
test('R2-10 status and timestamp formatting is deterministic and safe',()=>{
 assert.equal(quotaCallLabels.uncertain,'Chưa xác định — vẫn giữ hạn mức');
 assert.equal(quotaTimeLabel(-5),'Không rõ thời điểm');
 assert.equal(quotaTimeLabel(10**20),'Không rõ thời điểm');
 assert.equal(quotaUnitLabel(-100),'Không xác định');
 assert.equal(typeof quotaTimeLabel(1700000000000),'string');
});

test('R2-10 mismatched backend remaining arithmetic fails rather than show positive quota',()=>{
 assert.throws(()=>quotaLedgerView(make({remainingUnits:95}),modelId),/INVALID_QUOTA_LEDGER_RESPONSE/);
 assert.throws(()=>quotaLedgerView(make({used:Number.MAX_SAFE_INTEGER,pendingUnits:30}),modelId),/INVALID_QUOTA_LEDGER_RESPONSE/);
 const v=quotaLedgerView(make({remainingUnits:0,limit:50,used:20,pendingUnits:30,admitted:true}),modelId);
 assert.equal(v.admitted,false);
});
