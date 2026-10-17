import { spawn } from 'node:child_process';
import { TtsError } from './errors.js';
import { detectAudioFormat } from './audio.js';

/**
 * Optional offline diagnostic TTS provider. eSpeak is intelligible but robotic:
 * useful to verify *real speech generation* with no online credentials or GPU,
 * not a substitute for neural Hoài My / Nam Minh quality. Not installed by default on Windows.
 * Text is written to stdin so narration does not leak via command-line process lists.
 */
export class EspeakTtsAdapter {
  constructor({ binary = 'espeak', timeoutMs = 15000, maxBytes = 12_000_000, voice = 'vi' } = {}) {
    this.id = 'espeak-local';
    this.costTier = 'local';
    this.binary = binary;
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
    this.defaultVoice = voice;
  }
  voices() { return [{ id: this.defaultVoice, name: 'eSpeak Vietnamese (robotic)', locale: 'vi-VN' }]; }
  async health() {
    return new Promise(resolve => {
      const child = spawn(this.binary, ['--version'], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
      let settled = false;
      const timer = setTimeout(() => child.kill(), 3000);
      const finish = status => {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve({ status });
      };
      child.on('error', () => finish('dependency_unavailable'));
      child.on('close', code => finish(code === 0 ? 'ready' : 'dependency_unavailable'));
    });
  }
  async synthesize({ text, voice = this.defaultVoice, rate = 0 }, { signal } = {}) {
    // eSpeak speed is in words/minute, while the public adapter contract uses percentage.
    const wordsPerMin = Math.min(300, Math.max(80, Math.round(175 * (1 + rate / 100))));
    return new Promise((resolve, reject) => {
      const args = ['-v', voice, '-s', String(wordsPerMin), '-b', '1', '--stdin', '--stdout'];
      const child = spawn(this.binary, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      let settled = false; let timedOut = false; let size = 0;
      const chunks = [];
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, this.timeoutMs);
      const onAbort = () => child.kill();
      const finish = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
        if (error) reject(error); else resolve(value);
      };
      if (signal?.aborted) child.kill(); else signal?.addEventListener('abort', onAbort, { once: true });
      child.stdout.on('data', data => {
        size += data.length;
        if (size > this.maxBytes) { child.kill(); return; }
        chunks.push(data);
      });
      child.on('error', error => finish(new TtsError('DEPENDENCY_UNAVAILABLE', 'eSpeak executable unavailable', { retryable: true, cause: error })));
      child.on('close', code => {
        if (signal?.aborted) return finish(new TtsError('CANCELLED', 'Speech request cancelled'));
        if (timedOut) return finish(new TtsError('TIMEOUT', 'eSpeak timed out', { retryable: true }));
        if (size > this.maxBytes) return finish(new TtsError('OUTPUT_TOO_LARGE', 'Speech output too large'));
        if (code !== 0) return finish(new TtsError('PROVIDER_UNAVAILABLE', 'eSpeak failed', { retryable: true }));
        try {
          const bytes = Buffer.concat(chunks, size);
          const format = detectAudioFormat(bytes);
          if (format !== 'wav') throw new TtsError('INVALID_AUDIO', 'eSpeak returned unexpected format');
          finish(null, { bytes, format, voice });
        } catch (error) { finish(error); }
      });
      child.stdin.on('error', () => {});
      child.stdin.end(text);
    });
  }
}
