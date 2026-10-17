import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,utimes,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StorageManagementR403} from '../src/storage-management-r403.mjs';
const fakeDb={prepare:()=>({all:()=>[],get:()=>({n:0,bytes:0})})};
const stage='.hyperframes-a1234567-a123-4123-8123-123456789abc';
test('R4-03 reversible quarantine and restore do not mutate immutable media',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r403-restore-'));let running=0;
 try{
  const transient=join(root,'renders','video-1',stage),media=join(root,'voices','keep.wav');
  await mkdir(transient,{recursive:true});await mkdir(join(root,'voices'));
  await writeFile(join(transient,'tmp-fragment'),'stage-bytes');
  await writeFile(media,'immutable-bytes');
  const old=new Date(Date.now()-20*86400_000);await utimes(transient,old,old);
  const store={countByStatus:()=>({running})};
  const svc=new StorageManagementR403({dataRoot:root,db:fakeDb,store});
  let p=await svc.preview();assert.equal(p.candidates.length,1);
  const moved=await svc.quarantine({ids:[p.candidates[0].id],
   expectedDigest:p.digest,confirmation:'QUARANTINE_STAGING'});
  assert.equal(moved.count,1);
  const q=(await svc.preview()).quarantine;
  assert.equal(q.items.length,1);assert.equal(q.bytes,11);
  running=1;
  await assert.rejects(svc.restore({ids:[q.items[0].id],expectedDigest:q.digest,
   confirmation:'RESTORE_STAGING'}),{code:'STORAGE_RESTORE_STALE'});
  running=0;
  await assert.rejects(svc.restore({ids:[q.items[0].id],expectedDigest:'0'.repeat(64),
   confirmation:'RESTORE_STAGING'}),{code:'STORAGE_RESTORE_STALE'});
  const current=(await svc.preview()).quarantine;
  const result=await svc.restore({ids:[q.items[0].id],expectedDigest:current.digest,
   confirmation:'RESTORE_STAGING'});
  assert.equal(result.count,1);assert.equal(result.deletedBytes,0);
  assert.equal(await readFile(join(transient,'tmp-fragment'),'utf8'),'stage-bytes');
  assert.equal(await readFile(media,'utf8'),'immutable-bytes');
  assert.equal((await svc.preview()).quarantine.items.length,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('R4-03 restore rejects destination collisions and unapproved requests',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r403-conflict-'));
 try{
  const from=join(root,'.quarantine','video-1',stage),to=join(root,'renders','video-1',stage);
  await mkdir(from,{recursive:true});await mkdir(to,{recursive:true});
  await writeFile(join(from,'keep'),'quarantined');
  const svc=new StorageManagementR403({dataRoot:root,db:fakeDb,store:{countByStatus:()=>({running:0})}});
  const q=await svc.quarantined();assert.equal(q.items.length,1);
  await assert.rejects(svc.restore({ids:[q.items[0].id],expectedDigest:q.digest,
   confirmation:'DELETE_ALL'}),{code:'STORAGE_RESTORE_INVALID'});
  await assert.rejects(svc.restore({ids:[q.items[0].id],expectedDigest:q.digest,
   confirmation:'RESTORE_STAGING'}),{code:'STORAGE_RESTORE_COLLISION'});
  assert.equal(await readFile(join(from,'keep'),'utf8'),'quarantined');
 }finally{await rm(root,{recursive:true,force:true});}
});
