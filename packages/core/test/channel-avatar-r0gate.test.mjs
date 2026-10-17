import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openProjectDb,StudioRepository,ChannelAvatarService,migrations,inspectAvatar} from '../src/index.mjs';

// A compact 1×1 PNG fixture. No external image codec or HTTP provider is needed.
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4H6/xHwAGbQKGYmyoQQAAAABJRU5ErkJggg==','base64');
async function setup(){const dir=await mkdtemp(join(tmpdir(),'studio-avatar-'));
  const db=openProjectDb(join(dir,'studio.sqlite')),repo=new StudioRepository(db),avatar=new ChannelAvatarService({repo,dataRoot:dir});
  const ch=repo.createChannel({name:'Thiên văn'});
  return {dir,db,repo,avatar,ch,close:async()=>{db.close();await rm(dir,{force:true,recursive:true})}};
}
const input=(rowVersion,bytes=PNG,mimeType='image/png')=>({rowVersion,dataBase64:bytes.toString('base64'),mimeType});
test('R0 avatar: private binary file, immutable history, persistence and idempotent identical upload',async()=>{
 const f=await setup();try{
   const saved=f.avatar.save(f.ch.id,input(f.ch.rowVersion));
   assert.equal(saved.rowVersion,f.ch.rowVersion+1);
   assert.match(saved.avatarId,/^[0-9a-f-]{36}$/);
   assert.deepEqual(f.avatar.read(saved.id).bytes,PNG);
   assert.equal(f.avatar.read(saved.id).mimeType,'image/png');
   const again=f.avatar.save(saved.id,input(saved.rowVersion));
   assert.equal(again.rowVersion,saved.rowVersion);
   assert.equal(f.db.prepare('SELECT COUNT(*) n FROM channel_avatar_revisions').get().n,1);
   assert.throws(()=>f.db.prepare('DELETE FROM channel_avatar_revisions').run(),/CHANNEL_AVATAR_REVISION_IMMUTABLE/);
   assert.equal(f.repo.listChannels()[0].avatarId,saved.avatarId);
   assert.equal(f.db.prepare('PRAGMA user_version').get().user_version,migrations.at(-1).version);
   const relative=join(f.dir,'channel-avatars',saved.id);
   const stored=(await readdir(relative))[0];assert.equal((await readFile(join(relative,stored))).length,PNG.length);
 }finally{await f.close()}
});
test('R0 avatar: MIME, size, dimensions, encoding and stale versions fail closed without DB changes',async()=>{
 const f=await setup();try{
   const baseline=f.db.prepare('SELECT COUNT(*) n FROM channel_avatar_revisions').get().n;
   assert.throws(()=>f.avatar.save(f.ch.id,input(22)),e=>e.code==='VERSION_CONFLICT');
   assert.throws(()=>f.avatar.save(f.ch.id,input(1,PNG,'image/svg+xml')),e=>e.code==='UNSUPPORTED_AVATAR_FORMAT');
   assert.throws(()=>f.avatar.save(f.ch.id,input(1,Buffer.from('not a png'))),e=>e.code==='INVALID_AVATAR_IMAGE');
   assert.throws(()=>f.avatar.save(f.ch.id,{rowVersion:1,mimeType:'image/png',dataBase64:'%'}),e=>e.code==='INVALID_AVATAR_ENCODING');
   assert.throws(()=>f.avatar.save(f.ch.id,input(1,Buffer.alloc(262145))),e=>e.code==='INVALID_AVATAR_SIZE');
   const wide=Buffer.from(PNG);wide.writeUInt32BE(3000,16);
   assert.throws(()=>inspectAvatar(wide,'image/png'),e=>e.code==='INVALID_AVATAR_DIMENSIONS');
   assert.equal(f.db.prepare('SELECT COUNT(*) n FROM channel_avatar_revisions').get().n,baseline);
 }finally{await f.close()}
});
test('R0 avatar: channel scoping, tamper detection and soft-deleted image refusal',async()=>{
 const f=await setup();try{
   const other=f.repo.createChannel({name:'Khác'});
   const saved=f.avatar.save(f.ch.id,input(1));
   assert.throws(()=>f.avatar.read(other.id),e=>e.code==='AVATAR_NOT_FOUND');
   assert.throws(()=>f.db.prepare('UPDATE channels SET avatar_id=? WHERE id=?').run(saved.avatarId,other.id),/CHANNEL_AVATAR_OWNER_MISMATCH/);
   const file=join(f.dir,'channel-avatars',saved.id,(await readdir(join(f.dir,'channel-avatars',saved.id)))[0]);
   await writeFile(file,Buffer.from('corrupted'));
   assert.throws(()=>f.avatar.read(saved.id),e=>e.code==='AVATAR_CORRUPT');
   f.repo.softDeleteChannel(saved.id,{rowVersion:saved.rowVersion});
   assert.throws(()=>f.avatar.read(saved.id),e=>e.code==='CHANNEL_NOT_FOUND');
 }finally{await f.close()}
});
