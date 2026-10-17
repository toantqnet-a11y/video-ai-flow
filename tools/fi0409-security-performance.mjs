#!/usr/bin/env node
/** FI-04-09: repeatable local security regression + opt-in npm dependency
 * audit. Security test PASS is NOT a pen-test or Windows secret audit.
 * No remote calls except operator-requested npm audit. */
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyWorkspaceLock} from './fi02-lock-policy.mjs';
import {ROOT,options,reportFile,output,timestamp} from './fi04-final-gate-core.mjs';
const securityTests=['packages/core/test/render-env-fi03.test.mjs','packages/core/test/render-safety-r313.test.mjs','apps/api/test/security-r003.test.mjs','tools/fi02-release.test.mjs'];
function command(binary,args,timeout=120000){const r=spawnSync(binary,args,{cwd:ROOT,timeout,windowsHide:true,stdio:'ignore',env:{...process.env,CI:'1'}});
 return {status:r.status===0?'PASS':'FAIL',exitCode:r.status,errorCode:r.error?.code??null};}
export function classifySecurityAcceptance({lock,localTests,npmAudit,windowsSecurityReview,perfMeasured}={}){
 const checks={dependencyLock:lock==='PASS'?'PASS':'BLOCKED',securityRegression:localTests==='PASS'?'PASS':'BLOCKED',
  auditedDependencies:npmAudit==='PASS'?'PASS':'BLOCKED',windowsSecretExposureReview:windowsSecurityReview===true?'MANUAL_REVIEW_REQUIRED':'BLOCKED',
  longRealRenderCpuRamDiskGpuProfile:perfMeasured===true?'MANUAL_REVIEW_REQUIRED':'BLOCKED'};
 return {status:'NOT_READY',gates:checks};
}
export async function inspectSecurity({verify=false,allowNetworkAudit=false}={}){
 const lock=await verifyWorkspaceLock(ROOT);
 const localTests=verify?command(process.execPath,['--test',...securityTests]):{status:'BLOCKED'};
 const audit=verify&&allowNetworkAudit&&lock.status==='PASS'?command(process.platform==='win32'?'npm.cmd':'npm',['audit','--omit=dev','--audit-level=high','--json'],120000):{status:'BLOCKED'};
 return {task:'FI-04-09',timestamp:timestamp(),...classifySecurityAcceptance({lock:lock.status,localTests:localTests.status,npmAudit:audit.status}),
  evidence:{lock:lock.status,focusedSecurityTests:localTests.status,npmAudit:audit.status},
  limits:'npm audit can contact registry ONLY with --allow-network-audit; production security and VRAM profile require explicit operator review; no blanket security approval'};
}
async function main(){const a=options(process.argv.slice(2),['inspect','verify','allow-network-audit'],['report']);
 if(!!a.inspect===!!a.verify||a['allow-network-audit']&&!a.verify)throw Error('FI0409_INVALID_MODE');
 const r=await inspectSecurity({verify:!!a.verify,allowNetworkAudit:!!a['allow-network-audit']});await reportFile(a.report,r);output(r,!!a.verify);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
