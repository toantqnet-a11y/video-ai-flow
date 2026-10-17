import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { ComfyUiImageAdapter, readLimited } from '../src/comfy.js';
import { CloudflareImageAdapter } from '../src/cloudflare.js';
import { makePng } from './helpers.js';

const workflow = { '6': { class_type: 'CLIPTextEncode', inputs: { text: 'placeholder' } }, '3': { class_type: 'KSampler', inputs: { seed: 0 } }, '9': { class_type: 'SaveImage', inputs: { images: ['8', 0] } } };
const bindings = { prompt: { nodeId: '6', input: 'text' }, seed: { nodeId: '3', input: 'seed' } };

async function fakeComfy(handler, fn) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  try { await fn(endpoint); } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}

test('ComfyUI integration: POST API workflow, poll history, download genuine image', async () => {
  const promptId = randomUUID();
  let patched;
  let polls = 0;
  const png = makePng(20, 12);
  await fakeComfy(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/system_stats') return res.end(JSON.stringify({ devices: [{ type: 'cuda', name: 'Test GPU', vram_total: 123 }] }));
    if (req.url === '/prompt' && req.method === 'POST') {
      let body = ''; for await (const part of req) body += part;
      patched = JSON.parse(body).prompt;
      return res.end(JSON.stringify({ prompt_id: promptId }));
    }
    if (req.url === `/history/${promptId}`) {
      polls++;
      return res.end(polls < 2 ? '{}' : JSON.stringify({ [promptId]: { status: { status_str: 'success' }, outputs: { '9': { images: [{ filename: 'Comfy_01.png', subfolder: '', type: 'output' }] } } } }));
    }
    if (req.url.startsWith('/view?')) { res.setHeader('Content-Type', 'image/png'); return res.end(png); }
    res.statusCode = 404; res.end('{}');
  }, async endpoint => {
    const comfy = new ComfyUiImageAdapter({ endpoint, workflow, bindings, pollMs: 2, timeoutMs: 3000 });
    const stats = await comfy.diagnose();
    assert.equal(stats.reachable, true);
    const result = await comfy.generate({ prompt: 'Vietnam landscape', style: 'clean painting', seed: 24 });
    assert.deepEqual(result.bytes, png);
    assert.equal(patched['6'].inputs.text, 'Vietnam landscape, clean painting');
    assert.equal(patched['3'].inputs.seed, 24);
    assert.equal(workflow['6'].inputs.text, 'placeholder', 'must not mutate original workflow');
    assert.equal(result.provenance.promptId, promptId);
  });
});
test('ComfyUI rejects broken workflow input bindings', async () => {
  const comfy = new ComfyUiImageAdapter({ workflow, bindings: { prompt: { nodeId: '100', input: 'text' } } });
  await assert.rejects(comfy.generate({ prompt: 'test' }), { code: 'INVALID_CONFIG' });
});
test('ComfyUI rejects unsafe image filename returned by provider', async () => {
  const promptId = randomUUID();
  await fakeComfy(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/prompt') return res.end(JSON.stringify({ prompt_id: promptId }));
    if (req.url === `/history/${promptId}`) return res.end(JSON.stringify({ [promptId]: { status: { status_str: 'success' }, outputs: { save: { images: [{ filename: '../../steal.png' }] } } } }));
    res.statusCode = 404; res.end('{}');
  }, async endpoint => {
    const comfy = new ComfyUiImageAdapter({ endpoint, workflow, bindings, pollMs: 2, timeoutMs: 1000 });
    await assert.rejects(comfy.generate({ prompt: 'A' }), { code: 'INVALID_RESPONSE' });
  });
});
test('ComfyUI reports execution failure without attempting download', async () => {
  const promptId = randomUUID();
  await fakeComfy((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/prompt') return res.end(JSON.stringify({ prompt_id: promptId }));
    if (req.url === `/history/${promptId}`) return res.end(JSON.stringify({ [promptId]: { status: { status_str: 'error' }, outputs: {} } }));
    res.statusCode = 404; res.end('{}');
  }, async endpoint => {
    const comfy = new ComfyUiImageAdapter({ endpoint, workflow, bindings, pollMs: 1, timeoutMs: 1000 });
    await assert.rejects(comfy.generate({ prompt: 'A' }), { code: 'GENERATION_FAILED' });
  });
});
test('ComfyUI timeout is bounded if history is never ready', async () => {
  const promptId = randomUUID();
  await fakeComfy((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/prompt') return res.end(JSON.stringify({ prompt_id: promptId }));
    if (req.url.startsWith('/history')) return res.end('{}');
    res.statusCode = 404; res.end('{}');
  }, async endpoint => {
    const comfy = new ComfyUiImageAdapter({ endpoint, workflow, bindings, pollMs: 5, timeoutMs: 40 });
    await assert.rejects(comfy.generate({ prompt: 'A' }), { code: 'PROVIDER_TIMEOUT' });
  });
});
test('ComfyUI cancelled during polling stops without presenting a result', async () => {
  const promptId = randomUUID();
  await fakeComfy((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/prompt') return res.end(JSON.stringify({ prompt_id: promptId }));
    if (req.url.startsWith('/history')) return res.end('{}');
    res.statusCode = 404; res.end('{}');
  }, async endpoint => {
    const comfy = new ComfyUiImageAdapter({ endpoint, workflow, bindings, pollMs: 100, timeoutMs: 1000 });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(comfy.generate({ prompt: 'A' }, { signal: controller.signal }), { code: 'CANCELLED' });
  });
});
test('readLimited rejects streaming body exceeding max size', async () => {
  const response = new Response(Buffer.alloc(100));
  await assert.rejects(readLimited(response, 10), { code: 'OUTPUT_TOO_LARGE' });
});
test('Cloudflare adapter parses official JSON base64 image result with stub transport', async () => {
  const png = makePng();
  const calls = [];
  const adapter = new CloudflareImageAdapter({ accountId: 'account000001', token: 'test-token', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ success: true, result: { image: png.toString('base64') } }), { headers: { 'Content-Type': 'application/json' } });
  } });
  const result = await adapter.generate({ prompt: 'An illustration', seed: 1 });
  assert.deepEqual(result.bytes, png);
  assert.equal(JSON.parse(calls[0].options.body).seed, 1);
  assert.ok(calls[0].url.startsWith('https://api.cloudflare.com/'));
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
});
test('Cloudflare malformed image response is rejected', async () => {
  const adapter = new CloudflareImageAdapter({ accountId: 'account000001', token: 'private', fetchImpl: async () => new Response(JSON.stringify({ result: {} })) });
  await assert.rejects(adapter.generate({ prompt: 'A' }), { code: 'INVALID_RESPONSE' });
});
test('Cloudflare does not call HTTP without credentials', async () => {
  let called = 0;
  const adapter = new CloudflareImageAdapter({ accountId: 'account000001', tokenEnv: 'VERY_UNLIKELY_FAKE_TOKEN_401', fetchImpl: async () => { called++; return new Response(); } });
  await assert.rejects(adapter.generate({ prompt: 'A' }), { code: 'MISSING_CREDENTIALS' });
  assert.equal(called, 0);
});
