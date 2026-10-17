/** Shared, non-sensitive error envelopes for imaging adapters and queue integration. */
export class ImageError extends Error {
  constructor(code, message, { retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'ImageError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function normalizeImageError(error) {
  if (error instanceof ImageError) return error;
  if (error?.name === 'AbortError') return new ImageError('CANCELLED', 'Image task cancelled');
  return new ImageError('PROVIDER_UNAVAILABLE', 'Image provider request failed', { retryable: true, cause: error });
}
