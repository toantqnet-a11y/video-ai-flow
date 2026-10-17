import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

/** Hardware discovery is advisory, not evidence a particular model will fit VRAM.
 * AMD/Intel GPUs and CPU inference require workflow-specific checks in the target environment.
 */
export async function diagnoseGpu({ runner = exec, platform = process.platform } = {}) {
  let nvidia = [];
  try {
    const { stdout } = await runner('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'], { timeout: 6000, windowsHide: true });
    nvidia = stdout.trim().split(/\r?\n/).filter(Boolean).map(row => {
      const parts = row.split(',').map(x => x.trim());
      return { vendor: 'NVIDIA', name: parts[0], vramMiB: Number.isFinite(Number(parts[1])) ? Number(parts[1]) : null, driver: parts[2] ?? null };
    });
  } catch { /* NVIDIA utilities may be absent on CPU, AMD, Intel or restricted hosts. */ }
  if (nvidia.length) return { platform, detection: 'nvidia-smi', gpus: nvidia, modelCompatibility: 'NOT_TESTED' };
  let windowsDevices = [];
  if (platform === 'win32') {
    try {
      const { stdout } = await runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name'], { timeout: 8000, windowsHide: true });
      windowsDevices = stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(name => ({ name, vramMiB: null, vendor: 'unknown' }));
    } catch { /* WMI may be disabled; do not guess hardware. */ }
  }
  return { platform, detection: windowsDevices.length ? 'windows-wmi-name-only' : 'gpu-not-confirmed', gpus: windowsDevices, modelCompatibility: 'NOT_TESTED' };
}
