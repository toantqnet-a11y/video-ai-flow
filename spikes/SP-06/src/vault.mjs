/**
 * ContentStudio local credential vault (SP-06 security spike).
 *
 * Encrypts API keys at rest using scrypt + AES-256-GCM. An authenticated vault
 * verifier rejects incorrect passphrases even for an empty vault. This module
 * NEVER exposes plaintext secrets in list/status methods or HTTP responses.
 *
 * Production on Windows should prefer DPAPI/OS Credential Manager once tested.
 * This passphrase fallback fails closed: no passphrase means no access to keys.
 */
import { randomBytes, scrypt as scryptCallback, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const scrypt = promisify(scryptCallback);
const MAGIC = 'contentstudio-vault';
const CHECK = 'CONTENTSTUDIO_VAULT_CHECK_2026_V1';
const KDF = { N: 16384, r: 8, p: 1, keylen: 32 };
const REF_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const PROVIDER_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_SECRET = 8192;

export class VaultError extends Error {
  constructor(code) { super(code); this.name = 'VaultError'; this.code = code; }
}

function assertRef(value, re = REF_RE) {
  if (typeof value !== 'string' || !re.test(value)) throw new VaultError('INVALID_REFERENCE');
}
function safePassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || Buffer.byteLength(passphrase) > 4096)
    throw new VaultError('INVALID_PASSPHRASE');
}
function encrypt(key, plaintext, aad) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  return { nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
function decrypt(key, sealed, aad) {
  try {
    const nonce = Buffer.from(sealed.nonce, 'base64');
    const tag = Buffer.from(sealed.tag, 'base64');
    const ciphertext = Buffer.from(sealed.ciphertext, 'base64');
    if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length > MAX_SECRET + 128)
      throw new Error('BAD_CIPHERTEXT');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Uniform errors hide whether a secret exists or ciphertext was tampered with.
    throw new VaultError('VAULT_DECRYPT_FAILED');
  }
}

/** Atomic write + restrictive file mode; never create plaintext temp files. */
async function atomicWrite(filename, value) {
  const tmp = `${filename}.${randomBytes(8).toString('hex')}.tmp`;
  const handle = await fs.open(tmp, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(value), { encoding: 'utf8' });
    await handle.sync();
  } finally { await handle.close(); }
  try {
    await fs.rename(tmp, filename);
    if (process.platform !== 'win32') await fs.chmod(filename, 0o600);
    // A durable rename still depends on filesystem durability; syncing a
    // directory is unsupported by some Windows filesystems.
    if (process.platform !== 'win32') {
      try { const dir = await fs.open(path.dirname(filename), 'r'); try { await dir.sync(); } finally { await dir.close(); } } catch { /* best effort */ }
    }
  } catch (error) { await fs.rm(tmp, { force: true }); throw error; }
}

export class PassphraseVault {
  #filename;
  #key = null;
  #mutation = Promise.resolve();

  constructor(storageDir) {
    if (!path.isAbsolute(storageDir)) throw new VaultError('ABSOLUTE_DIRECTORY_REQUIRED');
    this.directory = path.resolve(storageDir);
    this.#filename = path.join(this.directory, 'secrets.vault.json');
  }
  get unlocked() { return !!this.#key; }

  /** Restrict storage paths; reject symlink substitution at known entry points. */
  async #checkPaths(create = false) {
    if (create) await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const dirStat = await fs.lstat(this.directory).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (!dirStat) return;
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) throw new VaultError('UNSAFE_VAULT_PATH');
    if (process.platform !== 'win32') await fs.chmod(this.directory, 0o700);
    const stat = await fs.lstat(this.#filename).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new VaultError('UNSAFE_VAULT_PATH');
    if (stat && stat.size > MAX_FILE) throw new VaultError('VAULT_FILE_TOO_LARGE');
  }

  async #read() {
    await this.#checkPaths();
    const bytes = await fs.readFile(this.#filename).catch(e => { if (e.code === 'ENOENT') throw new VaultError('VAULT_NOT_INITIALIZED'); throw e; });
    if (bytes.length > MAX_FILE) throw new VaultError('VAULT_FILE_TOO_LARGE');
    let doc;
    try { doc = JSON.parse(bytes.toString('utf8')); } catch { throw new VaultError('INVALID_VAULT_FORMAT'); }
    if (doc?.type !== MAGIC || doc.version !== 1 || !doc.salt || !doc.verifier || !doc.records || typeof doc.records !== 'object' || Array.isArray(doc.records))
      throw new VaultError('INVALID_VAULT_FORMAT');
    return doc;
  }

