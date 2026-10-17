/**
 * R0-03: framework-independent ingress checks for the local Fastify API.
 * WHY: localhost alone is not an authentication boundary: malicious webpages,
 * local DNS rebinding, proxy headers and ambiguous URL parsing can reach it.
 * Validate the *raw* request before routing/body parsing, and never accept
 * bearer or vault credentials through URL query strings.
 */
const sensitiveQuery = /(?:token|secret|password|passphrase|api[_-]?key|bearer|csrf|credential|auth|code)/i;
const allowedQueryKeys = new Map([['GET /api/providers/monitor',new Set(['limit'])],['GET /api/channels', new Set(['status'])],['GET /api/tts/local-providers',new Set(['probe'])],['GET /api/images/local-provider',new Set(['probe'])]]);
// Only the exact dynamic account readiness path may accept a non-sensitive probe flag.
const jobsListPath = 'GET /api/jobs';
const jobHistoryPath = 'GET /api/jobs/events/history';
const quotaLedgerPath = /^GET \/api\/provider-models\/[a-zA-Z0-9_-]{1,80}\/quota-ledger$/;
const assetLibraryPath = /^GET \/api\/videos\/[a-zA-Z0-9-]{1,80}\/assets\/library$/;
const assetDagRunsPath = /^GET \/api\/videos\/[a-zA-Z0-9-]{1,80}\/assets\/dag$/;
const sceneWaveformPath = /^GET \/api\/scenes\/[a-zA-Z0-9-]{1,80}\/voice\/waveform$/;
const videosPath = /^GET \/api\/channels\/[a-zA-Z0-9-]{1,80}\/videos$/;
const readinessPath = /^GET \/api\/provider-accounts\/[a-zA-Z0-9-]{1,80}\/readiness$/;
const projectZipPath = /^GET \/api\/videos\/[a-zA-Z0-9-]{1,80}\/exports\/project\.zip$/;
const securityHeaders = new Set(['host','origin','authorization','x-contentstudio-csrf','content-length','transfer-encoding']);

/** @returns {string|null} Safe public rejection code, or null when transport is valid. */
export function inspectIncomingRequest(raw, {port,gate}={}) {
  if (!raw || !gate) return 'INVALID_REQUEST_CONTEXT';
  const headers = raw.headers ?? {};
  const counts = new Map();
  const list = raw.rawHeaders ?? [];
  if (!Array.isArray(list) || list.length % 2) return 'AMBIGUOUS_HEADERS';
  for (let i=0;i<list.length;i+=2) {
    const key = String(list[i]).toLowerCase();
    if (securityHeaders.has(key)) counts.set(key,(counts.get(key)??0)+1);
  }
  if (counts.get('host')!==1 || [...securityHeaders].some(key => (counts.get(key)??0)>1))
    return 'AMBIGUOUS_HEADERS';
  if (headers['content-length']!==undefined && headers['transfer-encoding']!==undefined)
    return 'AMBIGUOUS_BODY_LENGTH';
  const forwarded = ['forwarded','x-forwarded-host','x-forwarded-for','x-forwarded-proto',
    'x-real-ip','x-original-url','x-rewrite-url'].some(key=>headers[key]!==undefined);
  const transport = gate.verifyTransport({
    host:headers.host,origin:headers.origin,peer:raw.socket?.remoteAddress,forwarded
  });
  if (transport) return transport;
  const rawUrl = raw.url;
  if (typeof rawUrl!=='string' || rawUrl.length>4096 || /[\\\r\n\0]/.test(rawUrl)) return 'INVALID_ROUTE';
  const [pathname] = rawUrl.split('?',1);
  if (!pathname.startsWith('/') || pathname.includes('%') || pathname.includes('//') || pathname.includes('/./') || pathname.includes('/../'))
    return 'INVALID_ROUTE';
  if (raw.method==='OPTIONS' && (pathname==='/health'||pathname.startsWith('/api/')))
    return 'CORS_DISABLED';
  if (headers['sec-fetch-site'] === 'cross-site') return 'CROSS_SITE_REQUEST';
  const question=rawUrl.indexOf('?');
  if (question>=0) {
    if (!pathname.startsWith('/api/')) return 'INVALID_ROUTE';
    let search;
    try { search=new URLSearchParams(rawUrl.slice(question+1)); } catch { return 'INVALID_ROUTE'; }
    const permitted=allowedQueryKeys.get(`${raw.method} ${pathname}`)??
      (`${raw.method} ${pathname}`===jobsListPath?new Set(['status','limit','cursor','kind','videoId','sceneId']):
       `${raw.method} ${pathname}`===jobHistoryPath?new Set(['after','limit']):null)??
      (assetLibraryPath.test(`${raw.method} ${pathname}`)?new Set(['kind','limit','cursor']):
       quotaLedgerPath.test(`${raw.method} ${pathname}`)?new Set(['limit']):
       assetDagRunsPath.test(`${raw.method} ${pathname}`)?new Set(['limit']):
       sceneWaveformPath.test(`${raw.method} ${pathname}`)?new Set(['bins']):
       readinessPath.test(`${raw.method} ${pathname}`)?new Set(['probe']):
       videosPath.test(`${raw.method} ${pathname}`)?new Set(['search','status','limit','cursor','deleted']):
       projectZipPath.test(`${raw.method} ${pathname}`)?new Set(['revision']):new Set());
    for (const [key] of search) {
      if (sensitiveQuery.test(key)) return 'SECRET_IN_QUERY_FORBIDDEN';
      if (!permitted.has(key)) return 'QUERY_NOT_ALLOWED';
    }
    if (rawUrl.slice(question+1).length>500) return 'QUERY_NOT_ALLOWED';
  }
  return null;
}

/** Only operational metadata is logged; raw URL/query and headers are untrusted. */
export function safeRequestLog(req) {
  return {method:req?.method??'UNKNOWN',requestId:req?.id??null};
}
