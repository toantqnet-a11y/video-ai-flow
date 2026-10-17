/**
 * R2-01 (EP05) — deterministic, lossless Scene Builder.
 *
 * WHY: narration/subtitles may contain Vietnamese punctuation, paragraph breaks,
 * quotes, or intentional whitespace. We store UTF-16 source offsets and require
 * exact coverage of the *approved* immutable Master Script, so a split cannot
 * silently remove a single character. Timing is advisory until TTS/ffprobe.
 * Scene revisions record intentional edits and provenance without invoking AI.
 */
import {createHash,randomUUID} from 'node:crypto';
import {transact} from './db.mjs';
import {DomainError} from './domain.mjs';

const err=(code,status=400)=>{throw new DomainError(code,status)};
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const mediaTypes=new Set(['image_motion','ai_video','import_video']);
export const DEFAULT_SPLIT_OPTIONS=Object.freeze({targetSeconds:18,minSeconds:4,maxSeconds:45,wpm:145,mediaType:'image_motion'});
const wordCount=text=>text.trim().split(/\s+/u).filter(Boolean).length;
const timing=(text,wpm)=>Math.max(500,Math.min(120000,Math.round(wordCount(text)*60000/wpm)));

function splitOptions(options={}){
  if(!plain(options)||Object.keys(options).some(k=>!Object.keys(DEFAULT_SPLIT_OPTIONS).includes(k)))err('INVALID_SCENE_OPTIONS');
  const opt={...DEFAULT_SPLIT_OPTIONS,...options};
  if(!integer(opt.targetSeconds,3,90)||!integer(opt.minSeconds,1,40)||!integer(opt.maxSeconds,3,120)||
    opt.minSeconds>opt.targetSeconds||opt.targetSeconds>opt.maxSeconds||!integer(opt.wpm,70,250)||!mediaTypes.has(opt.mediaType))err('INVALID_SCENE_OPTIONS');
  return opt;
}

/**
 * Find *suggested* sentence ends. Preserve all whitespace after punctuation in
 * the previous span. Dot between digits is not a sentence end; punctuation
 * followed by letters (e.g. abbreviations) remains inside its phrase.
 */
function candidateEnds(script){
  const ends=[];
  for(let i=0;i<script.length;i++){
    const c=script[i],n=script[i+1];
    const punctuation=/[.!?…]/u.test(c) && (i===script.length-1 || /\s/u.test(n)) &&
      !(c==='.'&&/\d/u.test(script[i-1]??'')&&/\d/u.test(n??''));
    const paragraph=c==='\n'&&(/\r?\n/u.test(script.slice(i+1,i+3))||i===script.length-1);
    if(!punctuation&&!paragraph)continue;
    let end=i+1;
    while(end<script.length && /\s/u.test(script[end]))end++;
    if(end>0&&end<script.length && script[end-1]==='\r')end++;
    ends.push(Math.min(script.length,end));
    i=end-1;
  }
  ends.push(script.length);
  return [...new Set(ends)].sort((a,b)=>a-b);
}

/** Never cut inside a Unicode surrogate pair; choose whitespace if available. */
function safeCut(script,start,maxEnd){
  let end=Math.min(maxEnd,script.length);
  const near=script.slice(start,end);
  const breakAt=Math.max(near.lastIndexOf(' '),near.lastIndexOf('\n'),near.lastIndexOf('\t'));
  if(breakAt>Math.floor(near.length*.55))end=start+breakAt+1;
  if(end<script.length && /[\uD800-\uDBFF]/u.test(script[end-1]) && /[\uDC00-\uDFFF]/u.test(script[end]))end--;
  return end>start?end:Math.min(script.length,start+2);
}

/**
 * Synchronous segmentation has no AI/provider side effects.
 * Returns exact substrings and offsets (UTF-16 indices into approvedScript).
 */
