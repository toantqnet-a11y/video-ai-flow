/** R2-12 defensive presentation model. Unverified local numbers are NOT
 * upstream free entitlement. A switch event must be actual and auditable. */
const states=new Set(['disabled','local_limit_exhausted','local_limit_near','quota_unverified','local_configured','local_limit_ok']);
const source=new Set(['unknown','estimated','provider_verified']);
const safe=x=>Number.isSafeInteger(x)&&x>=0;
export const monitoringStatusLabel=Object.freeze({
  disabled:'Đã tắt',local_limit_exhausted:'Hết hạn mức nội bộ',
  local_limit_near:'Sắp chạm giới hạn nội bộ',quota_unverified:'Chưa rõ quota',
  local_configured:'Local đã cấu hình',local_limit_ok:'Theo giới hạn nội bộ: còn dung lượng'
});
export function providerMonitorView(payload){
  if(!payload||!Array.isArray(payload.items)||payload.items.length>100||
    !Array.isArray(payload.switches)||payload.switches.length>50||
    !safe(payload.asOf)||typeof payload.truncated!=='boolean'||
    payload.switchCoverage!=='remote_llm_success_only'||payload.liveQuotaChecked!==false||
    payload.billingVerified!==false)throw new Error('INVALID_PROVIDER_MONITOR_RESPONSE');
  const items=payload.items.map(m=>{
    if(!m||!states.has(m.status)||!source.has(m.quotaSource)||!safe(m.pendingUnits)||
      !safe(m.pendingCalls)||typeof m.modelId!=='string'||typeof m.id!=='string'||
      typeof m.providerId!=='string'||!['local','remote'].includes(m.location)||
      !['local','free_unverified','paid'].includes(m.costTier)||
      m.billingVerified!==false||typeof m.nearLimit!=='boolean'||
      typeof m.exhausted!=='boolean'||m.requiresPaidApproval!==(m.costTier==='paid'))
      throw new Error('INVALID_PROVIDER_MONITOR_RESPONSE');
    const known=m.quotaSource!=='unknown'&&m.limit!==null&&m.used!==null&&m.remainingUnits!==null;
    if(known&&(!safe(m.limit)||!safe(m.used)||!safe(m.remainingUnits)||
      !Number.isSafeInteger(m.used+m.pendingUnits)||
      m.remainingUnits!==Math.max(0,m.limit-m.used-m.pendingUnits)))
      throw new Error('INVALID_PROVIDER_MONITOR_RESPONSE');
    if(!known&&m.remainingUnits!==null)throw new Error('INVALID_PROVIDER_MONITOR_RESPONSE');
    const label=monitoringStatusLabel[m.status];
    return {id:m.id,modelId:m.modelId,accountId:m.accountId,accountName:m.accountName,
      providerId:m.providerId,kind:m.kind,location:m.location,costTier:m.costTier,
      status:m.status,label,quotaSource:m.quotaSource,remainingUnits:known?m.remainingUnits:null,
      pendingCalls:m.pendingCalls,nearLimit:m.nearLimit,exhausted:m.exhausted,
      requiresPaidApproval:m.requiresPaidApproval};
  });
  const switches=payload.switches.map(e=>{
    if(!e||!safe(e.seq)||e.seq===0||e.status!=='succeeded'||
      e.consent!=='explicit_remote_runtime'||e.billingGate!=='confirmed_free_allowlist'||
      !safe(e.createdAt)||typeof e.fromModelId!=='string'||typeof e.toModelId!=='string'||
      typeof e.jobId!=='string')throw new Error('INVALID_PROVIDER_MONITOR_RESPONSE');
    return {seq:e.seq,jobId:e.jobId,fromModelId:e.fromModelId,
      toModelId:e.toModelId,providerId:e.providerId,createdAt:e.createdAt,
      label:'Đổi tài khoản model tương đương (free đã được allowlist)'};
  });
  return {items,switches,truncated:payload.truncated,asOf:payload.asOf,
    nearCount:items.filter(x=>x.nearLimit).length,
    exhaustedCount:items.filter(x=>x.exhausted).length,
    unknownCount:items.filter(x=>x.status==='quota_unverified').length,
    paidCount:items.filter(x=>x.requiresPaidApproval).length};
}
