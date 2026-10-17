/**
 * Typed-operation local API client. Session credentials exist only inside this
 * closure and request headers — never query parameters, logs or localStorage.
 * Operation paths are allowlisted by the shared contract, preventing SDK/API
 * drift when multiple agents implement independent features.
 */
import {operationById,operations} from '../../contracts/src/catalog.mjs';

export class StudioApiError extends Error {
  /** @param {string} code Stable machine code; never a raw server error body. */
  constructor(code,status=0){super(code);this.name='StudioApiError';this.code=code;this.status=status;}
}
const allowedCode=/^[A-Z][A-Z0-9_]{1,100}$/;
const safeCode=(value,fallback)=>typeof value==='string'&&allowedCode.test(value)?value:fallback;
const validId=(id)=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id);
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(signal.reason??new DOMException('Aborted','AbortError'));
  const timer=setTimeout(done,ms);
  const onAbort=()=>{clearTimeout(timer);signal.removeEventListener('abort',onAbort);reject(signal.reason??new DOMException('Aborted','AbortError'));};
  function done(){signal?.removeEventListener('abort',onAbort);resolve();}
  signal?.addEventListener('abort',onAbort,{once:true});
});

const assertBase=(base)=>{
  // A relative endpoint preserves the secured Vite proxy in development.
  // Absolute hosts other than literal loopback must never receive bearer keys.
  if(base==='/api')return base;
  if(/^http:\/\/127\.0\.0\.1:[0-9]{2,5}\/api$/.test(base))return base;
  throw new StudioApiError('UNSAFE_API_BASE');
};
const pathFor=(op,args={})=>{
 let path=op.path;
 for(const [,field] of path.matchAll(/:([a-zA-Z][a-zA-Z0-9_]*)/g)){
   if(!validId(args[field]))throw new StudioApiError('INVALID_PATH_PARAMETER');
   path=path.replace(`:${field}`,encodeURIComponent(args[field]));
 }
 if(op.query){
   const query=args.query??{},params=new URLSearchParams();
   if(!query||typeof query!=='object'||Array.isArray(query))throw new StudioApiError('INVALID_QUERY');
   for(const [key,value] of Object.entries(query)){
     if(!Object.hasOwn(op.query,key))throw new StudioApiError('QUERY_NOT_ALLOWED');
     if(value!==undefined&&value!==null){
       const schema=op.query[key];
       if(schema.enum&&!schema.enum.includes(value))throw new StudioApiError('INVALID_QUERY');
       params.set(key,String(value));
     }
   }
   if(params.size)path+='?'+params.toString();
 }else if(args.query&&Object.keys(args.query).length)throw new StudioApiError('QUERY_NOT_ALLOWED');
 return path.startsWith('/api/')?path.slice(4):path;
};
const parseResponse=async(res)=>{
 const type=res.headers?.get?.('content-type')??'';
 if(type&&!/\bapplication\/json\b|\+json\b/i.test(type))throw new StudioApiError('INVALID_SERVER_RESPONSE',res.status);
 let value;try {value=await res.json();}catch {throw new StudioApiError('INVALID_SERVER_RESPONSE',res.status);}
 if(!res.ok)throw new StudioApiError(safeCode(value?.error,`HTTP_${res.status}`),res.status);
 return value;
};

/**
 * Parses full SSE records across arbitrary UTF-8 chunks / CRLF boundaries.
 * Only `event: job` JSON payloads are emitted; heartbeat and comments ignored.
 * `lastEventId` tracks durable cursor for explicit reconnect on interruption.
 */
