import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ImageError, normalizeImageError } from './errors.js';
import { ensureLoopbackHttp } from './validation.js';

/** ComfyUI API-format workflow runs on a user-controlled loopback server.
 * It never creates a workflow/model on its own: users must export API JSON from ComfyUI.
 * The adapter polls /history rather than requiring a websocket for this offline-friendly spike.
 */
export class ComfyUiImageAdapter {
  constructor({ endpoint = 'http://127.0.0.1:8188', workflowPath, workflow, bindings, fetchImpl = fetch, pollMs = 1000, timeoutMs = 120_000 } = {}) {
    this.id = 'comfyui';
    this.location = 'local';
    this.costTier = 'local';
    this.origin = ensureLoopbackHttp(endpoint);
    this.workflowPath = workflowPath;
    this.workflow = workflow;
    this.bindings = bindings;
    this.fetch = fetchImpl;
    this.pollMs = pollMs;
    this.timeoutMs = timeoutMs;
    if (!Number.isInteger(pollMs) || pollMs < 1 || !Number.isInteger(timeoutMs) || timeoutMs < 10) throw new ImageError('INVALID_CONFIG', 'Invalid polling configuration');
  }
  capabilities() {
    return { id: this.id, location: 'local', costTier: 'local', methods: ['text_to_image'], requires: ['running_comfyui', 'api_workflow', 'compatible_model_weights'], gpuVerified: false };
  }
  async diagnose() {
    try {
      const response = await this.fetch(new URL('/system_stats', this.origin), { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) return { providerId: this.id, reachable: false, status: response.status };
      const data = await response.json();
      return { providerId: this.id, reachable: true, devices: (data.devices ?? []).map(d => ({ type: d.type ?? 'unknown', name: d.name ?? 'unknown', vramTotalBytes: d.vram_total ?? null })) };
    } catch { return { providerId: this.id, reachable: false, reason: 'SERVICE_UNREACHABLE' }; }
  }
  async loadWorkflow(request) {
    if (!this.workflow && !this.workflowPath) throw new ImageError('INVALID_CONFIG', 'ComfyUI API-exported workflow path is required');
    const original = this.workflow ?? JSON.parse(await readFile(this.workflowPath, 'utf8'));
    if (!original || typeof original !== 'object' || Array.isArray(original) || Object.keys(original).length === 0) throw new ImageError('INVALID_CONFIG', 'ComfyUI workflow must be API-format JSON nodes');
    const copy = structuredClone(original);
    const patches = this.bindings;
    if (!patches?.prompt) throw new ImageError('INVALID_CONFIG', 'Workflow requires explicit prompt binding');
    // Only configured inputs are patched; model-specific node names are never guessed.
    const values = { prompt: [request.prompt, request.style].filter(Boolean).join(', '), seed: request.seed, width: request.width, height: request.height };
    for (const [property, value] of Object.entries(values)) {
      if (value === undefined || !patches[property]) continue;
      const { nodeId, input } = patches[property];
      if (typeof nodeId !== 'string' || typeof input !== 'string' || !copy[nodeId]?.inputs || !Object.hasOwn(copy[nodeId].inputs, input)) {
        throw new ImageError('INVALID_CONFIG', `Workflow binding ${property} references an unknown input`);
      }
      copy[nodeId].inputs[input] = value;
    }
    return copy;
  }
  async fetchJson(path, init, signal, timeoutMs) {
    let response;
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      response = await this.fetch(new URL(path, this.origin), { ...init, redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch (error) {
      if (signal?.aborted) throw new ImageError('CANCELLED', 'Image task cancelled');
      throw new ImageError('PROVIDER_UNAVAILABLE', 'ComfyUI not reachable or timed out', { retryable: true, cause: error });
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new ImageError('PROVIDER_HTTP_ERROR', `ComfyUI returned HTTP ${response.status}`, { retryable });
    }
    return response;
  }
  /** @returns {Promise<{bytes:Buffer,format:string,provenance:Object}>} */
  async generate(request, { signal } = {}) {
    if (signal?.aborted) throw new ImageError('CANCELLED', 'Image task cancelled');
    const workflow = await this.loadWorkflow(request);
    const clientId = randomUUID();
    const queued = await this.fetchJson('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow, client_id: clientId }) }, signal, 12_000);
    const reply = await queued.json();
    const promptId = reply.prompt_id;
    if (typeof promptId !== 'string' || !/^[a-fA-F0-9-]{20,50}$/.test(promptId)) throw new ImageError('INVALID_RESPONSE', 'ComfyUI returned no valid prompt_id');
    const started = Date.now();
    let imageRef;
    while (Date.now() - started < this.timeoutMs) {
      if (signal?.aborted) throw new ImageError('CANCELLED', 'Image task cancelled');
      const historyResponse = await this.fetchJson(`/history/${promptId}`, {}, signal, Math.min(10_000, this.timeoutMs));
      const history = (await historyResponse.json())[promptId];
      if (history) {
        if (history.status?.status_str === 'error' || history.status?.completed === false || history.status?.messages?.some(m => m?.[0] === 'execution_error')) {
          throw new ImageError('GENERATION_FAILED', 'ComfyUI workflow execution failed');
        }
        // SaveImage results can appear in any node: do not assume node 9 or output order.
        imageRef = Object.values(history.outputs ?? {}).flatMap(node => node.images ?? []).find(img => img.type === 'output' || !img.type);
        if (!imageRef) throw new ImageError('INVALID_RESPONSE', 'ComfyUI job completed without SaveImage output');
        break;
      }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, this.pollMs);
        const abort = () => { clearTimeout(timer); reject(new ImageError('CANCELLED', 'Image task cancelled')); };
        signal?.addEventListener('abort', abort, { once: true });
      });
    }
    if (!imageRef) throw new ImageError('PROVIDER_TIMEOUT', 'ComfyUI workflow exceeded timeout', { retryable: true });
    // Do not permit arbitrary file paths, URL schemes or remote host access via ComfyUI output.
    if (typeof imageRef.filename !== 'string' || !/^[\w .()\-]+\.(png|jpg|jpeg|webp)$/i.test(imageRef.filename)) {
      throw new ImageError('INVALID_RESPONSE', 'ComfyUI supplied an unsafe output filename');
    }
    const subfolder = imageRef.subfolder ?? '';
    if (typeof subfolder !== 'string' || subfolder.split(/[\\/]/).some(segment => segment === '..') || /^[\\/]/.test(subfolder) || /^[A-Za-z]:/.test(subfolder)) {
      throw new ImageError('INVALID_RESPONSE', 'ComfyUI output subfolder is unsafe');
    }
    const query = new URLSearchParams({ filename: imageRef.filename, subfolder, type: 'output' });
    const outputResponse = await this.fetchJson(`/view?${query}`, {}, signal, 20_000);
    // Enforce a streaming byte limit: untrusted output cannot exhaust memory.
    const declared = Number(outputResponse.headers.get('content-length'));
    if (declared > 25 * 1024 * 1024) throw new ImageError('OUTPUT_TOO_LARGE', 'ComfyUI output exceeds 25 MB');
    const bytes = await readLimited(outputResponse, 25 * 1024 * 1024);
    return { bytes, provenance: { provider: this.id, promptId, workflow: 'user_api_export' } };
  }
}

/** Reused by remote adapter, with a hard cap even when Content-Length is absent. */
export async function readLimited(response, maxBytes) {
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new ImageError('OUTPUT_TOO_LARGE', 'Response exceeds allowed size');
    return bytes;
  }
  const chunks = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new ImageError('OUTPUT_TOO_LARGE', 'Response exceeds allowed size');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw normalizeImageError(error);
  }
  return Buffer.concat(chunks, length);
}
