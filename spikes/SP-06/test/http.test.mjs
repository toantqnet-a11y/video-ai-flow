import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {PassphraseVault} from '../src/vault.mjs';
import {startSecureLocalServer} from '../src/http.mjs';

const passphrase = 'my_unpredictable_test_password_456';
async function serverFixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cs06-http-'));
  const vault = new PassphraseVault(dir);
  const events = [];
  const srv = await startSecureLocalServer({vault, audit:e => events.push(e)});
  t.after(async () => { await srv.close(); vault.lock(); await rm(dir,{force:true,recursive:true}); });
  const call = (route, {method='GET', body, headers={}, auth=true, csrf=true}={}) => fetch(`${srv.url}${route}`, {
    method,
    headers: {'content-type': 'application/json', ...(auth ? {authorization:`Bearer ${srv.bearerToken}`} : {}),
      ...(csrf && method !== 'GET' ? {'x-contentstudio-csrf':srv.csrfToken} : {}), ...headers},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), redirect:'manual'
  });
  return {dir,vault,srv,events,call};
}

test('loopback binding and minimal unauthenticated health', async t => {
  const {srv,call} = await serverFixture(t);
  assert.equal(srv.server.address().address, '127.0.0.1');
  assert.deepEqual(await (await call('/health', {auth:false})).json(), {status:'ok'});
  assert.equal((await call('/api/security/status', {auth:false})).status, 401);
});

test('credentials API requires bearer, second CSRF token and redacts secret', async t => {
  const {call,dir} = await serverFixture(t);
  assert.equal((await call('/api/security/vault/init', {method:'POST', body:{passphrase}, auth:false})).status, 401);
  assert.equal((await call('/api/security/vault/init', {method:'POST', body:{passphrase}, csrf:false})).status, 403);
  assert.equal((await call('/api/security/vault/init', {method:'POST', body:{passphrase}})).status, 201);
  const secret = 'sk-EXPLICIT-SECRET-TEST-DO-NOT-LEAK';
  const store = await call('/api/security/credentials', {method:'POST',body:{id:'primary',providerId:'groq',apiKey:secret}});
  assert.equal(store.status, 201);
  assert.deepEqual(await store.json(), {id:'primary',providerId:'groq',stored:true});
  const list = await (await call('/api/security/credentials')).text();
  const status = await (await call('/api/security/status')).text();
  assert.ok(!list.includes(secret) && !status.includes(secret));
  assert.ok(!(await readFile(path.join(dir,'secrets.vault.json'),'utf8')).includes(secret));
});

