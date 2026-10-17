/**
 * Local ComfyUI AI-video protocol adapter (Wan/LTX workflow agnostic).
 * Binds only explicit API-format node IDs, never guesses model parameters.
 * Proves POST /prompt -> poll /history -> download /view, NOT real GPU inference.
 * Cancellation aborts local wait but may leave work running in ComfyUI.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { VideoError, validateLocalOrigin, validateRequest, requestFingerprint } from './contracts.mjs';
import { readBounded, MAX_VIDEO_BYTES } from './media.mjs';

const MAX_JSON_BYTES = 2 * 1024 * 1024;
const identity = value => value;
const allowedFields = new Set(['prompt', 'negativePrompt', 'seed', 'width', 'height', 'fps', 'durationSeconds', 'image']);
const parseFilename = (value) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9 _().-]{1,160}\.(mp4|webm)$/i.test(value) || value.startsWith('.')) throw new VideoError('UNSAFE_MEDIA_FILENAME');
  return value;
};
function safeSubfolder(folder) {
  if (typeof folder !== 'string' || folder.length > 180 || folder.startsWith('/') || folder.startsWith('\\')
    || /^[a-zA-Z]:/.test(folder) || folder.split(/[\\/]/).some(p => p === '..' || p === '.')) throw new VideoError('UNSAFE_MEDIA_FOLDER');
  return folder;
}
const pause = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new VideoError('CANCELLED'));
  const t = setTimeout(() => {signal?.removeEventListener('abort', onAbort); resolve();}, ms);
  const onAbort = () => { clearTimeout(t); reject(new VideoError('CANCELLED')); };
  signal?.addEventListener('abort', onAbort, {once:true});
});

export class ComfyVideoAdapter {
  constructor({origin = 'http://127.0.0.1:8188', workflow, workflowPath,
    bindings = {}, timeoutMs = 30 * 60_000, pollMs = 1500, fetchImpl = globalThis.fetch} = {}) {
    this.id = 'comfyui-local';
    this.origin = validateLocalOrigin(origin);
    this.workflow = workflow;
    this.workflowPath = workflowPath;
    this.bindings = bindings;
    this.timeoutMs = timeoutMs;
    this.pollMs = pollMs;
    this.fetch = fetchImpl;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 3_600_000 ||
        !Number.isInteger(pollMs) || pollMs < 1 || pollMs > 30_000) throw new VideoError('INVALID_TIMEOUT');
  }

  async fetchResponse(route, { method = 'GET', body, signal, responseLimit = MAX_JSON_BYTES } = {}) {
    if (signal?.aborted) throw new VideoError('CANCELLED');
    if (!route.startsWith('/') || route.startsWith('//')) throw new VideoError('INVALID_ROUTE');
    const timeout = AbortSignal.timeout(Math.min(30_000, this.timeoutMs));
    let response;
    try {
      response = await this.fetch(`${this.origin}${route}`, {
        method, body, redirect:'manual', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: typeof body === 'string' ? {'Content-Type':'application/json'} : undefined,
      });
    } catch (error) {
      if (signal?.aborted) throw new VideoError('CANCELLED');
      throw new VideoError('PROVIDER_UNAVAILABLE', 'Local ComfyUI request failed', {retryable:true});
    }
    if (response.status >= 300 && response.status < 400) throw new VideoError('REDIRECT_FORBIDDEN');
    if (!response.ok) throw new VideoError('PROVIDER_HTTP_ERROR', `ComfyUI HTTP ${response.status}`, {retryable:response.status === 429 || response.status >= 500});
    const len = Number(response.headers.get('content-length') || 0);
    if (len > responseLimit) throw new VideoError('RESPONSE_TOO_LARGE');
    return response;
  }

  async json(route, options) {
    const res = await this.fetchResponse(route, options);
    const bytes = await readBounded(res, MAX_JSON_BYTES);
    try {return JSON.parse(bytes.toString('utf8'));} catch {throw new VideoError('INVALID_PROVIDER_JSON');}
  }

  async status({signal} = {}) {
    const stats = await this.json('/system_stats', {signal});
    return {providerId:this.id, reachable:true,
      devices:(stats.devices ?? []).map(d=>({name:d.name, type:d.type, vramTotal:d.vram_total})),
      realInferenceVerified:false};
  }

  async loadWorkflow(request, imageName) {
    validateRequest(request);
    const original = this.workflow ?? (this.workflowPath ? JSON.parse(await readFile(this.workflowPath, 'utf8')) : null);
    if (!original || Array.isArray(original) || typeof original !== 'object' || !Object.keys(original).length) throw new VideoError('WORKFLOW_REQUIRED');
    // ComfyUI UI workflow JSON (nodes/links) is NOT accepted by /prompt.
    if (Array.isArray(original.nodes)) throw new VideoError('WORKFLOW_MUST_BE_API_FORMAT');
    const workflow = structuredClone(original);
    if (!this.bindings.prompt || (request.mode === 'image_to_video' && !this.bindings.image)) throw new VideoError('WORKFLOW_BINDING_MISSING');
    const values = {
      prompt:request.prompt, negativePrompt:request.negativePrompt, seed:request.seed,
      width:request.width, height:request.height, fps:request.fps,
      durationSeconds:request.durationSeconds, image:imageName,
    };
    for (const [field, binding] of Object.entries(this.bindings)) {
      if (!allowedFields.has(field) || !binding || typeof binding.nodeId !== 'string' || typeof binding.input !== 'string' ||
          !workflow[binding.nodeId]?.inputs || !Object.hasOwn(workflow[binding.nodeId].inputs, binding.input)) throw new VideoError('INVALID_WORKFLOW_BINDING');
      if (values[field] !== undefined) {
        if (field === 'durationSeconds' && binding.transform === 'frames') {
          if (!request.fps) throw new VideoError('FPS_REQUIRED_FOR_FRAME_BINDING');
          workflow[binding.nodeId].inputs[binding.input] = Math.round(values[field] * request.fps);
        } else if (!binding.transform || binding.transform === 'identity') {
          workflow[binding.nodeId].inputs[binding.input] = values[field];
        } else throw new VideoError('INVALID_WORKFLOW_BINDING');
      }
    }
    const workflowHash = createHash('sha256').update(JSON.stringify(original)).digest('hex');
    return {workflow, workflowHash};
  }

  /** Upload I2V reference only to loopback; a content hash avoids sharing original path. */
  async uploadReference(imageBytes, {signal}={}) {
    const mime = imageBytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) ? 'image/png' : 'image/jpeg';
    const name = `${randomUUID()}.${mime === 'image/png' ? 'png' : 'jpg'}`;
    const body = new FormData();
    body.append('image', new Blob([imageBytes], {type:mime}), name);
    body.append('overwrite','false');
    const result = await this.json('/upload/image', {method:'POST', body, signal});
    if (typeof result.name !== 'string' || result.name.length > 160 || !/^[\w .()-]+\.(png|jpg)$/i.test(result.name)) throw new VideoError('UNSAFE_UPLOADED_FILENAME');
    return result.name;
  }

  /** Select real video file outputs; reject preview GIFs and user filepaths. */
  extractVideo(history) {
    if (history?.status?.status_str === 'error' || history?.status?.completed === false ||
        history?.status?.messages?.some(m => m?.[0] === 'execution_error')) throw new VideoError('GENERATION_FAILED');
    const matches = Object.values(history?.outputs ?? {}).flatMap(out => [
      ...(out.videos ?? []), ...(out.gifs ?? []), ...(out.video ?? []),
    ]).filter(item => item && typeof item.filename === 'string' && /\.mp4$/i.test(item.filename));
    if (matches.length === 0) throw new VideoError('NO_VIDEO_OUTPUT', 'ComfyUI history contains no MP4 output. Remux WebM explicitly before import.');
    const ref = matches[0];
    return {filename:parseFilename(ref.filename), subfolder:safeSubfolder(ref.subfolder ?? ''), type:'output'};
  }

  /**
   * A user-supplied Wan/LTX workflow provides model logic; adapter only
   * submits explicit bindings and retrieves an actual generated video stream.
   * This function deliberately never uses FFmpeg to synthesize an AI clip.
   */
  async generate(request, {signal, onProgress = identity}={}) {
    validateRequest(request);
    if (signal?.aborted) throw new VideoError('CANCELLED');
    const imageName = request.mode === 'image_to_video' ? await this.uploadReference(request.imageBytes, {signal}) : undefined;
    const {workflow, workflowHash} = await this.loadWorkflow(request, imageName);
    const inputHash = requestFingerprint(request, workflowHash);
    const reply = await this.json('/prompt', {method:'POST', body:JSON.stringify({prompt:workflow, client_id:randomUUID()}), signal});
    const promptId = reply.prompt_id;
    if (typeof promptId !== 'string' || !/^[a-zA-Z0-9-]{10,80}$/.test(promptId)) throw new VideoError('INVALID_PROMPT_ID');
    onProgress({stage:'queued', promptId});
    const deadline = Date.now() + this.timeoutMs;
    let history;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new VideoError('CANCELLED');
      const payload = await this.json(`/history/${encodeURIComponent(promptId)}`, {signal});
      history = payload[promptId];
      if (history) break;
      onProgress({stage:'generating', promptId});
      await pause(Math.min(this.pollMs, Math.max(1, deadline - Date.now())), signal);
    }
    if (!history) throw new VideoError('GENERATION_TIMEOUT', 'ComfyUI generation exceeded configured timeout', {retryable:true});
    const ref = this.extractVideo(history);
    const params = new URLSearchParams(ref);
    onProgress({stage:'downloading', promptId});
    const video = await this.fetchResponse(`/view?${params.toString()}`, {signal, responseLimit:MAX_VIDEO_BYTES});
    const bytes = await readBounded(video, MAX_VIDEO_BYTES);
    if (bytes.length === 0) throw new VideoError('EMPTY_PROVIDER_MEDIA');
    return {bytes, inputHash, provenance:{providerId:this.id, workflowHash,
      // Avoid persisting prompt text, ComfyUI file URLs or image path.
      modelId:request.modelId || 'workflow-configured', promptId}};
  }
}