export async function readJobEventStream(stream,onEvent,{signal,lastEventId=0,maxFrameBytes=262144}={}){
 const reader=stream.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 let buffer='',lastId=lastEventId;
 const emit=(frame)=>{
   let id,type='message',data=[];
   for(const line of frame.split('\n')){
     if(!line||line.startsWith(':'))continue;
     const colon=line.indexOf(':');const key=colon<0?line:line.slice(0,colon);
     let value=colon<0?'':line.slice(colon+1);if(value.startsWith(' '))value=value.slice(1);
     if(key==='id')id=value;
     else if(key==='event')type=value;
     else if(key==='data')data.push(value);
   }
   if(type!=='job'||!data.length)return;
   let payload;try{payload=JSON.parse(data.join('\n'));}catch{throw new StudioApiError('INVALID_EVENT_PAYLOAD');}
   // Advance the cursor only for a successfully parsed, delivered job event.
   // A mismatch between transport ID and payload seq could silently skip work
   // after reconnect, so fail rather than trusting either representation.
   if(!payload||typeof payload!=='object'||!Number.isSafeInteger(payload.seq)||payload.seq<0)
     throw new StudioApiError('INVALID_EVENT_PAYLOAD');
   if(id!==undefined&&(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)!==payload.seq))
     throw new StudioApiError('INVALID_EVENT_CURSOR');
   if(payload.seq<=lastId)return; // at-least-once SSE replay without duplicate UI effects
   onEvent(payload);
   lastId=payload.seq;
 };
 try{
   while(true){
     if(signal?.aborted)break;
     const {done,value}=await reader.read();
     if(done){buffer+=decoder.decode();break;}
     buffer+=decoder.decode(value,{stream:true});
     // Normalize only after concatenation, so a CRLF split over chunks is valid.
     buffer=buffer.replace(/\r\n/g,'\n').replace(/\r(?=.)/g,'\n');
     let split;
     while((split=buffer.indexOf('\n\n'))!==-1){
       if(split>maxFrameBytes)throw new StudioApiError('EVENT_TOO_LARGE');
       const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);emit(frame);
     }
     if(buffer.length>maxFrameBytes)throw new StudioApiError('EVENT_TOO_LARGE');
   }
   // Trailing partial event has not been terminated by a blank line and must
   // not be committed to the durable cursor. Server replays it on reconnect.
   return {lastEventId:lastId};
 }finally{
   // Cancel releases a long-lived pending fetch reader after Abort/route change.
   try{await reader.cancel();}catch{}
   try{reader.releaseLock();}catch{}
 }
}

