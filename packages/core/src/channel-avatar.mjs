/**
 * R0-GATE: Trusted channel-avatar storage.
 * Intent: keep private channel artwork in /data, never inside public Vite assets,
 * and serve it only through the paired localhost API. No user file name or path
 * reaches the filesystem. Historical rows are immutable for safe rollback.
 */
import {createHash, randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import {DomainError} from './domain.mjs';
import {transact} from './db.mjs';

const MAX_BYTES=256*1024;
const MAX_DIM=2048;
const fail=(code,status=400)=>{throw new DomainError(code,status)};
const pngSig=Buffer.from([137,80,78,71,13,10,26,10]);

// PNG CRC and bounded inflater: a valid-looking IHDR alone is not an image.
// Reject truncated/corrupt/zlib-bomb files before they become browser assets.
const crcTable=Array.from({length:256},(_,n)=>{
  for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;
  return n>>>0;
});
function crc32(buffer){let c=0xffffffff;for(const b of buffer)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function verifyPng(bytes,width,height,channels){
  const idat=[];let offset=8,sawIhdr=false,sawIend=false,sawPalette=false;
  while(offset<bytes.length){
    if(offset+12>bytes.length)fail('INVALID_AVATAR_IMAGE');
    const size=bytes.readUInt32BE(offset);
    if(size>MAX_BYTES||offset+size+12>bytes.length)fail('INVALID_AVATAR_IMAGE');
    const type=bytes.toString('ascii',offset+4,offset+8);
    const content=bytes.subarray(offset+8,offset+8+size);
    if(crc32(bytes.subarray(offset+4,offset+8+size))!==bytes.readUInt32BE(offset+8+size))fail('INVALID_AVATAR_IMAGE');
    if(!sawIhdr){if(type!=='IHDR'||size!==13)fail('INVALID_AVATAR_IMAGE');sawIhdr=true;}
    if(type==='PLTE')sawPalette=true;
    if(type==='IDAT')idat.push(content);
    if(type==='IEND'){
      if(size!==0||offset+12!==bytes.length)fail('INVALID_AVATAR_IMAGE');
      sawIend=true;
    }
    // An unknown critical chunk changes decoding semantics, so reject it.
    if(!['IHDR','PLTE','IDAT','IEND'].includes(type)&&type[0]===type[0].toUpperCase())fail('INVALID_AVATAR_IMAGE');
    offset+=size+12;
    if(sawIend)break;
  }
  if(!sawIend||!idat.length||(channels===1&&!sawPalette))fail('INVALID_AVATAR_IMAGE');
  const row=width*channels+1,expected=row*height;
  let raw;
  try{raw=inflateSync(Buffer.concat(idat),{maxOutputLength:expected+1});}
  catch{fail('INVALID_AVATAR_IMAGE');}
  if(raw.length!==expected)fail('INVALID_AVATAR_IMAGE');
  for(let y=0;y<height;y++)if(raw[y*row]>4)fail('INVALID_AVATAR_IMAGE');
}

/** Validate actual bytes, not untrusted filename or declared MIME. */
export function inspectAvatar(bytes,mimeType){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_BYTES)fail('INVALID_AVATAR_SIZE');
  let width,height,extension;
  if(mimeType==='image/png'){
    if(bytes.length<33||!bytes.subarray(0,8).equals(pngSig)
      ||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')fail('INVALID_AVATAR_IMAGE');
    width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);extension='png';
    if(![2,3,6].includes(bytes[25])||bytes[24]!==8||bytes[26]!==0||bytes[27]!==0||bytes[28]!==0)fail('INVALID_AVATAR_IMAGE');
    if(!width||!height||width>MAX_DIM||height>MAX_DIM||width*height>4_000_000)fail('INVALID_AVATAR_DIMENSIONS');
    if(bytes[28]!==0)fail('INVALID_AVATAR_IMAGE'); // no interlace, exact row-bound decoder
    verifyPng(bytes,width,height,bytes[25]===2?3:bytes[25]===6?4:1);
  }else if(mimeType==='image/jpeg'){
    if(bytes.length<16||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)fail('INVALID_AVATAR_IMAGE');
    extension='jpg';
    // Scan JPEG markers until a Start Of Frame segment carries the dimensions.
    // Reject malformed segment lengths instead of trusting an EXIF declaration.
    let i=2;
    while(i<bytes.length-4){
      if(bytes[i++]!==0xff)fail('INVALID_AVATAR_IMAGE');
      while(i<bytes.length&&bytes[i]===0xff)i++;
      const marker=bytes[i++];
      if(marker===0xd9||marker===0xda)break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(i+2>bytes.length)fail('INVALID_AVATAR_IMAGE');
      const length=bytes.readUInt16BE(i);
      if(length<2||i+length>bytes.length)fail('INVALID_AVATAR_IMAGE');
      if([0xc0,0xc1,0xc2].includes(marker)){
        if(length<7)fail('INVALID_AVATAR_IMAGE');
        height=bytes.readUInt16BE(i+3);width=bytes.readUInt16BE(i+5);break;
      }
      i+=length;
    }
    if(!width||!height)fail('INVALID_AVATAR_IMAGE');
  }else fail('UNSUPPORTED_AVATAR_FORMAT');
  if(!width||!height||width>MAX_DIM||height>MAX_DIM||width*height>4_000_000)fail('INVALID_AVATAR_DIMENSIONS');
  return {width,height,mimeType,extension,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}

export class ChannelAvatarService {
  constructor({repo,dataRoot,clock=()=>Date.now()}){
    this.repo=repo;this.db=repo.db;this.clock=clock;
    this.root=join(dataRoot,'channel-avatars');
  }
  /** Decode a bounded base64 JSON body, avoiding multipart parser dependencies. */
  save(id,{rowVersion,mimeType,dataBase64}={}){
    const current=this.repo.getChannel(id);
    if(!current||current.deletedAt!==null)fail('CHANNEL_NOT_FOUND',404);
    if(!Number.isInteger(rowVersion)||rowVersion!==current.rowVersion)fail('VERSION_CONFLICT',409);
    if(typeof dataBase64!=='string'||dataBase64.length<8||dataBase64.length>Math.ceil(MAX_BYTES/3)*4+4||
       !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataBase64))fail('INVALID_AVATAR_ENCODING');
    const bytes=Buffer.from(dataBase64,'base64');
    if(bytes.toString('base64')!==dataBase64)fail('INVALID_AVATAR_ENCODING');
    const image=inspectAvatar(bytes,mimeType);
    const previous=this.db.prepare('SELECT sha256 FROM channel_avatar_revisions WHERE id=?').get(current.avatarId);
    if(previous?.sha256===image.sha256)return current; // No unnecessary version bump.
    const assetId=randomUUID(),relative=`${assetId}.${image.extension}`;
    const folder=join(this.root,id); // id is a UUID generated by the domain.
    mkdirSync(folder,{recursive:true,mode:0o700});
    const file=join(folder,relative);
    writeFileSync(file,bytes,{flag:'wx',mode:0o600});
    try{
      transact(this.db,()=>{
        const row=this.db.prepare('SELECT row_version,deleted_at FROM channels WHERE id=?').get(id);
        if(!row||row.deleted_at!==null)fail('CHANNEL_NOT_FOUND',404);
        if(row.row_version!==rowVersion)fail('VERSION_CONFLICT',409);
        this.db.prepare(`INSERT INTO channel_avatar_revisions
          (id,channel_id,file_name,sha256,mime_type,bytes,width,height,created_at)
          VALUES(?,?,?,?,?,?,?,?,?)`).run(assetId,id,relative,image.sha256,image.mimeType,image.bytes,image.width,image.height,this.clock());
        this.db.prepare('UPDATE channels SET avatar_id=?,row_version=row_version+1,updated_at=? WHERE id=?').run(assetId,this.clock(),id);
        this.repo.event('channel',id,'channel.avatar_updated',{avatarId:assetId});
      });
    }catch(error){try{unlinkSync(file);}catch{}throw error;}
    return this.repo.getChannel(id);
  }
  /** Read only the current revision and fixed UUID-based path, never user input. */
  read(id){
    const channel=this.repo.getChannel(id);
    if(!channel||channel.deletedAt!==null)fail('CHANNEL_NOT_FOUND',404);
    if(!channel.avatarId)fail('AVATAR_NOT_FOUND',404);
    const entry=this.db.prepare('SELECT * FROM channel_avatar_revisions WHERE id=? AND channel_id=?').get(channel.avatarId,id);
    if(!entry||!/^[-a-f0-9]{36}\.(?:png|jpg)$/.test(entry.file_name))fail('AVATAR_MISSING',503);
    let bytes;
    try{bytes=readFileSync(join(this.root,id,entry.file_name));}catch{fail('AVATAR_MISSING',503);}
    if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)fail('AVATAR_CORRUPT',503);
    return {bytes,mimeType:entry.mime_type,sha256:entry.sha256};
  }
}
