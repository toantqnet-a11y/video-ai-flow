/** R2-03 bearer-authenticated scene voice playback cannot leak the session. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioClient} from '../src/client.mjs';
const wav=()=>{const b=new Uint8Array(70);b.set(new TextEncoder().encode('RIFF'),0);b.set(new TextEncoder().encode('WAVE'),8);return b};
function harness({status=200,type='audio/wav',body=wav()}={}){
 const requests=[];
 const client=createStudioClient({fetchImpl:async(url,init)=>{
  requests.push({url,init});
  if(url==='/api/session/pair')return new Response(JSON.stringify({bearer:'opaque-bearer',csrf:'opaque-csrf'}),{headers:{'content-type':'application/json'}});
  if(status!==200)return new Response(JSON.stringify({error:'VOICE_NOT_READY'}),{status,headers:{'content-type':'application/json'}});
  return new Response(body,{status,headers:{'content-type':type}});
 }});
 return {client,requests};
}
test('requires pairing and sends bearer only in protected GET header',async()=>{
 const {client,requests}=harness();
 await assert.rejects(client.getSceneVoiceAudio('scene-id'),{code:'PAIRING_REQUIRED'});
 await client.pair('one-time-code');
 const blob=await client.getSceneVoiceAudio('scene-id');
 assert.equal(blob.size,70);assert.equal(blob.type,'audio/wav');
 assert.equal(requests[1].url,'/api/scenes/scene-id/voice/audio');
 assert.equal(requests[1].init.headers.authorization,'Bearer opaque-bearer');
 assert.equal(requests[1].init.method,'GET');
 assert(!JSON.stringify(requests[1].url).includes('opaque-bearer'));
});
test('rejects spoofed file types, corrupt signatures and invalid ids',async()=>{
 for(const props of [{status:404},{type:'text/html'},{type:'audio/mpeg',body:wav()},{body:new Uint8Array(20)}]){
  const {client}=harness(props);await client.pair('code');
  await assert.rejects(client.getSceneVoiceAudio('scene-id'));
 }
 const {client,requests}=harness();await client.pair('code');
 await assert.rejects(client.getSceneVoiceAudio('../escape'),{code:'INVALID_PATH_PARAMETER'});
 assert.equal(requests.length,1);
});
