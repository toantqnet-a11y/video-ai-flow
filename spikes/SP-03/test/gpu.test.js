import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseGpu } from '../src/gpu.js';

test('nvidia-smi parsing returns MiB but does not certify model execution', async () => {
  const r = await diagnoseGpu({ runner: async () => ({ stdout: 'NVIDIA Test GPU, 12288, 555.50\nNVIDIA GPU 2, 8192, 555.50\n' }), platform: 'win32' });
  assert.equal(r.gpus[0].vramMiB, 12288);
  assert.equal(r.gpus.length, 2);
  assert.equal(r.modelCompatibility, 'NOT_TESTED');
});
test('without NVIDIA on Linux GPU status stays unknown', async () => {
  const r = await diagnoseGpu({ runner: async () => { throw new Error('missing'); }, platform: 'linux' });
  assert.equal(r.detection, 'gpu-not-confirmed');
  assert.equal(r.modelCompatibility, 'NOT_TESTED');
});
test('Windows fallback lists display devices but does not invent VRAM', async () => {
  const r = await diagnoseGpu({ runner: async command => command === 'nvidia-smi' ? Promise.reject(new Error('missing')) : ({ stdout: 'Intel Arc\r\n' }), platform: 'win32' });
  assert.equal(r.detection, 'windows-wmi-name-only');
  assert.equal(r.gpus[0].vramMiB, null);
});

import { recommendImagePath } from '../src/selector.js';
test('offline selection preserves manual import when no local provider or remote approval', () => {
  assert.equal(recommendImagePath({ comfy: { reachable: false }, gpu: { gpus: [] }, remoteConfigured: true }).path, 'manual_import');
});
test('local ComfyUI reachable does not pretend model generation is verified', () => {
  const choice = recommendImagePath({ comfy: { reachable: true }, gpu: { detection: 'nvidia-smi' } });
  assert.equal(choice.path, 'comfyui');
  assert.equal(choice.readiness, 'SERVICE_REACHABLE_MODEL_UNTESTED');
});
test('remote selection requires both data consent and cost approval', () => {
  assert.equal(recommendImagePath({ comfy: { reachable: false }, remoteConfigured: true, remoteConsent: true }).path, 'manual_import');
  assert.equal(recommendImagePath({ comfy: { reachable: false }, remoteConfigured: true, remoteConsent: true, paidApproval: true }).path, 'cloudflare');
});
