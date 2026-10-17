import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {isPublicAddress,resolveEndpoint,requestApprovedEndpoint} from '../src/endpoint.mjs';

const allow = {kind:'remote',allowedHosts:['example.ai']};
const dnsGood = async () => [{address:'8.8.8.8',family:4}];
const dnsBad = async () => [{address:'169.254.169.254',family:4}];

test('public address classifier refuses local, metadata, private and docs', () => {
  for (const address of ['127.0.0.1','10.2.0.1','172.16.4.1','192.168.1.2','169.254.169.254','100.64.0.1','198.18.0.1','192.0.2.1','198.51.100.4','203.0.113.5','::1','fe80::1','fc00::1','::ffff:127.0.0.1','2001:db8::1'])
    assert.equal(isPublicAddress(address),false,address);
  assert.equal(isPublicAddress('8.8.8.8'),true);
  assert.equal(isPublicAddress('2606:4700::1111'),true);
});

test('local endpoints allow only loopback', async () => {
  assert.equal((await resolveEndpoint('http://127.0.0.1:8000/tts')).addresses[0].address,'127.0.0.1');
  assert.equal((await resolveEndpoint('http://localhost:8000/tts')).addresses[0].address,'127.0.0.1');
  await assert.rejects(resolveEndpoint('http://192.168.0.1:8000/tts'),{code:'LOCAL_LOOPBACK_ONLY'});
  await assert.rejects(resolveEndpoint('http://169.254.169.254/'),{code:'LOCAL_LOOPBACK_ONLY'});
  await assert.rejects(resolveEndpoint('http://attacker.test/'),{code:'LOCAL_LOOPBACK_ONLY'});
});

test('remote allows only allowlisted HTTPS with public DNS', async () => {
  assert.equal((await resolveEndpoint('https://example.ai/v1/tts',{...allow,resolver:dnsGood})).addresses[0].address,'8.8.8.8');
  await assert.rejects(resolveEndpoint('http://example.ai/v1/tts',{...allow,resolver:dnsGood}),{code:'REMOTE_HTTPS_REQUIRED'});
  await assert.rejects(resolveEndpoint('https://not-allowed.ai/tts',{...allow,resolver:dnsGood}),{code:'REMOTE_HOST_NOT_ALLOWED'});
  await assert.rejects(resolveEndpoint('https://example.ai/tts',{...allow,resolver:dnsBad}),{code:'DNS_ADDRESS_NOT_PUBLIC'});
  await assert.rejects(resolveEndpoint('https://example.ai/tts',{...allow,resolver:async()=>[{address:'127.0.0.1',family:4}]}),{code:'DNS_ADDRESS_NOT_PUBLIC'});
  await assert.rejects(resolveEndpoint('https://8.8.8.8/tts',{...allow,resolver:dnsGood}),{code:'REMOTE_HOST_NOT_ALLOWED'});
});

test('disallows embedded credentials, query API keys, fragments and unsafe schemes', async () => {
  for (const url of ['https://user:pass@example.ai/tts','https://example.ai/tts?api_key=secret','https://example.ai/tts#fragment'])
    await assert.rejects(resolveEndpoint(url,{...allow,resolver:dnsGood}),{code:'URL_CREDENTIALS_OR_QUERY_FORBIDDEN'});
  await assert.rejects(resolveEndpoint('file:///etc/passwd'),{code:'BAD_PROTOCOL'});
});

test('local pinned HTTP request works without external network', async t => {
  const server = createServer((req,res)=>{res.end('tts fixture');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const result = await requestApprovedEndpoint(`http://localhost:${server.address().port}/tts`);
  assert.equal(result.status,200);
  assert.equal(result.data.toString(),'tts fixture');
});

test('redirect response is blocked and not followed', async t => {
  const server = createServer((_req,res)=>{res.writeHead(302,{location:'http://169.254.169.254/secret'});res.end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await assert.rejects(requestApprovedEndpoint(`http://127.0.0.1:${server.address().port}/`),{code:'REDIRECT_FORBIDDEN'});
});

test('caps response bytes', async t => {
  const server = createServer((_req,res)=>res.end('x'.repeat(4096)));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await assert.rejects(requestApprovedEndpoint(`http://127.0.0.1:${server.address().port}/`,{maxResponseBytes:128}),{code:'RESPONSE_TOO_LARGE'});
});


test('request cannot override pinned Host or disable network limits', async () => {
  await assert.rejects(requestApprovedEndpoint('http://127.0.0.1:8080/',{headers:{Host:'169.254.169.254'}}),{code:'UNSAFE_REQUEST_HEADER'});
  await assert.rejects(requestApprovedEndpoint('http://127.0.0.1:8080/',{timeoutMs:0}),{code:'INVALID_TRANSPORT_LIMIT'});
});
