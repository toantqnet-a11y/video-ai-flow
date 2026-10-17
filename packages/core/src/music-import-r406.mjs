/** A deliberately bounded authenticated local music import. A JSON request
 * under Fastify's existing 1 MiB limit avoids changing the global body limit.
 * Larger music files require a future streamed upload implementation.
 */
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream,constants as fsConstants} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {mkdir,writeFile,rename,rm,stat,realpath,copyFile,lstat} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {DomainError} from './domain.mjs';
import {runBinary,safePinnedPath} from './render-ffmpeg-r2ext04.mjs';
const fail=(code,status=400)=>{throw new DomainError(code,status)};
export async function importMusicTrack({videoId,body,dataRoot,ffprobe='ffprobe'}={}){
 if(!/^[a-zA-Z0-9-]{1,100}$/.test(videoId??'')||!body||typeof body!=='object'||Array.isArray(body)||
   Object.keys(body).sort().join(',')!=='base64,extension'||
   !['mp3','wav','m4a'].includes(body.extension)||typeof body.base64!=='string'||
   body.base64.length<8||body.base64.length>900000||!(/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64)))fail('R4_MUSIC_IMPORT_INVALID');
 const bytes=Buffer.from(body.base64,'base64');
 if(bytes.length<100||bytes.length>640*1024||bytes.toString('base64')!==body.base64)fail('R4_MUSIC_IMPORT_TOO_LARGE');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const relativePath=`music/${videoId}/${sha256}.${body.extension}`;
 const directory=join(dataRoot,'music',videoId);
 await mkdir(directory,{recursive:true,mode:0o700});
 // Compare canonical roots, not case-sensitive Windows path strings.
 // Exact relative identity still rejects junction/symlink redirects.
 const realRoot=await realpath(dataRoot);
 if(relative(resolve(realRoot,'music',videoId),await realpath(directory))!=='')fail('R4_MUSIC_IMPORT_UNSAFE');
 const target=join(dataRoot,relativePath),temporary=join(directory,`.music-${sha256}.part`);
 try{
  await writeFile(temporary,bytes,{flag:'wx',mode:0o600});
  let probe;
  try{probe=JSON.parse(await runBinary(ffprobe,['-v','error','-show_entries','stream=codec_type,codec_name:format=duration','-of','json',temporary],{timeoutMs:15000}));}
  catch{fail('R4_MUSIC_FORMAT_INVALID');}
  const streams=probe.streams??[],duration=Number(probe.format?.duration);
  if(!streams.some(s=>s.codec_type==='audio')||streams.some(s=>s.codec_type==='video')||!Number.isFinite(duration)||duration<=0||duration>14400)fail('R4_MUSIC_FORMAT_INVALID');
  const prior=await stat(target).catch(()=>null);
  if(!prior)await rename(temporary,target);
  const pin={relativePath,sha256,bytes:bytes.length};
  await safePinnedPath(dataRoot,pin);
  return {pin,durationSeconds:duration,codec:streams.find(s=>s.codec_type==='audio')?.codec_name};
 }finally{await rm(temporary,{force:true}).catch(()=>{});}
}

/** Authenticated binary music import up to 50MiB, streamed to private disk.
 * The extension is a user hint; ffprobe must independently confirm format.
 * No Buffer.concat, paid service, arbitrary path, symlink, or overwrite.
 */
