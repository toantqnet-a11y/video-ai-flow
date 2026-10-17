import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { TtsService } from '../src/service.js';
import { probeAudio } from '../src/audio.js';
import { TtsError } from '../src/errors.js';
import { stubAdapter, temporaryRoot, wavBytes } from './helpers.js';

const wav = await wavBytes();
const request = { projectId: 'project_1', sceneId: 'scene-01', text: 'Tiếng Việt', voice: 'vi-VN-HoaiMyNeural' };
test('commits real valid WAV bytes atomically; ffprobe gives duration; repeated requests create versions', async () => {
  await temporaryRoot(async dataRoot => {
    const provider = stubAdapter('fake-local', { bytes: wav });
    const service = new TtsService({ dataRoot, adapters: [provider] });
    const a = await service.synthesize(request);
    const b = await service.synthesize(request);
    assert.notEqual(a.assetId, b.assetId);
    assert.match(a.path, /scene-01[/\\]audio[/\\].+\.wav$/);
    assert.equal(a.format, 'wav');
    assert.ok(a.durationSec > 0.4 && a.durationSec < 0.6);
    assert.deepEqual(await readFile(a.path), wav);
    assert.deepEqual(await readFile(b.path), wav);
    assert.deepEqual((await probeAudio(a.path)).codec, 'pcm_s16le');
    assert.equal((await readdir(join(dataRoot, request.projectId, 'scenes', request.sceneId, 'audio'))).filter(name => name.endsWith('.partial')).length, 0);
  });
});

test('retryable Edge failure falls back to configured local adapter, with voice remapping', async () => {
  await temporaryRoot(async dataRoot => {
    const failures = [], local = stubAdapter('local-http', { bytes: wav, voice: 'vieneu' });
    const service = new TtsService({ dataRoot, adapters: [stubAdapter('edge', { error: new TtsError('DEPENDENCY_UNAVAILABLE', 'missing', { retryable: true }) }), local], logger: event => failures.push(event) });
    const result = await service.synthesize({ ...request, voiceByProvider: { 'local-http': 'vieneu' } });
    assert.equal(result.providerId, 'local-http');
    assert.equal(result.voice, 'vieneu');
    assert.deepEqual(result.attempts.map(x => x.status), ['failed', 'succeeded']);
    assert.ok(failures.every(event => !JSON.stringify(event).includes(request.text)));
  });
});

test('non-retryable invalid input does not fall back silently', async () => {
  await temporaryRoot(async dataRoot => {
    let fallbackCalled = false;
    const service = new TtsService({ dataRoot, adapters: [stubAdapter('edge', { error: new TtsError('INVALID_INPUT', 'bad') }), { ...stubAdapter('local', { bytes: wav }), synthesize() { fallbackCalled = true; } }] });
    await assert.rejects(() => service.synthesize(request), { code: 'INVALID_INPUT' });
    assert.equal(fallbackCalled, false);
  });
});

test('rejects path traversal, invalid script and unknown provider before creating files', async () => {
  await temporaryRoot(async dataRoot => {
    const service = new TtsService({ dataRoot, adapters: [stubAdapter('local', { bytes: wav })] });
    await assert.rejects(() => service.synthesize({ ...request, projectId: '../escape' }), { code: 'INVALID_INPUT' });
    await assert.rejects(() => service.synthesize({ ...request, text: ' ' }), { code: 'INVALID_INPUT' });
    await assert.rejects(() => service.synthesize(request, { providerIds: ['missing'] }), { code: 'INVALID_CONFIG' });
    await assert.rejects(() => service.synthesize({ ...request, rate: 999 }), { code: 'INVALID_INPUT' });
  });
});

test('no paid provider used without explicit approval', async () => {
  await temporaryRoot(async dataRoot => {
    const provider = stubAdapter('cloud-paid', { bytes: wav, costTier: 'paid' });
    const service = new TtsService({ dataRoot, adapters: [provider] });
    await assert.rejects(() => service.synthesize(request), { code: 'PAID_NOT_APPROVED' });
  });
});

test('bad audio or failed verification leaves no partial asset', async () => {
  await temporaryRoot(async dataRoot => {
    const bad = { ...stubAdapter('broken', { bytes: wav }), synthesize: async () => ({ bytes: Buffer.from('<html>oops</html>'), format: 'wav' }) };
    await assert.rejects(() => new TtsService({ dataRoot, adapters: [bad] }).synthesize(request), { code: 'ALL_PROVIDERS_FAILED' });
    const brokenProbe = new TtsService({ dataRoot, adapters: [stubAdapter('good', { bytes: wav })], probe: async () => { throw new TtsError('INVALID_AUDIO', 'probe failure', { retryable: true }); } });
    await assert.rejects(() => brokenProbe.synthesize(request), { code: 'ALL_PROVIDERS_FAILED' });
    const path = join(dataRoot, request.projectId, 'scenes', request.sceneId, 'audio');
    assert.deepEqual(await readdir(path), []);
  });
});

test('cancelled request never falls back', async () => {
  await temporaryRoot(async dataRoot => {
    const ctrl = new AbortController(); ctrl.abort();
    await assert.rejects(() => new TtsService({ dataRoot, adapters: [stubAdapter('local', { bytes: wav })] }).synthesize(request, { signal: ctrl.signal }), { code: 'CANCELLED' });
  });
});

test('symlinked scene folder cannot escape local data directory', async () => {
  await temporaryRoot(async dataRoot => await temporaryRoot(async foreignRoot => {
    await mkdir(join(dataRoot, request.projectId), { recursive: true });
    await symlink(foreignRoot, join(dataRoot, request.projectId, 'scenes'));
    const service = new TtsService({ dataRoot, adapters: [stubAdapter('local', { bytes: wav })] });
    await assert.rejects(() => service.synthesize(request), { code: 'INVALID_CONFIG' });
  }));
});

test('remote HTTP TTS cannot bypass paid approval via allowRemote configuration', async () => {
  await temporaryRoot(async dataRoot => {
    const provider = { ...stubAdapter('remote-http', { bytes: wav }), costTier: 'remote_unapproved' };
    await assert.rejects(() => new TtsService({ dataRoot, adapters: [provider] }).synthesize(request), { code: 'PAID_NOT_APPROVED' });
  });
});
