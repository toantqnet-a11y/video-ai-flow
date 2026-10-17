/**
 * Video-asset façade. Only explicitly validated clips become usable revisions.
 * This spike does not expose HTTP write endpoints or paid provider routing.
 */
import { VideoError, assertProviderAllowed, validateRequest } from './contracts.mjs';
import { saveVideoRevision, importVideoRevision } from './media.mjs';

export class VideoAssetService {
  constructor({adapter, dataRoot, ffprobe='ffprobe'}={}) {
    if (!dataRoot) throw new VideoError('DATA_ROOT_REQUIRED');
    this.adapter = adapter;
    this.dataRoot = dataRoot;
    this.ffprobe = ffprobe;
  }
  /** Returns local immutable file revision; never promotes an unvalidated provider URL. */
  async generateScene({projectId, sceneId, request, policy={type:'local'}}, {signal, onProgress} = {}) {
    assertProviderAllowed(policy);
    validateRequest(request);
    if (!this.adapter) throw new VideoError('NO_VIDEO_PROVIDER');
    const result = await this.adapter.generate(request, {signal, onProgress});
    if (signal?.aborted) throw new VideoError('CANCELLED');
    return saveVideoRevision({dataRoot:this.dataRoot, projectId, sceneId,
      bytes:result.bytes, source:'ai_video', fingerprint:result.inputHash, ffprobe:this.ffprobe});
  }
  async importScene({projectId, sceneId, inputPath}) {
    return importVideoRevision({dataRoot:this.dataRoot, projectId, sceneId, inputPath, ffprobe:this.ffprobe});
  }
}

/**
 * Reuse SP-04 SQLite JobRunner exactly; no second queue.
 * WARNING: provider request may execute twice following a crash; SP-04 fences
 * DB asset records but cannot undo remote/local provider side effects.
 * Payload contains only nonsecret references or public text, never keys/bytes.
 */
export function createVideoJobHandler({service, loadInput}) {
  return async (payload, {signal}) => {
    const {projectId, sceneId, revisionId} = payload;
    const request = await loadInput(payload); // implement DB/vault resolver in ARC-01
    const saved = await service.generateScene({projectId, sceneId, request}, {signal});
    return {result:{assetId:saved.assetId, durationMs:saved.durationMs, source:'ai_video'},
      asset:{logicalKey:`video:${projectId}:${sceneId}:${revisionId}`,
        filePath:saved.filePath, checksum:saved.checksum}};
  };
}
