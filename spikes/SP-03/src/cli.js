#!/usr/bin/env node
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { diagnoseGpu } from './gpu.js';
import { ComfyUiImageAdapter } from './comfy.js';
import { CloudflareImageAdapter } from './cloudflare.js';
import { ImageService } from './service.js';
import { recommendImagePath } from './selector.js';

/** CLI is a portable spike harness, not a public HTTP API; no secrets/prompts printed. */
async function main() {
  const [operation, argument] = process.argv.slice(2);
  const root = resolve(process.env.IMAGE_DATA_ROOT ?? './output');
  const comfy = new ComfyUiImageAdapter({ endpoint: process.env.COMFY_ENDPOINT ?? 'http://127.0.0.1:8188', workflowPath: process.env.COMFY_WORKFLOW, bindings: process.env.COMFY_BINDINGS ? JSON.parse(process.env.COMFY_BINDINGS) : undefined, timeoutMs: Number(process.env.COMFY_TIMEOUT_MS ?? 120000) });
  if (operation === 'diagnose') {
    const gpu = await diagnoseGpu();
    const status = await comfy.diagnose();
    console.log(JSON.stringify({ gpu, comfy: status, recommendation: recommendImagePath({ gpu, comfy: status, remoteConfigured: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID) }), note: 'No GPU/model inference is verified by these probes alone' }, null, 2));
    return;
  }
  const cf = process.env.CLOUDFLARE_ACCOUNT_ID ? new CloudflareImageAdapter({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID }) : null;
  const service = new ImageService({ dataRoot: root, adapters: [comfy, ...(cf ? [cf] : [])] });
  if (operation === 'import') {
    if (!argument) throw new Error('Usage: node src/cli.js import /path/to/real-image.png');
    console.log(JSON.stringify(await service.importImage({ projectId: 'demo', sceneId: 'scene_001', filePath: resolve(argument) }), null, 2));
    return;
  }
  if (operation === 'generate') {
    const prompt = await readFile(process.env.IMAGE_PROMPT_FILE ?? './prompt.txt', 'utf8');
    // Default only local ComfyUI. Cloudflare only with affirmative consent + bounded approval.
    const provider = process.env.IMAGE_PROVIDER ?? 'comfyui';
    const policy = { providerIds: [provider] };
    if (provider === 'cloudflare') {
      policy.remoteConsent = process.env.IMAGE_REMOTE_CONSENT === 'YES';
      policy.paidApproval = { providerId: 'cloudflare', confirmed: process.env.IMAGE_APPROVE_METERED === 'YES', estimatedUsd: Number(process.env.IMAGE_ESTIMATED_USD ?? NaN), maxUsd: Number(process.env.IMAGE_MAX_USD ?? NaN) };
    }
    const result = await service.generate({ projectId: 'demo', sceneId: 'scene_001', prompt: prompt.trim(), seed: 42 }, policy);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  throw new Error('Usage: node src/cli.js diagnose | import /path/to/image.png | generate');
}
main().catch(error => { console.error(JSON.stringify({ code: error.code ?? 'COMMAND_FAILED', message: error.message })); process.exitCode = 1; });
