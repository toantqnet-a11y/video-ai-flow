import { ImageError } from './errors.js';

/** Metered remote provider. Never treated as free merely because a promotional quota exists.
 * Authorization and sending prompts off-device require separate explicit approval in ImageService.
 * See Cloudflare's published @cf/black-forest-labs/flux-1-schnell API contract.
 */
export class CloudflareImageAdapter {
  constructor({ accountId, token, tokenEnv = 'CLOUDFLARE_API_TOKEN', fetchImpl = fetch, model = '@cf/black-forest-labs/flux-1-schnell' } = {}) {
    this.id = 'cloudflare';
    this.location = 'remote';
    this.costTier = 'metered';
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(accountId ?? '')) throw new ImageError('INVALID_CONFIG', 'Invalid Cloudflare account id');
    if (model !== '@cf/black-forest-labs/flux-1-schnell') throw new ImageError('INVALID_CONFIG', 'Unknown model; review its pricing/response contract first');
    this.accountId = accountId;
    this.token = token;
    this.tokenEnv = tokenEnv;
    this.fetch = fetchImpl;
    this.model = model;
  }
  capabilities() {
    return { id: this.id, location: 'remote', costTier: 'metered', methods: ['text_to_image'], requires: ['credential', 'remote_consent', 'cost_approval'], quota: 'unknown_until_provider_query' };
  }
  async generate(request, { signal } = {}) {
    const credential = this.token ?? process.env[this.tokenEnv];
    if (!credential) throw new ImageError('MISSING_CREDENTIALS', 'Remote provider credentials not configured');
    const fullPrompt = [request.prompt, request.style].filter(Boolean).join(', ');
    if (fullPrompt.length > 2048) throw new ImageError('INVALID_REQUEST', 'Cloudflare model prompt limit is 2048 characters');
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
    let response;
    try {
      response = await this.fetch(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential}` }, body: JSON.stringify({ prompt: fullPrompt, ...(request.seed === undefined ? {} : { seed: request.seed }) }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000) });
    } catch (error) {
      if (signal?.aborted) throw new ImageError('CANCELLED', 'Image task cancelled');
      throw new ImageError('PROVIDER_UNAVAILABLE', 'Remote image provider unavailable', { retryable: true, cause: error });
    }
    if (!response.ok) throw new ImageError('PROVIDER_HTTP_ERROR', `Remote provider returned HTTP ${response.status}`, { retryable: response.status === 429 || response.status >= 500 });
    let data;
    try { data = await response.json(); } catch { throw new ImageError('INVALID_RESPONSE', 'Remote provider did not return JSON'); }
    if (data.success === false || typeof data.result?.image !== 'string') throw new ImageError('INVALID_RESPONSE', 'Remote provider image field missing');
    const b64 = data.result.image;
    if (b64.length > 36_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) throw new ImageError('INVALID_RESPONSE', 'Invalid or excessive base64 image');
    return { bytes: Buffer.from(b64, 'base64'), provenance: { provider: this.id, model: this.model, remote: true } };
  }
}
