/** R2-05: protected image streaming is bounded and rejects spoofed responses. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStudioClient} from '../src/client.mjs';
const png=await readFile('spikes/SP-03/fixtures/sp03-demo.png');
function fake({status=200,mime='image/png',bytes=png,length=null}={}){
  const calls=[];
  const client=createStudioClient({fetchImpl:async(url,opts)=>{
    calls.push({url,opts});
    if(url==='/api/session/pair')return new Response(JSON.stringify({bearer:'secret-session',csrf:'csrf'}),{
      headers:{'content-type':'application/json'}});
    if(status!==200)return new Response(JSON.stringify({error:'IMAGE_NOT_READY'}),{
      status,headers:{'content-type':'application/json'}});
    const headers={'content-type':mime};
    if(length!==null)headers['content-length']=String(length);
    return new Response(bytes,{headers});
  }});
  return {client,calls};
}
test('protected GET streams image bytes through in-memory bearer, never URL',async()=>{
  const f=fake();
  await assert.rejects(f.client.getSceneImageFile('scene-1'),{code:'PAIRING_REQUIRED'});
  await f.client.pair('activation-code');
  const blob=await f.client.getSceneImageFile('scene-1');
  assert.equal(blob.type,'image/png');assert.equal(blob.size,png.length);
  assert.equal(f.calls[1].url,'/api/scenes/scene-1/image/file');
  assert.equal(f.calls[1].opts.method,'GET');
  assert.equal(f.calls[1].opts.headers.authorization,'Bearer secret-session');
  assert(!f.calls[1].url.includes('secret-session'));
});
test('invalid scene ID and HTML/spoofed/mismatched image are never shown',async()=>{
  const bad=[{status:404},{mime:'text/html'},
    {mime:'image/jpeg',bytes:png},{bytes:Buffer.from('<html>not image</html>')},
    {length:26*1024*1024}];
  for(const props of bad){const f=fake(props);await f.client.pair('activation-code');
    await assert.rejects(f.client.getSceneImageFile('scene-1'));
  }
  const f=fake();await f.client.pair('activation-code');
  await assert.rejects(f.client.getSceneImageFile('../outside'),{code:'INVALID_PATH_PARAMETER'});
  assert.equal(f.calls.length,1);
});
test('cancel stream when actual response exceeds limit without declared Content-Length',async()=>{
  // Response stream is explicitly oversized; no huge buffer is accumulated.
  let canceled=false;
  const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(4*1024*1024));},
    cancel(){canceled=true;}});
  const client=createStudioClient({fetchImpl:async(url)=>url==='/api/session/pair'?new Response(JSON.stringify({bearer:'secret-session',csrf:'csrf'}),{
    headers:{'content-type':'application/json'}}):{
      ok:true,status:200,headers:new Headers({'content-type':'image/png'}),body:stream}});
  await client.pair('activation-code');
  await assert.rejects(client.getSceneImageFile('scene-1'),{code:'IMAGE_FILE_TOO_LARGE'});
  assert.equal(canceled,true);
});
