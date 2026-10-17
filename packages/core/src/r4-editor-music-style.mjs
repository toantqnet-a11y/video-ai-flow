/** R4-05/06/07 bounded, local-first enhancement primitives. Nothing invokes AI,
 * overwrites an immutable Composition revision, or silently changes a render.
 */
import {createHash} from 'node:crypto';
import {transact} from './db.mjs';
import {DomainError} from './domain.mjs';
import {validateTimedComposition} from './composition-timing-r2ext02.mjs';
import {runBinary,probeMp4} from './render-ffmpeg-r2ext04.mjs';
import {safePinnedPath} from './render-ffmpeg-r2ext04.mjs';
import {rename,rm,mkdir,stat} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';

const error=(code)=>{throw new DomainError(code,code.endsWith('CONFLICT')?409:400)};
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const validText=t=>typeof t==='string'&&t.trim().length>0&&t.length<=500&& !/[\x00-\x08\x0b-\x1f]/.test(t);
function ensureDoc(doc){validateTimedComposition(doc);if(!doc.readiness.ready)error('R4_COMPOSITION_NOT_READY');return doc;}
/** Preview subtitles without mutating approved narration. Multiple localized
 * cues may replace a full-scene caption, but cannot overflow the voice scene.
 */
export function previewSubtitleEdits(document,overrides=[]){
 const doc=ensureDoc(document);
 if(!Array.isArray(overrides)||overrides.length>1500)error('R4_SUBTITLE_INVALID');
 const scenes=new Map(doc.scenes.map(s=>[s.id,s]));const ids=new Set();const entries=[];
 for(const row of overrides){
  if(!row||typeof row.sceneId!=='string'||!scenes.has(row.sceneId)||ids.has(row.sceneId)||!Array.isArray(row.cues)||row.cues.length<1||row.cues.length>50)error('R4_SUBTITLE_INVALID');
  ids.add(row.sceneId);const scene=scenes.get(row.sceneId);let lastEnd=0;
  for(const cue of row.cues){
   if(!cue||Object.keys(cue).sort().join(',')!=='endFrame,startFrame,text'||!Number.isSafeInteger(cue.startFrame)||!Number.isSafeInteger(cue.endFrame)||cue.startFrame<lastEnd||cue.endFrame>scene.durationFrames||cue.startFrame>=cue.endFrame||!validText(cue.text))error('R4_SUBTITLE_INVALID');
   entries.push({sceneId:scene.id,startFrame:scene.startFrame+cue.startFrame,endFrame:scene.startFrame+cue.endFrame,text:cue.text});lastEnd=cue.endFrame;
  }
 }
 for(const scene of doc.scenes.filter(s=>!ids.has(s.id)))for(const cue of scene.captions.cues)
  entries.push({sceneId:scene.id,startFrame:scene.startFrame+cue.startFrame,endFrame:scene.startFrame+cue.endFrame,text:cue.text});
 entries.sort((a,b)=>a.startFrame-b.startFrame||a.endFrame-b.endFrame);
 const fps=doc.profile.fps;
 const ms=f=>Math.round(f*1000/fps);
 const clock=f=>{const time=ms(f),hours=Math.floor(time/3600000),minutes=Math.floor(time/60000)%60,seconds=Math.floor(time/1000)%60,remain=time%1000;return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')},${String(remain).padStart(3,'0')}`;};
 // Renderer ASS filter may treat HTML specially; SRT needs escaped visible text.
 const clean=t=>t.replace(/[\u202a-\u202e\u2066-\u2069]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 return {sourceDigest:doc.digest,overrides,frameRate:fps,digest:hash({v:1,sourceDigest:doc.digest,overrides}),cues:entries,
  srt:entries.map((e,i)=>`${i+1}\n${clock(e.startFrame)} --> ${clock(e.endFrame)}\n${clean(e.text)}\n`).join('\n')};
}
/** R4-05: version-guarded independent drafts, not active until an explicit
 * composition/render publishing step adopts them (not implemented yet). */
export class SubtitleDraftsR405{
 constructor(db){this.db=db;}
 get(videoId){const row=this.db.prepare('SELECT * FROM r4_subtitle_drafts WHERE video_id=?').get(videoId);
  return row?{revision:row.revision,sourceDigest:row.source_digest,overrides:JSON.parse(row.cues_json)}:{revision:0,sourceDigest:null,overrides:[]};}
 save(videoId,{document,overrides,expectedRevision}){
  const preview=previewSubtitleEdits(document,overrides);
  if(document.videoId!==videoId||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)error('R4_SUBTITLE_INVALID');
  transact(this.db,()=>{
   const current=this.get(videoId);if(current.revision!==expectedRevision)error('R4_SUBTITLE_VERSION_CONFLICT');
   const record=this.db.prepare('SELECT id FROM videos WHERE id=?').get(videoId);if(!record)error('R4_VIDEO_NOT_FOUND');
   this.db.prepare(`INSERT INTO r4_subtitle_drafts(video_id,revision,source_digest,cues_json,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(video_id) DO UPDATE SET revision=excluded.revision,source_digest=excluded.source_digest,cues_json=excluded.cues_json,updated_at=excluded.updated_at`).run(videoId,current.revision+1,document.digest,JSON.stringify(overrides),Date.now());
  });return {...this.get(videoId),srt:preview.srt};
 }
}
export function validateMusicMixSettings(input){
 if(!input||Object.keys(input).some(k=>!['volume','fadeInSeconds','fadeOutSeconds','loop','ducking'].includes(k))||
 !Number.isFinite(input.volume)||input.volume<0||input.volume>0.6||
 !Number.isFinite(input.fadeInSeconds)||input.fadeInSeconds<0||input.fadeInSeconds>15||
 !Number.isFinite(input.fadeOutSeconds)||input.fadeOutSeconds<0||input.fadeOutSeconds>15||
 input.loop!==true||(input.ducking!==undefined&&typeof input.ducking!=='boolean'))error('R4_MUSIC_SETTINGS_INVALID');
 return {...input};
}
/** R4-06: local optional second pass, source MP4 never overwritten.
 * Audio loops under narration, fades music only, avoids fake ducking claims.
 */
export async function mixMusicIntoMp4({sourceMp4,musicPin,dataRoot,targetMp4,seconds,settings,ffmpeg='ffmpeg',ffprobe='ffprobe',signal}={}){
 const cfg=validateMusicMixSettings(settings);
 if(!Number.isFinite(seconds)||seconds<=0||seconds>14400||cfg.fadeInSeconds+cfg.fadeOutSeconds>seconds)error('R4_MUSIC_DURATION_INVALID');
 if(resolve(sourceMp4)===resolve(targetMp4)||!targetMp4.endsWith('.mp4'))error('R4_MUSIC_TARGET_UNSAFE');
 const track=await safePinnedPath(dataRoot,musicPin);
 const staging=`${targetMp4}.${createHash('sha256').update(String(process.pid)+':'+String(Date.now())+':'+String(Math.random())).digest('hex').slice(0,14)}.r4-incomplete`;
 const existing=await stat(targetMp4).catch(()=>null);
 if(existing)error('R4_MUSIC_TARGET_EXISTS');
 await mkdir(dirname(targetMp4),{recursive:true});
 const fadeStart=Math.max(0,seconds-cfg.fadeOutSeconds);
 // Fixed sidechain compressor lowers music during voice; no untrusted
 // user filter strings or extra provider calls. Enabled only by explicit flag.
 const bed=`[1:a]volume=${cfg.volume},atrim=duration=${seconds},asetpts=N/SR/TB,afade=t=in:st=0:d=${cfg.fadeInSeconds},afade=t=out:st=${fadeStart}:d=${cfg.fadeOutSeconds}[music]`;
 const musicGraph=cfg.ducking?`[0:a]asplit=2[voice][side];${bed};[music][side]sidechaincompress=threshold=0.07:ratio=6:attack=40:release=450[ducked];[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0[aout]`:
 `${bed};[0:a][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
 try{
  await runBinary(ffmpeg,['-y','-v','error','-i',sourceMp4,'-stream_loop','-1','-i',track,'-filter_complex',musicGraph,'-map','0:v:0','-map','[aout]','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart','-t',String(seconds),'-f','mp4',staging],{signal,timeoutMs:Math.max(120000,seconds*2000)});
  const [meta,sourceMeta]=await Promise.all([probeMp4(staging,{ffprobe,signal}),probeMp4(sourceMp4,{ffprobe,signal})]);
  if(meta.videoCodec!=='h264'||meta.audioCodec!=='aac'||Math.abs(meta.durationSeconds-seconds)>0.3||
     meta.frameCount!==sourceMeta.frameCount||meta.width!==sourceMeta.width||meta.height!==sourceMeta.height)error('R4_MUSIC_QA_FAILED');
  // Detect music changed during encode; a pinned source must remain immutable.
  await safePinnedPath(dataRoot,musicPin);
  if((await stat(targetMp4).catch(()=>null)))error('R4_MUSIC_TARGET_EXISTS');
  await rename(staging,targetMp4);return {output:targetMp4,metadata:meta,settings:cfg};
 }finally{await rm(staging,{force:true}).catch(()=>{});}
}
/** R4-07: deterministic consistency linter, never manufacture AI imagery.
 * Empty voice/visual/style evidence must be flagged, not silently filled. */
export function inspectVisualConsistency({scenes,styleProfile,assetEvidence=null}){
 if(!Array.isArray(scenes)||scenes.length>1500||!styleProfile||typeof styleProfile!=='object'||
 typeof styleProfile.styleToken!=='string'||!(/^[a-z0-9][a-z0-9-]{1,62}$/i.test(styleProfile.styleToken))||
 !Array.isArray(styleProfile.characterTokens)||styleProfile.characterTokens.length>20||styleProfile.characterTokens.some(t=>typeof t!=='string'||!(/^[a-z0-9][a-z0-9-]{1,62}$/i.test(t))))error('R4_STYLE_PROFILE_INVALID');
 const warnings=[];for(const scene of scenes){if(!scene||typeof scene.id!=='string')error('R4_STYLE_SCENES_INVALID');
  const prompt=String(scene.visualPrompt??'').toLowerCase();if(!prompt.includes(styleProfile.styleToken.toLowerCase()))warnings.push({sceneId:scene.id,code:'STYLE_TOKEN_MISSING'});
  for(const token of styleProfile.characterTokens)if(prompt.includes(token.toLowerCase())&& !scene.visualAssetId)warnings.push({sceneId:scene.id,code:'CHARACTER_IMAGE_UNRENDERED',token});
  if(!scene.visualAssetId)warnings.push({sceneId:scene.id,code:'VISUAL_ASSET_MISSING'});
  const health=assetEvidence?.find(x=>x.sceneId===scene.id);
  if(assetEvidence&&scene.visualAssetId&&(!health||health.health!=='healthy'))warnings.push({sceneId:scene.id,code:'VISUAL_ASSET_UNHEALTHY'});
 }
 const inspected=assetEvidence?.filter(x=>x.health==='healthy').length??null;
 return {profileDigest:hash(styleProfile),sceneCount:scenes.length,warnings,ready:warnings.length===0,
  assetEvidence:assetEvidence?{checked:assetEvidence.length,healthy:inspected,missingOrCorrupt:assetEvidence.length-inspected,identityVerified:false}:null,
  note:'Validates real media checksum health plus prompt tokens; no proof of character identity, image similarity or model consistency.'};
}
