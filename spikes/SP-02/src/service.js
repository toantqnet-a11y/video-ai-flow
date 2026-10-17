import { mkdir, writeFile, rename, rm, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TtsError, normalizeError } from './errors.js';
import { validateSpeechRequest } from './validation.js';
import { detectAudioFormat, probeAudio } from './audio.js';

/**
 * Scene-level output ownership: adapters only generate bytes; the service atomically
 * commits a new immutable asset version and never replaces an existing voice file.
 * Later queue/SQLite integration (EP12) will store the returned version/path.
 */
export class TtsService {
  constructor({ dataRoot, adapters, probe = probeAudio, verifyAudio = true, logger = () => {} }) {
    if (!dataRoot || !Array.isArray(adapters) || !adapters.length) throw new TtsError('INVALID_CONFIG', 'Data root and at least one provider required');
    this.dataRoot = resolve(dataRoot);
    this.adapters = adapters;
    this.probe = probe;
    this.verifyAudio = verifyAudio;
    this.logger = logger;
  }
  /**
   * @param {{projectId:string,sceneId:string,text:string,voice?:string,rate?:number,voiceByProvider?:Object}} request
   * @param {{signal?:AbortSignal, providerIds?:string[]}} options
   * @returns {Promise<{assetId:string,path:string,providerId:string,voice:string,format:string,durationSec:number|null,attempts:Array}>}
   */
  async synthesize(request, { signal, providerIds } = {}) {
    validateSpeechRequest(request);
    if (signal?.aborted) throw new TtsError('CANCELLED', 'Speech request cancelled');
    // Explicit provider list is a policy choice; no unseen paid or remote fallback.
    const candidates = providerIds ? providerIds.map(id => this.adapters.find(p => p.id === id)) : this.adapters;
    if (candidates.some(p => !p) || candidates.length === 0) throw new TtsError('INVALID_CONFIG', 'Provider routing contains unknown provider');
    const attempts = [];
    for (const provider of candidates) {
      if (!['local', 'unverified_free'].includes(provider.costTier)) throw new TtsError('PAID_NOT_APPROVED', 'Paid provider requires explicit approval');
      const voice = request.voiceByProvider?.[provider.id] ?? (provider.id === 'edge' ? request.voice : undefined) ?? provider.defaultVoice ?? provider.voices()?.[0]?.id;
      try {
        const result = await provider.synthesize({ text: request.text, voice, rate: request.rate ?? 0 }, { signal });
        if (signal?.aborted) throw new TtsError('CANCELLED', 'Speech request cancelled');
        const format = detectAudioFormat(result.bytes);
        if (format !== result.format) throw new TtsError('INVALID_AUDIO', 'Provider audio format disagrees with bytes', { retryable: true });
        const assetId = randomUUID();
        const directory = join(this.dataRoot, request.projectId, 'scenes', request.sceneId, 'audio');
        await mkdir(directory, { recursive: true });
        // Existing symlinked directories could otherwise escape the configured local data root.
        await mkdir(this.dataRoot, { recursive: true });
        const realRoot = await realpath(this.dataRoot);
        const realDir = await realpath(directory);
        if (!realDir.startsWith(realRoot + sep)) throw new TtsError('INVALID_CONFIG', 'Output path escapes data root');
        const finalPath = join(realDir, `${assetId}.${format}`);
        const tempPath = join(realDir, `.${assetId}.partial`);
        try {
          await writeFile(tempPath, result.bytes, { flag: 'wx', mode: 0o600 });
          const metadata = this.verifyAudio ? await this.probe(tempPath) : null;
          if (signal?.aborted) throw new TtsError('CANCELLED', 'Speech request cancelled');
          await rename(tempPath, finalPath);
          attempts.push({ providerId: provider.id, status: 'succeeded' });
          this.logger({ event: 'tts.asset.committed', providerId: provider.id, sceneId: request.sceneId, assetId });
          return { assetId, path: finalPath, providerId: provider.id, voice: result.voice ?? voice, format, durationSec: metadata?.durationSec ?? null, attempts };
        } finally { await rm(tempPath, { force: true }); }
      } catch (error) {
        const normalized = normalizeError(error);
        if (signal?.aborted || normalized.code === 'CANCELLED') throw new TtsError('CANCELLED', 'Speech request cancelled');
        attempts.push({ providerId: provider.id, status: 'failed', errorCode: normalized.code });
        this.logger({ event: 'tts.provider.failure', providerId: provider.id, sceneId: request.sceneId, code: normalized.code });
        if (!normalized.retryable || normalized.code === 'OUTPUT_TOO_LARGE') {
          normalized.attempts = attempts;
          throw normalized;
        }
      }
    }
    const failed = new TtsError('ALL_PROVIDERS_FAILED', 'No configured TTS provider generated valid audio', { retryable: true });
    failed.attempts = attempts;
    throw failed;
  }
}
