/** FI-03 boot policy: consume verifyWorkspaceLock's `status` (not legacy
 * dependencyReproducibility's `lock` property). A valid lock can now reach
 * npm ci, while missing/tampered locks still fail closed. */
import {dependencyInstallPlan} from './fi02-release-core.mjs';

export function planLauncherInstall(lockCheck,{dependenciesPresent=false,skipInstall=false}={}){
  if(!lockCheck||!['PASS','BLOCKED','FAIL'].includes(lockCheck.status)){
    const error=new Error('LOCK_CHECK_INVALID');error.code='LOCK_CHECK_INVALID';throw error;
  }
  return dependencyInstallPlan({lockStatus:lockCheck.status,dependenciesPresent,skipInstall});
}
