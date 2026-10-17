/** R4-02/03. Offline-only verified snapshots and conservative storage inventory.
 * No HTTP route: backup/restore requires exclusive operator access, never a
 * running SQLite writer or an unlocked credentials vault. No recursive deletes.
 */
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,copyFile,readFile,writeFile,rename,rm,lstat,realpath,readdir,stat} from 'node:fs/promises';
import {resolve,relative,join,dirname,sep} from 'node:path';
import {assertHealthy} from './db.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function digest(path){return await new Promise((ok,bad)=>{const hash=createHash('sha256');const stream=createReadStream(path);stream.on('error',bad);stream.on('data',b=>hash.update(b));stream.on('end',()=>ok(hash.digest('hex')));});}
function rel(root,path){const p=relative(root,path).replaceAll('\\','/');if(!p||p==='..'||p.startsWith('../')||p.startsWith('/')||p.split('/').includes('..'))fail('R4_UNSAFE_PATH');return p;}
async function fileUnder(root,relativePath){
 if(!relativePath||relativePath.split('/').some(p=>!p||p==='.'||p==='..')||relativePath.includes('\\'))fail('R4_UNSAFE_PATH');
 const absolute=resolve(root,relativePath);if(!absolute.startsWith(root+sep))fail('R4_UNSAFE_PATH');
 let cur=root;for(const part of relativePath.split('/')){cur=join(cur,part);const s=await lstat(cur);if(s.isSymbolicLink())fail('R4_SYMLINK_BLOCKED');}
 const s=await lstat(absolute);if(!s.isFile())fail('R4_EXPECTED_FILE');return {absolute,size:s.size};
}
async function fileList(root,prefix='',depth=0){
 if(depth>18)fail('R4_STORAGE_DEPTH');
 const output=[];for(const entry of await readdir(join(root,prefix),{withFileTypes:true})){
  if(entry.isSymbolicLink())continue;
  const next=[prefix,entry.name].filter(Boolean).join('/');
  if(entry.isDirectory())output.push(...await fileList(root,next,depth+1));
  else if(entry.isFile())output.push(next);
 }return output;
}
/** Only media referenced by committed asset revisions or segment cache is portable.
 * Unknown user files and vault material are deliberately excluded. */
