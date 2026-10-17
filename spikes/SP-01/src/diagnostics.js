import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function shell(command, args, timeout = 12000) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 2_000_000 });
  return { ok: result.status === 0, stdout: String(result.stdout || '').trim(), error: result.error?.code || (result.status ? `exit ${result.status}` : null) };
}
function json(text) { try { return JSON.parse(text); } catch { return null; } }
function statDisk(root) {
  try {
    const s = fs.statfsSync(root, { bigint: true });
    return { root, freeBytes: Number(s.bavail * s.bsize), totalBytes: Number(s.blocks * s.bsize) };
  } catch (err) { return { root, error: err.code || err.message }; }
}
function probeGpuWindows() {
  // Avoid names/IDs containing local user identifiers, only adapter name and memory.
  const cmd = 'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress';
  const r = shell('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd]);
  if (!r.ok) return { status: 'unavailable', detail: r.error };
  const parsed = json(r.stdout);
  const rows = parsed ? (Array.isArray(parsed) ? parsed : [parsed]) : [];
  return { status: rows.length ? 'detected' : 'unknown', adapters: rows.map(x => ({ name: x.Name, reportedAdapterRamBytes: x.AdapterRAM, driverVersion: x.DriverVersion, note: 'WMI AdapterRAM may overflow on GPUs with >4GiB; nvidia-smi preferred for VRAM.' })) };
}
function probeGpu() {
  const nv = shell('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits']);
  const nvidia = nv.ok ? nv.stdout.split('\n').filter(Boolean).map(x => {
    const parts = x.split(',').map(y => y.trim());
    return { name: parts[0], memoryMiB: Number(parts[1]), driverVersion: parts[2] };
  }) : [];
  const windows = process.platform === 'win32' ? probeGpuWindows() : null;
  return { nvidiaSmiAvailable: nv.ok, nvidia, windows, verifiedAiVideoViability: false };
}
function findExe(name) {
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const r = shell(command, [name]);
  return r.ok ? r.stdout.split(/\r?\n/)[0] : null;
}
function ffmpegInfo() {
  const ffmpeg = findExe('ffmpeg');
  const ffprobe = findExe('ffprobe');
  const version = ffmpeg ? shell(ffmpeg, ['-version']) : { ok: false, stdout: '' };
  const enc = ffmpeg ? shell(ffmpeg, ['-hide_banner', '-encoders']) : { ok: false, stdout: '' };
  const text = enc.stdout;
  return {
    ffmpeg, ffprobe, version: version.ok ? version.stdout.split(/\r?\n/)[0] : null,
    encoders: { libx264: /\blibx264\b/.test(text), h264_nvenc: /\bh264_nvenc\b/.test(text), h264_qsv: /\bh264_qsv\b/.test(text), aac: /\baac\b/.test(text) },
    note: 'Encoder listed does not prove hardware encoder works; benchmark required.'
  };
}
export function collectDiagnostics(outputRoot = process.cwd()) {
  const cpu = os.cpus();
  const windowsExpected = process.platform === 'win32';
  return {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    targetPlatform: 'Windows 11',
    actualPlatform: { platform: process.platform, release: os.release(), arch: process.arch, windowsTargetValidated: windowsExpected },
    machine: { logicalCores: cpu.length, cpuModel: cpu[0]?.model || 'unknown', totalRamBytes: os.totalmem(), freeRamBytes: os.freemem() },
    gpu: probeGpu(),
    disk: statDisk(path.parse(path.resolve(outputRoot)).root === '/' ? path.resolve(outputRoot) : path.parse(path.resolve(outputRoot)).root),
    media: ffmpegInfo(),
    privacy: 'No API keys, host name, or hardware serial numbers are collected. Executable paths and disk root may reveal usernames; review before sharing.',
    verdict: windowsExpected ? 'WINDOWS_ENVIRONMENT_DETECTED_NOT_YET_BENCHMARKED' : 'WINDOWS_TEST_PENDING_NON_WINDOWS_RUN'
  };
}
export function evaluatePrerequisites(report) {
  const missing = [];
  if (!report.media.ffmpeg) missing.push('ffmpeg');
  if (!report.media.ffprobe) missing.push('ffprobe');
  if (!report.media.encoders.libx264) missing.push('libx264');
  if (!report.media.encoders.aac) missing.push('aac');
  return { readyForSyntheticBenchmark: missing.length === 0, missing };
}
