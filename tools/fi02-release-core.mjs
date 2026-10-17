/** FI-02 release policy is intentionally independent of npm/runtime packages.
 * A missing live proof stays BLOCKED; historical fixtures never turn into PASS.
 * This module contains only policy/pure functions so negative controls can test
 * it on hosts without HyperFrames or a browser.
 */
export const RELEASE_GATES = Object.freeze([
 'node22','ffmpeg','ffprobe','rendererPinned','dependencyLock','localHyperframesCli',
 'fullOfflineSuite','fi02FocusedTests','apiContract','sdkTypecheck','negativeControl',
 'frontendBuild','liveHttp','realHyperframesFinishing','windowsBrowserUX',
 'real35MinuteRender','longRenderRestartRecovery','realProvidersWithConsent',
 'dependencySecurityAudit','productionSecurityReview'
]);
const VALID = new Set(['PASS','BLOCKED','FAIL']);
export function gate(status,detail,proof=null){
 if(!VALID.has(status))throw new TypeError('FI02_INVALID_GATE_STATUS');
 // Never store stdout, source paths, keys or request bodies in release reports.
 if(typeof detail!=='string'||detail.length>250)throw new TypeError('FI02_INVALID_GATE_DETAIL');
 return {status,detail,...(proof?{proof}:{})};
}
export function releaseSummary(gates){
 const keys=Object.keys(gates);
 if(keys.length!==RELEASE_GATES.length||RELEASE_GATES.some(k=>!Object.hasOwn(gates,k)))
  throw new TypeError('FI02_MISSING_REQUIRED_GATE');
 const statuses=keys.map(k=>gates[k]?.status);
 if(statuses.some(x=>!VALID.has(x)))throw new TypeError('FI02_INVALID_GATE_STATUS');
 const summary={pass:statuses.filter(x=>x==='PASS').length,
  blocked:statuses.filter(x=>x==='BLOCKED').length,fail:statuses.filter(x=>x==='FAIL').length};
 return {summary,status:summary.fail?'FAILED':summary.blocked?'NOT_READY':'READY_FOR_MANUAL_REVIEW'};
}
/** A real host still cannot be accepted without live render, long render,
 * manual browser and security proof, regardless of its offline test count.
 */
export function freshEvidenceRequired(gates){
 const required=['realHyperframesFinishing','windowsBrowserUX','real35MinuteRender',
  'longRenderRestartRecovery','realProvidersWithConsent','productionSecurityReview'];
 return required.every(k=>gates[k]?.status==='PASS');
}

/** A production launcher MUST use lock-based `npm ci` or refuse start.
 * `npm install` on first launch would silently resolve a new dependency graph.
 */
export function dependencyInstallPlan({lockStatus,dependenciesPresent,skipInstall=false}){
 if(lockStatus!=='PASS'){
  const e=new Error('PACKAGE_LOCK_UNVERIFIED');e.code='PACKAGE_LOCK_UNVERIFIED';throw e;
 }
 if(dependenciesPresent)return null;
 if(skipInstall){const e=new Error('DEPENDENCIES_MISSING_SKIP_INSTALL');e.code=e.message;throw e;}
 return ['ci','--no-audit','--no-fund'];
}
