/**
 * Contract + policy boundary for AI VIDEO (not image-motion).
 * Local inference is not proof of a free API or a working GPU. Remote paid
 * generation is intentionally excluded from this Sprint 0 spike.
 */
import { createHash } from 'node:crypto';

export class VideoError extends Error {
  constructor(code, message = code, { retryable = false } = {}) {
    super(message); this.name = 'VideoError'; this.code = code; this.retryable = retryable;
  }
}
export const LOCAL_VIDEO_CAPABILITY = Object.freeze({
  providerId: 'comfyui-local', modelId: 'workflow-configured',
  modes: ['text_to_video', 'image_to_video'],
  cost: { type: 'local' },
  verification: 'unverified_without_live_model',
  maxDurationSeconds: null,
});

/** The only allowed network provider in this spike is the configured loopback ComfyUI. */
export function validateLocalOrigin(origin) {
  let url;
  try { url = new URL(origin); } catch { throw new VideoError('INVALID_ENDPOINT'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new VideoError('LOCAL_LOOPBACK_ONLY', 'ComfyUI URL must be a bare http://127.0.0.1:<port>/ origin');
  }
  return url.hostname === 'localhost' ? `http://127.0.0.1:${url.port || '80'}` : url.origin;
}

/** Validate immutable generation request before any provider-side work is dispatched. */
export function validateRequest(req) {
  if (!req || !['text_to_video', 'image_to_video'].includes(req.mode)) throw new VideoError('INVALID_MODE');
  if (typeof req.prompt !== 'string' || req.prompt.trim().length < 2 || req.prompt.length > 12_000) throw new VideoError('INVALID_PROMPT');
  if (!Number.isFinite(req.durationSeconds) || req.durationSeconds <= 0 || req.durationSeconds > 300) throw new VideoError('INVALID_DURATION');
  if (req.width !== undefined && (!Number.isInteger(req.width) || req.width < 128 || req.width > 4096)) throw new VideoError('INVALID_WIDTH');
  if (req.height !== undefined && (!Number.isInteger(req.height) || req.height < 128 || req.height > 4096)) throw new VideoError('INVALID_HEIGHT');
  if (req.fps !== undefined && (!Number.isInteger(req.fps) || req.fps < 1 || req.fps > 120)) throw new VideoError('INVALID_FPS');
  if (req.seed !== undefined && (!Number.isSafeInteger(req.seed) || req.seed < 0)) throw new VideoError('INVALID_SEED');
  if (req.mode === 'image_to_video') {
    if (!Buffer.isBuffer(req.imageBytes) || req.imageBytes.length < 12 || req.imageBytes.length > 15 * 1024 * 1024) throw new VideoError('REFERENCE_IMAGE_REQUIRED');
    const png = req.imageBytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    const jpg = req.imageBytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
    if (!png && !jpg) throw new VideoError('INVALID_REFERENCE_IMAGE');
  }
  return true;
}

/** Persist only fingerprints, never raw prompts or private reference-image bytes. */
export function requestFingerprint(req, workflowHash) {
  return createHash('sha256').update(JSON.stringify({
    workflowHash, mode: req.mode, prompt: req.prompt, durationSeconds: req.durationSeconds,
    width: req.width, height: req.height, fps: req.fps, seed: req.seed,
    imageSha256: req.imageBytes ? createHash('sha256').update(req.imageBytes).digest('hex') : null,
  })).digest('hex');
}

/** Must be explicitly permitted before consuming quotas / sharing any data. */
export function assertProviderAllowed({type = 'local', paidApproved = false, remoteConsent = false} = {}) {
  if (type === 'local') return;
  if (type === 'paid' && !paidApproved) throw new VideoError('PAID_APPROVAL_REQUIRED');
  if (!remoteConsent) throw new VideoError('REMOTE_CONSENT_REQUIRED');
  throw new VideoError('REMOTE_ADAPTER_NOT_IMPLEMENTED');
}
