#!/usr/bin/env node
/** Explicit CLI is intentionally unavailable over HTTP. Operator stops the app before restore. */
import {DatabaseSync} from 'node:sqlite';
import {createVerifiedBackup,verifyBackup,restoreBackupToEmpty,inspectStorage,quarantineStaleTemp} from '../packages/core/src/maintenance-r402-r403.mjs';
const [cmd,...args]=process.argv.slice(2);
try{
 let out;
 if(cmd==='backup')out=await createVerifiedBackup({dbPath:args[0],dataRoot:args[1],backupDir:args[2]});
 else if(cmd==='verify')out=await verifyBackup(args[0]);
 else if(cmd==='restore-dry-run'||cmd==='restore-to-empty')out=await restoreBackupToEmpty({backupDir:args[0],targetDbPath:args[1],targetDataRoot:args[2],confirm:cmd==='restore-to-empty'&&args[3]==='--confirm-new-target'});
 else if(cmd==='inspect'||cmd==='quarantine'){
  const db=new DatabaseSync(args[0],{readOnly:true});try{out=cmd==='inspect'?await inspectStorage({db,dataRoot:args[1]}):await quarantineStaleTemp({db,dataRoot:args[1],quarantineDir:args[2],expectedDigest:args[3]});}finally{db.close();}
 } else throw new Error('Usage: backup DB DATA_ROOT NEW_BACKUP_DIR | verify BACKUP_DIR | restore-dry-run BACKUP_DIR NEW_DB NEW_DATA | restore-to-empty BACKUP_DIR NEW_DB NEW_DATA --confirm-new-target | inspect DB DATA_ROOT | quarantine DB DATA_ROOT NEW_QUARANTINE_DIR PLAN_DIGEST');
 console.log(JSON.stringify(out,null,2));
}catch(e){console.error(e.code||e.message);process.exitCode=1;}
