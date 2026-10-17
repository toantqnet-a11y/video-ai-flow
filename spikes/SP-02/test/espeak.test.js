import test from 'node:test';
import assert from 'node:assert/strict';
import { EspeakTtsAdapter } from '../src/espeak.js';
import { TtsService } from '../src/service.js';
import { temporaryRoot } from './helpers.js';
import { readFile } from 'node:fs/promises';

const provider = new EspeakTtsAdapter();
const offlineAvailable = (await provider.health()).status === 'ready';
test('offline Vietnamese speech really synthesized, committed, and probed (eSpeak installed only)', { skip: !offlineAvailable }, async () => {
  await temporaryRoot(async dataRoot => {
    const service = new TtsService({ dataRoot, adapters: [provider] });
    const result = await service.synthesize({ projectId: 'speech', sceneId: 'demo', text: 'Xin chào. Đây là giọng đọc tiếng Việt chạy ở máy local.', voiceByProvider: { 'espeak-local': 'vi' } });
    assert.equal(result.providerId, 'espeak-local');
    assert.equal(result.format, 'wav');
    assert.ok(result.durationSec > 0.2);
    assert.ok((await readFile(result.path)).length > 10000);
  });
});
test('offline voice provider absent returns a clear dependency error', async () => {
  const missing = new EspeakTtsAdapter({ binary: 'unavailable-espeak-xyz' });
  assert.equal((await missing.health()).status, 'dependency_unavailable');
  await assert.rejects(() => missing.synthesize({ text: 'Xin chào' }), { code: 'DEPENDENCY_UNAVAILABLE' });
});