test('malicious Origin, null Origin, and host rebinding attempts rejected', async t => {
  const {call,srv} = await serverFixture(t);
  assert.equal((await call('/api/security/status', {headers:{origin:'https://attacker.test'}})).status, 403);
  assert.equal((await call('/api/security/status', {headers:{origin:'null'}})).status, 403);
  assert.equal((await call('/api/security/status', {headers:{origin:srv.url}})).status, 200);
  // Undici/fetch replaces Host with its URL authority. Use raw Node HTTP to
  // prove the actual DNS-rebinding Host check is enforced.
  const rebound = await new Promise((resolve,reject) => {
    const request=http.request({host:'127.0.0.1',port:srv.server.address().port,path:'/api/security/status',headers:{Host:'attacker.test',authorization:`Bearer ${srv.bearerToken}`}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
    request.on('error',reject);request.end();
  });
  assert.equal(rebound,403);
  assert.equal((await call('/api/security/status', {headers:{'x-forwarded-host':'attacker.test'}})).status, 403);
  assert.equal((await call('/api/security/status', {headers:{'x-forwarded-for':'8.8.8.8'}})).status, 403);
});

test('rejects browser CORS preflight even when supplied credentials', async t => {
  const {call} = await serverFixture(t);
  const result = await call('/api/security/status', {method:'OPTIONS',headers:{origin:'https://bad.example','access-control-request-method':'POST'}});
  assert.equal(result.status, 403);
  assert.equal(result.headers.get('access-control-allow-origin'), null);
});

test('wrong CSRF token and bad authorization blocked', async t => {
  const {call} = await serverFixture(t);
  assert.equal((await call('/api/security/vault/init',{method:'POST',body:{passphrase},headers:{'x-contentstudio-csrf':'bad'}})).status,403);
  assert.equal((await call('/api/security/status',{headers:{authorization:'Bearer invalid'}})).status,401);
});

test('invalid JSON, content type, oversized body', async t => {
  const {call,srv} = await serverFixture(t);
  const url = `${srv.url}/api/security/vault/init`;
  const headers = {authorization:`Bearer ${srv.bearerToken}`,'x-contentstudio-csrf':srv.csrfToken};
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{invalid'})).status,400);
  assert.equal((await call('/api/security/vault/init',{method:'POST',body:{passphrase:'x'.repeat(25000)}})).status,413);
});

test('vault locks, unlocks and throttles bad passphrases', async t => {
  const {call} = await serverFixture(t);
  assert.equal((await call('/api/security/vault/init',{method:'POST',body:{passphrase}})).status,201);
  assert.equal((await call('/api/security/vault/lock',{method:'POST'})).status,200);
  assert.equal((await call('/api/security/credentials',{method:'POST',body:{id:'x',providerId:'groq',apiKey:'x'}})).status,423);
  for (let i=0;i<5;i++) assert.equal((await call('/api/security/vault/unlock',{method:'POST',body:{passphrase:'wrong'}})).status,401);
  assert.equal((await call('/api/security/vault/unlock',{method:'POST',body:{passphrase}})).status,429);
});

test('secret metadata only in errors and audit stream, never raw passwords or tokens', async t => {
  const {call,events,srv} = await serverFixture(t);
  await call('/api/security/vault/init',{method:'POST',body:{passphrase}});
  const secret = 'API-SECRET-CANARY-984';
  await call('/api/security/credentials',{method:'POST',body:{id:'a',providerId:'groq',apiKey:secret}});
  await call('/api/security/credentials',{method:'POST',body:{id:'../../x',providerId:'groq',apiKey:secret}});
  const serialized = JSON.stringify(events);
  assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes(passphrase));
  assert.ok(!serialized.includes(srv.bearerToken));
  assert.ok(!serialized.includes(srv.csrfToken));
});

test('delete endpoint and reject escaped path', async t => {
  const {call} = await serverFixture(t);
  await call('/api/security/vault/init',{method:'POST',body:{passphrase}});
  await call('/api/security/credentials',{method:'POST',body:{id:'a',providerId:'groq',apiKey:'secret'}});
  assert.equal((await call('/api/security/credentials/a',{method:'DELETE'})).status,200);
  assert.equal((await call('/api/security/credentials')).status,200);
  assert.equal((await call('/api/security/credentials/%2e%2e',{method:'DELETE'})).status,404);
});

test('duplicated Host headers rejected (parser disagreement)', async t => {
  const {srv} = await serverFixture(t);
  const response = await new Promise((resolve,reject) => {
    const request = http.request({host:'127.0.0.1',port:srv.server.address().port,path:'/api/security/status',headers:{authorization:`Bearer ${srv.bearerToken}`,'Host':'127.0.0.1:1'}}, res => {
      const chunks=[]; res.on('data',c=>chunks.push(c)); res.on('end',()=>resolve({status:res.statusCode, body:Buffer.concat(chunks).toString()}));
    });
    request.on('error',reject);request.end();
  });
  assert.equal(response.status,403);
});

test('raw HTTP with two Host headers never reaches API', async t => {
  const {srv} = await serverFixture(t);
  const {connect} = await import('node:net');
  const result = await new Promise((resolve,reject) => {
    const socket = connect(srv.server.address().port, '127.0.0.1', () => {
      socket.write(`GET /api/security/status HTTP/1.1\r\nHost: 127.0.0.1:${srv.server.address().port}\r\nHost: evil.example\r\nAuthorization: Bearer ${srv.bearerToken}\r\nConnection: close\r\n\r\n`);
    });
    let chunks=''; socket.on('data',data=>{chunks+=data.toString();});
    socket.on('end',()=>resolve(chunks)); socket.on('error',reject);
  });
  assert.match(result, /^HTTP\/1\.1 (400|403) /);
});

test('foreign Origin blocks an authenticated write even with bearer+CSRF', async t => {
  const {call} = await serverFixture(t);
  const response = await call('/api/security/vault/init', {method:'POST',body:{passphrase},headers:{Origin:'https://evil.test'}});
  assert.equal(response.status, 403);
});
