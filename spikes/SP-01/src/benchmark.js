import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

function probe(ffprobe, file) {
  const p = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type', '-of', 'json', file], { encoding: 'utf8', timeout: 30000, maxBuffer: 200000 });
  if (p.status !== 0) throw new Error(`ffprobe failed: ${p.stderr || p.error?.message}`);
  return JSON.parse(p.stdout);
}
function memoryBytes(pid) {
  if (process.platform === 'linux') {
    try { const s = fs.readFileSync(`/proc/${pid}/status`, 'utf8'); const m = s.match(/^VmRSS:\s+(\d+)\s+kB/m); return m ? Number(m[1]) * 1024 : null; } catch { return null; }
  }
  if (process.platform === 'win32') {
    // Windows tasklist is supported out of the box, but localization makes memory parsing unreliable.
    // Record unavailable instead of claiming a made-up peak. Windows performance counters can be used in the follow-up on-device validation.
    return null;
  }
  return null;
}
export async function benchmark({ ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', durationSeconds = 15, outputDir, label = 'smoke' }) {
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0 || durationSeconds > 3600) throw new Error('Duration must be integer 1..3600 seconds');
  fs.mkdirSync(outputDir, { recursive: true });
  const file = path.join(outputDir, `${label}-${durationSeconds}s.mp4`);
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=0x1e293b:s=320x180:r=2',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=16000',
    '-t', String(durationSeconds),
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '35',
    '-pix_fmt', 'yuv420p', '-r', '2', '-threads', '2', '-c:a', 'aac', '-b:a', '32k',
    '-movflags', '+faststart', file
  ];
  const start = performance.now();
  let peakRssBytes = null;
  const processResult = await new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const poller = setInterval(() => { if (!proc.pid) return; const bytes = memoryBytes(proc.pid); if (bytes !== null) peakRssBytes = Math.max(peakRssBytes || 0, bytes); }, 100);
    proc.stderr.on('data', b => { if (stderr.length < 10000) stderr += b.toString(); });
    proc.on('error', err => { clearInterval(poller); reject(err); });
    proc.on('close', code => { clearInterval(poller); resolve({ code, stderr }); });
  });
  const elapsedSeconds = Math.round((performance.now() - start) / 10) / 100;
  if (processResult.code !== 0) throw new Error(`FFmpeg exit=${processResult.code}: ${processResult.stderr}`);
  const info = probe(ffprobe, file);
  const duration = Number(info.format.duration);
  const video = info.streams.find(s => s.codec_type === 'video');
  const audio = info.streams.find(s => s.codec_type === 'audio');
  const passed = !!video && !!audio && video.codec_name === 'h264' && audio.codec_name === 'aac' && Math.abs(duration - durationSeconds) <= 0.55;
  return {
    label, fixture: 'solid-color/silent-audio synthetic 320x180 @ 2fps (NOT a production-grade render performance benchmark)',
    expectedDurationSeconds: durationSeconds, actualDurationSeconds: duration,
    elapsedSeconds, encodingSpeedRatio: +(durationSeconds / Math.max(elapsedSeconds, 0.01)).toFixed(2),
    peakFfmpegRssBytes: peakRssBytes,
    fileBytes: Number(info.format.size), codecs: { video: video?.codec_name || null, audio: audio?.codec_name || null },
    verifiedWithFfprobe: true, passed,
    outputFilename: path.basename(file),
    warning: process.platform === 'win32' ? 'Peak FFmpeg RSS not collected in this portable script; use Windows perf tooling in acceptance run.' : null
  };
}