/** @param {{fetchImpl?:typeof fetch,baseUrl?:string}} options */
export function createStudioClient({fetchImpl=globalThis.fetch,baseUrl='/api'}={}){
 const base=assertBase(baseUrl);
 if(typeof fetchImpl!=='function')throw new StudioApiError('FETCH_UNAVAILABLE');
 let credentials=null;
 const authenticated=()=>credentials!==null;
 const clear=()=>{credentials=null;};
 const request=async(id,args={},options={})=>{
   const op=operationById.get(id);
   if(!op)throw new StudioApiError('UNKNOWN_OPERATION');
   if(op.stream)throw new StudioApiError('USE_STREAM_JOB_EVENTS');
   if(op.binaryAudio)throw new StudioApiError('USE_VOICE_PREVIEW');
   if(op.binaryImage)throw new StudioApiError('USE_CHANNEL_AVATAR');
   if(op.binarySceneImage)throw new StudioApiError('USE_SCENE_IMAGE_FILE');
   if(op.binarySceneVideo)throw new StudioApiError('USE_SCENE_CLIP_FILE');
   if(!op.public&&!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   const path=pathFor(op,args);
   const headers={'accept':'application/json'};
   if(!op.public)headers.authorization=`Bearer ${credentials.bearer}`;
   if(op.method!=='GET'){
     headers['content-type']='application/json';
     if(!op.public)headers['x-contentstudio-csrf']=credentials.csrf;
   }
   const url=op.path.startsWith('/api/')?`${base}${path}`:`${base.slice(0,-4)}${path}`;
   const response=await fetchImpl(url,{method:op.method,headers,
     ...(op.body?{body:JSON.stringify(args.body)}:{}),...(options.signal?{signal:options.signal}:{})});
   try{return await parseResponse(response);}catch(error){
     if(error instanceof StudioApiError&&error.status===401&&!op.public)clear();
     throw error;
   }
 };
 /**
  * Send preview via the authenticated SDK (not an unauthenticated <audio src>).
  * Reject unexpected HTML/JSON and oversized replies before making a Blob URL.
  * Session credentials never leave the SDK closure or appear in query strings.
  */
 const previewVoice=async(channelId,body,{signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   const op=operationById.get('previewChannelVoice');
   const path=pathFor(op,{id:channelId});
   const response=await fetchImpl(`${base}${path}`,{method:'POST',headers:{
     accept:'audio/mpeg, audio/wav',authorization:`Bearer ${credentials.bearer}`,
     'x-contentstudio-csrf':credentials.csrf,'content-type':'application/json'
   },body:JSON.stringify(body),signal});
   if(!response.ok){
     if(response.status===401)clear();
     let errorCode;try{errorCode=(await response.json())?.error;}catch{}
     throw new StudioApiError(safeCode(errorCode,`HTTP_${response.status}`),response.status);
   }
   const mime=response.headers?.get?.('content-type')?.split(';')[0]?.trim();
   if(!['audio/mpeg','audio/wav'].includes(mime))throw new StudioApiError('INVALID_PREVIEW_AUDIO');
   const declared=Number(response.headers?.get?.('content-length'));
   if(declared>2_000_000)throw new StudioApiError('PREVIEW_AUDIO_TOO_LARGE');
   const reader=response.body?.getReader?.();
   if(!reader)throw new StudioApiError('INVALID_PREVIEW_AUDIO');
   const chunks=[];let length=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;
     length+=value.byteLength;
     if(length>2_000_000)throw new StudioApiError('PREVIEW_AUDIO_TOO_LARGE');
     chunks.push(value);
   }}finally{if(length>2_000_000)await reader.cancel().catch(()=>{});reader.releaseLock();}
   if(length<44)throw new StudioApiError('INVALID_PREVIEW_AUDIO');
   const audio=new Uint8Array(length);let offset=0;
   for(const chunk of chunks){audio.set(chunk,offset);offset+=chunk.length;}
   const isWav=String.fromCharCode(...audio.subarray(0,4))==='RIFF'&&String.fromCharCode(...audio.subarray(8,12))==='WAVE';
   const isMp3=String.fromCharCode(...audio.subarray(0,3))==='ID3'||(audio[0]===255&&(audio[1]&224)===224);
   if(mime==='audio/wav'&&!isWav||mime==='audio/mpeg'&&!isMp3)throw new StudioApiError('INVALID_PREVIEW_AUDIO');
   return new Blob([audio],{type:mime});
 };
 /** Fetch completed scene voice as a private Blob: no <audio src=/api> because
  * native media requests cannot include the ephemeral Bearer session header.
  */
 const getSceneVoiceAudio=async(id,{signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   const op=operationById.get('getSceneVoiceAudio');
   const res=await fetchImpl(`${base}${pathFor(op,{id})}`,{method:'GET',headers:{
     authorization:`Bearer ${credentials.bearer}`,accept:'audio/mpeg, audio/wav'},signal});
   if(!res.ok){
     if(res.status===401)clear();
     let err;try{err=(await res.json())?.error;}catch{}
     throw new StudioApiError(safeCode(err,`HTTP_${res.status}`),res.status);
   }
   const mime=res.headers?.get?.('content-type')?.split(';')[0]?.trim();
   if(!['audio/mpeg','audio/wav'].includes(mime))throw new StudioApiError('INVALID_VOICE_AUDIO');
   const declared=Number(res.headers?.get?.('content-length'));
   if(declared>12_000_000)throw new StudioApiError('VOICE_AUDIO_TOO_LARGE');
   // Enforce the cap while streaming: a server can omit Content-Length.
   const reader=res.body?.getReader?.();
   if(!reader)throw new StudioApiError('INVALID_VOICE_AUDIO');
   let size=0;const parts=[];
   try{while(true){const {done,value}=await reader.read();if(done)break;
     size+=value.byteLength;if(size>12_000_000)throw new StudioApiError('VOICE_AUDIO_TOO_LARGE');
     parts.push(value);
   }}finally{if(size>12_000_000)await reader.cancel().catch(()=>{});reader.releaseLock();}
   if(size<44)throw new StudioApiError('INVALID_VOICE_AUDIO');
   const bytes=new Uint8Array(size);let cursor=0;
   for(const part of parts){bytes.set(part,cursor);cursor+=part.length;}
   const wav=String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WAVE';
   const mp3=String.fromCharCode(...bytes.subarray(0,3))==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224);
   if(!(wav&&mime==='audio/wav'||mp3&&mime==='audio/mpeg'))throw new StudioApiError('INVALID_VOICE_AUDIO');
   return new Blob([bytes],{type:mime});
 };
 /** An <img src=/api/...> cannot supply bearer credentials safely. Fetch
  * the image through the in-memory session instead, then create a revocable
  * Blob URL in React. Do not persist the Blob or authenticated URL.
  */
 const getSceneImageFile=async(id,{signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   const op=operationById.get('getSceneImageFile');
   const res=await fetchImpl(`${base}${pathFor(op,{id})}`,{method:'GET',headers:{
     authorization:`Bearer ${credentials.bearer}`,accept:'image/png, image/jpeg, image/webp'},signal});
   if(!res.ok){if(res.status===401)clear();let body;
     try{body=await res.json()}catch{}
     throw new StudioApiError(safeCode(body?.error,`HTTP_${res.status}`),res.status);
   }
   const mime=res.headers?.get?.('content-type')?.split(';')[0]?.trim();
   if(!['image/png','image/jpeg','image/webp'].includes(mime))throw new StudioApiError('INVALID_IMAGE_FILE');
   if(Number(res.headers?.get?.('content-length'))>25*1024*1024)throw new StudioApiError('IMAGE_FILE_TOO_LARGE');
   const reader=res.body?.getReader?.();if(!reader)throw new StudioApiError('INVALID_IMAGE_FILE');
   const parts=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;
     size+=value.byteLength;if(size>25*1024*1024)throw new StudioApiError('IMAGE_FILE_TOO_LARGE');parts.push(value);
   }}finally{if(size>25*1024*1024)await reader.cancel().catch(()=>{});reader.releaseLock();}
   if(size<24)throw new StudioApiError('INVALID_IMAGE_FILE');
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
   const ascii=(start,len)=>String.fromCharCode(...bytes.subarray(start,start+len));
   const png=ascii(1,3)==='PNG'&&ascii(12,4)==='IHDR';
   const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
   const webp=ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP';
   if(!(mime==='image/png'&&png||mime==='image/jpeg'&&jpeg||mime==='image/webp'&&webp))
     throw new StudioApiError('INVALID_IMAGE_FILE');
   return new Blob([bytes],{type:mime});
 };
 /** R2-VID-05: authenticated video playback; never expose bearer in src URL.
  * Fetch only allowlisted current scene clip; hard cap bytes and MP4 signature.
  */
 const readPrivateSceneClip=async(opId,args,{signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   const op=operationById.get(opId);
   const res=await fetchImpl(`${base}${pathFor(op,args)}`,{method:'GET',headers:{
     authorization:`Bearer ${credentials.bearer}`,accept:'video/mp4'},signal});
   if(!res.ok){if(res.status===401)clear();let body;try{body=await res.json()}catch{}
     throw new StudioApiError(safeCode(body?.error,`HTTP_${res.status}`),res.status);}
   if(!res.headers.get('content-type')?.startsWith('video/mp4'))throw new StudioApiError('INVALID_VIDEO_PREVIEW');
   const max=100*1024*1024;if(Number(res.headers.get('content-length'))>max)
     throw new StudioApiError('VIDEO_PREVIEW_TOO_LARGE');
   const reader=res.body?.getReader();if(!reader)throw new StudioApiError('INVALID_VIDEO_PREVIEW');
   const parts=[];let bytes=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;
     bytes+=value.byteLength;if(bytes>max)throw new StudioApiError('VIDEO_PREVIEW_TOO_LARGE');
     parts.push(value);}}
   finally{if(bytes>max)await reader.cancel().catch(()=>{});reader.releaseLock();}
   const data=new Uint8Array(bytes);let at=0;for(const part of parts){data.set(part,at);at+=part.length;}
   if(data.length<16||String.fromCharCode(...data.subarray(4,8))!=='ftyp')
     throw new StudioApiError('INVALID_VIDEO_PREVIEW');
   return new Blob([data],{type:'video/mp4'});
 };
 const getSceneClipFile=(id,opts)=>readPrivateSceneClip('getSceneClipFile',{id},opts);
 const getSceneClipRevisionFile=(id,assetId,opts)=>readPrivateSceneClip('getSceneClipRevisionFile',{id,assetId},opts);
 /** EXT-08: private thumbnail, bounded JPEG and no auth token in DOM URL. */
 const downloadLocalVideoThumbnail=async(videoId,jobId,{signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   const op=operationById.get('downloadLocalVideoThumbnail');
   const res=await fetchImpl(`${base}${pathFor(op,{id:videoId,jobId})}`,{method:'GET',headers:{
     authorization:`Bearer ${credentials.bearer}`,accept:'image/jpeg'},signal});
   if(!res.ok){if(res.status===401)clear();let body;try{body=await res.json()}catch{}
     throw new StudioApiError(safeCode(body?.error,`HTTP_${res.status}`),res.status);}
   if(!res.headers.get('content-type')?.startsWith('image/jpeg'))throw new StudioApiError('INVALID_THUMBNAIL');
   const limit=10*1024*1024;
   if(Number(res.headers.get('content-length'))>limit)throw new StudioApiError('THUMBNAIL_TOO_LARGE');
   const reader=res.body?.getReader();if(!reader)throw new StudioApiError('INVALID_THUMBNAIL');
   const chunks=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
     if(size>limit)throw new StudioApiError('THUMBNAIL_TOO_LARGE');chunks.push(value);}}
   finally{reader.releaseLock();}
   const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());
   if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new StudioApiError('INVALID_THUMBNAIL');
   return new Blob([bytes],{type:'image/jpeg'});
 };
 /** R3-10 authenticated SRT; streamed under 5MB, validate UTF-8 and cue timing.
  * Do not use a bare anchor to an authenticated endpoint (session is memory-only).
  */
 const downloadLocalVideoSubtitle=async(videoId,jobId,{signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   const op=operationById.get('downloadLocalVideoSubtitle');
   const res=await fetchImpl(`${base}${pathFor(op,{id:videoId,jobId})}`,{method:'GET',headers:{
     authorization:`Bearer ${credentials.bearer}`,accept:'application/x-subrip'},signal});
   if(!res.ok){if(res.status===401)clear();let body;try{body=await res.json()}catch{}
     throw new StudioApiError(safeCode(body?.error,`HTTP_${res.status}`),res.status);}
   if(!res.headers.get('content-type')?.startsWith('application/x-subrip'))throw new StudioApiError('INVALID_SUBTITLE_MEDIA');
   const cap=5_000_000;
   if(Number(res.headers.get('content-length'))>cap)throw new StudioApiError('SUBTITLE_TOO_LARGE');
   const reader=res.body?.getReader();if(!reader)throw new StudioApiError('INVALID_SUBTITLE_MEDIA');
   const chunks=[];let total=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;
     total+=value.byteLength;if(total>cap)throw new StudioApiError('SUBTITLE_TOO_LARGE');chunks.push(value);
   }}finally{reader.releaseLock();}
   let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(await new Blob(chunks).arrayBuffer());}
   catch{throw new StudioApiError('INVALID_SUBTITLE_UTF8');}
   if(content&&!/^1\r?\n\d{2}:\d{2}:\d{2},\d{3} --> /.test(content))throw new StudioApiError('INVALID_SUBTITLE_FORMAT');
   return new Blob([content],{type:'application/x-subrip;charset=utf-8'});
 };
 /** Private MP4 download. No bearer credential or signed URL in DOM/link. */
 const downloadLocalVideoRender=async(videoId,jobId,{signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   const op=operationById.get('downloadLocalVideoRender');
   const res=await fetchImpl(`${base}${pathFor(op,{id:videoId,jobId})}`,{method:'GET',headers:{
     authorization:`Bearer ${credentials.bearer}`,accept:'video/mp4'},signal});
   if(!res.ok){if(res.status===401)clear();let body;try{body=await res.json()}catch{}
     throw new StudioApiError(safeCode(body?.error,`HTTP_${res.status}`),res.status);}
   if(!res.headers.get('content-type')?.startsWith('video/mp4'))throw new StudioApiError('INVALID_RENDER_MEDIA');
   // Bound browser memory; long-form exports should use a future native file
   // streaming picker rather than buffering arbitrarily large video in JS.
   const limit=100*1024*1024;
   if(Number(res.headers.get('content-length'))>limit)throw new StudioApiError('RENDER_DOWNLOAD_TOO_LARGE');
   const reader=res.body?.getReader();if(!reader)throw new StudioApiError('INVALID_RENDER_MEDIA');
   const chunks=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
     if(size>limit)throw new StudioApiError('RENDER_DOWNLOAD_TOO_LARGE');chunks.push(value);}}
   finally{reader.releaseLock();}
   return new Blob(chunks,{type:'video/mp4'});
 };
 /** Stream long-form MP4 directly to an approved local file handle. */
 const saveLocalVideoRender=async(videoId,jobId,fileHandle,{signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   if(!fileHandle||typeof fileHandle.createWritable!=='function')throw new StudioApiError('FILE_HANDLE_REQUIRED');
   const op=operationById.get('downloadLocalVideoRender');
   const res=await fetchImpl(`${base}${pathFor(op,{id:videoId,jobId})}`,{method:'GET',headers:{
     authorization:`Bearer ${credentials.bearer}`,accept:'video/mp4'},signal});
   if(!res.ok){if(res.status===401)clear();let data;try{data=await res.json()}catch{}
     throw new StudioApiError(safeCode(data?.error,`HTTP_${res.status}`),res.status);}
   if(!res.headers.get('content-type')?.startsWith('video/mp4')||!res.body)throw new StudioApiError('INVALID_RENDER_MEDIA');
   const writer=await fileHandle.createWritable(),reader=res.body.getReader();
   let bytes=0;
   try{
     while(true){const {done,value}=await reader.read();if(done)break;
       bytes+=value.byteLength;if(bytes>10*1024*1024*1024)throw new StudioApiError('RENDER_DOWNLOAD_TOO_LARGE');
       await writer.write(value);
     }
     await writer.close();return {bytes};
   }catch(e){await writer.abort().catch(()=>{});throw e;}finally{reader.releaseLock();}
 };
 /** R3-11: save large ZIP64 bundles straight to disk (no giant browser Blob). */
 const saveProjectZip=async(videoId,revision,fileHandle,{signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   if(!Number.isSafeInteger(revision)||revision<1)throw new StudioApiError('INVALID_REVISION');
   if(!fileHandle||typeof fileHandle.createWritable!=='function')throw new StudioApiError('FILE_HANDLE_REQUIRED');
   const op=operationById.get('downloadProjectZip');
   const res=await fetchImpl(`${base}${pathFor(op,{id:videoId,query:{revision}})}`,{method:'GET',
     headers:{authorization:`Bearer ${credentials.bearer}`,accept:'application/zip'},signal});
   if(!res.ok){if(res.status===401)clear();let body;try{body=await res.json()}catch{}
     throw new StudioApiError(safeCode(body?.error,`HTTP_${res.status}`),res.status);}
   if(!res.headers.get('content-type')?.startsWith('application/zip')||!res.body)throw new StudioApiError('INVALID_PROJECT_ARCHIVE');
   const writer=await fileHandle.createWritable(),reader=res.body.getReader();let bytes=0;
   try{
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
      if(bytes>150*1024*1024*1024)throw new StudioApiError('PROJECT_ZIP_TOO_LARGE');
      await writer.write(value);
    }
    await writer.close();return {bytes};
   }catch(e){await writer.abort().catch(()=>{});throw e;}
   finally{reader.releaseLock();}
 };
 /** Small ZIP fallback for browsers without File System Access. */
 const downloadProjectZip=async(videoId,revision,{signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   const op=operationById.get('downloadProjectZip');
   const res=await fetchImpl(`${base}${pathFor(op,{id:videoId,query:{revision}})}`,{method:'GET',
     headers:{authorization:`Bearer ${credentials.bearer}`,accept:'application/zip'},signal});
   if(!res.ok){if(res.status===401)clear();let body;try{body=await res.json()}catch{}
     throw new StudioApiError(safeCode(body?.error,`HTTP_${res.status}`),res.status);}
   if(!res.headers.get('content-type')?.startsWith('application/zip')||!res.body)throw new StudioApiError('INVALID_PROJECT_ARCHIVE');
   const max=100*1024*1024;if(Number(res.headers.get('content-length'))>max)throw new StudioApiError('PROJECT_ZIP_BROWSER_LIMIT');
   const reader=res.body.getReader(),chunks=[];let bytes=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
     if(bytes>max)throw new StudioApiError('PROJECT_ZIP_BROWSER_LIMIT');chunks.push(value);
   }}finally{reader.releaseLock();}
   return new Blob(chunks,{type:'application/zip'});
 };
 const getChannelAvatar=async(id,{signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   const op=operationById.get('getChannelAvatar');
   const response=await fetchImpl(`${base}${pathFor(op,{id})}`,{method:'GET',headers:{
     authorization:`Bearer ${credentials.bearer}`,accept:'image/png, image/jpeg'
   },signal});
   if(!response.ok){
     if(response.status===401)clear();
     let error;try{error=(await response.json())?.error;}catch{}
     throw new StudioApiError(safeCode(error,`HTTP_${response.status}`),response.status);
   }
   const mime=response.headers?.get?.('content-type')?.split(';')[0]?.trim();
   if(!['image/png','image/jpeg'].includes(mime))throw new StudioApiError('INVALID_AVATAR_IMAGE');
   const size=Number(response.headers?.get?.('content-length'));
   if(size>262144)throw new StudioApiError('INVALID_AVATAR_SIZE');
   // Content-Length may be absent or forged. Stream with a hard byte ceiling.
   const reader=response.body?.getReader?.();
   if(!reader)throw new StudioApiError('INVALID_AVATAR_IMAGE');
   const chunks=[];let count=0;
   try{while(true){const {value,done}=await reader.read();if(done)break;
     count+=value.byteLength;
     if(count>262144)throw new StudioApiError('INVALID_AVATAR_SIZE');
     chunks.push(value);
   }}finally{if(count>262144)await reader.cancel().catch(()=>{});reader.releaseLock();}
   if(count<16)throw new StudioApiError('INVALID_AVATAR_IMAGE');
   const bytes=new Uint8Array(count);let offset=0;
   for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   if(mime==='image/png'&&!(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)
     ||mime==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216))throw new StudioApiError('INVALID_AVATAR_IMAGE');
   return new Blob([bytes],{type:mime});
 };
 const pair=async(code)=>{
   if(typeof code!=='string'||!code.length)throw new StudioApiError('INVALID_PAIR_CODE');
   const output=await request('pairSession',{body:{code}});
   if(typeof output?.bearer!=='string'||typeof output?.csrf!=='string'||!output.bearer||!output.csrf)
     throw new StudioApiError('INVALID_SERVER_RESPONSE');
   credentials={bearer:output.bearer,csrf:output.csrf};
   return true;
 };
 // Backwards-compatible adapter: only routes known to the published contract
 // may be called from pre-R0-05 frontend pages.
 /** Binary file upload uses the same memory-only bearer and CSRF as JSON API.
  * Files are streamed by fetch; no base64/URL token and no browser storage.
  */
 const uploadSceneClipStream=async(sceneId,file,{expectedRowVersion,signal}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   if(!validId(sceneId)||!file||!Number.isSafeInteger(file.size)||file.size<100||
      file.size>96*1024*1024||!Number.isSafeInteger(expectedRowVersion)||expectedRowVersion<1)
     throw new StudioApiError('VIDEO_STREAM_IMPORT_INVALID');
   const container=/\.mov$/i.test(file.name)?'mov':/\.mp4$/i.test(file.name)?'mp4':null;
   if(!container)throw new StudioApiError('VIDEO_STREAM_IMPORT_INVALID');
   const response=await fetchImpl(`${base}/scenes/${sceneId}/video/import-stream`,{
     method:'POST',headers:{accept:'application/json','content-type':'application/octet-stream',
       authorization:`Bearer ${credentials.bearer}`,'x-contentstudio-csrf':credentials.csrf,
       'x-contentstudio-row-version':String(expectedRowVersion),
       'x-contentstudio-container':container},body:file,signal});
   try{return await parseResponse(response)}catch(error){
     if(error instanceof StudioApiError&&error.status===401)clear();throw error;}
 };
 const requestPath=async(path,{method='GET',body,signal}={})=>{
   if(typeof path!=='string'||!path.startsWith('/'))throw new StudioApiError('UNKNOWN_OPERATION');
   const [pathname,search='']=path.split('?');
   for(const op of operations){
     if(op.method!==method||op.public||op.stream)continue;
     const keys=[...op.path.matchAll(/:([a-zA-Z][a-zA-Z0-9_]*)/g)].map(m=>m[1]);
     const relative=op.path.startsWith('/api/')?op.path.slice(4):op.path;
     const expression=new RegExp('^'+relative.replace(/:([a-zA-Z][a-zA-Z0-9_]*)/g,'([a-zA-Z0-9-]{1,80})')+'$');
     const found=expression.exec(pathname);if(!found)continue;
     const args={};keys.forEach((k,i)=>args[k]=found[i+1]);
     if(search){
       const searchParams=new URLSearchParams(search);
       if([...searchParams.keys()].length!==new Set(searchParams.keys()).size)throw new StudioApiError('INVALID_QUERY');
       args.query=Object.fromEntries(searchParams);
       if(!op.query)throw new StudioApiError('QUERY_NOT_ALLOWED');
     }
     if(body!==undefined)args.body=body;
     return request(op.id,args,{signal});
   }
   throw new StudioApiError('UNKNOWN_OPERATION');
 };
 const streamJobs=async(onEvent,{signal,lastEventId=0,retries=0,retryDelayMs=750}={})=>{
   if(!credentials)throw new StudioApiError('PAIRING_REQUIRED');
   if(!Number.isSafeInteger(lastEventId)||lastEventId<0)throw new StudioApiError('INVALID_EVENT_CURSOR');
   let failures=0,cursor=lastEventId;
   while(!signal?.aborted){
     try{
       const headers={accept:'text/event-stream',authorization:`Bearer ${credentials.bearer}`};
       if(cursor>0)headers['Last-Event-ID']=String(cursor); // Header, never URL.
       const response=await fetchImpl(`${base}/jobs/events`,{method:'GET',headers,signal});
       if(!response.ok){
         let body;try{body=await response.json()}catch{}
         if(response.status===401)clear();
         throw new StudioApiError(safeCode(body?.error,`HTTP_${response.status}`),response.status);
       }
       if(!response.body||!response.headers?.get?.('content-type')?.includes('text/event-stream'))
         throw new StudioApiError('SSE_UNAVAILABLE');
       const result=await readJobEventStream(response.body,e=>{onEvent(e);cursor=Math.max(cursor,e.seq);},{signal,lastEventId:cursor});
       cursor=Math.max(cursor,result.lastEventId);
       if(failures>=retries)return {lastEventId:cursor};
     }catch(error){
       if(signal?.aborted)return {lastEventId:cursor};
       if(error instanceof StudioApiError&&error.status===401)throw error;
       if(failures>=retries)throw error;
     }
     failures++;
     await sleep(Math.min(10000,retryDelayMs*Math.pow(2,failures-1)),signal).catch(error=>{
       if(!signal?.aborted)throw error;
     });
   }
   return {lastEventId:cursor};
 };
 return {authenticated,clear,pair,request,requestPath,uploadSceneClipStream,previewVoice,getSceneVoiceAudio,getSceneImageFile,getSceneClipFile,getSceneClipRevisionFile,getChannelAvatar,downloadLocalVideoThumbnail,downloadLocalVideoRender,downloadLocalVideoSubtitle,saveLocalVideoRender,downloadProjectZip,saveProjectZip,streamJobs};
}