  /** Serialize all updates to avoid a lost secret on concurrent requests. */
  #exclusive(action) {
    const next = this.#mutation.then(action);
    this.#mutation = next.catch(() => {});
    return next;
  }

  async status() {
    try {
      const doc = await this.#read();
      return { mode: 'passphrase', state: this.unlocked ? 'UNLOCKED' : 'LOCKED', count: Object.keys(doc.records).length };
    } catch (error) {
      if (error.code === 'VAULT_NOT_INITIALIZED') return { mode: 'passphrase', state: 'UNINITIALIZED', count: 0 };
      throw error;
    }
  }

  async initialize(passphrase) {
    safePassphrase(passphrase);
    return this.#exclusive(async () => {
      await this.#checkPaths(true);
      const exists = await fs.stat(this.#filename).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
      if (exists) throw new VaultError('VAULT_ALREADY_INITIALIZED');
      const salt = randomBytes(32);
      const key = await scrypt(passphrase, salt, KDF.keylen, { N: KDF.N, r: KDF.r, p: KDF.p });
      const doc = { type: MAGIC, version: 1, kdf: { name: 'scrypt', N: KDF.N, r: KDF.r, p: KDF.p }, salt: salt.toString('base64'), verifier: encrypt(key, CHECK, 'vault:verifier:v1'), records: {} };
      await atomicWrite(this.#filename, doc);
      this.lock();
      this.#key = key;
      return { mode: 'passphrase', state: 'UNLOCKED' };
    });
  }

  async unlock(passphrase) {
    return this.#exclusive(async () => {
      const doc = await this.#read();
      if (typeof passphrase !== 'string' || !passphrase) throw new VaultError('VAULT_UNLOCK_FAILED');
      // Reject malicious KDF parameters in a modified vault file. Derivation
      // cost is fixed in code for the spike to avoid local DoS via config.
      if (doc.kdf?.name !== 'scrypt' || doc.kdf?.N !== KDF.N || doc.kdf?.r !== KDF.r || doc.kdf?.p !== KDF.p)
        throw new VaultError('INVALID_VAULT_FORMAT');
      const salt = Buffer.from(doc.salt, 'base64');
      if (salt.length !== 32) throw new VaultError('INVALID_VAULT_FORMAT');
      const key = await scrypt(passphrase, salt, KDF.keylen, { N: KDF.N, r: KDF.r, p: KDF.p });
      try {
        if (decrypt(key, doc.verifier, 'vault:verifier:v1') !== CHECK) throw new Error('BAD_CHECK');
      } catch {
        key.fill(0);
        throw new VaultError('VAULT_UNLOCK_FAILED');
      }
      this.lock();
      this.#key = key;
      return { mode: 'passphrase', state: 'UNLOCKED' };
    });
  }

  lock() { if (this.#key) this.#key.fill(0); this.#key = null; }
  #requireUnlocked() { if (!this.#key) throw new VaultError('VAULT_LOCKED'); }

  async list() {
    const doc = await this.#read();
    return Object.entries(doc.records).map(([id, record]) => ({ id, providerId: record.providerId, stored: true }));
  }

  async put(id, providerId, secret) {
    assertRef(id); assertRef(providerId, PROVIDER_RE);
    if (typeof secret !== 'string' || secret.length < 1 || Buffer.byteLength(secret) > MAX_SECRET)
      throw new VaultError('INVALID_SECRET');
    return this.#exclusive(async () => {
      this.#requireUnlocked();
      const doc = await this.#read();
      const sealed = encrypt(this.#key, secret, `credential:${id}:${providerId}:v1`);
      doc.records[id] = { providerId, ...sealed };
      await atomicWrite(this.#filename, doc);
      return { id, providerId, stored: true };
    });
  }

  /** Only trusted server-side provider adapters may call this method. */
  async getSecret(id) {
    assertRef(id); this.#requireUnlocked();
    const doc = await this.#read();
    const row = doc.records[id];
    if (!row) throw new VaultError('SECRET_NOT_FOUND');
    return decrypt(this.#key, row, `credential:${id}:${row.providerId}:v1`);
  }

  async remove(id) {
    assertRef(id);
    return this.#exclusive(async () => {
      this.#requireUnlocked();
      const doc = await this.#read();
      if (!(id in doc.records)) throw new VaultError('SECRET_NOT_FOUND');
      delete doc.records[id];
      await atomicWrite(this.#filename, doc);
      return { deleted: true };
    });
  }
}
