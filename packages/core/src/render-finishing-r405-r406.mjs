/** R4-05/06: explicit, immutable render finishing selections.
 * A subtitle draft cannot alter signed-off narration or Composition v2; its
 * validated cues are overlays pinned separately to the queued render snapshot.
 */
import {createHash} from 'node:crypto';
import {DomainError} from './domain.mjs';
import {previewSubtitleEdits,validateMusicMixSettings} from './r4-editor-music-style.mjs';
const fail=(code,status=400)=>{throw new DomainError(code,status)};
const sha=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
const keys=(x,allowed)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>allowed.includes(k));

export function prepareSubtitleRenderPlan(document,draft){
 if(!draft)return null;
 if(!Number.isSafeInteger(draft.revision)||draft.revision<1||draft.sourceDigest!==document.digest||!Array.isArray(draft.overrides))
  fail('R4_SUBTITLE_SOURCE_STALE',409);
 const p=previewSubtitleEdits(document,draft.overrides);
 if(Buffer.byteLength(p.srt,'utf8')>5_000_000)fail('RENDER_SUBTITLE_TOO_LARGE');
 return {draftRevision:draft.revision,sourceDigest:document.digest,digest:p.digest,srt:p.srt,cues:p.cues};
}
export function validateRenderMusic(music){
 if(music===undefined||music===null)return null;
 if(!keys(music,['pin','settings'])||!keys(music.pin,['relativePath','sha256','bytes','id','kind'])||
    !keys(music.settings,['volume','fadeInSeconds','fadeOutSeconds','loop','ducking']))fail('R4_MUSIC_REQUEST_INVALID');
 const p=music.pin;
 if(typeof p.relativePath!=='string'||!/^music\/[A-Za-z0-9-]{1,100}\/[a-f0-9]{64}\.(?:mp3|wav|m4a)$/.test(p.relativePath)||
  !/^[a-f0-9]{64}$/.test(p.sha256)||!Number.isSafeInteger(p.bytes)||p.bytes<=0||p.bytes>50*1024*1024||
  (p.id!==undefined&&typeof p.id!=='string')||(p.kind!==undefined&&p.kind!=='music'))fail('R4_MUSIC_REQUEST_INVALID');
 const settings=validateMusicMixSettings(music.settings);
 return {pin:{relativePath:p.relativePath,sha256:p.sha256,bytes:p.bytes},settings};
}
export function renderMusicDigest({baseRelativePath,music}){
 if(!/^[a-f0-9]{64}\.mp4$/.test(baseRelativePath?.split('/').at(-1)))fail('R4_MUSIC_BASE_INVALID');
 return sha({v:1,baseRelativePath,music});
}