export async function importMusicTrackStream({videoId,stream,extension,dataRoot,ffprobe='ffprobe'}={}){
 if(!/^[A-Za-z0-9-]{1,100}$/.test(videoId??'')||!['mp3','wav','m4a'].includes(extension)||
    !stream||typeof stream[Symbol.asyncIterator]!=='function')fail('R4_MUSIC_STREAM_INVALID');
 const max=50*1024*1024,root=await realpath(dataRoot);
 const directory=join(root,'music',videoId);
 await mkdir(directory,{recursive:true,mode:0o700});
 if(relative(resolve(root,'music',videoId),await realpath(directory))!=='')fail('R4_MUSIC_IMPORT_UNSAFE');
 const tmp=join(directory,`.incoming-${randomUUID()}.part`);let bytes=0;
 try{
  async function* bounded(source){for await(const part of source){
   const block=Buffer.from(part);bytes+=block.length;
   if(bytes>max)fail('R4_MUSIC_STREAM_TOO_LARGE',413);
   yield block;
  }}
  await pipeline(stream,bounded,createWriteStream(tmp,{flags:'wx',mode:0o600}));
  if(bytes<100)fail('R4_MUSIC_STREAM_INVALID');
  let probe;
  try{probe=JSON.parse(await runBinary(ffprobe,['-v','error',
   '-show_entries','stream=codec_type,codec_name:format=duration,format_name','-of','json',tmp],{timeoutMs:15000}));}
  catch{fail('R4_MUSIC_FORMAT_INVALID');}
  const streams=probe.streams??[],duration=Number(probe.format?.duration);
  const formats=String(probe.format?.format_name??'').split(',');
  const allowed=extension==='mp3'?formats.includes('mp3'):extension==='wav'?formats.includes('wav'):
   formats.some(x=>['mov','mp4','m4a'].includes(x));
  if(!allowed||!streams.some(s=>s.codec_type==='audio')||streams.some(s=>s.codec_type==='video')||
   !Number.isFinite(duration)||duration<=0||duration>14400)fail('R4_MUSIC_FORMAT_INVALID');
  const h=createHash('sha256');
  for await(const chunk of createReadStream(tmp))h.update(chunk);
  const sha256=h.digest('hex'),relativePath=`music/${videoId}/${sha256}.${extension}`;
  const target=join(directory,`${sha256}.${extension}`);
  try{await copyFile(tmp,target,fsConstants.COPYFILE_EXCL)}
  catch(e){if(e.code!=='EEXIST')throw e;}
  const pin={relativePath,sha256,bytes};
  // Detect unsafe existing/symlink colliders and the full expected checksum.
  const st=await lstat(target);
  if(!st.isFile()||st.isSymbolicLink()||st.size!==bytes)fail('R4_MUSIC_IMPORT_COLLISION');
  await safePinnedPath(root,pin);
  return {pin,durationSeconds:duration,codec:streams.find(s=>s.codec_type==='audio').codec_name};
 }finally{await rm(tmp,{force:true}).catch(()=>{})}
}

/** Local library index is reconstructed from SHA-named imports; it contains
 * no user-entered filesystem paths, API tokens or absolute machine paths. */
export async function listMusicTracks({videoId,dataRoot,ffprobe='ffprobe'}={}){
 if(!/^[a-zA-Z0-9-]{1,100}$/.test(videoId??''))fail('R4_MUSIC_IMPORT_INVALID');
 const {readdir,realpath}=await import('node:fs/promises');
 const directory=join(dataRoot,'music',videoId);
 let names;try{names=await readdir(directory);}catch(e){if(e.code==='ENOENT')return {items:[]};throw e;}
 // Compare canonical roots, not case-sensitive Windows path strings.
 // Exact relative identity still rejects junction/symlink redirects.
 const realRoot=await realpath(dataRoot);
 if(relative(resolve(realRoot,'music',videoId),await realpath(directory))!=='')fail('R4_MUSIC_IMPORT_UNSAFE');
 const items=[];
 for(const filename of names.sort().slice(0,200)){
  if(!/^[a-f0-9]{64}\.(?:mp3|wav|m4a)$/.test(filename))continue;
  const relativePath=`music/${videoId}/${filename}`,path=join(directory,filename);
  const bytes=(await stat(path)).size;
  if(bytes<100||bytes>50*1024*1024)continue;
  const pin={relativePath,sha256:filename.slice(0,64),bytes};
  try{
   await safePinnedPath(dataRoot,pin);
   const probe=JSON.parse(await runBinary(ffprobe,['-v','error','-show_entries','stream=codec_type,codec_name:format=duration','-of','json',path],{timeoutMs:15000}));
   const stream=probe.streams?.find(s=>s.codec_type==='audio');const durationSeconds=Number(probe.format?.duration);
   if(stream&&Number.isFinite(durationSeconds)&&durationSeconds>0)items.push({pin,durationSeconds,codec:stream.codec_name});
  }catch{/* Corrupt files are excluded; never serve an unverified pin. */}
 }
 return {items};
}
