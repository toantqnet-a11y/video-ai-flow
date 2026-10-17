/** A deliberately bounded authenticated local music import. A JSON request
 * under Fastify's existing 1 MiB limit avoids changing the global body limit.
 * Larger music files require a future streamed upload implementation.
 */
import {createHash} from 'node:crypto';
import {mkdir,writeFile,rename,rm,stat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
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
 if((await realpath(directory))!==resolve(dataRoot,'music',videoId))fail('R4_MUSIC_IMPORT_UNSAFE');
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

/** Local library index is reconstructed from SHA-named imports; it contains
 * no user-entered filesystem paths, API tokens or absolute machine paths. */
export async function listMusicTracks({videoId,dataRoot,ffprobe='ffprobe'}={}){
 if(!/^[a-zA-Z0-9-]{1,100}$/.test(videoId??''))fail('R4_MUSIC_IMPORT_INVALID');
 const {readdir,realpath}=await import('node:fs/promises');
 const directory=join(dataRoot,'music',videoId);
 let names;try{names=await readdir(directory);}catch(e){if(e.code==='ENOENT')return {items:[]};throw e;}
 if((await realpath(directory))!==resolve(dataRoot,'music',videoId))fail('R4_MUSIC_IMPORT_UNSAFE');
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
