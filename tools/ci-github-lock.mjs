#!/usr/bin/env node
/** CI lock gate: prevent misleading green runtime builds from floating npm installs.
 * Operator must commit a reviewed lockfile; this tool never installs packages. */
import {verifyWorkspaceLock} from './fi02-lock-policy.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await verifyWorkspaceLock(root);
if(result.status!=='PASS'){
  // No local paths, secrets or npm credentials are printed.
  console.error(`::error title=Unverified workspace lock::${result.status}: ${result.reason}. Run the manual Prepare npm lockfile workflow, review its artifact and commit package-lock.json.`);
  process.exitCode=1;
}else console.log(`WORKSPACE_LOCK_PASS verifiedWorkspaces=${result.verifiedWorkspaces}`);