export function segmentApprovedScript(approvedScript,settings={}){
  if(typeof approvedScript!=='string'||!approvedScript.trim()||approvedScript.length>300000)err('INVALID_APPROVED_SCRIPT');
  const options=splitOptions(settings),ends=candidateEnds(approvedScript);
  // Strict duration bound prevents later R2 worker receiving oversized TTS chunks.
  const targetWords=options.targetSeconds*options.wpm/60;
  const maxWords=options.maxSeconds*options.wpm/60;
  const maxChars=18000;
  const chunks=[];let start=0;
  while(start<approvedScript.length){
    let best=null,last=null;
    for(const end of ends){
      if(end<=start)continue;
      const body=approvedScript.slice(start,end),n=wordCount(body);
      if(body.length>maxChars||n>maxWords)break;
      last=end;
      if(n>=targetWords*.8){best=end;break;}
    }
    let end=best??last;
    if(!end){
      // One run-on sentence or long line: fall back to a space boundary.
      let cursor=start,words=0;
      while(cursor<approvedScript.length&&cursor-start<maxChars){
        while(cursor<approvedScript.length && /\s/u.test(approvedScript[cursor]))cursor++;
        while(cursor<approvedScript.length && !/\s/u.test(approvedScript[cursor]))cursor++;
        words++;
        if(words>=Math.max(1,Math.floor(targetWords)))break;
      }
      end=safeCut(approvedScript,start,Math.min(cursor||start+maxChars,start+maxChars));
    }
    // Reject whitespace-only fragments: attach the trailing whitespace to the
    // last valid scene instead of silently discarding it.
    if(!approvedScript.slice(end).trim())end=approvedScript.length;
    const text=approvedScript.slice(start,end);
    if(!text.trim()&&chunks.length){
      chunks.at(-1).sourceEnd=end;
      chunks.at(-1).text+=text;
      chunks.at(-1).durationMs=timing(chunks.at(-1).text,options.wpm);
    }else if(text.trim())chunks.push({sourceStart:start,sourceEnd:end,text,durationMs:timing(text,options.wpm),mediaType:options.mediaType,visualPrompt:''});
    start=end;
    if(chunks.length>1200)err('TOO_MANY_SCENES',422);
  }
  // No-op segmentation is not lossless unless *all* UTF-16 source bytes survive.
  if(chunks.map(c=>c.text).join('')!==approvedScript)err('SCENE_SEGMENTATION_LOSS',500);
  return {scenes:chunks,estimatedDurationMs:chunks.reduce((n,c)=>n+c.durationMs,0),options,lossless:true,wordCount:wordCount(approvedScript)};
}

/** Split scene at an exact source boundary; text edits are handled separately. */
export function splitSceneAt(scene,relativeOffset,wpm=145){
  if(!plain(scene)||!integer(relativeOffset,1,scene.text.length-1)||scene.sourceEnd-scene.sourceStart!==scene.text.length||
    !integer(scene.sourceStart,0,300000)||!integer(scene.sourceEnd,1,300000))err('INVALID_SCENE_SPLIT');
  if(relativeOffset>0&&/[\uD800-\uDBFF]/u.test(scene.text[relativeOffset-1])&&/[\uDC00-\uDFFF]/u.test(scene.text[relativeOffset]))err('INVALID_SCENE_SPLIT');
  const left=scene.text.slice(0,relativeOffset),right=scene.text.slice(relativeOffset);
  if(!left.trim()||!right.trim())err('INVALID_SCENE_SPLIT');
  return [{...scene,text:left,sourceEnd:scene.sourceStart+relativeOffset,durationMs:timing(left,wpm)},
    {...scene,text:right,sourceStart:scene.sourceStart+relativeOffset,durationMs:timing(right,wpm)}];
}

/** Merge only adjoining unedited source regions; otherwise explicit editor review required. */
export function mergeAdjacentScenes(left,right,wpm=145){
  if(!plain(left)||!plain(right)||left.sourceEnd!==right.sourceStart||
    left.sourceEnd-left.sourceStart!==left.text.length||right.sourceEnd-right.sourceStart!==right.text.length)err('SCENES_NOT_MERGEABLE');
  const text=left.text+right.text;
  if(text.length>20000)err('SCENE_TEXT_TOO_LONG');
  return {...left,text,sourceEnd:right.sourceEnd,durationMs:timing(text,wpm)};
}

