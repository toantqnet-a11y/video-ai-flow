import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHttpTtsAdapter } from '../src/local.js';
import { withHttp, wavBytes } from './helpers.js';

const sample = await wavBytes();
test('local JSON adapter transmits text/voice to loopback, accepts playable WAV', async () => {
  await withHttp(async (req, res) => {
    assert.equal(req.method, 'POST');
    let body = ''; for await (const part of req) body += part;
    assert.deepEqual(JSON.parse(body), { text: 'Xin chào Việt Nam', voice: 'vi-demo', rate: 20 });
    res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(sample);
  }, async endpoint => {
    const adapter = new LocalHttpTtsAdapter({ endpoint });
    const output = await adapter.synthesize({ text: 'Xin chào Việt Nam', voice: 'vi-demo', rate: 20 });
    assert.equal(output.format, 'wav'); assert.deepEqual(output.bytes, sample);
  });
});

test('local text/plain mode works for Piper-style raw text endpoint', async () => {
  await withHttp(async (req, res) => {
    assert.match(req.headers['content-type'], /text\/plain/);
    let body = ''; for await (const part of req) body += part;
    assert.equal(body, 'Lời thoại');
    res.writeHead(200); res.end(sample);
  }, async endpoint => {
    const adapter = new LocalHttpTtsAdapter({ endpoint, bodyFormat: 'text' });
    assert.equal((await adapter.synthesize({ text: 'Lời thoại' })).format, 'wav');
  });
});

test('remote URLs, credentials and other schemes blocked by default', async () => {
  for (const endpoint of ['https://example.com/tts', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'http://admin:token@localhost/tts']) {
    assert.throws(() => new LocalHttpTtsAdapter({ endpoint }), { code: 'INVALID_CONFIG' });
  }
});

test('HTTP errors and invalid HTML responses cannot be saved as speech', async () => {
  await withHttp((_req, res) => { res.writeHead(429); res.end('Rate limited'); }, async endpoint => {
    await assert.rejects(() => new LocalHttpTtsAdapter({ endpoint }).synthesize({ text: 'hello' }), error => error.code === 'RATE_LIMITED' && error.retryable);
  });
  await withHttp((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>not speech</html>'); }, async endpoint => {
    await assert.rejects(() => new LocalHttpTtsAdapter({ endpoint }).synthesize({ text: 'hello' }), { code: 'INVALID_AUDIO' });
  });
});

test('local body size limit prevents unbounded response buffering', async () => {
  await withHttp((_req, res) => { res.writeHead(200); res.end(sample); }, async endpoint => {
    await assert.rejects(() => new LocalHttpTtsAdapter({ endpoint, maxBytes: 1000 }).synthesize({ text: 'hello' }), { code: 'OUTPUT_TOO_LARGE' });
  });
});

test('local endpoint health without healthUrl is explicitly unverified', async () => {
  const adapter = new LocalHttpTtsAdapter({ endpoint: 'http://127.0.0.1:8000/tts' });
  assert.equal((await adapter.health()).status, 'unverified');
});

test('local adapter cancellation and timeout are distinguishable', async () => {
  await withHttp((_req, res) => { setTimeout(() => { if (!res.destroyed) res.end(sample); }, 80); }, async endpoint => {
    const fast = new LocalHttpTtsAdapter({ endpoint, timeoutMs: 20 });
    await assert.rejects(() => fast.synthesize({ text: 'text' }), { code: 'TIMEOUT' });
    const ctrl = new AbortController();
    const future = new LocalHttpTtsAdapter({ endpoint, timeoutMs: 1000 }).synthesize({ text: 'text' }, { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 15);
    await assert.rejects(() => future, { code: 'CANCELLED' });
  });
});
