/** R2-10: pure presentation rules for an *internal* quota ledger.
 * WHY: provider quota, operator-entered ceilings, and billing balances are
 * different facts. This view must never turn local reservations into a claim
 * that an external API is free or that the provider has issued more quota.
 */
const safeUnit=n=>Number.isSafeInteger(n)&&n>=0;
const sources=new Set(['unknown','estimated','provider_verified']);
const statuses=new Set(['reserved','settled','uncertain']);
export const QUOTA_LEDGER_PAGE_LIMIT=20;
export const quotaCallLabels=Object.freeze({reserved:'Đang giữ hạn mức',settled:'Đã ghi nhận dùng',uncertain:'Chưa xác định — vẫn giữ hạn mức'});

/** Guard against malformed/stale HTTP payloads; never fabricate positive balances. */
export function quotaLedgerView(response,expectedModelId){
  if(!response||response.modelId!==expectedModelId||response.summary?.modelId!==expectedModelId||
    !Array.isArray(response.items)||response.items.length>QUOTA_LEDGER_PAGE_LIMIT)
    throw new Error('INVALID_QUOTA_LEDGER_RESPONSE');
  const s=response.summary;
  if(!sources.has(s.source)||!safeUnit(s.pendingUnits)||!safeUnit(s.pendingCalls)||
    ![null,undefined].includes(s.limit)&&!safeUnit(s.limit)||
    ![null,undefined].includes(s.used)&&!safeUnit(s.used)||
    ![null,undefined].includes(s.remainingUnits)&&!safeUnit(s.remainingUnits)||
    typeof s.billingVerified!=='boolean'||typeof s.admitted!=='boolean')
    throw new Error('INVALID_QUOTA_LEDGER_RESPONSE');
  const known=s.limit!==null&&s.limit!==undefined&&s.used!==null&&s.used!==undefined&&
    s.remainingUnits!==null&&s.remainingUnits!==undefined&&s.source!=='unknown';
  // A fabricated / stale remaining field must NEVER become an optimistic
  // availability label. Use the same held-capacity equation as R2-08.
  if(known&&(!Number.isSafeInteger(s.used+s.pendingUnits)||
    s.remainingUnits!==Math.max(0,s.limit-s.used-s.pendingUnits)))
    throw new Error('INVALID_QUOTA_LEDGER_RESPONSE');
  const items=response.items.map(row=>{
    if(row.modelId!==expectedModelId||!statuses.has(row.status)||!safeUnit(row.reservedUnits)||
      row.reservedUnits===0||![null,undefined].includes(row.actualUnits)&&!safeUnit(row.actualUnits)||
      row.status==='settled'&&!safeUnit(row.actualUnits)||!safeUnit(row.createdAt))
      throw new Error('INVALID_QUOTA_LEDGER_RESPONSE');
    return Object.freeze({status:row.status,label:quotaCallLabels[row.status],
      reservedUnits:row.reservedUnits,actualUnits:row.actualUnits??null,createdAt:row.createdAt});
  });
  return Object.freeze({
    source:s.source,known,limit:known?s.limit:null,used:known?s.used:null,
    pending:known?s.pendingUnits:null,pendingCalls:s.pendingCalls,
    remaining:known?s.remainingUnits:null,admitted:s.admitted&&(!known||s.remainingUnits>0),
    billingVerified:false, // Intentionally not inferred from a configuration flag.
    percentUsed:known&&s.limit>0?Math.min(100,Math.round(s.used/s.limit*100)):0,
    percentHeld:known&&s.limit>0?Math.min(100,Math.round(s.pendingUnits/s.limit*100)):0,
    items:Object.freeze(items),uncertainCount:items.filter(x=>x.status==='uncertain').length,
    sourceNotice:s.source==='unknown'
      ?'Chưa biết hạn mức nhà cung cấp. Không thể suy ra còn quota hoặc được dùng miễn phí.'
      :s.source==='estimated'
        ?'Hạn mức nhập thủ công tại máy; không được nhà cung cấp xác nhận.'
        :'Trường nguồn được gắn cờ provider_verified; màn hình này không đối soát hóa đơn hoặc xác nhận miễn phí.',
    admissionNotice:s.admitted?'Cho phép xét tiếp theo chính sách nội bộ, KHÔNG phải quyền gọi API miễn phí.'
      :'Không đủ điều kiện theo cơ chế kiểm tra nội bộ; không tự động retry hay chuyển sang API trả phí.'
  });
}
export function quotaTimeLabel(epoch){
  if(!safeUnit(epoch)||epoch>8_640_000_000_000_000)return 'Không rõ thời điểm';
  try {return new Date(epoch).toLocaleString('vi-VN');}catch{return 'Không rõ thời điểm';}
}
export const quotaUnitLabel=value=>safeUnit(value)?value.toLocaleString('vi-VN'):'Không xác định';
