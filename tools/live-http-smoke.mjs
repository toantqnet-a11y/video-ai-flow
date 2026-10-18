/**
 * Release R0 network-enabled CI gate. Unlike offline fake route-registration
 * tests, this exercises real Fastify parsing, security hooks and binary avatar
 * headers with inject(). Deliberately fails if Fastify is not installed.
 * CI runners provide npm dependencies; offline authoring environments do not.
 */
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'studio-http-smoke-'));
process.env.CONTENTSTUDIO_DATA_DIR=dir;
process.env.CONTENTSTUDIO_PORT='4311';
let app;
const headers={host:'127.0.0.1:4311'};
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4H6/xHwAGbQKGYmyoQQAAAABJRU5ErkJggg==';
try{
  const {startApi}=await import('../apps/api/src/server.mjs');
  const runtime=await startApi({listen:false});app=runtime.app;
  await app.ready();
  const health=await app.inject({method:'GET',url:'/health',headers});
  assert.equal(health.statusCode,200);
  assert.equal(health.json().service,'contentstudio');
  const denied=await app.inject({method:'GET',url:'/api/channels',headers});
  assert.equal(denied.statusCode,401);
  const pair=await app.inject({method:'POST',url:'/api/session/pair',headers,
    payload:{code:runtime.security.pairingCodeForTerminal()}});
  assert.equal(pair.statusCode,200,`Pairing: HTTP ${pair.statusCode}`);
  const tokens=pair.json();
  const authorized={...headers,authorization:`Bearer ${tokens.bearer}`,'x-contentstudio-csrf':tokens.csrf};
  const created=await app.inject({method:'POST',url:'/api/channels',headers:authorized,payload:{name:'CI Smoke Channel'}});
  assert.equal(created.statusCode,201,`create channel HTTP ${created.statusCode}`);
  const ch=created.json();
  const video=runtime.repo.createVideo(ch.id,{title:'Empty real-render-history'});
  const noAuthHistory=await app.inject({method:'GET',url:`/api/videos/${video.id}/renders`,headers});
  assert.equal(noAuthHistory.statusCode,401,'history must require browser authentication');
  const history=await app.inject({method:'GET',url:`/api/videos/${video.id}/renders?limit=5`,headers:authorized});
  assert.equal(history.statusCode,200);
  assert.deepEqual(history.json(),{items:[]},'fresh video should have zero render jobs');
  const wrongQuery=await app.inject({method:'GET',url:`/api/videos/${video.id}/renders?limit=100`,headers:authorized});
  assert.equal(wrongQuery.statusCode,400,'unbounded history reads forbidden');
  const unknownQuery=await app.inject({method:'GET',url:`/api/videos/${video.id}/renders?other=1`,headers:authorized});
  assert.equal(unknownQuery.statusCode,400);
  const upload=await app.inject({method:'PUT',url:`/api/channels/${ch.id}/avatar`,headers:authorized,
    payload:{rowVersion:ch.rowVersion,mimeType:'image/png',dataBase64:png}});
  assert.equal(upload.statusCode,200,`upload HTTP ${upload.statusCode}`);
  assert(upload.json().avatarId);
  const unauthorizedImg=await app.inject({method:'GET',url:`/api/channels/${ch.id}/avatar`,headers});
  assert.equal(unauthorizedImg.statusCode,401);
  const image=await app.inject({method:'GET',url:`/api/channels/${ch.id}/avatar`,headers:authorized});
  assert.equal(image.statusCode,200);
  assert.match(String(image.headers['content-type']),/image\/png/);
  assert.equal(image.rawPayload.compare(Buffer.from(png,'base64')),0);
  const rejected=await app.inject({method:'PUT',url:`/api/channels/${ch.id}/avatar`,headers:authorized,
    payload:{rowVersion:ch.rowVersion,mimeType:'image/png',dataBase64:png}});
  assert.equal(rejected.statusCode,409);
  // Operator rearm revokes existing HTTP credentials without restarting
  // Fastify or changing local SQLite. Never expose the reset as an API route.
  runtime.security.rearmFromLocalOperator();
  const revoked=await app.inject({method:'GET',url:'/api/channels',headers:authorized});
  assert.equal(revoked.statusCode,401);
  const noHttpReset=await app.inject({method:'POST',url:'/api/session/rearm',headers:authorized,payload:{}});
  assert.equal(noHttpReset.statusCode,401);
  const oldCode=await app.inject({method:'POST',url:'/api/session/pair',headers,payload:{code:tokens.bearer}});
  assert.equal(oldCode.statusCode,401);
  const rotatedCode=runtime.security.pairingCodeForTerminal();
  const newPair=await app.inject({method:'POST',url:'/api/session/pair',headers,payload:{code:rotatedCode}});
  assert.equal(newPair.statusCode,200);
  const nextTokens=newPair.json();
  assert.notEqual(nextTokens.bearer,tokens.bearer);
  const fresh=await app.inject({method:'GET',url:'/api/channels',
    headers:{...headers,authorization:`Bearer ${nextTokens.bearer}`}});
  assert.equal(fresh.statusCode,200);
  assert.ok(fresh.json().items.some(x=>x.id===ch.id));
  console.log('LIVE_HTTP_SMOKE_PASS health/auth/channel/avatar/version-conflict/rearm');
}catch(error){
  console.error(`LIVE_HTTP_SMOKE_FAILED ${error?.code??error?.name??'UNKNOWN'}`);
  process.exitCode=1;
}finally{
  try{await app?.close();}catch{process.exitCode=1;}
  await rm(dir,{recursive:true,force:true});
}
