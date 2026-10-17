import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { ImageError, normalizeImageError } from './errors.js';
import { validateImportRequest, validateImageRequest } from './validation.js';
import { validateImageBytes, verifyImage } from './image.js';

/** Owns local image asset persistence and trust gates; adapters only return bytes.
 * SP-04 will supply durable job leases and DB-based active-asset selection. Until
 * then this spike creates immutable versions, but DOES NOT mutate scene pointers.
 */
export class ImageService {
  constructor({ dataRoot, adapters = [], verify = verifyImage, logger = () => {} } = {}) {
    if (!dataRoot || !Array.isArray(adapters) || adapters.some(a => !a?.id || typeof a.generate !== 'function')) {
      throw new ImageError('INVALID_CONFIG', 'A data root and valid provider adapters are required');
    }
    if (new Set(adapters.map(a => a.id)).size !== adapters.length) throw new ImageError('INVALID_CONFIG', 'Duplicate provider IDs');
    this.dataRoot = resolve(dataRoot);
    this.adapters = adapters;
    this.verify = verify;
    this.logger = logger;
  }

  /**
   * @param {{projectId:string,sceneId:string,prompt:string,style?:string,seed?:number,width?:number,height?:number}} request
   * @param {{providerIds?:string[],signal?:AbortSignal,remoteConsent?:boolean,paidApproval?:{providerId:string,confirmed:boolean,estimatedUsd:number,maxUsd:number}}} policy
   * @returns {Promise<{assetId:string, relativePath:string,providerId:string,format:string,width:number,height:number,sha256:string,attempts:Array}>}
   */
  async generate(request, policy = {}) {
    validateImageRequest(request);
    if (policy.signal?.aborted) throw new ImageError('CANCELLED', 'Image generation cancelled');
    // Never add a remote provider to fallback unless explicitly in the caller's ordered list.
    const providers = policy.providerIds ? policy.providerIds.map(id => this.adapters.find(a => a.id === id)) : this.adapters.filter(a => a.location === 'local');
    if (!providers.length || providers.some(p => !p)) throw new ImageError('INVALID_CONFIG', 'No matching image providers');
    const attempts = [];
    for (const adapter of providers) {
      // Policy denials are terminal, not retryable: do not silently skip a paid provider.
      authorize(adapter, policy);
      try {
        const output = await adapter.generate(request, { signal: policy.signal });
        if (policy.signal?.aborted) throw new ImageError('CANCELLED', 'Image generation cancelled');
        const file = await this.#commit({ projectId: request.projectId, sceneId: request.sceneId, bytes: output.bytes, provenance: output.provenance ?? { provider: adapter.id }, providerId: adapter.id, promptFingerprint: createHash('sha256').update(JSON.stringify({ prompt: request.prompt, style: request.style, seed: request.seed, width: request.width, height: request.height })).digest('hex'), signal: policy.signal });
        attempts.push({ providerId: adapter.id, status: 'succeeded' });
        this.logger({ event: 'image.asset.committed', providerId: adapter.id, projectId: request.projectId, sceneId: request.sceneId, assetId: file.assetId });
        return { ...file, attempts };
      } catch (error) {
        const normalized = normalizeImageError(error);
        if (policy.signal?.aborted || normalized.code === 'CANCELLED') throw new ImageError('CANCELLED', 'Image generation cancelled');
        attempts.push({ providerId: adapter.id, status: 'failed', code: normalized.code });
        this.logger({ event: 'image.provider.failed', providerId: adapter.id, sceneId: request.sceneId, code: normalized.code });
        if (!normalized.retryable) { normalized.attempts = attempts; throw normalized; }
      }
    }
    const result = new ImageError('ALL_PROVIDERS_FAILED', 'No eligible provider produced a valid image', { retryable: true });
    result.attempts = attempts;
    throw result;
  }