export function inspectSceneCoverage(script,scenes){
  if(!Array.isArray(scenes)||!scenes.length||scenes.length>1200)err('INVALID_SCENE_COUNT');
  let intentionalEdits=false;
  const spans=[];
  for(const s of scenes){
    if(!plain(s)||Object.keys(s).some(k=>!['sourceStart','sourceEnd','text','durationMs','mediaType','visualPrompt'].includes(k))||
      !integer(s.sourceStart,0,script.length)||!integer(s.sourceEnd,s.sourceStart+1,script.length)||
      typeof s.text!=='string'||!s.text.trim()||s.text.length>20000||!integer(s.durationMs,500,120000)||
      !mediaTypes.has(s.mediaType)||typeof s.visualPrompt!=='string'||s.visualPrompt.length>4000)err('INVALID_SCENE');
    spans.push(s);
    if(script.slice(s.sourceStart,s.sourceEnd)!==s.text)intentionalEdits=true;
  }
  const sorted=spans.toSorted((a,b)=>a.sourceStart-b.sourceStart);
  let position=0;
  for(const s of sorted){if(s.sourceStart!==position)err('SCENE_SOURCE_COVERAGE',409);position=s.sourceEnd;}
  if(position!==script.length)err('SCENE_SOURCE_COVERAGE',409);
  const reordered=spans.some((s,i)=>s!==sorted[i]);
  return {lossless:!intentionalEdits&&!reordered,intentionalEdits,reordered,requiresAcknowledgement:intentionalEdits||reordered,
    sourceSha256:sha(script),count:scenes.length,estimatedDurationMs:scenes.reduce((n,s)=>n+s.durationMs,0)};
}

