import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageService, authorize } from '../src/service.js';
import { makePng, withDir } from './helpers.js';
const input = { projectId: 'channel_A', sceneId: 'scene_01', prompt: 'An illustrated green hill', seed: 123 };
const fake = (id = 'comfyui', overrides = {}) => ({ id, location: 'local', costTier: 'local', generate: async () => ({ bytes: makePng(), provenance: { provider: id } }), ...overrides });

test('real manual image import persists verified PNG and privacy-safe provenance', async () => withDir(async folder => {
  const source = join(folder, 'photo.png'); await writeFile(source, makePng());
  const service = new ImageService({ dataRoot: join(folder, 'data') });
  const asset = await service.importImage({ projectId: input.projectId, sceneId: input.sceneId, filePath: source });
  assert.equal(asset.providerId, 'manual_import');
  assert.ok(asset.relativePath.includes('images/'));
  assert.deepEqual(await readFile(join(folder, 'data', asset.relativePath)), makePng());
  const meta = JSON.parse(await readFile(join(folder, 'data', asset.metadataPath), 'utf8'));
  assert.equal(meta.provenance.origin, 'local_user_file');
  assert.ok(!JSON.stringify(meta).includes(source));
}));
test('generated asset creates immutable versions, does not leak prompt into metadata/log', async () => withDir(async folder => {
  const logs = [];
  const service = new ImageService({ dataRoot: join(folder, 'data'), adapters: [fake()], logger: record => logs.push(record) });
  const one = await service.generate({ ...input, prompt: 'PERSONAL PROMPT 9981' });
  const two = await service.generate({ ...input, prompt: 'PERSONAL PROMPT 9981' });
  assert.notEqual(one.assetId, two.assetId);
  assert.equal(one.sha256, two.sha256);
  const metadata = await readFile(join(folder, 'data', one.metadataPath), 'utf8');
  assert.ok(!metadata.includes('PERSONAL PROMPT'));
  assert.ok(!JSON.stringify(logs).includes('PERSONAL PROMPT'));
}));
test('retryable local failure falls back only to explicitly selected second provider', async () => withDir(async folder => {
  let secondCalled = false;
  const service = new ImageService({ dataRoot: folder, adapters: [fake('a', { generate: async () => { throw Object.assign(new Error('fail'), { code: 'no' }); } }), fake('b', { generate: async () => { secondCalled = true; return { bytes: makePng() }; } })] });
  const result = await service.generate(input, { providerIds: ['a', 'b'] });
  assert.equal(result.attempts.length, 2);
  assert.ok(secondCalled);
}));
test('malformed image is terminal: does not fallback invisibly', async () => withDir(async folder => {
  let count = 0;
  const service = new ImageService({ dataRoot: folder, adapters: [fake('invalid', { generate: async () => ({ bytes: Buffer.from('not an image') }) }), fake('second', { generate: async () => { count++; return { bytes: makePng() }; } })] });
  await assert.rejects(service.generate(input, { providerIds: ['invalid', 'second'] }), { code: 'INVALID_IMAGE' });
  assert.equal(count, 0);
}));
test('remote providers are never chosen implicitly', async () => withDir(async folder => {
  let remoteCalls = 0;
  const service = new ImageService({ dataRoot: folder, adapters: [fake('remote', { location: 'remote', costTier: 'metered', generate: async () => { remoteCalls++; return { bytes: makePng() }; } })] });
  await assert.rejects(service.generate(input), { code: 'INVALID_CONFIG' });
  assert.equal(remoteCalls, 0);
}));
test('remote consent and paid approval both required', () => {
  const remote = fake('remote', { location: 'remote', costTier: 'metered' });
  assert.throws(() => authorize(remote), { code: 'REMOTE_CONSENT_REQUIRED' });
  assert.throws(() => authorize(remote, { remoteConsent: true }), { code: 'COST_APPROVAL_REQUIRED' });
  assert.throws(() => authorize(remote, { remoteConsent: true, paidApproval: { providerId: 'remote', confirmed: true, estimatedUsd: 2, maxUsd: 1 } }), { code: 'COST_APPROVAL_REQUIRED' });
  assert.doesNotThrow(() => authorize(remote, { remoteConsent: true, paidApproval: { providerId: 'remote', confirmed: true, estimatedUsd: 0.25, maxUsd: 1 } }));
});
test('remote cannot be reached when consent denied even if provider explicitly selected', async () => withDir(async folder => {
  let called = false;
  const remote = fake('remote', { location: 'remote', costTier: 'metered', generate: async () => { called = true; return { bytes: makePng() }; } });
  const s = new ImageService({ dataRoot: folder, adapters: [remote] });
  await assert.rejects(s.generate(input, { providerIds: ['remote'] }), { code: 'REMOTE_CONSENT_REQUIRED' });
  assert.equal(called, false);
}));
test('cancelled prior to generation creates no asset', async () => withDir(async folder => {
  const service = new ImageService({ dataRoot: folder, adapters: [fake()] });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(service.generate(input, { signal: controller.signal }), { code: 'CANCELLED' });
}));
test('decoder failure rolls back partial and final files', async () => withDir(async folder => {
  const service = new ImageService({ dataRoot: folder, adapters: [fake()], verify: async () => { throw new Error('damaged'); } });
  await assert.rejects(service.generate(input), { code: 'IMAGE_PROBE_FAILED' });
  const names = await readdir(join(folder, 'projects/channel_A/scenes/scene_01/images'));
  assert.deepEqual(names, []);
}));
test('reject image output escape through symlinked scene directory', async () => withDir(async folder => {
  const realRoot = join(folder, 'data');
  await mkdir(join(realRoot, 'projects', 'channel_A', 'scenes'), { recursive: true });
  const outside = join(folder, 'outside'); await mkdir(outside);
  await symlink(outside, join(realRoot, 'projects', 'channel_A', 'scenes', 'scene_01'));
  const service = new ImageService({ dataRoot: realRoot, adapters: [fake()] });
  await assert.rejects(service.generate(input), { code: 'INVALID_CONFIG' });
}));
test('allow explicitly authorized remote provider using cost budget', async () => withDir(async folder => {
  const remote = fake('cloudflare', { location: 'remote', costTier: 'metered' });
  const service = new ImageService({ dataRoot: folder, adapters: [remote] });
  const result = await service.generate(input, { providerIds: ['cloudflare'], remoteConsent: true, paidApproval: { providerId: 'cloudflare', confirmed: true, estimatedUsd: 0.10, maxUsd: 0.20 } });
  assert.equal(result.providerId, 'cloudflare');
}));