  /** Manual import is fully functional without any GPU/network/provider. */
  async importImage(request, { signal } = {}) {
    validateImportRequest(request);
    if (signal?.aborted) throw new ImageError('CANCELLED', 'Import cancelled');
    // A 25MB pre-check avoids loading unexpected huge local files into memory.
    const { stat } = await import('node:fs/promises');
    const info = await stat(request.filePath);
    if (!info.isFile() || info.size > 25 * 1024 * 1024) throw new ImageError('INVALID_IMAGE', 'Import must be a local image smaller than 25 MB');
    const bytes = await readFile(request.filePath);
    const output = await this.#commit({ projectId: request.projectId, sceneId: request.sceneId, bytes, providerId: 'manual_import', provenance: { provider: 'manual_import', origin: 'local_user_file' }, signal });
    this.logger({ event: 'image.asset.imported', projectId: request.projectId, sceneId: request.sceneId, assetId: output.assetId });
    return { ...output, attempts: [{ providerId: 'manual_import', status: 'succeeded' }] };
  }

  async #commit({ projectId, sceneId, bytes, providerId, provenance, promptFingerprint, signal }) {
    const image = validateImageBytes(bytes);
    const assetId = randomUUID();
    const folder = join(this.dataRoot, 'projects', projectId, 'scenes', sceneId, 'images');
    await mkdir(folder, { recursive: true });
    const rootReal = await realpath(this.dataRoot);
    const dirReal = await realpath(folder);
    if (dirReal !== rootReal && !dirReal.startsWith(rootReal + sep)) throw new ImageError('INVALID_CONFIG', 'Image asset path escapes data root');
    const destination = join(dirReal, `${assetId}.${image.format}`);
    const staging = join(dirReal, `.${assetId}.partial`);
    const metadataTmp = join(dirReal, `.${assetId}.json.partial`);
    const metadataPath = join(dirReal, `${assetId}.json`);
    let committed = false;
    try {
      await writeFile(staging, bytes, { flag: 'wx', mode: 0o600 });
      let probed;
      try { probed = await this.verify(staging); }
      catch (error) {
        if (error instanceof ImageError) throw error;
        throw new ImageError('IMAGE_PROBE_FAILED', 'Image validation tool failed', { cause: error });
      }
      if (probed.width !== image.width || probed.height !== image.height) throw new ImageError('INVALID_IMAGE', 'Image header and decoder dimensions do not match');
      if (signal?.aborted) throw new ImageError('CANCELLED', 'Image creation cancelled');
      const digest = createHash('sha256').update(bytes).digest('hex');
      // Avoid saving prompts or API credentials in metadata/logs. Prompt hash is enough for selective regen later.
      const data = { assetId, providerId, relativePath: relative(this.dataRoot, destination).replaceAll('\\', '/'), format: image.format, width: image.width, height: image.height, sha256: digest, sizeBytes: bytes.length, promptFingerprint: promptFingerprint ?? null, provenance, createdAt: new Date().toISOString() };
      await writeFile(metadataTmp, JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 });
      await rename(staging, destination);
      // If metadata commit fails, remove the unreferenced binary instead of leaving an apparently ready asset.
      await rename(metadataTmp, metadataPath);
      committed = true;
      return { assetId, relativePath: data.relativePath, providerId, format: image.format, width: image.width, height: image.height, sha256: digest, sizeBytes: bytes.length, metadataPath: relative(this.dataRoot, metadataPath).replaceAll('\\', '/') };
    } finally {
      await rm(staging, { force: true });
      await rm(metadataTmp, { force: true });
      if (!committed) await rm(destination, { force: true });
    }
  }
}

/** Paid approval is call-scoped and explicit: no remembered permissions in this spike.
 * A production approval ledger and pricing snapshot belong to EP02/EP12. */
export function authorize(adapter, { remoteConsent = false, paidApproval } = {}) {
  if (adapter.location === 'remote' && remoteConsent !== true) throw new ImageError('REMOTE_CONSENT_REQUIRED', 'Sending prompt to remote image API requires explicit consent');
  if (adapter.costTier !== 'local') {
    if (paidApproval?.confirmed !== true || paidApproval?.providerId !== adapter.id || !Number.isFinite(paidApproval?.estimatedUsd) || paidApproval.estimatedUsd < 0 || !Number.isFinite(paidApproval.maxUsd) || paidApproval.maxUsd < 0 || paidApproval.estimatedUsd > paidApproval.maxUsd) {
      throw new ImageError('COST_APPROVAL_REQUIRED', 'Metered/unknown-cost image API requires cost estimate and approval');
    }
  }
}
