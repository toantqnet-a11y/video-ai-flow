/** R4-03: read-only storage inventory and reversible quarantine.
 * Never delete immutable assets, published MP4s, segment caches or backups.
 * Only orphaned, old, UUID-named transient render directories can move.
 */
import {createHash} from 'node:crypto';
import {readdir,lstat,mkdir,realpath,rename} from 'node:fs/promises';
import {join,resolve,relative,sep,isAbsolute} from 'node:path';
import {DomainError} from './domain.mjs';
const fail=(code,status=409)=>{throw new DomainError(code,status)};
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9-]{1,100}$/.test(x);
const stageName=x=>/^\.(?:staging|hyperframes)-[a-f0-9-]{36}$/.test(x);
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const nested=(root,p)=>{const rel=relative(root,p);return rel&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)};
async function safeDirectory(root,path){
 const s=await lstat(path).catch(()=>null);
 if(!s?.isDirectory()||s.isSymbolicLink())return false;
 const real=await realpath(path).catch(()=>null);
 return Boolean(real&&nested(root,real)&&relative(path,real)==='');
}
async function stageSize(path,limit=15000){
 let bytes=0,entries=0;const pending=[path];
 while(pending.length){
  const dir=pending.pop();const names=await readdir(dir);
  for(const name of names){
   if(++entries>limit)fail('STORAGE_STAGE_SCAN_LIMIT');
   const file=join(dir,name),s=await lstat(file);
   if(s.isSymbolicLink()||(!s.isFile()&&!s.isDirectory()))fail('STORAGE_UNSAFE_STAGE');
   if(s.isDirectory())pending.push(file);else bytes+=s.size;
  }
 }
 return bytes;
}
export class StorageManagementR403{
 constructor({dataRoot,db,store,clock=()=>Date.now(),minimumAgeMs=7*24*3600*1000}={}){
  this.root=resolve(dataRoot);this.db=db;this.store=store;this.clock=clock;this.minAge=minimumAgeMs;
 }
 async preview(){
  const root=await realpath(this.root);
  const renderRoot=join(root,'renders');const items=[];
  // A running task may still own an old staging directory. Fail closed for
  // *all* quarantine candidates rather than infer ownership from filenames.
  const running=(this.store?.countByStatus()?.running??0)>0;
  if(await safeDirectory(root,renderRoot)){
   const videos=await readdir(renderRoot,{withFileTypes:true});
   for(const entry of videos.slice(0,300)){
    if(!safeId(entry.name)||!entry.isDirectory()||entry.isSymbolicLink())continue;
    const folder=join(renderRoot,entry.name);
    if(!await safeDirectory(root,folder))continue;
    for(const name of (await readdir(folder)).slice(0,1500)){
     if(!stageName(name))continue;
     const target=join(folder,name),s=await lstat(target).catch(()=>null);
     if(!s?.isDirectory()||s.isSymbolicLink()||
        s.mtimeMs>this.clock()-this.minAge||!await safeDirectory(root,target))continue;
     try{
      const bytes=await stageSize(target);
      items.push({id:digest([entry.name,name]).slice(0,32),videoId:entry.name,
       bytes,modifiedAt:Math.floor(s.mtimeMs),eligible:!running,
       // Name/path intentionally NOT returned across the HTTP boundary.
       _name:name});
     }catch{/* Unsafe or enormous stage is never a cleanup candidate. */}
    }
   }
  }
  const summary=this.db?.prepare?this.db.prepare("SELECT kind,count(*) AS n,coalesce(sum(bytes),0) AS bytes FROM asset_revisions WHERE state='committed' GROUP BY kind").all():[];
  const cache=this.db?.prepare?this.db.prepare('SELECT count(*) AS n,coalesce(sum(bytes),0) AS bytes FROM render_segment_cache').get():{n:0,bytes:0};
  const fingerprint=digest(items.map(x=>[x.id,x.bytes,x.modifiedAt,x.eligible]));
  return {digest:fingerprint,inventory:summary.map(x=>({kind:x.kind,count:x.n,bytes:x.bytes})),
   segmentCache:{count:cache.n,bytes:cache.bytes},
   stagedBytes:items.reduce((s,x)=>s+x.bytes,0),runningJobsBlockQuarantine:running,
   candidates:items.map(({_name,...rest})=>rest),quarantine:await this.quarantined(),
   note:'Only old disposable staging directories can be quarantined. Referenced media, caches, backups and published renders are never deleted.'};
 }
 /** Enumerate only previously quarantined render staging, never project assets.
  * IDs are SHA of opaque directory names and no disk paths leave the API. */
 async quarantined(){
  const root=await realpath(this.root),base=join(root,'.quarantine'),found=[];
  const baseStat=await lstat(base).catch(()=>null);
  if(baseStat&&!await safeDirectory(root,base))fail('STORAGE_QUARANTINE_UNSAFE');
  if(baseStat){
   for(const v of (await readdir(base,{withFileTypes:true})).slice(0,300)){
    if(!safeId(v.name)||!v.isDirectory()||v.isSymbolicLink())continue;
    const folder=join(base,v.name);
    if(!await safeDirectory(root,folder))continue;
    for(const name of (await readdir(folder)).slice(0,1500)){
     if(!stageName(name))continue;
     const path=join(folder,name),state=await lstat(path).catch(()=>null);
     if(!state?.isDirectory()||state.isSymbolicLink()||!await safeDirectory(root,path))continue;
     try{
      const bytes=await stageSize(path);
      found.push({id:digest([v.name,name]).slice(0,32),videoId:v.name,bytes,
       modifiedAt:Math.floor(state.mtimeMs)});
     }catch{/* Symlinks and oversized stages are never restorable. */}
    }
   }
  }
  found.sort((a,b)=>a.id.localeCompare(b.id));
  const running=(this.store?.countByStatus()?.running??0)>0;
  return {digest:digest([running,found.map(x=>[x.id,x.bytes,x.modifiedAt])]),
   items:found,bytes:found.reduce((sum,x)=>sum+x.bytes,0),
   runningJobsBlockRestore:running,
   note:'Manual restore only; no permanent deletion. Never overwrite existing staging.'};
 }
 /** Restore old scratch state explicitly; reject stale inventory and collisions.
  * A restore is deliberately non-atomic across multiple filesystem renames. */
 async restore({ids,expectedDigest,confirmation}={}){
  if(confirmation!=='RESTORE_STAGING'||!Array.isArray(ids)||ids.length<1||ids.length>20||
     new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'||!/^[a-f0-9]{32}$/.test(x))||
     typeof expectedDigest!=='string'||!/^[a-f0-9]{64}$/.test(expectedDigest))
    fail('STORAGE_RESTORE_INVALID',400);
  const snapshot=await this.quarantined();
  if(snapshot.digest!==expectedDigest||snapshot.runningJobsBlockRestore)fail('STORAGE_RESTORE_STALE');
  const root=await realpath(this.root),base=join(root,'.quarantine'),render=join(root,'renders');
  if(!await safeDirectory(root,base))fail('STORAGE_QUARANTINE_UNSAFE');
  await mkdir(render,{recursive:true,mode:0o700});
  if(!await safeDirectory(root,render))fail('STORAGE_RESTORE_UNSAFE');
  const stages=[];
  for(const id of ids){
   const row=snapshot.items.find(x=>x.id===id);
   if(!row)fail('STORAGE_RESTORE_NOT_FOUND');
   const parent=join(base,row.videoId),name=(await readdir(parent))
     .find(n=>stageName(n)&&digest([row.videoId,n]).slice(0,32)===id);
   if(!name)fail('STORAGE_RESTORE_STALE');
   const source=join(parent,name),st=await lstat(source);
   if(!await safeDirectory(root,parent)||!await safeDirectory(root,source)||
      Math.floor(st.mtimeMs)!==row.modifiedAt||await stageSize(source)!==row.bytes)
     fail('STORAGE_RESTORE_STALE');
   const toFolder=join(render,row.videoId);
   await mkdir(toFolder,{recursive:true,mode:0o700});
   if(!await safeDirectory(root,toFolder))fail('STORAGE_RESTORE_UNSAFE');
   const target=join(toFolder,name);
   if(await lstat(target).catch(()=>null))fail('STORAGE_RESTORE_COLLISION');
   stages.push({id,source,target});
  }
  const restored=[];
  for(const stage of stages){
   if((this.store?.countByStatus()?.running??0)>0)fail('STORAGE_RESTORE_STALE');
   if(await lstat(stage.target).catch(()=>null))fail('STORAGE_RESTORE_COLLISION');
   if(!await safeDirectory(root,stage.source))fail('STORAGE_RESTORE_STALE');
   await rename(stage.source,stage.target);restored.push(stage.id);
  }
  return {restored,count:restored.length,deletedBytes:0,
   note:'Restored private transient stages without touching immutable media. Check project before reusing.'};
 }
 async quarantine({ids,expectedDigest,confirmation}={}){
  if(confirmation!=='QUARANTINE_STAGING'||!Array.isArray(ids)||ids.length<1||ids.length>20||
     new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'||!/^[a-f0-9]{32}$/.test(x))||
     typeof expectedDigest!=='string'||!/^[a-f0-9]{64}$/.test(expectedDigest))fail('STORAGE_REQUEST_INVALID',400);
  const live=await this.preview();
  if(live.digest!==expectedDigest||live.runningJobsBlockQuarantine)fail('STORAGE_SNAPSHOT_STALE');
  const root=await realpath(this.root),stages=[];
  // Revalidate ALL requested directories before moving any one. Filesystem
  // rename is not transactional: a partial move must be reported honestly.
  for(const id of ids){
   const c=live.candidates.find(x=>x.id===id&&x.eligible);
   if(!c)fail('STORAGE_CANDIDATE_NOT_FOUND');
   const videoDir=join(root,'renders',c.videoId);
   const name=(await readdir(videoDir)).find(name=>stageName(name)&&digest([c.videoId,name]).slice(0,32)===id);
   if(!name)fail('STORAGE_CANDIDATE_STALE');
   const source=join(videoDir,name),s=await lstat(source);
   if(!await safeDirectory(root,source)||Math.floor(s.mtimeMs)!==c.modifiedAt||await stageSize(source)!==c.bytes)
    fail('STORAGE_CANDIDATE_STALE');
   stages.push({id,source,videoId:c.videoId,name});
  }
  const moved=[];
  for(const c of stages){
   const out=join(root,'.quarantine',c.videoId);
   await mkdir(out,{recursive:true,mode:0o700});
   if(!await safeDirectory(root,out))fail('STORAGE_QUARANTINE_UNSAFE');
   const dest=join(out,c.name);
   if(await lstat(dest).catch(()=>null))fail('STORAGE_QUARANTINE_CONFLICT');
   await rename(c.source,dest);moved.push(c.id);
  }
  return {quarantined:moved,count:moved.length,deletedBytes:0,
   note:'Moved to private quarantine. No permanent delete or media reference changes.'};
 }
}
