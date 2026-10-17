import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,lstat,readdir,rm,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StorageManagementR403} from '../src/storage-management-r403.mjs';
const db={prepare:sql=>({all:()=>[],get:()=>({n:0,bytes:0})})};
const stage='.staging-12345678-1234-1234-1234-123456789abc';
test('R4-03 moves only old stages into quarantine, immutable asset untouched',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'r403-'));
 try{
  const render=join(dir,'renders','video1',stage),immutable=join(dir,'assets','video1','scene1','image');
  await mkdir(render,{recursive:true});await mkdir(immutable,{recursive:true});
  await writeFile(join(render,'partial.mp4'),'not a valid mp4');
  await writeFile(join(immutable,'immutable.png'),'never move');
  const old=new Date(Date.now()-20*86400_000);await utimes(render,old,old);
  const store={countByStatus:()=>({running:0})};
  const mgr=new StorageManagementR403({dataRoot:dir,db,store});
  const p=await mgr.preview();assert.equal(p.candidates.length,1);assert.equal(p.candidates[0].bytes,15);
  const moved=await mgr.quarantine({ids:[p.candidates[0].id],expectedDigest:p.digest,confirmation:'QUARANTINE_STAGING'});
  assert.equal(moved.count,1);assert.equal(moved.deletedBytes,0);
  assert.equal((await lstat(join(immutable,'immutable.png'))).isFile(),true);
  assert.ok((await readdir(join(dir,'.quarantine','video1'))).includes(stage));
  assert.equal((await mgr.preview()).candidates.length,0);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('R4-03 active job blocks physical staging movement and forged inputs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'r403-running-'));
 try{
  const stageDir=join(dir,'renders','v1',stage);await mkdir(stageDir,{recursive:true});
  await writeFile(join(stageDir,'a'),'x');const old=new Date(Date.now()-20*86400_000);await utimes(stageDir,old,old);
  let running=0;const mgr=new StorageManagementR403({dataRoot:dir,db,store:{countByStatus:()=>({running})}});
  const p=await mgr.preview();assert.equal(p.candidates.length,1);
  running=1;
  await assert.rejects(mgr.quarantine({ids:[p.candidates[0].id],expectedDigest:p.digest,confirmation:'QUARANTINE_STAGING'}),{code:'STORAGE_SNAPSHOT_STALE'});
  await assert.rejects(mgr.quarantine({ids:[p.candidates[0].id],expectedDigest:p.digest,confirmation:'DELETE_ALL'}),{code:'STORAGE_REQUEST_INVALID'});
  assert.equal((await lstat(stageDir)).isDirectory(),true);
 }finally{await rm(dir,{recursive:true,force:true})}
});