export function referencedMedia(db,dataRoot){
 const root=resolve(dataRoot),set=new Set();
 for(const row of db.prepare("SELECT file_path FROM asset_revisions WHERE state='committed'").all()){
  const path=resolve(root,row.file_path);set.add(rel(root,path));
 }
 const hasCache=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='render_segment_cache'").get();
 if(hasCache)for(const row of db.prepare('SELECT relative_path FROM render_segment_cache').all())set.add(rel(root,resolve(root,row.relative_path)));
 return [...set].sort();
}
function snapshotDb(path){const db=new DatabaseSync(path);try{assertHealthy(db);return db;}catch(e){db.close();throw e;}}
/** R4-02: hot WAL-safe, verified backup in an atomically renamed directory. */
export async function createVerifiedBackup({dbPath,dataRoot,backupDir}){
 const dbFile=resolve(dbPath),root=await realpath(dataRoot),dest=resolve(backupDir);
 if(dest===root||dest.startsWith(root+sep)||dest===dirname(dbFile))fail('R4_BACKUP_UNSAFE_DESTINATION');
 try{await lstat(dest);fail('R4_BACKUP_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 const stage=dest+'.partial-'+randomUUID();await mkdir(join(stage,'media'),{recursive:true,mode:0o700});
 let db;try{
  db=snapshotDb(dbFile);const files=referencedMedia(db,root);
  // Include final render outputs even when their only reference lives in the
  // queue result JSON (not the domain asset_revisions table). Never include
  // staging/tmp files, vault, tokens or arbitrary root-level user files.
  for(const area of ['renders','channel-avatars','music']){
   try{for(const path of await fileList(root,area))if(!/\.(?:partial|tmp|incomplete)$/.test(path)&&
    (area==='music'?/^music\/[A-Za-z0-9-]{1,100}\/[a-f0-9]{64}\.(?:mp3|wav|m4a)$/.test(path):
     /\.(?:mp4|srt|jpg|jpeg|png)$/.test(path)))files.push(path);}
   catch(e){if(e.code!=='ENOENT')throw e;}
  }
  files.splice(0,files.length,...new Set(files));files.sort();
  const expected=new Map(db.prepare("SELECT file_path,sha256,bytes FROM asset_revisions WHERE state='committed'").all().map(r=>[rel(root,resolve(root,r.file_path)),{sha256:r.sha256,bytes:r.bytes}]));
  const snapshot=join(stage,'project.sqlite');db.exec(`VACUUM INTO '${snapshot.replaceAll("'","''")}'`);
  const check=new DatabaseSync(snapshot,{readOnly:true});try{assertHealthy(check);}finally{check.close();}
  for(const path of files.filter(x=>x.startsWith('music/'))){
   // User-uploaded BGM is content-addressed and must survive backup/restore.
   expected.set(path,{sha256:path.split('/').at(-1).split('.')[0]});
  }
  const avatars=db.prepare("SELECT channel_id,file_name,sha256,bytes FROM channel_avatar_revisions").all();
  for(const row of avatars)expected.set(`channel-avatars/${row.channel_id}/${row.file_name}`,{sha256:row.sha256,bytes:row.bytes});
  db.close();db=null;
  const entries=[];
  for(const path of files){const input=await fileUnder(root,path);const before=await digest(input.absolute);if(expected.has(path)&&(expected.get(path).sha256!==before||(expected.get(path).bytes!==undefined&&expected.get(path).bytes!==input.size)))fail('R4_BACKUP_SOURCE_CORRUPT');const target=join(stage,'media',path);await mkdir(dirname(target),{recursive:true});await copyFile(input.absolute,target);
   const after=await digest(target);if(before!==after)fail('R4_BACKUP_MEDIA_CHANGED');entries.push({path,bytes:input.size,sha256:after});}
  const database={bytes:(await stat(snapshot)).size,sha256:await digest(snapshot)};
  const manifest={format:'ContentStudio-Backup-v1',createdAt:new Date().toISOString(),database,media:entries,excluded:['vault','credentials','keys','unreferenced files']};
  await writeFile(join(stage,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});await rename(stage,dest);
  return {directory:dest,mediaCount:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes,0)+database.bytes};
 }catch(error){await rm(stage,{recursive:true,force:true});throw error;}finally{db?.close();}
}
export async function verifyBackup(directory){
 const root=await realpath(directory);await fileUnder(root,'manifest.json');const raw=await readFile(join(root,'manifest.json'));
 if(raw.length>20_000_000)fail('R4_MANIFEST_TOO_LARGE');
 let m;try{m=JSON.parse(raw);}catch{fail('R4_MANIFEST_INVALID');}
 if(m?.format!=='ContentStudio-Backup-v1'||!Array.isArray(m.media)||m.media.length>100000||!m.database?.sha256)fail('R4_MANIFEST_INVALID');
 const dbFile=await fileUnder(root,'project.sqlite');if(dbFile.size!==m.database.bytes||await digest(dbFile.absolute)!==m.database.sha256)fail('R4_BACKUP_DB_TAMPERED');
 const db=new DatabaseSync(dbFile.absolute,{readOnly:true});try{assertHealthy(db); // Check no ledger/schema downgrade is silently approved.
  const existing=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();if(!existing)fail('R4_BACKUP_SCHEMA_MISSING');
 }finally{db.close();}
 const seen=new Set();let bytes=dbFile.size;
 for(const f of m.media){if(typeof f?.path!=='string'||!Number.isSafeInteger(f.bytes)||!(/^[0-9a-f]{64}$/.test(f.sha256))||seen.has(f.path))fail('R4_MANIFEST_INVALID');seen.add(f.path);
  const file=await fileUnder(root,'media/'+f.path);if(file.size!==f.bytes||await digest(file.absolute)!==f.sha256)fail('R4_BACKUP_MEDIA_TAMPERED');bytes+=f.bytes;}
 return {verified:true,database:m.database,media:m.media,mediaCount:m.media.length,bytes};
}
/** Restore is *new-location only*. Never overwrite a live project or vault. */
export async function restoreBackupToEmpty({backupDir,targetDbPath,targetDataRoot,confirm=false}){
 const proof=await verifyBackup(backupDir);if(!confirm)return {dryRun:true,mediaCount:proof.mediaCount,bytes:proof.bytes};
 const dbTarget=resolve(targetDbPath),dataTarget=resolve(targetDataRoot),source=await realpath(backupDir);
 if(dbTarget.startsWith(source+sep)||dataTarget.startsWith(source+sep)||dataTarget===source||dbTarget===dataTarget)fail('R4_RESTORE_UNSAFE_TARGET');
 for(const target of [dbTarget,dataTarget]){try{await lstat(target);fail('R4_RESTORE_DESTINATION_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}}
 // The canonical asset manifest stores portable RELATIVE paths, so moving
 // to a different data root does not rewrite immutable revision rows.
 const db=new DatabaseSync(join(source,'project.sqlite'),{readOnly:true});try{
  for(const row of db.prepare("SELECT file_path FROM asset_revisions WHERE state='committed'").all())
   rel('/portable-root',resolve('/portable-root',row.file_path));
 }finally{db.close();}
 // Fail closed rather than leaving partial assets in a preexisting installation.
 await mkdir(dirname(dbTarget),{recursive:true});await mkdir(dataTarget,{recursive:true,mode:0o700});
 try{await copyFile(join(source,'project.sqlite'),dbTarget);
  for(const f of proof.media){const path=join(dataTarget,f.path);await mkdir(dirname(path),{recursive:true});await copyFile(join(source,'media',f.path),path);}
  const dbCheck=new DatabaseSync(dbTarget,{readOnly:true});try{assertHealthy(dbCheck);}finally{dbCheck.close();}
  return {restored:true,mediaCount:proof.mediaCount,dbPath:dbTarget,dataRoot:dataTarget};
 }catch(e){await rm(dbTarget,{force:true});await rm(dataTarget,{recursive:true,force:true});throw e;}
}
/** R4-03: inventory plus *only* known staging leftovers; never orphan assets. */
export async function inspectStorage({db,dataRoot,olderThanMs=86400000,now=Date.now()}){
 const root=await realpath(dataRoot),refs=new Set(referencedMedia(db,root)),files=await fileList(root);
 // Preserve managed imported music even before it appears in a completed job.
 for(const path of files)if(/^music\/[A-Za-z0-9-]{1,100}\/[a-f0-9]{64}\.(?:mp3|wav|m4a)$/.test(path))refs.add(path);
 const items=[];let totalBytes=0,referencedBytes=0,candidatesBytes=0;
 for(const path of files){const item=await fileUnder(root,path),s=await stat(item.absolute);totalBytes+=s.size;
  const referenced=refs.has(path);if(referenced)referencedBytes+=s.size;
  // Restrict quarantine eligibility to explicitly named ephemeral artifacts.
  const temporary=/(?:^|\/)(?:\.staging|\.tmp)(?:\/|$)|\.(?:incomplete|partial|tmp)$/.test(path);
  const eligible=!referenced&&temporary&&now-s.mtimeMs>=olderThanMs;
  if(eligible)candidatesBytes+=s.size;
  items.push({path,bytes:s.size,mtimeMs:s.mtimeMs,referenced,quarantineEligible:eligible});}
 const plan={root,totalBytes,referencedBytes,candidatesBytes,files:items,refCount:refs.size};
 return {...plan,digest:sha(JSON.stringify({root,items}))};
}
export async function quarantineStaleTemp({db,dataRoot,quarantineDir,expectedDigest,now=Date.now(),olderThanMs=86400000}){
 const plan=await inspectStorage({db,dataRoot,now,olderThanMs});
 if(plan.digest!==expectedDigest)fail('R4_STORAGE_PLAN_CHANGED');
 const dest=resolve(quarantineDir);if(dest===plan.root||dest.startsWith(plan.root+sep))fail('R4_QUARANTINE_UNSAFE');
 try{await lstat(dest);fail('R4_QUARANTINE_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(dest,{recursive:true,mode:0o700});let moved=0;
 for(const f of plan.files.filter(f=>f.quarantineEligible)){
  const source=await fileUnder(plan.root,f.path),fresh=await stat(source.absolute);if(fresh.size!==f.bytes||fresh.mtimeMs!==f.mtimeMs)fail('R4_STORAGE_PLAN_CHANGED');const target=join(dest,f.path);await mkdir(dirname(target),{recursive:true});await rename(source.absolute,target);moved++;}
 await writeFile(join(dest,'quarantine-manifest.json'),JSON.stringify({createdAt:new Date(now).toISOString(),moved,sourceRoot:plan.root},null,2));
 return {moved,bytes:plan.candidatesBytes,quarantineDir:dest};
}
