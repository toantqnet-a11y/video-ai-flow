import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EdgeTtsAdapter, EDGE_VOICES } from '../src/edge.js';
import { mp3Bytes } from './helpers.js';

const mp3 = await mp3Bytes();
test('Vietnamese Edge voice catalog is explicit and metadata has free-tier disclaimer', () => {
  const adapter = new EdgeTtsAdapter();
  assert.deepEqual(EDGE_VOICES.map(x => x.id), ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural']);
  assert.equal(adapter.costTier, 'unverified_free');
});

test('missing Python interpreter produces dependency error instead of silent success', async () => {
  const adapter = new EdgeTtsAdapter({ python: 'this-binary-does-not-exist' });
  assert.equal((await adapter.health()).status, 'dependency_unavailable');
  await assert.rejects(() => adapter.synthesize({ text: 'Xin chào' }), { code: 'DEPENDENCY_UNAVAILABLE' });
});

test('Edge Python subprocess sends private script via stdin and validates saved MP3 (mock bridge)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mock-edge-'));
  try {
    const fakeScript = join(root, 'bridge.py');
    const fakeMP3 = join(root, 'synthetic.mp3');
    await writeFile(fakeMP3, mp3);
    await writeFile(fakeScript, `import sys, json, shutil\nif '--check' in sys.argv: sys.exit(0)\npayload = json.load(sys.stdin)\nassert payload['text'] == 'Đây là lời thoại riêng'\nassert payload['voice'] == 'vi-VN-NamMinhNeural'\nshutil.copyfile(${JSON.stringify(fakeMP3)}, payload['outputPath'])\n`);
    const adapter = new EdgeTtsAdapter({ bridgePath: fakeScript, python: 'python3' });
    assert.equal((await adapter.health()).status, 'dependency_ready_network_unchecked');
    const result = await adapter.synthesize({ text: 'Đây là lời thoại riêng', voice: 'vi-VN-NamMinhNeural' });
    assert.equal(result.format, 'mp3');
    assert.deepEqual(result.bytes, mp3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid Edge voice is rejected before sending private data', async () => {
  await assert.rejects(() => new EdgeTtsAdapter().synthesize({ text: 'Hi', voice: 'bad-voice' }), { code: 'INVALID_INPUT' });
});
