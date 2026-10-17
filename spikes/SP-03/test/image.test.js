import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makePng, withDir } from './helpers.js';
import { detectImage, verifyImage, validateImageBytes } from '../src/image.js';
import { ensureLoopbackHttp, validateImageRequest, validateImportRequest } from '../src/validation.js';

test('generated PNG is genuine and ffprobe verifies dimensions', async () => withDir(async folder => {
  const png = makePng(32, 20);
  assert.deepEqual(detectImage(png), { format: 'png', width: 32, height: 20 });
  const path = join(folder, 'real.png'); await writeFile(path, png);
  assert.deepEqual(await verifyImage(path), { codec: 'png', width: 32, height: 20 });
}));
test('non-image provider JSON and empty content are rejected', () => {
  for (const value of [Buffer.from('{"error":"out of quota"}'), Buffer.alloc(0)]) assert.throws(() => validateImageBytes(value), { code: 'INVALID_IMAGE' });
});
test('PNG huge/zero dimensions rejected', () => {
  const raw = makePng(); raw.writeUInt32BE(20000, 16);
  assert.throws(() => validateImageBytes(raw), { code: 'INVALID_IMAGE' });
  const zero = makePng(); zero.writeUInt32BE(0, 16);
  assert.throws(() => validateImageBytes(zero), { code: 'INVALID_IMAGE' });
});
test('reject oversize image buffer', () => assert.throws(() => validateImageBytes(Buffer.alloc(25 * 1024 * 1024 + 1)), { code: 'INVALID_IMAGE' }));
test('reject scene path traversal', () => {
  assert.throws(() => validateImageRequest({ projectId: '../escape', sceneId: 'valid', prompt: 'hey' }), { code: 'INVALID_REQUEST' });
  assert.throws(() => validateImportRequest({ projectId: 'a', sceneId: '..', filePath: '/tmp/a.png' }), { code: 'INVALID_REQUEST' });
});
test('empty prompt and unreasonable dimensions rejected', () => {
  assert.throws(() => validateImageRequest({ projectId: 'p', sceneId: 's', prompt: '' }), { code: 'INVALID_REQUEST' });
  assert.throws(() => validateImageRequest({ projectId: 'p', sceneId: 's', prompt: 'A', width: 999999 }), { code: 'INVALID_REQUEST' });
});
test('loopback endpoint blocks credentialed, remote and alternate path URLs', () => {
  assert.equal(ensureLoopbackHttp('http://127.0.0.1:8188'), 'http://127.0.0.1:8188');
  assert.equal(ensureLoopbackHttp('http://localhost:8188'), 'http://127.0.0.1:8188');
  for (const url of ['http://172.16.1.1:8188', 'https://127.0.0.1:8188', 'http://user:secret@localhost:8188', 'http://localhost:8188/evil', 'http://localhost:8188?u=1']) {
    assert.throws(() => ensureLoopbackHttp(url), { code: 'INVALID_CONFIG' });
  }
});
test('corrupted PNG pixel payload is rejected by full decoder', async () => withDir(async folder => {
  const png = makePng(32, 20);
  png[41] = 0x00; // Corrupt IDAT zlib header; PNG IHDR still looks valid.
  const path = join(folder, 'corrupt.png'); await writeFile(path, png);
  await assert.rejects(verifyImage(path), { code: 'INVALID_IMAGE' });
}));
