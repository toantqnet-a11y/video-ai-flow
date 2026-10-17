/**
 * R0-10: On-demand voice preview for channel settings.
 * This is deliberately NOT a scene asset or queued production voice. It never
 * persists text, audio, credentials or jobs; previews are short-lived binary
 * responses guarded by the existing localhost session and CSRF middleware.
 */
import {DomainError} from '../../../packages/core/src/index.mjs';
import {EdgeTtsAdapter,EDGE_VOICES} from '../../../spikes/SP-02/src/edge.js';
import {LocalHttpTtsAdapter} from '../../../spikes/SP-02/src/local.js';
import {detectAudioFormat} from '../../../spikes/SP-02/src/audio.js';

export const MAX_PREVIEW_CHARS=350;
export const MAX_PREVIEW_BYTES=2_000_000;
const permittedProviders=new Set(['edge','piper','vieneu']);
const invalid=(code,status=400)=>{throw new DomainError(code,status)};

/**
 * Reject arbitrary request properties and unsafe text before any network call.
 * speedMultiplier is the existing channel setting (0.5–2.0), converted to
 * integer percentage for SP-02 adapters (-50 through +100).
 */
export function validateVoicePreview(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!
    ['provider','voice','text','speed','remoteConsent'].includes(k)))invalid('INVALID_VOICE_PREVIEW');
  const {provider,voice,text,speed,remoteConsent}=body;
  if(!permittedProviders.has(provider))invalid('UNSUPPORTED_TTS_PROVIDER');
  if(typeof text!=='string'||!text.trim()||text.length>MAX_PREVIEW_CHARS||/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text))invalid('INVALID_PREVIEW_TEXT');
  if(typeof voice!=='string'||!(/^[a-zA-Z0-9_.-]{1,100}$/).test(voice))invalid('INVALID_VOICE_ID');
  if(typeof speed!=='number'||!Number.isFinite(speed)||speed<0.5||speed>2)invalid('INVALID_PREVIEW_SPEED');
  if(typeof remoteConsent!=='boolean')invalid('REMOTE_CONSENT_REQUIRED',403);
  if(provider==='edge'){
    if(!remoteConsent)invalid('REMOTE_CONSENT_REQUIRED',403);
    if(!EDGE_VOICES.some(v=>v.id===voice))invalid('INVALID_VOICE_ID');
  }
  // Consent to Edge's online connection is request-scoped, not stored as a
  // blanket authorization for later channel generation or paid providers.
  return {provider,voice,text:text.trim(),rate:Math.round((speed-1)*100)};
}

/**
 * Construct only known adapters; local URLs must be configured by the local
 * operator, never accepted from the frontend (SSRF prevention).
 */
export function defaultPreviewAdapters({env=process.env}={}){
  const map=new Map([['edge',new EdgeTtsAdapter({timeoutMs:25000,maxBytes:MAX_PREVIEW_BYTES})]]);
  for(const [id,key] of [['piper','CONTENTSTUDIO_PIPER_TTS_URL'],['vieneu','CONTENTSTUDIO_VIENEU_TTS_URL']]){
    if(!env[key])continue;
    let endpoint;
    try{
      const url=new URL(env[key]);
      if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.hash)
        invalid('INVALID_LOCAL_TTS_CONFIG',503);
      endpoint=url.toString();
    }catch{invalid('INVALID_LOCAL_TTS_CONFIG',503)}
    map.set(id,new LocalHttpTtsAdapter({endpoint,allowRemote:false,timeoutMs:25000,maxBytes:MAX_PREVIEW_BYTES}));
  }
  return map;
}

/**
 * @param {{repo:object,adapters?:Map<string,object>,maxActive?:number}} deps
 * @returns {{preview:(channelId:string,body:object,options?:{signal?:AbortSignal})=>Promise<{bytes:Buffer,format:'mp3'|'wav'}>}}
 */
export function createVoicePreview({repo,adapters=defaultPreviewAdapters(),maxActive=1}){
  if(!repo||!(adapters instanceof Map)||!Number.isInteger(maxActive)||maxActive<1)throw Error('INVALID_PREVIEW_CONFIG');
  let active=0;
  return {preview:async(channelId,body,{signal}={})=>{
    // Never invoke TTS for nonexistent, deleted or archived channels.
    const channel=repo.getChannel(channelId);
    if(!channel||channel.deletedAt!==null)invalid('CHANNEL_NOT_FOUND',404);
    if(channel.status!=='active')invalid('CHANNEL_NOT_ACTIVE',409);
    const input=validateVoicePreview(body);
    const adapter=adapters.get(input.provider);
    if(!adapter)invalid('TTS_NOT_CONFIGURED',503);
    if(active>=maxActive)invalid('VOICE_PREVIEW_BUSY',429);
    active++;
    try{
      if(signal?.aborted)invalid('PREVIEW_CANCELLED',499);
      let generated;
      try {generated=await adapter.synthesize({text:input.text,voice:input.voice,rate:input.rate},{signal});}
      catch(error){
        // No underlying provider message, text, filesystem path or network URL
        // ever crosses the API boundary or enters request logs.
        const code=error?.code;
        if(signal?.aborted||code==='CANCELLED')invalid('PREVIEW_CANCELLED',499);
        if(code==='DEPENDENCY_UNAVAILABLE')invalid('TTS_DEPENDENCY_UNAVAILABLE',503);
        if(code==='TIMEOUT')invalid('TTS_PREVIEW_TIMEOUT',504);
        if(code==='RATE_LIMITED')invalid('TTS_RATE_LIMITED',429);
        invalid('TTS_PROVIDER_UNAVAILABLE',503);
      }
      if(!Buffer.isBuffer(generated?.bytes)||generated.bytes.length>MAX_PREVIEW_BYTES)invalid('INVALID_PREVIEW_AUDIO',502);
      let format;
      try{format=detectAudioFormat(generated.bytes);}catch{invalid('INVALID_PREVIEW_AUDIO',502)}
      if(generated.format!==format)invalid('INVALID_PREVIEW_AUDIO',502);
      return {bytes:generated.bytes,format};
    }finally{active--;}
  }};
}

/** Register beside studio routes; global security onRequest applies automatically. */
export function registerVoicePreviewRoute(app,service){
  app.post('/api/channels/:id/voice-preview',async(req,reply)=>{
    const abort=new AbortController();
    const disconnected=()=>abort.abort();
    req.raw?.once?.('aborted',disconnected);
    try{
      const audio=await service.preview(req.params.id,req.body,{signal:abort.signal});
      return reply.header('cache-control','no-store, private').header('x-content-type-options','nosniff')
        .header('content-disposition','inline').type(audio.format==='mp3'?'audio/mpeg':'audio/wav').send(audio.bytes);
    }catch(error){
      const status=error instanceof DomainError?(error.status===499?400:error.status):500;
      const code=error instanceof DomainError?(error.status===499?'PREVIEW_CANCELLED':error.code):'INTERNAL_ERROR';
      req.log?.warn?.({code},'voice preview rejected');
      return reply.code(status).header('cache-control','no-store').send({error:code});
    }finally{req.raw?.off?.('aborted',disconnected)}
  });
}
