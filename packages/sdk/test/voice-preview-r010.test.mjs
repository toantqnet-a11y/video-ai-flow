/** Binary SDK transport: token and CSRF stay private, rejects spoofed audio. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioClient} from '../src/client.mjs';

const voice={provider:'edge',voice:'vi-VN-NamMinhNeural',text:'Xin chào',speed:1,remoteConsent:true};
const wav=()=>{const bytes=new Uint8Array(64);bytes.set(new TextEncoder().encode('RIFF'),0);bytes.set(new TextEncoder().encode('WAVE'),8);return bytes;};

function makeClient({status=200,type='audio/wav',bytes=wav()}={}){
 const requests=[];
 const client=createStudioClient({fetchImpl:async(url,init)=>{
   requests.push({url,init});
   if(url==='/api/session/pair')return new Response(JSON.stringify({bearer:'private-secret',csrf:'private-csrf'}),{headers:{'content-type':'application/json'}});
   if(status!==200)return new Response(JSON.stringify({error:'TTS_NOT_CONFIGURED'}),{status,headers:{'content-type':'application/json'}});
   return new Response(bytes,{status,headers:{'content-type':type}});
 }});
 return {client,requests};
}

test('binary voice preview reuses in-memory auth and CSRF, returns actual Blob',async()=>{
 const {client,requests}=makeClient();
 await assert.rejects(client.previewVoice('channel-1',voice),{code:'PAIRING_REQUIRED'});
 await client.pair('terminal-only-code');
 const audio=await client.previewVoice('channel-1',voice);
 assert.equal(audio.type,'audio/wav');assert.equal(audio.size,64);
 assert.equal(requests[1].url,'/api/channels/channel-1/voice-preview');
 assert.equal(requests[1].init.headers.authorization,'Bearer private-secret');
 assert.equal(requests[1].init.headers['x-contentstudio-csrf'],'private-csrf');
 assert.equal(JSON.stringify(requests[1].init.body).includes('private-secret'),false);
});

test('audio endpoint refuses JSON errors, HTML, oversized responses and invalid signature',async()=>{
 for(const props of [{status:503},{type:'text/html'}, {type:'audio/mpeg',bytes:wav()}, {type:'audio/wav',bytes:new Uint8Array(2_000_001)}]){
  const {client}=makeClient(props);await client.pair('code');
  await assert.rejects(client.previewVoice('abc',voice),e=>['TTS_NOT_CONFIGURED','INVALID_PREVIEW_AUDIO','PREVIEW_AUDIO_TOO_LARGE'].includes(e.code));
 }
});

test('SDK rejects path injection before sending binary request',async()=>{
 const {client,requests}=makeClient();await client.pair('code');
 await assert.rejects(client.previewVoice('../other',voice),{code:'INVALID_PATH_PARAMETER'});
 assert.equal(requests.length,1);
});
