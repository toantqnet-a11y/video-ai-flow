/**
 * Safe smoke check for R0-04 without starting Fastify or using cloud services.
 * Writes only redacted readiness metadata. Never shares the SQLite filename,
 * executable paths, GPU serials, host name, or raw child-process output.
 */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createDiagnosticsService} from '../apps/api/src/diagnostics.mjs';
const dir=mkdtempSync(join(tmpdir(),'contentstudio-r004-'));
const db=new DatabaseSync(join(dir,'smoke.sqlite'));
try {
  db.exec('PRAGMA journal_mode=WAL');
  const report=await createDiagnosticsService({db,dataRoot:dir,registry:{list:()=>[]}}).get();
  console.log(JSON.stringify(report,null,2));
}finally {db.close();rmSync(dir,{recursive:true,force:true})}
