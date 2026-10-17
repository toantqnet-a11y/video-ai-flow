/** R3-11: dependency-free ZIP64 STORE writer for local-first project handoff.
 * Already-compressed media is copied without compression or buffering in RAM.
 * ZIP64 records and data descriptors allow archives >4GiB and streaming input.
 * Only sanitized, explicitly provided relative archive names are accepted.
 */
import {createHash} from 'node:crypto';
import {constants as fsConstants,createWriteStream} from 'node:fs';
import {open} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {DomainError} from './domain.mjs';
import {makeSrt,safePinnedPath} from './render-ffmpeg-r2ext04.mjs';
import {validateTimedComposition} from './composition-timing-r2ext02.mjs';
import {extname} from 'node:path';

const fault=(code,status=409)=>{throw new DomainError(code,status)};
const SHA=/^[a-f0-9]{64}$/;
const checksum=data=>createHash('sha256').update(data).digest('hex');
const crcTable=Uint32Array.from({length:256},(_,i)=>{
 let x=i;for(let n=0;n<8;n++)x=x&1?0xedb88320^(x>>>1):x>>>1;return x>>>0;
});
const nextCrc=(prior,buffer)=>{let crc=prior;for(const c of buffer)crc=crcTable[(crc^c)&255]^(crc>>>8);return crc>>>0};
const b16=(v)=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b};
const b32=(v)=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b};
const b64=(v)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b};
const json=(value)=>Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
const allowedArchiveName=name=>typeof name==='string'&&name.length<240&&
 !name.startsWith('/')&&!name.includes('\\')&&!name.includes('..')&&!name.includes('//')&&
 /^[A-Za-z0-9_./-]+$/.test(name)&&!name.split('/').some(v=>!v||v==='.'||v==='..');
const acceptedExt=(kind,p)=>{
 const ext=extname(p).toLowerCase();
 const allowed={voice:['.wav','.mp3','.m4a','.flac','.ogg','.opus'],image:['.png','.jpg','.jpeg','.webp','.bmp'],video:['.mp4','.mov','.webm','.mkv']};
 return allowed[kind]?.includes(ext)?ext:'.bin';
};
/** Manifest has no source filesystem paths, account credentials or provider config. */
export async function projectZipEntries({composition,revision,dataRoot,videoTitle='Video'}){
 validateTimedComposition(composition);
 if(!composition.readiness.ready||!Number.isSafeInteger(revision)||revision<1)fault('PROJECT_ZIP_UNAPPROVED');
 if(composition.scenes.length>3000)fault('PROJECT_ZIP_TOO_MANY_SCENES',413);
 const entries=[];const assets=[];const timelineScenes=[];
 let total=0n;
 for(const [index,scene] of composition.scenes.entries()){
  const media={};
  for(const [role,pin] of [['voice',scene.voice?.asset],['visual',scene.visual?.asset]]){
   if(!pin||!SHA.test(pin.sha256)||!Number.isSafeInteger(pin.bytes)||pin.bytes<1)fault('PROJECT_ZIP_ASSET_INVALID');
   const kind=role==='voice'?'voice':scene.visual.kind;
   const archivePath=`assets/scene-${String(index+1).padStart(4,'0')}/${role}${acceptedExt(kind,pin.relativePath)}`;
   const path=await safePinnedPath(dataRoot,pin); // SHA, size, realpath, no symlink: before any output bytes.
   entries.push({name:archivePath,path,bytes:pin.bytes,sha256:pin.sha256});
   total+=BigInt(pin.bytes);
   assets.push({name:archivePath,sceneId:scene.id,role,kind,bytes:pin.bytes,sha256:pin.sha256});
   media[role]={path:archivePath,kind,sha256:pin.sha256};
  }
  timelineScenes.push({id:scene.id,index,sceneRowVersion:scene.sceneRowVersion,text:scene.text,
   startFrame:scene.startFrame,endFrame:scene.endFrame,durationFrames:scene.durationFrames,
   mediaType:scene.mediaType,voice:media.voice,visual:media.visual,
   motion:scene.visual.motion,visualWindow:scene.visualWindow??null,
   captions:scene.captions.cues.map(c=>({text:c.text,startFrame:c.startFrame,endFrame:c.endFrame}))});
 }
 if(total>150n*1024n*1024n*1024n)fault('PROJECT_ZIP_TOO_LARGE',413);
 const timeline={schemaVersion:1,format:'ContentStudio portable timeline',videoId:composition.videoId,
  compositionRevision:revision,compositionDigest:composition.digest,profile:composition.profile,totalFrames:composition.totalFrames,
  scenes:timelineScenes};
 const script=Buffer.from(composition.scenes.map((s,i)=>`SCENE ${i+1}\n${s.text}\n`).join('\n'),'utf8');
 const subtitle=Buffer.from(makeSrt(composition),'utf8');
 const extra=[{name:'timeline.json',data:json(timeline)},{name:'script.txt',data:script},{name:'subtitles.srt',data:subtitle},
  {name:'README.txt',data:Buffer.from('ContentStudio R3-11 portable project export\nExtract all files with a ZIP64-capable extractor.\nOpen timeline.json to locate media by relative archive path.\nNo account keys, provider settings, internal file paths or database included.\nMedia is stored without compression (ZIP64). Subtitle timing follows the approved Composition.\nThis is an export bundle, not an automatic editable-project importer.\n','utf8')}];
 const manifest={schemaVersion:1,videoId:composition.videoId,videoTitle:String(videoTitle).slice(0,200),
  compositionRevision:revision,compositionDigest:composition.digest,archiveFormat:'ZIP64-STORE',
  entries:[...assets,...extra.map(e=>({name:e.name,bytes:e.data.byteLength,sha256:checksum(e.data)}))]};
 return {entries:[...entries,...extra,{name:'manifest.json',data:json(manifest)}],manifest};
}
/** All data records use UTF-8, STORE, ZIP64 descriptors, and deterministic order.
 * A changed source file aborts generation; callers only publish after pipeline completes.
 */
