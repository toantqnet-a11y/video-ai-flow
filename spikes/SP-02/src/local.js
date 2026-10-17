import { TtsError, normalizeError } from './errors.js';
import { detectAudioFormat } from './audio.js';
import { localEndpoint } from './validation.js';

/**
 * Generic Piper/VieNeu/Coqui HTTP bridge, not a claim that all servers use the same API.
 * Per-endpoint request body format and response format must be configured by the operator.
 * For security, remote TTS servers are disallowed until explicitly authorized in configuration.
 */
export class LocalHttpTtsAdapter {
  constructor({ endpoint, healthUrl, allowRemote = false, bodyFormat = 'json', timeoutMs = 30000, maxBytes = 12_000_000, voice = 'default', fetchImpl = fetch } = {}) {
    this.id = 'local-http';
    // Remote endpoints can carry unknown billing; only loopback endpoints are permitted by the default free/local policy.
    this.costTier = allowRemote ? 'remote_unapproved' : 'local';
    this.endpoint = localEndpoint(endpoint, { allowRemote });
    this.healthUrl = healthUrl ? localEndpoint(healthUrl, { allowRemote }) : null;
    if (!['json', 'text'].includes(bodyFormat)) throw new TtsError('INVALID_CONFIG', 'bodyFormat must be json or text');
    this.bodyFormat = bodyFormat;
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
    this.defaultVoice = voice;
    this.fetchImpl = fetchImpl;
  }
  voices() { return [{ id: this.defaultVoice, name: 'Configured local voice', locale: 'vi-VN' }]; }
  async health({ signal } = {}) {
    if (!this.healthUrl) return { status: 'unverified', note: 'No health URL configured' };
    try {
      const response = await this.fetchImpl(this.healthUrl, { method: 'GET', redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(3000), ...(signal ? [signal] : [])]) });
      return { status: response.ok ? 'ready' : 'unavailable', statusCode: response.status };
    } catch { return { status: 'unavailable' }; }
  }
  /** Returns audio bytes only; the service owns atomic file writes and cleanup. */
  async synthesize({ text, voice, rate = 0 }, { signal } = {}) {
    const requestSignal = AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]);
    const options = this.bodyFormat === 'text'
      ? { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Accept': 'audio/*' }, body: text }
      : { headers: { 'Content-Type': 'application/json', 'Accept': 'audio/*' }, body: JSON.stringify({ text, voice: voice ?? this.defaultVoice, rate }) };
    let response;
    try { response = await this.fetchImpl(this.endpoint, { method: 'POST', redirect: 'error', ...options, signal: requestSignal }); }
    catch (error) {
      if (signal?.aborted) throw new TtsError('CANCELLED', 'Speech request cancelled');
      if (requestSignal.aborted) throw new TtsError('TIMEOUT', 'Local TTS request timed out', { retryable: true });
      throw normalizeError(error);
    }
    if (!response.ok) throw new TtsError(response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE', `Local TTS returned HTTP ${response.status}`, { retryable: response.status === 429 || response.status >= 500 });
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > this.maxBytes) throw new TtsError('OUTPUT_TOO_LARGE', 'Audio output exceeded size limit');
    const chunks = []; let size = 0;
    if (!response.body) throw new TtsError('INVALID_AUDIO', 'Empty audio response', { retryable: true });
    try {
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > this.maxBytes) {
          await response.body.cancel().catch(() => {});
          throw new TtsError('OUTPUT_TOO_LARGE', 'Audio output exceeded size limit');
        }
        chunks.push(Buffer.from(chunk));
      }
    } catch (error) {
      if (error instanceof TtsError) throw error;
      if (signal?.aborted) throw new TtsError('CANCELLED', 'Speech request cancelled');
      throw normalizeError(error);
    }
    const bytes = Buffer.concat(chunks, size);
    return { bytes, format: detectAudioFormat(bytes), voice: voice ?? this.defaultVoice };
  }
}
