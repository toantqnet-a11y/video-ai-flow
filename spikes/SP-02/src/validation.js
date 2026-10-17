import { TtsError } from './errors.js';
/** Scene IDs are path segments, not arbitrary filesystem paths. */
export function safeId(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
    throw new TtsError('INVALID_INPUT', `${label} must contain 1–64 ASCII letters, numbers, hyphens or underscores`);
  }
  return value;
}
export function validateSpeechRequest(request) {
  if (!request || typeof request !== 'object') throw new TtsError('INVALID_INPUT', 'Request required');
  safeId(request.projectId, 'projectId');
  safeId(request.sceneId, 'sceneId');
  if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 4000 || /\0/.test(request.text)) {
    throw new TtsError('INVALID_INPUT', 'Text must contain 1–4000 characters');
  }
  if (request.voice !== undefined && (typeof request.voice !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(request.voice))) {
    throw new TtsError('INVALID_INPUT', 'Invalid voice ID');
  }
  if (request.rate !== undefined && (!Number.isInteger(request.rate) || request.rate < -50 || request.rate > 100)) {
    throw new TtsError('INVALID_INPUT', 'Rate must be integer percent between -50 and 100');
  }
  return request;
}
/** In local-first mode untrusted endpoint URLs must not become arbitrary outbound/SSRF destinations. */
export function localEndpoint(url, { allowRemote = false } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new TtsError('INVALID_CONFIG', 'Invalid TTS endpoint URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new TtsError('INVALID_CONFIG', 'Endpoint must be HTTP(S) without embedded credentials or fragments');
  }
  if (!allowRemote && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    throw new TtsError('INVALID_CONFIG', 'Only loopback TTS endpoints are enabled by default');
  }
  if (parsed.hostname === 'localhost' && allowRemote) {
    throw new TtsError('INVALID_CONFIG', 'Remote endpoints should use an explicit hostname');
  }
  return parsed.toString();
}
