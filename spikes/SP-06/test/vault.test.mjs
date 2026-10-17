import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, lstat, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassphraseVault } from '../src/vault.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cs06-vault-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, vault: new PassphraseVault(dir), file: path.join(dir, 'secrets.vault.json') };
}
const password = 'some_long_personal_passphrase!';

test('status uninitialized and fail closed', async t => {
  const { vault } = await fixture(t);
  assert.equal((await vault.status()).state, 'UNINITIALIZED');
  await assert.rejects(vault.put('main', 'groq', 'secret'), { code: 'VAULT_LOCKED' });
  await assert.rejects(vault.getSecret('main'), { code: 'VAULT_LOCKED' });
});

test('encryption protects raw secret, plaintext not in disk file', async t => {
  const { vault, file } = await fixture(t);
  await vault.initialize(password);
  const secret = 'sk-private-sentinel-abc123';
  const response = await vault.put('acct1', 'openrouter', secret);
  assert.deepEqual(response, { id: 'acct1', providerId: 'openrouter', stored: true });
  assert.equal((await vault.getSecret('acct1')), secret);
  const bytes = await readFile(file, 'utf8');
  assert.ok(!bytes.includes(secret));
  assert.ok(!bytes.includes(password));
  assert.ok(!JSON.stringify(await vault.list()).includes(secret));
  if (process.platform !== 'win32') assert.equal((await lstat(file)).mode & 0o777, 0o600);
});

test('lock / restart / valid unlock / wrong unlock', async t => {
  const { vault, dir } = await fixture(t);
  await vault.initialize(password);
  await vault.put('account', 'gemini', 'secret');
  vault.lock();
  assert.equal((await vault.status()).state, 'LOCKED');
  await assert.rejects(vault.getSecret('account'), { code: 'VAULT_LOCKED' });
  const restarted = new PassphraseVault(dir);
  await assert.rejects(restarted.unlock('wrong'), { code: 'VAULT_UNLOCK_FAILED' });
  assert.equal((await restarted.status()).state, 'LOCKED');
  await restarted.unlock(password);
  assert.equal(await restarted.getSecret('account'), 'secret');
  restarted.lock();
});

test('vault init rejects weak passphrase and reinitialization', async t => {
  const { vault } = await fixture(t);
  await assert.rejects(vault.initialize('password'), { code: 'INVALID_PASSPHRASE' });
  await vault.initialize(password);
  await assert.rejects(vault.initialize(password), { code: 'VAULT_ALREADY_INITIALIZED' });
});

test('authenticity: record tamper fails decryption', async t => {
  const { vault, file } = await fixture(t);
  await vault.initialize(password);
  await vault.put('key1', 'groq', 'hidden-credential');
  const doc = JSON.parse(await readFile(file));
  doc.records.key1.tag = Buffer.alloc(16).toString('base64');
  await writeFile(file, JSON.stringify(doc));
  await assert.rejects(vault.getSecret('key1'), { code: 'VAULT_DECRYPT_FAILED' });
});

test('authenticity: swapping ciphertext between refs fails AAD', async t => {
  const { vault, file } = await fixture(t);
  await vault.initialize(password);
  await vault.put('first', 'groq', 'first-secret');
  await vault.put('second', 'groq', 'second-secret');
  const doc = JSON.parse(await readFile(file));
  doc.records.first = doc.records.second;
  await writeFile(file, JSON.stringify(doc));
  await assert.rejects(vault.getSecret('first'), { code: 'VAULT_DECRYPT_FAILED' });
});

test('authenticity: verifier tamper blocks unlock', async t => {
  const { vault, file } = await fixture(t);
  await vault.initialize(password);
  const doc = JSON.parse(await readFile(file));
  doc.verifier.tag = Buffer.alloc(16).toString('base64');
  await writeFile(file, JSON.stringify(doc));
  vault.lock();
  await assert.rejects(vault.unlock(password), { code: 'VAULT_UNLOCK_FAILED' });
});

test('reference validation disallows path traversal and huge credentials', async t => {
  const { vault } = await fixture(t);
  await vault.initialize(password);
  await assert.rejects(vault.put('../escape', 'groq', 'secret'), { code: 'INVALID_REFERENCE' });
  await assert.rejects(vault.put('key', '../groq', 'secret'), { code: 'INVALID_REFERENCE' });
  await assert.rejects(vault.put('key', 'groq', 'x'.repeat(9000)), { code: 'INVALID_SECRET' });
  await assert.rejects(vault.getSecret('../key'), { code: 'INVALID_REFERENCE' });
});

test('concurrent writes retain all records (no lost updates)', async t => {
  const { vault } = await fixture(t);
  await vault.initialize(password);
  await Promise.all(Array.from({length: 18}, (_, i) => vault.put(`id${i}`, 'groq', `k-${i}`)));
  assert.equal((await vault.list()).length, 18);
  for (let i=0; i<18; i++) assert.equal(await vault.getSecret(`id${i}`), `k-${i}`);
});

test('delete removes record; list metadata never leaks secret', async t => {
  const { vault } = await fixture(t);
  await vault.initialize(password);
  await vault.put('id1', 'groq', 'key-one');
  assert.deepEqual(await vault.list(), [{ id:'id1', providerId:'groq', stored:true }]);
  await vault.remove('id1');
  await assert.rejects(vault.getSecret('id1'), { code: 'SECRET_NOT_FOUND' });
});

test('refuses preexisting symlink vault file', async t => {
  const { vault, dir, file } = await fixture(t);
  const target = path.join(dir, 'elsewhere.json');
  await writeFile(target, '{}');
  await symlink(target, file);
  await assert.rejects(vault.initialize(password), { code: 'UNSAFE_VAULT_PATH' });
});

test('kdf params tamper cannot expand KDF cost', async t => {
  const { vault, file } = await fixture(t);
  await vault.initialize(password);
  const doc = JSON.parse(await readFile(file));
  doc.kdf.N = 1 << 20;
  await writeFile(file, JSON.stringify(doc)); vault.lock();
  await assert.rejects(vault.unlock(password), { code: 'INVALID_VAULT_FORMAT' });
});

test('not a relative storage directory', async () => {
  assert.throws(() => new PassphraseVault('relative/path'), { code: 'ABSOLUTE_DIRECTORY_REQUIRED' });
});
