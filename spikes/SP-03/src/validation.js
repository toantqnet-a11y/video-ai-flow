import { ImageError } from './errors.js';

/** IDs also become directory names: no absolute paths, separators, devices or traversal. */
export function validateId(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new ImageError('INVALID_REQUEST', `${label} must be 1–64 safe ASCII characters`);
  }
}

export function validateImageRequest(request) {
  if (!request || typeof request !== 'object') throw new ImageError('INVALID_REQUEST', 'Image request is required');
  validateId(request.projectId, 'projectId');
  validateId(request.sceneId, 'sceneId');
  if (typeof request.prompt !== 'string' || !request.prompt.trim() || request.prompt.length > 3000) {
    throw new ImageError('INVALID_REQUEST', 'Prompt must contain 1–3000 characters');
  }
  if (request.seed !== undefined && (!Number.isSafeInteger(request.seed) || request.seed < 0)) {
    throw new ImageError('INVALID_REQUEST', 'Seed must be a nonnegative safe integer');
  }
  if (request.width !== undefined && (!Number.isInteger(request.width) || request.width < 64 || request.width > 8192)) {
    throw new ImageError('INVALID_REQUEST', 'Width must be 64–8192');
  }
  if (request.height !== undefined && (!Number.isInteger(request.height) || request.height < 64 || request.height > 8192)) {
    throw new ImageError('INVALID_REQUEST', 'Height must be 64–8192');
  }
  if (request.style !== undefined && (typeof request.style !== 'string' || request.style.length > 500)) {
    throw new ImageError('INVALID_REQUEST', 'Style exceeds 500 characters');
  }
}

export function validateImportRequest(request) {
  if (!request || typeof request !== 'object') throw new ImageError('INVALID_REQUEST', 'Import request is required');
  validateId(request.projectId, 'projectId');
  validateId(request.sceneId, 'sceneId');
  if (typeof request.filePath !== 'string' || !request.filePath.trim()) {
    throw new ImageError('INVALID_REQUEST', 'An existing local file path is required');
  }
}

/** ComfyUI must be local for the local/free route. Prevent using it as a network proxy. */
export function ensureLoopbackHttp(endpoint) {
  let parsed;
  try { parsed = new URL(endpoint); } catch { throw new ImageError('INVALID_CONFIG', 'Invalid local endpoint URL'); }
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    throw new ImageError('INVALID_CONFIG', 'ComfyUI endpoint must be loopback HTTP origin');
  }
  return parsed.hostname === 'localhost' ? `http://127.0.0.1:${parsed.port || '80'}` : parsed.origin;
}
