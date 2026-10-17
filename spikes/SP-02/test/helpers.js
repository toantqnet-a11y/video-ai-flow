import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { TtsError } from '../src/errors.js';

export const wavBytes = () => readFile(new URL('./fixtures/synthetic-tone.wav', import.meta.url));
export const mp3Bytes = () => readFile(new URL('./fixtures/synthetic-tone.mp3', import.meta.url));
export async function temporaryRoot(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'tts-tests-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
export async function withHttp(handler, fn) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await fn(`http://127.0.0.1:${server.address().port}/tts`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
export function stubAdapter(id, { bytes, error, voice = 'default', delayMs = 0, costTier = 'local' } = {}) {
  return { id, costTier, defaultVoice: voice, voices: () => [{ id: voice }], async synthesize(args, { signal } = {}) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    if (signal?.aborted) throw new TtsError('CANCELLED', 'Cancelled');
    if (error) throw error;
    return { bytes, format: 'wav', voice: args.voice ?? voice };
  } };
}
