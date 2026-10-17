/** R0-03: security integration tests for request policy and actual vault paths.
 * Runs without npm Fastify dependency; HTTP Fastify E2E remains separate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSecurityGate,PassphraseVault,createCredentialAccess} from '../../../packages/security/src/index.mjs';
import {inspectIncomingRequest,safeRequestLog} from '../src/request-policy.mjs';
import {installSecurity} from '../src/security.mjs';
import {registerVaultRoutes} from '../src/vault-routes.mjs';
import {createUnlockLimiter} from '../src/unlock-limiter.mjs';

function wire(path='/api/channels',method='GET',overrides={}){
  const headers={host:'127.0.0.1:4311',...overrides.headers};
  const pairs=Object.entries(headers).flatMap(([k,v])=>[k,String(v)]);
  return {url:path,method,headers,rawHeaders:overrides.rawHeaders??pairs,socket:{remoteAddress:overrides.peer??'127.0.0.1'}};
}
function guard(raw,gate=createSecurityGate()) {return inspectIncomingRequest(raw,{port:4311,gate});}
function fakeApp(){
  const hooks=new Map(),routes=new Map(),app={};
  app.addHook=(name,fn)=>hooks.set(name,fn);
  for(const method of ['get','post','put','patch','delete'])app[method]=(path,fn)=>routes.set(`${method.toUpperCase()} ${path}`,fn);
  return {app,hooks,routes};
}
function reply(){return {status:200,body:undefined,headers:{},code(n){this.status=n;return this},header(k,v){this.headers[k]=v;return this},send(b){this.body=b;return this}};}
async function send({hooks,routes},method,path,{headers={},body,params={},peer}={}) {
  const url=path;
  const req={url,method,body,params,raw:wire(url,method,{headers,peer}),log:{error(){},warn(){}}};
  const response=reply();
  const denied=await hooks.get('onRequest')?.(req,response);
  if(denied)return {status:response.status,body:response.body};
  const fn=routes.get(`${method} ${path}`);
  if(!fn)return {status:404,body:{error:'NOT_FOUND'}};
  const result=await fn(req,response);
  return {status:response.status,body:response.body??result};
}

test('request boundary rejects wrong Host, Origin, peer, forwarded and header-smuggling',()=>{
  assert.equal(guard(wire()),null);
  assert.equal(guard(wire('/api/channels','GET',{headers:{host:'evil.example'}})),'BAD_HOST');
  assert.equal(guard(wire('/api/channels','GET',{headers:{origin:'http://evil.example'}})),'INVALID_ORIGIN');
  assert.equal(guard(wire('/api/channels','GET',{peer:'10.0.0.2'})),'NOT_LOOPBACK');
  for(const key of ['x-forwarded-for','x-forwarded-proto','x-real-ip','x-original-url'])
    assert.equal(guard(wire('/api/channels','GET',{headers:{[key]:'127.0.0.1'}})),'FORWARDED_HEADERS_NOT_ALLOWED');
  const duplicate=wire();duplicate.rawHeaders.push('HOST','evil.example');
  assert.equal(guard(duplicate),'AMBIGUOUS_HEADERS');
  assert.equal(guard(wire('/api/channels','POST',{headers:{'content-length':'12','transfer-encoding':'chunked'}})),'AMBIGUOUS_BODY_LENGTH');
});

test('request boundary rejects CORS probes, cross-site, path decoding tricks and query secrets',()=>{
  assert.equal(guard(wire('/api/channels','OPTIONS')),'CORS_DISABLED');
  assert.equal(guard(wire('/api/channels','GET',{headers:{'sec-fetch-site':'cross-site'}})),'CROSS_SITE_REQUEST');
  for(const path of ['/api/%63hannels','/api//channels','/api/../channels','/api/channels?bearer=x','/api/jobs?api_key=fake','/api/session/pair?code=x','/health?x=y'])
    assert.notEqual(guard(wire(path)),null,path);
  assert.equal(guard(wire('/api/channels?status=archived')),null);
  assert.equal(guard(wire('/api/channels?status=active&unknown=x')),'QUERY_NOT_ALLOWED');
});

test('global Fastify hook protects every API route including vault and SSE',async()=>{
  const f=fakeApp();const gate=installSecurity(f.app,{port:4311});
  const get=(url,method='GET',headers={})=>f.hooks.get('onRequest')({raw:wire(url,method,{headers}),url,method},reply());
  assert.equal((await get('/api/security/credentials')).status,401);
  assert.equal((await get('/api/jobs/events')).status,401);
  assert.equal((await get('/api/session/pair','GET')).status,401);
  const paired=await send(f,'POST','/api/session/pair',{body:{code:gate.pairingCodeForTerminal()}});
  assert.ok(paired.body.bearer);assert.ok(paired.body.csrf);
  assert.equal(paired.body.error,undefined);
  const head={authorization:`Bearer ${paired.body.bearer}`};
  assert.equal(await get('/api/channels','GET',head),undefined);
  assert.equal((await get('/api/channels','POST',head)).status,403);
  assert.equal(await get('/api/channels','POST',{...head,'x-contentstudio-csrf':paired.body.csrf}),undefined);
  assert.equal((await send(f,'POST','/api/session/pair',{body:{code:'wrong'}})).status,409);
});

test('vault HTTP facade stores ciphertext; no HTTP plaintext getter; wrong schemas rejected',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'r003-vault-'));const vault=new PassphraseVault(dir);const f=fakeApp();
  const gate=installSecurity(f.app,{port:4311});registerVaultRoutes(f.app,{vault});
  try {
    const paired=await send(f,'POST','/api/session/pair',{body:{code:gate.pairingCodeForTerminal()}});
    const head={authorization:`Bearer ${paired.body.bearer}`,'x-contentstudio-csrf':paired.body.csrf};
    const query=(method,path,body,headers=head)=>send(f,method,path,{body,headers});
    assert.equal((await query('POST','/api/security/vault/init',{passphrase:'super-secret-long-passphrase'},{})).status,401);
    assert.equal((await query('POST','/api/security/vault/init',{passphrase:'super-secret-long-passphrase'},{authorization:head.authorization})).status,403);
    assert.equal((await query('POST','/api/security/vault/init',{passphrase:'super-secret-long-passphrase',unknown:1})).status,400);
    assert.equal((await query('POST','/api/security/vault/init',{passphrase:'super-secret-long-passphrase'})).status,201);
    assert.equal((await query('POST','/api/security/credentials',{id:'gemini1',providerId:'gemini',apiKey:'demo-secret-key',extra:'x'})).status,400);
    const put=await query('POST','/api/security/credentials',{id:'gemini1',providerId:'gemini',apiKey:'demo-secret-key'});
    assert.equal(put.status,201);assert.deepEqual(put.body,{id:'gemini1',providerId:'gemini',stored:true});
    const listed=await query('GET','/api/security/credentials');assert.equal(listed.status,200);
    assert.deepEqual(listed.body.items,[{id:'gemini1',providerId:'gemini',stored:true}]);
    const json=await readFile(join(dir,'secrets.vault.json'),'utf8');
    assert.ok(!json.includes('demo-secret-key'));
    assert.equal((await query('GET','/api/security/credentials/gemini1')).status,404);
    assert.equal((await query('POST','/api/security/vault/lock',{})).body.state,'LOCKED');
    assert.equal((await query('POST','/api/security/credentials',{id:'abc',providerId:'gemini',apiKey:'x'})).status,423);
    assert.equal((await query('POST','/api/security/vault/unlock',{passphrase:'super-secret-long-passphrase'})).body.state,'UNLOCKED');
    const scoped=createCredentialAccess(vault);
    assert.equal(await scoped.withCredential({credentialId:'gemini1',providerId:'gemini'},async key=>key.length),15);
    await assert.rejects(scoped.withCredential({credentialId:'gemini1',providerId:'openrouter'},async key=>key),{code:'CREDENTIAL_PROVIDER_MISMATCH'});
  }finally{vault.lock();await rm(dir,{recursive:true,force:true})}
});

test('vault unlock throttle expires after a minute and serializes parallel attempts',async()=>{
  let now=0;const limiter=createUnlockLimiter({clock:()=>now});
  const dir=await mkdtemp(join(tmpdir(),'r003-limiter-'));const vault=new PassphraseVault(dir);const f=fakeApp();
  registerVaultRoutes(f.app,{vault,limiter});
  const invoke=(body)=>f.routes.get('POST /api/security/vault/unlock')({body,log:{error(){}}},reply());
  try {
    await vault.initialize('correct-passphrase-for-tests');vault.lock();
    const results=await Promise.all(Array.from({length:9},()=>invoke({passphrase:'wrong-passphrase-123'})));
    assert.equal(results.filter(r=>r.body?.error==='VAULT_UNLOCK_FAILED').length,5);
    assert.equal(results.filter(r=>r.body?.error==='VAULT_UNLOCK_RATE_LIMITED').length,4);
    const blocked=await invoke({passphrase:'correct-passphrase-for-tests'});assert.equal(blocked.status,429);
    now=60_001;
    const success=await invoke({passphrase:'correct-passphrase-for-tests'});assert.equal(success.state,'UNLOCKED');
    assert.equal(limiter.blocked(),false);
  }finally{vault.lock();await rm(dir,{recursive:true,force:true})}
});

test('Safe Fastify request serializer never includes URL, tokens or prompt text',()=>{
  const dangerous={method:'POST',id:'request-19',url:'/api/jobs?apiKey=highly-sensitive',headers:{authorization:'Bearer hidden'},body:{apiKey:'secret',prompt:'private'}};
  assert.deepEqual(safeRequestLog(dangerous),{method:'POST',requestId:'request-19'});
  assert.ok(!JSON.stringify(safeRequestLog(dangerous)).includes('sensitive'));
});

test('same-origin dev frontend allowed only when explicitly enabled',()=>{
  const fromVite=wire('/api/channels','GET',{headers:{origin:'http://127.0.0.1:5173'}});
  assert.equal(guard(fromVite,createSecurityGate({port:4311,devFrontend:false})),'INVALID_ORIGIN');
  assert.equal(guard(fromVite,createSecurityGate({port:4311,devFrontend:true})),null);
});
