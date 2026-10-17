/** Stable public error codes; do not persist raw provider exceptions or private script text. */
export class TtsError extends Error {
  constructor(code, message, { retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'TtsError';
    this.code = code;
    this.retryable = retryable;
  }
}
export function normalizeError(error) {
  if (error instanceof TtsError) return error;
  return new TtsError('PROVIDER_UNAVAILABLE', 'Speech provider unavailable', { retryable: true, cause: error });
}
