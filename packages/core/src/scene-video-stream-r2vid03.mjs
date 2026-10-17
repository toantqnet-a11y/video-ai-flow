/** R2-VID-03: authenticated binary upload sink for genuine MP4/MOV up to 96MiB.
 * Network ingress is streamed to private scratch disk with an enforced byte
 * bound; final verified media is pinned by the existing SHA/SQLite manifest.
 * Never expose a user-selected filesystem path or trust the extension/MIME.
 */
import {createWriteStream} from 'node:fs';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {DomainError} from './domain.mjs';
import {runBinary} from './render-ffmpeg-r2ext04.mjs';
import {probeClipSource} from './clip-normalize-r3vid02.mjs';
import {probeVideo} from '../../../spikes/SP-VID-01/src/media.mjs';

export const MAX_STREAM_CLIP_BYTES=96*1024*1024;
const fail=(code,status=400)=>{throw new DomainError(code,status)};
const validInteger=n=>Number.isSafeInteger(n)&&n>0&&n<=1e9;

export async function importSceneVideoStream({clips,sceneId,stream,expectedRowVersion,container,ffmpeg='ffmpeg',ffprobe='ffprobe'}={}){
 if(!clips?.manifest||!clips.input||!stream||typeof stream[Symbol.asyncIterator]!=='function'||
  !validInteger(expectedRowVersion)||!['mp4','mov'].includes(container))fail('VIDEO_STREAM_IMPORT_INVALID');
 const e=clips.input(sceneId);
 if(e.policy.mediaType!=='import_video')fail('VIDEO_IMPORT_POLICY_REQUIRED',409);
 if(e.scene.rowVersion!==expectedRowVersion)fail('SCENE_ROW_VERSION_CONFLICT',409);
 const root=clips.manifest.dataRoot;
 const scratch=await mkdtemp(join(root,'clip-stream-'));
 try{
  const input=join(scratch,`incoming.${container}`);let total=0;
  // No unbounded `Buffer.concat`, base64 expansion or shared request body.
  async function* bounded(source){
   for await(const item of source){
    const chunk=Buffer.from(item);total+=chunk.length;
    if(total>MAX_STREAM_CLIP_BYTES)fail('VIDEO_STREAM_IMPORT_TOO_LARGE',413);
    yield chunk;
   }
  }
  await pipeline(stream,bounded,createWriteStream(input,{flags:'wx',mode:0o600}));
  if(total<100)fail('VIDEO_STREAM_IMPORT_INVALID');
  const source=await probeClipSource(input,{ffprobe,run:runBinary});
  if(source.durationSeconds>300||source.fps>120||source.width>4096||source.height>4096||
    source.width*source.height*source.fps*source.durationSeconds>1_500_000_000)
    fail('VIDEO_STREAM_IMPORT_RESOURCE_LIMIT',413);
  // MOV/HEVC/ProRes require browser-compatible H264. Strip original audio
  // (voice narration is always a separate pinned asset at render time).
  let output=input,normalized=false;
  if(container==='mov'||source.sourceCodec!=='h264'){
   output=join(scratch,'normalized.mp4');normalized=true;
   await runBinary(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-i',input,
    '-map','0:v:0','-an','-sn','-dn','-c:v','libx264','-preset','ultrafast',
    '-crf','23','-pix_fmt','yuv420p','-movflags','+faststart','-y',output],
    {timeoutMs:Math.max(30000,source.durationSeconds*25000)});
  }
  const bytesInfo=await stat(output);
  if(bytesInfo.size<100||bytesInfo.size>MAX_STREAM_CLIP_BYTES)fail('VIDEO_STREAM_OUTPUT_TOO_LARGE',413);
  const verified=await probeVideo(output,{ffprobe});
  const originalHash=createHash('sha256').update(await readFile(input)).digest('hex');
  const metadata={source:'manual_import',durationMs:verified.durationMs,width:verified.width,
   height:verified.height,fps:verified.fps,codec:verified.codec,hasAudio:verified.hasAudio,
   originalContainer:container,originalSha256:originalHash,sourceCodec:source.sourceCodec,
   sourceHasAudio:source.embeddedAudio,locallyNormalized:normalized,streamed:true};
  const result=await clips.manifest.importBytes({sceneId,kind:'video',source:'manual_import',
   bytes:await readFile(output),extension:'.mp4',metadata,expectedRowVersion,
   onCommitted:assetId=>{
    clips.db.prepare("UPDATE scenes SET media_type='import_video' WHERE id=?").run(sceneId);
    clips.db.prepare('DELETE FROM scene_video_intents WHERE scene_id=?').run(sceneId);
    clips.db.prepare(`INSERT INTO scene_video_selections(scene_id,asset_id,selected_at)
     VALUES(?,?,?) ON CONFLICT(scene_id) DO UPDATE SET asset_id=excluded.asset_id,
     selected_at=excluded.selected_at`).run(sceneId,assetId,clips.clock());
   }});
  return {assetId:result.id,kind:'video',source:'manual_import',metadata,verified:true};
 }finally{await rm(scratch,{recursive:true,force:true});}
}
