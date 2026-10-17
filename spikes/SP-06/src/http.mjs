/**
 * Local-only HTTP security boundary for ContentStudio Fastify migration.
 *
 * Loopback binding alone is NOT sufficient: browser pages on other origins
 * can issue requests to localhost and DNS rebinding can spoof Host. Every
 * API route therefore requires a one-session bearer token; mutations also
 * require a separate CSRF token and same-origin validation. No CORS headers.
 *
 * These session tokens are passed out-of-band to the future desktop launcher,
 * not exposed by unauthenticated bootstrap pages or persistent files.
 */
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { VaultError } from './vault.mjs';

const READ_METHODS = new Set(['GET', 'HEAD']);
function equalToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function json(res, code, body) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
  });
  res.end(JSON.stringify(body));
}
async function readJson(req, limitBytes) {
  const mime = String(req.headers['content-type'] || '').toLowerCase();
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/.test(mime)) throw new HttpError(415, 'JSON_REQUIRED');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'INVALID_JSON'); }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new HttpError(400, 'INVALID_JSON');
  return body;
}
class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
function vaultError(error) {
  if (!(error instanceof VaultError)) return new HttpError(500, 'INTERNAL_ERROR');
  if (['INVALID_REFERENCE', 'INVALID_SECRET', 'INVALID_PASSPHRASE'].includes(error.code)) return new HttpError(400, error.code);
  if (error.code === 'VAULT_LOCKED') return new HttpError(423, error.code);
  if (error.code === 'VAULT_UNLOCK_FAILED') return new HttpError(401, 'VAULT_UNLOCK_FAILED');
  if (error.code === 'SECRET_NOT_FOUND') return new HttpError(404, error.code);
  if (['VAULT_NOT_INITIALIZED', 'VAULT_ALREADY_INITIALIZED'].includes(error.code)) return new HttpError(409, error.code);
  return new HttpError(500, 'VAULT_ERROR');
}
function headerCount(req, key) {
  let n = 0;
  for (let i = 0; i < req.rawHeaders.length; i += 2) if (req.rawHeaders[i].toLowerCase() === key) n++;
  return n;
}
function validLoopbackPeer(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/**
 * Starts a constrained HTTP server. Return tokens to a trusted process/UI
 * bootstrap channel; never write tokens into URLs, persistent logs or HTML.
 * `audit` receives event names and safe codes ONLY, never raw user input.
 */
export async function startSecureLocalServer({ vault, audit = () => {}, maxBodyBytes = 20_000 } = {}) {
  if (!vault) throw new Error('VAULT_REQUIRED');
  const bearerToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const failedUnlocks = new Map();
  let canonicalOrigin;

  const server = createServer(async (req, res) => {
    const reject = (code, status = 403) => { audit({ event: 'security.denied', code }); return json(res, status, { error: code }); };
    try {
      if (!validLoopbackPeer(req.socket.remoteAddress)) return reject('PEER_NOT_LOCAL');
      // Must validate the exact Host and port, not just parsed URL hostname.
      // Reject duplicates to avoid disagreement between proxies/parsers.
      if (headerCount(req, 'host') !== 1 || req.headers.host !== canonicalOrigin.slice(7)) return reject('BAD_HOST');
      if (req.headers['x-forwarded-host'] || req.headers['x-forwarded-for'] || req.headers.forwarded)
        return reject('PROXY_HEADERS_NOT_ALLOWED');
      if (headerCount(req, 'origin') > 1) return reject('CROSS_ORIGIN');
      const rawOrigin = req.headers.origin;
      if (typeof rawOrigin === 'string' && rawOrigin !== canonicalOrigin) return reject('CROSS_ORIGIN');
      if (Array.isArray(rawOrigin)) return reject('CROSS_ORIGIN');
      const url = new URL(req.url, canonicalOrigin);
      if (!url.pathname.startsWith('/api/')) {
        if (req.method === 'GET' && url.pathname === '/health' && !url.search)
          return json(res, 200, { status: 'ok' });
        return reject('NOT_FOUND', 404);
      }
      if (req.method === 'OPTIONS') return reject('CORS_DISABLED');
      if (!equalToken(req.headers.authorization, `Bearer ${bearerToken}`)) return reject('AUTH_REQUIRED', 401);
      if (!READ_METHODS.has(req.method) && !equalToken(req.headers['x-contentstudio-csrf'], csrfToken))
        return reject('CSRF_REQUIRED');
      // Avoid ambiguous routing, query tokens, and unexpected slash-encodings.
      if (url.search || url.pathname.includes('%') || req.url.startsWith('//')) return reject('INVALID_ROUTE', 400);

      if (req.method === 'GET' && url.pathname === '/api/security/status') return json(res, 200, await vault.status());
      if (req.method === 'GET' && url.pathname === '/api/security/credentials') return json(res, 200, { credentials: await vault.list() });
      if (req.method === 'POST' && url.pathname === '/api/security/vault/lock') {
        vault.lock(); audit({ event: 'vault.locked' }); return json(res, 200, { state: 'LOCKED' });
      }
      if (req.method === 'POST' && url.pathname === '/api/security/vault/init') {
        const { passphrase } = await readJson(req, maxBodyBytes);
        const outcome = await vault.initialize(passphrase);
        audit({ event: 'vault.initialized' }); return json(res, 201, outcome);
      }
      if (req.method === 'POST' && url.pathname === '/api/security/vault/unlock') {
        const peer = req.socket.remoteAddress;
        const state = failedUnlocks.get(peer) || { times: [] };
        const now = Date.now();
        state.times = state.times.filter(time => now - time < 60_000);
        if (state.times.length >= 5) return reject('UNLOCK_RATE_LIMITED', 429);
        const { passphrase } = await readJson(req, maxBodyBytes);
        try {
          const outcome = await vault.unlock(passphrase);
          failedUnlocks.delete(peer); audit({ event: 'vault.unlocked' });
          return json(res, 200, outcome);
        } catch (error) {
          state.times.push(now); failedUnlocks.set(peer, state); throw error;
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/security/credentials') {
        const { id, providerId, apiKey } = await readJson(req, maxBodyBytes);
        const outcome = await vault.put(id, providerId, apiKey);
        audit({ event: 'credential.stored' }); return json(res, 201, outcome);
      }
      if (req.method === 'DELETE' && url.pathname.startsWith('/api/security/credentials/')) {
        const id = url.pathname.slice('/api/security/credentials/'.length);
        const outcome = await vault.remove(id);
        audit({ event: 'credential.deleted' }); return json(res, 200, outcome);
      }
      return reject('NOT_FOUND', 404);
    } catch (error) {
      const safe = error instanceof HttpError ? error : vaultError(error);
      audit({ event: 'request.failed', code: safe.code });
      return json(res, safe.status, { error: safe.code });
    }
  });
  // Never bind 0.0.0.0 or an externally supplied interface.
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  canonicalOrigin = `http://127.0.0.1:${server.address().port}`;
  return {
    url: canonicalOrigin, server, bearerToken, csrfToken,
    close: () => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
  };
}
