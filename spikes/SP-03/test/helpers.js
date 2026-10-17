import { deflateSync } from 'node:zlib';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (~crc) >>> 0;
}
function chunk(name, data) {
  const marker = Buffer.from(name);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([marker, data])));
  return Buffer.concat([size, marker, data, checksum]);
}
/** Minimal genuine PNG generated locally, not neural-AI media. */
export function makePng(width = 16, height = 8) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const lines = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + 3 * width);
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = (x * 21) % 255;
      row[2 + x * 3] = (y * 27) % 255;
      row[3 + x * 3] = 120;
    }
    lines.push(row);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(lines))), chunk('IEND', Buffer.alloc(0))]);
}
export async function withDir(fn) {
  const folder = await mkdtemp(join(tmpdir(), 'contentstudio-sp03-'));
  try { return await fn(folder); } finally { await rm(folder, { recursive: true, force: true }); }
}
