import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TtsError } from './errors.js';
import { detectAudioFormat } from './audio.js';

/** Run the Edge Python worker with private JSON on stdin; never echo user script to logs. */
function runPython(executable, script, payload, { signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let settled = false; let timedOut = false;
    const child = spawn(executable, [script, ...(payload === null ? ['--check'] : [])], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const onAbort = () => child.kill();
    const finish = (error, code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve(code);
    };
    if (signal?.aborted) child.kill();
    else signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', err => finish(new TtsError('DEPENDENCY_UNAVAILABLE', 'Python executable unavailable', { retryable: true, cause: err })));
    child.on('close', code => {
      if (signal?.aborted) return finish(new TtsError('CANCELLED', 'Speech request cancelled'));
      if (timedOut) return finish(new TtsError('TIMEOUT', 'Edge TTS timed out', { retryable: true }));
      finish(null, code);
    });
    if (payload !== null) child.stdin.end(JSON.stringify(payload)); else child.stdin.end();
    child.stdin.on('error', () => {});
  });
}

export const EDGE_VOICES = Object.freeze([
  { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My', locale: 'vi-VN', gender: 'female' },
  { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh', locale: 'vi-VN', gender: 'male' },
]);

/** Edge TTS is unofficial and online; no API key does NOT guarantee lifetime availability/free use. */
export class EdgeTtsAdapter {
  constructor({ python = process.platform === 'win32' ? 'python' : 'python3', bridgePath = resolve(import.meta.dirname, 'python/edge_bridge.py'), timeoutMs = 90000, maxBytes = 12_000_000 } = {}) {
    this.id = 'edge';
    this.costTier = 'unverified_free';
    this.python = python; this.bridgePath = bridgePath; this.timeoutMs = timeoutMs; this.maxBytes = maxBytes;
  }
  voices() { return EDGE_VOICES.map(v => ({ ...v })); }
  async health() {
    try {
      const code = await runPython(this.python, this.bridgePath, null, { timeoutMs: 5000 });
      return { status: code === 0 ? 'dependency_ready_network_unchecked' : 'dependency_unavailable' };
    } catch { return { status: 'dependency_unavailable' }; }
  }
  async synthesize({ text, voice = EDGE_VOICES[0].id, rate = 0 }, { signal } = {}) {
    if (!EDGE_VOICES.some(v => v.id === voice)) throw new TtsError('INVALID_INPUT', 'Unsupported Edge Vietnamese voice');
    const dir = await mkdtemp(join(tmpdir(), 'contentstudio-tts-'));
    const outputPath = join(dir, 'voice.mp3');
    try {
      const code = await runPython(this.python, this.bridgePath, { text, voice, rate, outputPath }, { timeoutMs: this.timeoutMs, signal });
      if (code === 20) throw new TtsError('DEPENDENCY_UNAVAILABLE', 'Install the Python edge-tts dependency', { retryable: true });
      if (code === 21) throw new TtsError('INVALID_INPUT', 'Edge TTS rejected speech parameters');
      if (code !== 0) throw new TtsError('PROVIDER_UNAVAILABLE', 'Edge TTS upstream unavailable', { retryable: true });
      const bytes = await readFile(outputPath);
      if (bytes.length > this.maxBytes) throw new TtsError('OUTPUT_TOO_LARGE', 'Edge audio exceeded output limit');
      const format = detectAudioFormat(bytes);
      if (format !== 'mp3') throw new TtsError('INVALID_AUDIO', 'Edge produced unexpected audio format', { retryable: true });
      return { bytes, format, voice };
    } catch (error) {
      if (error instanceof TtsError) throw error;
      throw new TtsError('INVALID_AUDIO', 'Edge output file missing or invalid', { retryable: true, cause: error });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
