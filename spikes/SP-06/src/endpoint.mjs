/**
 * SSRF-resistant transport for explicitly configured TTS/ComfyUI endpoints.
 *
 * DNS validation without connection pinning is susceptible to rebind attacks.
 * We therefore validate resolved addresses and pass a pinned DNS resolver to
 * the actual request. Redirects are NEVER automatically followed. Remote
 * hosts require HTTPS and an exact hostname allowlist; LAN is denied by default.
 */
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export class EndpointError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'EndpointError'; }
}
function publicV4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b,c] = parts;
  // Public egress only: block RFC1918, loopback, link-local, carrier NAT,
  // TEST-NET, benchmarking and other reserved ranges / metadata endpoints.
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 0 && c === 2))) ||
    (a === 192 && b === 0 && c === 2) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    (a === 255));
}
function publicV6(address) {
  const normalized = address.toLowerCase();
  // Only global-unicast range. Reject documentation, v4-mapped, Teredo,
  // ULA, loopback and unspecified. Remote IPv6 disabled for special ranges.
  return /^[23][0-9a-f]{0,3}:/.test(normalized) &&
    !normalized.startsWith('2001:db8:') &&
    !normalized.startsWith('2001:0:') &&
    !normalized.startsWith('2002:') &&
    !normalized.includes('::ffff:');
}
export function isPublicAddress(address) {
  const family = net.isIP(address);
  return family === 4 ? publicV4(address) : family === 6 ? publicV6(address) : false;
}

/**
 * Resolve a local-only or allowlisted remote URL to validated IP addresses.
 * `resolver` is injectable for deterministic negative tests and DNS checks.
 */
export async function resolveEndpoint(target, { kind = 'local', allowedHosts = [], resolver = dns.lookup } = {}) {
  if (typeof target !== 'string' || target.length > 2048 || /[\s\\]/.test(target)) throw new EndpointError('INVALID_ENDPOINT');
  let url;
  try { url = new URL(target); } catch { throw new EndpointError('INVALID_ENDPOINT'); }
  if (url.username || url.password || url.hash || url.search) throw new EndpointError('URL_CREDENTIALS_OR_QUERY_FORBIDDEN');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new EndpointError('BAD_PROTOCOL');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (kind === 'local') {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) throw new EndpointError('LOCAL_LOOPBACK_ONLY');
    return { url, addresses: [{ address: hostname === '[::1]' ? '::1' : '127.0.0.1', family: hostname === '[::1]' ? 6 : 4 }] };
  }
  if (kind !== 'remote') throw new EndpointError('INVALID_ENDPOINT_KIND');
  if (url.protocol !== 'https:') throw new EndpointError('REMOTE_HTTPS_REQUIRED');
  if (net.isIP(hostname) || !/^[a-z0-9.-]+$/.test(hostname) || !hostname.includes('.') || !allowedHosts.includes(hostname))
    throw new EndpointError('REMOTE_HOST_NOT_ALLOWED');
  let records;
  try { records = await resolver(hostname, { all: true, verbatim: true }); } catch { throw new EndpointError('DNS_RESOLUTION_FAILED'); }
  if (!Array.isArray(records) || !records.length || records.some(({address, family}) => !isPublicAddress(address) || net.isIP(address) !== family))
    throw new EndpointError('DNS_ADDRESS_NOT_PUBLIC');
  return { url, addresses: records };
}

/**
 * Execute approved endpoint request with a pinned address, response cap,
 * timeout and disabled redirects. Caller must additionally obtain explicit
 * consent before sending prompts to any remote/metered provider.
 */
export async function requestApprovedEndpoint(target, { kind = 'local', allowedHosts = [], resolver,
  method = 'GET', body, headers = {}, timeoutMs = 10_000, maxResponseBytes = 3_000_000 } = {}) {
  const { url, addresses } = await resolveEndpoint(target, {kind, allowedHosts, resolver});
  if (!['GET', 'POST'].includes(method)) throw new EndpointError('BAD_METHOD');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000 ||
      !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 50_000_000)
    throw new EndpointError('INVALID_TRANSPORT_LIMIT');
  if (Object.keys(headers).some(name => ['host', 'cookie', 'proxy-authorization', 'connection'].includes(name.toLowerCase())))
    throw new EndpointError('UNSAFE_REQUEST_HEADER');
  const transport = url.protocol === 'https:' ? https : http;
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method, headers, timeout: timeoutMs, autoSelectFamily: false,
      // DNS-pin the socket: the hostname must NOT resolve again between
      // approval and connection, including on a subsequent request.
      lookup: (_hostname, opts, cb) => opts.all
        ? cb(null, [{address:chosen.address, family:chosen.family}])
        : cb(null, chosen.address, chosen.family)
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume(); reject(new EndpointError('REDIRECT_FORBIDDEN')); return;
      }
      const chunks = []; let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > maxResponseBytes) {
          response.destroy(new EndpointError('RESPONSE_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode, data: Buffer.concat(chunks) }));
      response.on('error', error => reject(error instanceof EndpointError ? error : new EndpointError('ENDPOINT_IO_ERROR')));
    });
    request.on('timeout', () => request.destroy(new EndpointError('ENDPOINT_TIMEOUT')));
    request.on('error', error => reject(error instanceof EndpointError ? error : new EndpointError('ENDPOINT_IO_ERROR')));
    if (body) request.write(body);
    request.end();
  });
}
