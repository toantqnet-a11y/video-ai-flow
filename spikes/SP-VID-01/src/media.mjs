/**
 * Trusted local ffprobe verification and bounded streaming for video assets.
 * A file extension is not evidence that a provider produced playable video.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { VideoError } from './contracts.mjs';

export const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

/** Download without trusting Content-Length; redirects always disabled by caller. */
export async function readBounded(response, maxBytes = MAX_VIDEO_BYTES) {
  if (!response.body) throw new VideoError('EMPTY_PROVIDER_MEDIA');
  const pieces = []; let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new VideoError('VIDEO_TOO_LARGE');
      pieces.push(Buffer.from(value));
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  return Buffer.concat(pieces, size);
}

/** ffprobe is invoked as a process with fixed arguments, never via a shell. */
export async function probeVideo(file, {ffprobe = 'ffprobe', timeoutMs = 15000} = {}) {
  const output = await new Promise((resolveResult, reject) => {
    const child = spawn(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], {shell: false, windowsHide: true});
    let out = '', err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', chunk => { out += chunk; if (out.length > 1_000_000) child.kill('SIGKILL'); });
    child.stderr.on('data', chunk => { err += chunk; if (err.length > 10_000) child.kill('SIGKILL'); });
    child.on('error', error => { clearTimeout(timer); reject(new VideoError('FFPROBE_UNAVAILABLE', error.message)); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolveResult(out) : reject(new VideoError('INVALID_VIDEO', 'ffprobe could not decode video')); });
  });
  let json;
  try { json = JSON.parse(output); } catch { throw new VideoError('INVALID_VIDEO'); }
  const video = json.streams?.find(stream => stream.codec_type === 'video');
  const sec = Number(video?.duration || json.format?.duration);
  if (!video || !Number.isFinite(sec) || sec <= 0 || sec > 600) throw new VideoError('INVALID_VIDEO', 'Missing/invalid video stream or duration');
  // We always save `.mp4`; reject WebM/MKV containers rather than mislabeling bytes.
  if (!String(json.format?.format_name ?? '').split(',').some(f => ['mov','mp4','m4a','3gp','3g2','mj2'].includes(f))) throw new VideoError('UNSUPPORTED_CONTAINER', 'Only MP4-compatible containers may be saved as .mp4');
  const fpsParts = String(video.avg_frame_rate || '0/1').split('/').map(Number);
  const fps = fpsParts[1] > 0 ? fpsParts[0] / fpsParts[1] : 0;
  return {durationMs: Math.round(sec * 1000), width: video.width, height: video.height,
    fps: Number(fps.toFixed(3)), codec: video.codec_name,
    hasAudio: json.streams.some(stream => stream.codec_type === 'audio')};
}

function safeId(id, field) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new VideoError('INVALID_ASSET_SCOPE', `Invalid ${field}`);
  return id;
}

/**
 * Stage+ffprobe+SHA before atomic rename. Never overwrite existing revisions;
 * DB asset-record commit is handled by the SP-04 store with lease fencing.
 * A crash can leave an orphan file to reconcile, NOT a corrupted active file.
 */
export async function saveVideoRevision({dataRoot, projectId, sceneId, bytes, source, fingerprint, ffprobe} = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_VIDEO_BYTES) throw new VideoError('INVALID_VIDEO_BYTES');
  if (!['ai_video', 'imported_video'].includes(source)) throw new VideoError('INVALID_MEDIA_SOURCE');
  safeId(projectId, 'projectId'); safeId(sceneId, 'sceneId');
  const assetId = randomUUID();
  const folder = join(resolve(dataRoot), projectId, 'scenes', sceneId, 'video');
  await mkdir(folder, {recursive:true});
  const finalVideo = join(folder, `${assetId}.mp4`);
  const stageVideo = join(folder, `.${assetId}.partial`);
  const metaPath = join(folder, `${assetId}.json`);
  const digest = createHash('sha256').update(bytes).digest('hex');
  try {
    await writeFile(stageVideo, bytes, {flag:'wx'});
    const info = await probeVideo(stageVideo, {ffprobe});
    // Atomic on same filesystem: readers never see a half-written MP4.
    await rename(stageVideo, finalVideo);
    await writeFile(metaPath, JSON.stringify({id:assetId, source, sha256:digest,
      durationMs:info.durationMs, width:info.width, height:info.height, fps:info.fps,
      codec:info.codec, hasAudio:info.hasAudio, fingerprint, createdAt:new Date().toISOString()}, null, 2), {flag:'wx'});
    return {assetId, filePath:finalVideo, metadataPath:metaPath, checksum:digest, ...info, source};
  } catch (error) {
    await rm(stageVideo, {force:true}).catch(()=>{});
    // If metadata commit fails, drop finished file; keep no silent half-revision.
    await rm(finalVideo, {force:true}).catch(()=>{});
    await rm(metaPath, {force:true}).catch(()=>{});
    throw error;
  }
}

/** Import an existing MP4 from an explicitly selected local file, never fetch an arbitrary URL. */
export async function importVideoRevision({dataRoot, projectId, sceneId, inputPath, ffprobe}) {
  const s = await stat(inputPath);
  if (!s.isFile() || s.size <= 0 || s.size > MAX_VIDEO_BYTES) throw new VideoError('INVALID_VIDEO_BYTES');
  return saveVideoRevision({dataRoot, projectId, sceneId, bytes:await readFile(inputPath), source:'imported_video', ffprobe});
}
