/** Local TTS HTTP bridge tests: no real Piper/VieNeu model required. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setupProviders,localTtsConfig} from '../src/providers.mjs';
import {localTtsCatalog} from '../src/local-tts-catalog.mjs';
import {detectAudioFormat,probeAudio} from '../../../spikes/SP-02/src/audio.js';

function wav(){
 const b=Buffer.alloc(1644);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);
 b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);
 b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(1600,40);return b;
}
async function mockServer(handler){
 const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
 return {server,base:`http://127.0.0.1:${server.address().port}`,
  close:()=>new Promise(resolve=>server.close(resolve))};
}
test('configuration requires literal loopback, explicit synthesis path and safe local voice',()=>{
 const invalid=[
   'http://localhost:8123/synth','https://127.0.0.1:8123/synth',
   'http://example.com:8123/synth','http://127.0.0.2:8123/synth',
   'http://127.0.0.1:8123/', 'http://127.0.0.1:8123/synth?token=ABC',
   'http://user:pwd@127.0.0.1:8123/synth', 'http://127.0.0.1:8123/synth#secret'
 ];
 for(const url of invalid)assert.throws(()=>localTtsConfig({CONTENTSTUDIO_PIPER_TTS_URL:url}),/INVALID_LOCAL_TTS_CONFIG/,url);
 assert.throws(()=>localTtsConfig({CONTENTSTUDIO_PIPER_TTS_URL:'http://127.0.0.1:8123/synth',CONTENTSTUDIO_PIPER_TTS_VOICE:'bad voice'}),/INVALID_LOCAL_TTS_VOICE/);
 const good=localTtsConfig({CONTENTSTUDIO_PIPER_TTS_URL:'http://127.0.0.1:8123/synth',CONTENTSTUDIO_PIPER_TTS_VOICE:'vi_VN'});
 assert.equal(good.piper.voice,'vi_VN');assert.equal(good.piper.healthUrl,'http://127.0.0.1:8123/health');
 assert.throws(()=>localTtsConfig({CONTENTSTUDIO_PIPER_TTS_URL:'http://127.0.0.1:8123/synth',CONTENTSTUDIO_PIPER_TTS_BODY_FORMAT:'xml'}),/INVALID_LOCAL_TTS_BODY_FORMAT/);
});

test('absent operators config registers no local TTS and exposes no address',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cs-r204-local-'));
 try{
  const registry=setupProviders({dataRoot:root,localConfig:{}});
  const list=await localTtsCatalog(registry,{probe:true});
  assert.deepEqual(list.items.map(x=>x.health),['not_configured','not_configured']);
  assert.equal(registry.list().some(x=>x.id==='piper'),false);
  assert(!JSON.stringify(list).includes('127.0.0.1'));
 }finally{await rm(root,{recursive:true,force:true})}
});

test('Piper custom JSON loopback contract: health, headers, actual audio file, codec',async()=>{
 const requests=[];
 const http=await mockServer(async(req,res)=>{
  if(req.url==='/health'){res.setHeader('Content-Type','application/json');res.end('{"ready":true}');return}
  if(req.url!=='/synthesize'||req.method!=='POST'){res.writeHead(404);res.end();return}
  let text='';for await(const part of req)text+=part.toString();
  requests.push({method:req.method,contentType:req.headers['content-type'],accept:req.headers.accept,body:JSON.parse(text)});
  res.writeHead(200,{'Content-Type':'audio/wav'});res.end(wav());
 });
 const root=await mkdtemp(join(tmpdir(),'cs-r204-loopback-'));
 try{
  const localConfig=localTtsConfig({CONTENTSTUDIO_PIPER_TTS_URL:http.base+'/synthesize',CONTENTSTUDIO_PIPER_TTS_VOICE:'vi_Northern'});
  const registry=setupProviders({dataRoot:root,localConfig});
  const before=await localTtsCatalog(registry,{probe:false});assert.equal(before.items[0].health,'not_probed');
  const after=await localTtsCatalog(registry,{probe:true});assert.equal(after.items[0].health,'ready');
  assert.deepEqual(after.items.map(x=>x.configured),[true,false]);
  assert(!JSON.stringify(after).includes(http.base),'never disclose loopback URL/port');
  const audio=await registry.invoke('piper',{projectId:'testproject',sceneId:'testscene',text:'Chào Việt Nam',voice:'vi_Northern',rate:10},{allowRemote:false});
  assert.equal(detectAudioFormat(await readFile(audio.path)),'wav');
  assert.equal((await probeAudio(audio.path)).codec,'pcm_s16le');
  assert.equal(requests.length,1);
  assert.deepEqual(requests[0].body,{text:'Chào Việt Nam',voice:'vi_Northern',rate:10});
  assert.match(requests[0].contentType,/application\/json/);
  assert.equal(requests[0].accept,'audio/*');
 }finally{await http.close();await rm(root,{recursive:true,force:true})}
});

test('local adapter rejects HTTP redirect, HTML payload and never writes them as voice files',async()=>{
 let status=302;
 const http=await mockServer((req,res)=>{
  if(req.url==='/health'){res.writeHead(503);res.end();return}
  if(status===302){res.writeHead(302,{location:'http://example.com/synth'});res.end();return}
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<html>Not audio</html>');
 });
 const root=await mkdtemp(join(tmpdir(),'cs-r204-bad-'));
 try{
  const registry=setupProviders({dataRoot:root,localConfig:localTtsConfig({CONTENTSTUDIO_VIENEU_TTS_URL:http.base+'/synthesize'})});
  assert.equal((await localTtsCatalog(registry,{probe:true})).items[1].health,'unavailable');
  const input={projectId:'myproject',sceneId:'scene1',text:'Xin chào',voice:'default',rate:0};
  await assert.rejects(registry.invoke('vieneu',input,{allowRemote:false}));
  status=200;
  await assert.rejects(registry.invoke('vieneu',input,{allowRemote:false}));
 }finally{await http.close();await rm(root,{recursive:true,force:true})}
});

test('text/plain bridge mode supports native Piper-style raw-text endpoint',async()=>{
 let observed=null;
 const http=await mockServer(async(req,res)=>{
   if(req.method==='POST'){
     let body='';for await(const part of req)body+=part.toString();
     observed={body,contentType:req.headers['content-type']};
     res.writeHead(200,{'Content-Type':'audio/wav'});res.end(wav());return;
   }
   res.writeHead(404);res.end();
 });
 const root=await mkdtemp(join(tmpdir(),'cs-r204-plaintext-'));
 try{
  const config=localTtsConfig({CONTENTSTUDIO_PIPER_TTS_URL:http.base+'/synthesize',CONTENTSTUDIO_PIPER_TTS_BODY_FORMAT:'text'});
  const registry=setupProviders({dataRoot:root,localConfig:config});
  const created=await registry.invoke('piper',{projectId:'project',sceneId:'scene',text:'Lời thoại thuần văn bản.',voice:'default',rate:0},{allowRemote:false});
  assert.equal((await probeAudio(created.path)).codec,'pcm_s16le');
  assert.deepEqual(observed,{body:'Lời thoại thuần văn bản.',contentType:'text/plain; charset=utf-8'});
 }finally{await http.close();await rm(root,{recursive:true,force:true})}
});

test('provider registry will not remote invoke a local provider even if allowRemote spoofing was passed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cs-r204-spoof-'));
 try{
  const registry=setupProviders({dataRoot:root,localConfig:{}});
  await assert.rejects(registry.invoke('piper',{},{allowRemote:true}),/PROVIDER_NOT_REGISTERED/);
 }finally{await rm(root,{recursive:true,force:true})}
});