export async function writeZip64(entries,destination){
 if(!Array.isArray(entries)||entries.length>7000||!entries.length)fault('PROJECT_ZIP_INVALID_ENTRIES');
 const names=new Set();for(const entry of entries){if(!allowedArchiveName(entry.name)||names.has(entry.name))fault('PROJECT_ZIP_UNSAFE_NAME');names.add(entry.name);}
 let offset=0n;const central=[];
 async function* produce(){
  const emit=b=>{offset+=BigInt(b.length);return b};
  for(const entry of entries){
   const name=Buffer.from(entry.name,'utf8'),localOffset=offset;
   // ZIP64 extra with unknown upfront size; sizes follow in data descriptor.
   const local=Buffer.concat([b32(0x04034b50),b16(45),b16(0x0808),b16(0),b16(0),b16(0),b32(0),
    b32(0xffffffff),b32(0xffffffff),b16(name.length),b16(20),name,b16(0x0001),b16(16),b64(0),b64(0)]);
   yield emit(local);
   let crc=0xffffffff,bytes=0n;const hash=createHash('sha256');
   if(entry.data!==undefined){
    if(!Buffer.isBuffer(entry.data))fault('PROJECT_ZIP_INVALID_DATA');
    bytes=BigInt(entry.data.length);crc=nextCrc(crc,entry.data);hash.update(entry.data);yield emit(entry.data);
   }else{
    if(!entry.path||!SHA.test(entry.sha256))fault('PROJECT_ZIP_INVALID_PIN');
    // Open the verified path without following its final symlink (where supported).
    const handle=await open(entry.path,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW??0));
    try{
     const st=await handle.stat();if(!st.isFile()||st.size!==entry.bytes)fault('PROJECT_ZIP_SOURCE_CHANGED');
     for await(const data of handle.createReadStream({autoClose:true})){
      bytes+=BigInt(data.length);crc=nextCrc(crc,data);hash.update(data);yield emit(data);
     }
    }finally{await handle.close();}
    if(bytes!==BigInt(entry.bytes)||hash.digest('hex')!==entry.sha256)fault('PROJECT_ZIP_SOURCE_CHANGED');
   }
   const dataCrc=(crc^0xffffffff)>>>0;
   const descriptor=Buffer.concat([b32(0x08074b50),b32(dataCrc),b64(bytes),b64(bytes)]);
   yield emit(descriptor);
   central.push({name,offset:localOffset,bytes,crc:dataCrc});
  }
  const cdOffset=offset;
  for(const e of central){
   const extra=Buffer.concat([b16(0x0001),b16(24),b64(e.bytes),b64(e.bytes),b64(e.offset)]);
   const cd=Buffer.concat([b32(0x02014b50),b16(45),b16(45),b16(0x0808),b16(0),b16(0),b16(0),
    b32(e.crc),b32(0xffffffff),b32(0xffffffff),b16(e.name.length),b16(extra.length),b16(0),
    b16(0),b16(0),b32(0),b32(0xffffffff),e.name,extra]);
   yield emit(cd);
  }
  const cdSize=offset-cdOffset,zip64EocdOffset=offset;
  yield emit(Buffer.concat([b32(0x06064b50),b64(44),b16(45),b16(45),b32(0),b32(0),
   b64(central.length),b64(central.length),b64(cdSize),b64(cdOffset)]));
  yield emit(Buffer.concat([b32(0x07064b50),b32(0),b64(zip64EocdOffset),b32(1)]));
  yield emit(Buffer.concat([b32(0x06054b50),b16(0),b16(0),b16(Math.min(65535,central.length)),
   b16(Math.min(65535,central.length)),b32(0xffffffff),b32(0xffffffff),b16(0)]));
 }
 await pipeline(Readable.from(produce()),createWriteStream(destination,{flags:'wx',mode:0o600}));
 return {entries:central.length,bytes:offset};
}
