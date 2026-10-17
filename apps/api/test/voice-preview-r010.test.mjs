/** R0-10: offline contracts exercise the same service/route, never a fake Edge sample. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoicePreview,validateVoicePreview,defaultPreviewAdapters,registerVoicePreviewRoute} from '../src/voice-preview.mjs';

const text='Xin chào, đây là bản xem trước.';
const data=(extra={})=>({provider:'edge',voice:'vi-VN-HoaiMyNeural',text,speed:1.2,remoteConsent:true,...extra});
const wav=()=>{const bytes=Buffer.alloc(100);bytes.write('RIFF',0);bytes.write('WAVE',8);return bytes;};
const channel={id:'chan1',status:'active',deletedAt:null};
const repository={getChannel:id=>id===channel.id?channel:null};
const adapter=(fn=async()=>({bytes:wav(),format:'wav'}))=>new Map([['edge',{synthesize:fn}],['piper',{synthesize:fn}]]);

const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);

test('validates voice, short Vietnamese text, exact per-call consent and rate conversion',()=>{
 assert.deepEqual(validateVoicePreview(data()).rate,20);
 assert.deepEqual(validateVoicePreview(data({speed:0.5})).rate,-50);
 assert.deepEqual(validateVoicePreview(data({speed:2})).rate,100);
 for(const [body,code] of [
   [data({provider:'espeak'}),'UNSUPPORTED_TTS_PROVIDER'],
   [data({text:''}),'INVALID_PREVIEW_TEXT'],
   [data({text:'a'.repeat(351)}),'INVALID_PREVIEW_TEXT'],
   [data({voice:'../bad'}),'INVALID_VOICE_ID'],
   [data({voice:'vi-VN-FakeNeural'}),'INVALID_VOICE_ID'],
   [data({speed:2.1}),'INVALID_PREVIEW_SPEED'],
   [data({remoteConsent:false}),'REMOTE_CONSENT_REQUIRED'],
   [data({remoteConsent:'true'}),'REMOTE_CONSENT_REQUIRED'],
   [data({endpoint:'http://untrusted/'}),'INVALID_VOICE_PREVIEW']
 ]) assert.throws(()=>validateVoicePreview(body),e=>e.code===code);
 assert.equal(validateVoicePreview({provider:'piper',voice:'local1',text,speed:1,remoteConsent:false}).provider,'piper');
});

test('returns genuine adapter bytes and never queues or writes a preset',async()=>{
 let calls=0,input;
 const preview=createVoicePreview({repo:repository,adapters:adapter(async value=>{calls++;input=value;return {bytes:wav(),format:'wav'}})});
 const result=await preview.preview('chan1',data());
 assert.equal(calls,1);assert.equal(input.rate,20);assert.equal(input.text,text);
 assert.equal(result.format,'wav');assert.ok(result.bytes.equals(wav()));
});

test('reject missing, archived and deleted channel before provider invocation',async()=>{
 let called=false;
 const repo={getChannel:id=>id==='arch'?{...channel,status:'archived'}:id==='deleted'?{...channel,deletedAt:1}:null};
 const preview=createVoicePreview({repo,adapters:adapter(async()=>{called=true;return {bytes:wav(),format:'wav'}})});
 await rejects(preview.preview('bad',data()),'CHANNEL_NOT_FOUND');
 await rejects(preview.preview('deleted',data()),'CHANNEL_NOT_FOUND');
 await rejects(preview.preview('arch',data()),'CHANNEL_NOT_ACTIVE');
 assert.equal(called,false);
});

test('no implicit fallback for unconfigured local provider or upstream error',async()=>{
 const preview=createVoicePreview({repo:repository,adapters:new Map([['edge',{synthesize:async()=>{throw Object.assign(Error('private response text'),{code:'PROVIDER_UNAVAILABLE'});}}]])});
 await rejects(preview.preview('chan1',{provider:'piper',voice:'local',text,speed:1,remoteConsent:false}),'TTS_NOT_CONFIGURED');
 await rejects(preview.preview('chan1',data()),'TTS_PROVIDER_UNAVAILABLE');
});

test('enforces concurrency limit and recovers capacity after cancel/failure',async()=>{
 let release;const barrier=new Promise(resolve=>release=resolve);let entered=0;
 const preview=createVoicePreview({repo:repository,adapters:adapter(async()=>{entered++;await barrier;return {bytes:wav(),format:'wav'}})});
 const first=preview.preview('chan1',data());
 await rejects(preview.preview('chan1',data()),'VOICE_PREVIEW_BUSY');
 release();await first;
 await preview.preview('chan1',data());assert.equal(entered,2);
});

test('rejects oversized, forged or absent audio without returning a Blob',async()=>{
 for(const response of [
   {bytes:Buffer.alloc(2_000_001),format:'wav'},
   {bytes:Buffer.from('html', 'utf8'),format:'mp3'},
   {bytes:wav(),format:'mp3'}
 ]){
   const preview=createVoicePreview({repo:repository,adapters:adapter(async()=>response)});
   await rejects(preview.preview('chan1',data()),'INVALID_PREVIEW_AUDIO');
 }
});

test('local provider URL remains literal 127.0.0.1, not arbitrary HTTP destination',()=>{
 assert.equal(defaultPreviewAdapters({env:{}}).has('piper'),false);
 const configured=defaultPreviewAdapters({env:{CONTENTSTUDIO_PIPER_TTS_URL:'http://127.0.0.1:8000/tts'}});
 assert.equal(configured.has('piper'),true);
 for(const endpoint of ['https://example.org/tts','http://localhost:8000/tts','http://evil:pass@127.0.0.1:8000/tts','http://127.0.0.1@evil.org/tts'])
   assert.throws(()=>defaultPreviewAdapters({env:{CONTENTSTUDIO_PIPER_TTS_URL:endpoint}}),e=>e.code==='INVALID_LOCAL_TTS_CONFIG');
});

test('route emits no-store binary and sanitized errors, no text in logs',async()=>{
 const routes=new Map();const app={post:(path,handler)=>routes.set(path,handler)};
 const preview=createVoicePreview({repo:repository,adapters:adapter()});registerVoicePreviewRoute(app,preview);
 const handler=routes.get('/api/channels/:id/voice-preview');assert.equal(typeof handler,'function');
 const headers={};let status=200,output;
 const reply={header(k,v){headers[k]=v;return this},type(v){headers['content-type']=v;return this},code(v){status=v;return this},send(v){output=v;return v}};
 let logEntries=[];
 const req={params:{id:'chan1'},body:data(),raw:{once(){},off(){}},log:{warn:o=>logEntries.push(o)}};
 await handler(req,reply);assert.ok(Buffer.isBuffer(output));assert.equal(headers['cache-control'],'no-store, private');assert.equal(headers['content-type'],'audio/wav');
 req.body=data({remoteConsent:false});await handler(req,reply);assert.equal(status,403);assert.deepEqual(output,{error:'REMOTE_CONSENT_REQUIRED'});
 assert.equal(JSON.stringify(logEntries).includes(text),false);
});
