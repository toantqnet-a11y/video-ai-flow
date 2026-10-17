import { spawn } from 'node:child_process';
import { TtsError } from './errors.js';

/** Reject HTTP 200 HTML/JSON errors pretending to be audio before storing assets. */
export function detectAudioFormat(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 44) throw new TtsError('INVALID_AUDIO', 'Audio too small', { retryable: true });
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'mp3';
  throw new TtsError('INVALID_AUDIO', 'Unsupported or invalid audio signature', { retryable: true });
}

/** Optional ffprobe verification. Duration values are seconds, not milliseconds. */
export async function probeAudio(filePath, { binary = 'ffprobe', timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,duration:format=duration', '-of', 'json', filePath];
    let settled = false;
    const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const fail = error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
    child.stdout.on('data', b => { out += b.toString(); if (out.length > 16384) child.kill(); });
    child.on('error', error => fail(new TtsError('PROBE_UNAVAILABLE', 'ffprobe unavailable', { cause: error })));
    child.on('close', code => {
      if (settled) return;
      clearTimeout(timer); settled = true;
      if (code !== 0) return reject(new TtsError('INVALID_AUDIO', 'ffprobe rejected the audio', { retryable: true }));
      try {
        const parsed = JSON.parse(out);
        const stream = parsed.streams?.[0];
        const duration = Number(stream?.duration ?? parsed.format?.duration);
        if (!stream?.codec_name || !Number.isFinite(duration) || duration <= 0) throw Error('No decodable audio stream');
        resolve({ codec: stream.codec_name, durationSec: duration });
      } catch { reject(new TtsError('INVALID_AUDIO', 'Invalid ffprobe audio metadata', { retryable: true })); }
    });
  });
}
