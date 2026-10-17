#!/usr/bin/env node
/**
 * R0-02 offline database diagnostics / manual snapshot helper.
 * Intentionally never auto-restores or edits schema: restoring into a live
 * SQLite WAL DB could silently discard committed user work. This is a tool
 * for a fully stopped application, and outputs metadata only (no prompts/keys).
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertHealthy, backupProjectDb } from '../packages/core/src/db.mjs';

const [operation,fileArg]=process.argv.slice(2);
if(!['inspect','backup'].includes(operation)||!fileArg){
  console.error('Usage: node tools/db-maintenance.mjs inspect|backup <path/to/studio.sqlite>');
  process.exitCode=2;
} else {
  const filename=resolve(fileArg);
  if(!existsSync(filename)) {console.error('DATABASE_NOT_FOUND');process.exitCode=2;}
  else {
    let db;
    try {
      db=new DatabaseSync(filename,{readOnly:operation==='inspect'});
      assertHealthy(db);
      const hasLedger=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
      const version=hasLedger?db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v??0:0;
      const result={ok:true,schemaVersion:version,journalMode:db.prepare('PRAGMA journal_mode').get().journal_mode,
        foreignKeyCheck:'ok',quickCheck:'ok'};
      if(operation==='backup') result.backup=backupProjectDb(db,filename,'manual');
      console.log(JSON.stringify(result,null,2));
    } catch(e){ console.error(`DB_CHECK_FAILED: ${e.message}`);process.exitCode=1; }
    finally {try{db?.close()}catch{}}
  }
}