export class SceneBuilderRepository {
  constructor(repo){this.repo=repo;this.db=repo.db;this.clock=repo.clock;}
  source(videoId){
    const video=this.repo.getVideo(videoId);
    if(!video||video.deletedAt!==null)err('VIDEO_NOT_FOUND',404);
    const state=this.db.prepare('SELECT approved_revision FROM content_master_state WHERE video_id=?').get(videoId);
    if(!state?.approved_revision)err('MASTER_NOT_APPROVED',409);
    const rev=this.db.prepare('SELECT script_text,script_sha256 FROM content_master_revisions WHERE video_id=? AND revision=?')
      .get(videoId,state.approved_revision);
    if(!rev||video.masterScript!==rev.script_text||sha(rev.script_text)!==rev.script_sha256)err('MASTER_SOURCE_MISMATCH',409);
    return {video,approvedRevision:state.approved_revision,script:rev.script_text,sha256:rev.script_sha256};
  }
  state(videoId){
    const s=this.source(videoId);
    const row=this.db.prepare('SELECT revision FROM scene_build_state WHERE video_id=?').get(videoId);
    return {videoId,approvedMasterRevision:s.approvedRevision,sourceSha256:s.sha256,sceneRevision:row?.revision??0,
      videoRowVersion:s.video.rowVersion,sceneCount:this.db.prepare('SELECT count(*) n FROM scenes WHERE video_id=?').get(videoId).n};
  }
  preview(videoId,body={}){
    const s=this.source(videoId),proposal=segmentApprovedScript(s.script,body.options??{});
    return {...this.state(videoId),...proposal,sourceLength:s.script.length};
  }
  history(videoId){
    this.source(videoId);
    return {items:this.db.prepare(`SELECT revision,master_revision,source_sha256,scene_count,created_at,
      acknowledge_edits,coverage_json FROM scene_build_revisions WHERE video_id=? ORDER BY revision DESC LIMIT 100`)
      .all(videoId).map(r=>({revision:r.revision,approvedMasterRevision:r.master_revision,sourceSha256:r.source_sha256,
        sceneCount:r.scene_count,createdAt:r.created_at,acknowledgedEdits:!!r.acknowledge_edits,coverage:JSON.parse(r.coverage_json)}))};
  }
  revision(videoId,number){
    this.source(videoId);
    if(!integer(number,1,2147483647))err('INVALID_SCENE_REVISION');
    const row=this.db.prepare('SELECT * FROM scene_build_revisions WHERE video_id=? AND revision=?').get(videoId,number);
    if(!row)err('SCENE_REVISION_NOT_FOUND',404);
    return {videoId,revision:row.revision,approvedMasterRevision:row.master_revision,
      sourceSha256:row.source_sha256,scenes:JSON.parse(row.scenes_json),coverage:JSON.parse(row.coverage_json),createdAt:row.created_at};
  }
  /** Atomic apply with a double version check; no asset regeneration or paid calls. */
  apply(videoId,body={}){
    if(!plain(body)||Object.keys(body).some(k=>!['approvedMasterRevision','expectedSceneRevision','videoRowVersion','acknowledgeEdits','scenes'].includes(k))||
      !integer(body.approvedMasterRevision,1,2147483647)||!integer(body.expectedSceneRevision,0,2147483647)||
      !integer(body.videoRowVersion,1,2147483647)||typeof body.acknowledgeEdits!=='boolean')err('INVALID_SCENE_COMMIT');
    let revision,coverage;
    transact(this.db,()=>{
      const source=this.source(videoId);
      const current=this.db.prepare('SELECT revision FROM scene_build_state WHERE video_id=?').get(videoId)?.revision??0;
      if(source.approvedRevision!==body.approvedMasterRevision||source.video.rowVersion!==body.videoRowVersion||current!==body.expectedSceneRevision)
        err('SCENE_VERSION_CONFLICT',409);
      coverage=inspectSceneCoverage(source.script,body.scenes);
      if(coverage.requiresAcknowledgement&&!body.acknowledgeEdits)err('SCENE_EDIT_REQUIRES_ACK',409);
      if(this.db.prepare('SELECT 1 FROM asset_revisions WHERE video_id=? LIMIT 1').get(videoId))err('SCENES_HAVE_ASSETS',409);
      const now=this.clock(),next=current+1;
      // All original scene UUIDs are replaced only before assets exist; reset
      // associated timeline to prevent dangling references and stale playback.
      this.db.prepare('DELETE FROM scenes WHERE video_id=?').run(videoId);
      const insert=this.db.prepare(`INSERT INTO scenes(id,video_id,idx,text,duration_ms,media_type,visual_prompt,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)`);
      for(const [idx,scene] of body.scenes.entries())insert.run(randomUUID(),videoId,idx,scene.text,scene.durationMs,scene.mediaType,scene.visualPrompt,now,now);
      this.db.prepare('UPDATE timeline_documents SET data_json=?,row_version=row_version+1,updated_at=? WHERE video_id=?')
        .run(JSON.stringify({tracks:['media','text','voice','music'],clips:[]}),now,videoId);
      this.db.prepare("UPDATE videos SET status='scenes_ready',last_active_step='scenes',row_version=row_version+1,updated_at=? WHERE id=?")
        .run(now,videoId);
      this.db.prepare(`INSERT INTO scene_build_revisions(video_id,revision,master_revision,source_sha256,scene_count,
        scenes_json,coverage_json,acknowledge_edits,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
        .run(videoId,next,source.approvedRevision,source.sha256,body.scenes.length,JSON.stringify(body.scenes),JSON.stringify(coverage),Number(body.acknowledgeEdits),now);
      this.db.prepare(`INSERT INTO scene_build_state(video_id,revision,updated_at) VALUES(?,?,?)
        ON CONFLICT(video_id) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at`).run(videoId,next,now);
      this.repo.event('video',videoId,'video.scene_builder_saved',{revision:next,count:body.scenes.length});
      revision=next;
    });
    return {state:this.state(videoId),coverage,scenes:this.repo.listScenes(videoId),revision};
  }
}
