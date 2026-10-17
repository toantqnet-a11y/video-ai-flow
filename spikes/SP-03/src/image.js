import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ImageError } from './errors.js';
const execFileAsync = promisify(execFile);

/** Lightweight signature checks reject HTML/error JSON masquerading as image bytes. */
export function detectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) throw new ImageError('INVALID_IMAGE', 'Image is empty or truncated');
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') throw new ImageError('INVALID_IMAGE', 'PNG IHDR missing');
    return { format: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    // JPEG dimensions are stored in SOF markers, which are not necessarily near the beginning.
    let i = 2;
    while (i + 4 < buffer.length) {
      if (buffer[i] !== 0xff) { i++; continue; }
      let marker = buffer[++i];
      while (marker === 0xff) marker = buffer[++i];
      i++;
      if ([0xd8, 0xd9, 0x01].includes(marker) || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (marker === 0xda) break;
      if (i + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(i);
      if (length < 2 || i + length > buffer.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        return { format: 'jpg', height: buffer.readUInt16BE(i + 3), width: buffer.readUInt16BE(i + 5) };
      }
      i += length;
    }
    throw new ImageError('INVALID_IMAGE', 'JPEG dimensions not found');
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const type = buffer.toString('ascii', 12, 16);
    if (type === 'VP8X' && buffer.length >= 30) {
      const dimension = offset => 1 + buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
      return { format: 'webp', width: dimension(24), height: dimension(27) };
    }
    if (type === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      return { format: 'webp', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (type === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
      const d = buffer.readUInt32LE(21);
      return { format: 'webp', width: 1 + (d & 0x3fff), height: 1 + ((d >>> 14) & 0x3fff) };
    }
  }
  throw new ImageError('INVALID_IMAGE', 'Only real PNG, JPEG, or WebP files are accepted');
}

/** ffprobe verifies dimensions; FFmpeg decodes the frame to reject corrupted pixel data. */
export async function verifyImage(filePath, { min = 1, maxSide = 16384, maxPixels = 40_000_000 } = {}) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', filePath], { timeout: 15_000, maxBuffer: 32_768, windowsHide: true }));
  } catch (error) {
    throw new ImageError('IMAGE_PROBE_FAILED', 'ffprobe cannot verify image integrity (install FFmpeg)', { cause: error });
  }
  let info;
  try { info = JSON.parse(stdout).streams?.[0]; } catch { /* invalid ffprobe output */ }
  if (!info || !Number.isInteger(info.width) || !Number.isInteger(info.height) || info.width < min || info.height < min || info.width > maxSide || info.height > maxSide || info.width * info.height > maxPixels) {
    throw new ImageError('INVALID_IMAGE', 'Image dimensions are missing or exceed limits');
  }
  // ffprobe only inspects headers. Force one-frame decode so truncated/corrupt
  // pixel payloads do not become immutable ready assets.
  try {
    await execFileAsync('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-i', filePath, '-frames:v', '1', '-f', 'null', '-'], { timeout: 20_000, maxBuffer: 32_768, windowsHide: true });
  } catch (error) {
    throw new ImageError('INVALID_IMAGE', 'Image pixels could not be fully decoded', { cause: error });
  }
  return { width: info.width, height: info.height, codec: info.codec_name };
}

export function validateImageBytes(bytes, { maxBytes = 25 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length > maxBytes) throw new ImageError('INVALID_IMAGE', `Image must be a buffer of at most ${maxBytes} bytes`);
  const img = detectImage(bytes);
  if (img.width < 1 || img.height < 1 || img.width > 16384 || img.height > 16384 || img.width * img.height > 40_000_000) {
    throw new ImageError('INVALID_IMAGE', 'Image dimensions are outside policy bounds');
  }
  return img;
}
