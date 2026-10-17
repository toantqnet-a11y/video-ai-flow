/** Private image transport must never use token-bearing URLs or persistent auth. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioClient} from '../src/client.mjs';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4H6/xHwAGbQKGYmyoQQAAAABJRU5ErkJggg==','base64');
async function fixture({type='image/png',bytes=PNG,status=200}={}){
 const calls=[];
 const client=createStudioClient({fetchImpl:async(url,init)=>{
   calls.push({url,init});
   if(url==='/api/session/pair')return new Response(JSON.stringify({bearer:'ephemeral',csrf:'ephemeral-csrf'}),{headers:{'content-type':'application/json'}});
   if(status!==200)return new Response(JSON.stringify({error:'AVATAR_NOT_FOUND'}),{status,headers:{'content-type':'application/json'}});
   return new Response(bytes,{status,headers:{'content-type':type}});
 }});
 await client.pair('terminal-code');return {client,calls};
}
test('R0 avatar SDK safely obtains a revocable Blob with bearer only in headers',async()=>{
 const {client,calls}=await fixture();
 const image=await client.getChannelAvatar('safe-channel');
 assert.equal(image.type,'image/png');assert.equal(image.size,PNG.length);
 assert.equal(calls[1].url,'/api/channels/safe-channel/avatar');
 assert.equal(calls[1].init.headers.authorization,'Bearer ephemeral');
 assert(!calls[1].url.includes('ephemeral'));
 await assert.rejects(client.request('getChannelAvatar',{id:'safe-channel'}),{code:'USE_CHANNEL_AVATAR'});
});
test('R0 avatar SDK rejects unsupported content, oversized images and URL injection',async()=>{
 for(const config of [{type:'text/html'},{bytes:new Uint8Array(262145)},{type:'image/png',bytes:new Uint8Array(32)}]){
   const {client}=await fixture(config);
   await assert.rejects(client.getChannelAvatar('safe-channel'),e=>e.code==='INVALID_AVATAR_IMAGE'||e.code==='INVALID_AVATAR_SIZE');
 }
 const {client}=await fixture({status:404});
 await assert.rejects(client.getChannelAvatar('safe-channel'),{code:'AVATAR_NOT_FOUND'});
 await assert.rejects(client.getChannelAvatar('../admin'),{code:'INVALID_PATH_PARAMETER'});
});
