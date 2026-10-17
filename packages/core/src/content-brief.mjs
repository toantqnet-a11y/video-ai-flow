/**
 * EP04 / R1-01: content brief is the durable, versioned INPUT to generation.
 * Generation (R1-02+) must pin a specific immutable brief revision; editing
 * the form must never mutate a running AI job or replace the master script.
 */
import {transact} from './db.mjs';
import {DomainError} from './domain.mjs';
// Script recipe IDs are static; the actual recipe remains in script-skills-r1ext01.

const err=(code,status=400)=>{throw new DomainError(code,status)};
const fields={topic:500,idea:10000,sourceText:100000,freePrompt:10000};
const styleFields={style:120,tone:120,audience:250,language:40};
const plainObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const whole=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;

/** Strict shape validation: no unrecognized provider flags, credentials or prompt roles. */
export function normalizeContentBrief(input){
  if(!plainObject(input)||Object.keys(input).some(k=>!['topic','idea','sourceText','freePrompt','target','styleOverrides','modelIds','scriptSkillId'].includes(k)))err('INVALID_CONTENT_BRIEF');
  const brief={};
  brief.scriptSkillId=input.scriptSkillId??'educational';
  if(!['educational','storytelling','analysis','review','shorts'].includes(brief.scriptSkillId))err('INVALID_SCRIPT_SKILL');
  for(const [name,max] of Object.entries(fields)){
    const value=input[name]??'';
    if(typeof value!=='string'||value.length>max)err('INVALID_CONTENT_FIELD_'+name.toUpperCase());
    brief[name]=value.trim();
  }
  const t=input.target??{};
  if(!plainObject(t)||Object.keys(t).some(k=>!['mode','durationMinutes','wordCount','wpm','chapterTargetWords'].includes(k)))err('INVALID_CONTENT_TARGET');
  const mode=t.mode??'duration',wpm=t.wpm??145,chapterTargetWords=t.chapterTargetWords??1100;
  if(!['duration','words'].includes(mode)||!whole(wpm,100,200)||!whole(chapterTargetWords,500,2000))err('INVALID_CONTENT_TARGET');
  const durationMinutes=t.durationMinutes??35,wordCount=t.wordCount??5075;
  if(!whole(durationMinutes,1,120)||!whole(wordCount,200,20000))err('INVALID_CONTENT_TARGET');
  brief.target={mode,durationMinutes,wordCount,wpm,chapterTargetWords};
  const overrides=input.styleOverrides??{};
  if(!plainObject(overrides)||Object.keys(overrides).some(k=>!Object.hasOwn(styleFields,k)))err('INVALID_STYLE_OVERRIDES');
  brief.styleOverrides={};
  for(const [name,value] of Object.entries(overrides)){
    if(typeof value!=='string'||value.length>styleFields[name])err('INVALID_STYLE_OVERRIDES');
    const trimmed=value.trim();
    if(trimmed)brief.styleOverrides[name]=trimmed;
  }
  const modelIds=input.modelIds??[];
  if(!Array.isArray(modelIds)||modelIds.length>3||new Set(modelIds).size!==modelIds.length||
     modelIds.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)))err('INVALID_CONTENT_MODELS');
  brief.modelIds=[...modelIds];
  return brief;
}

/** Deterministic projection only. Actual video length follows measured TTS duration. */
export function estimateContent(brief){
  const {mode,durationMinutes,wordCount,wpm,chapterTargetWords}=brief.target;
  const targetWords=mode==='duration'?Math.round(durationMinutes*wpm):wordCount;
  return {targetWords,estimatedMinutes:Number((targetWords/wpm).toFixed(1)),
    chapterCount:Math.ceil(targetWords/chapterTargetWords),chapterTargetWords,wpm,
    isEstimate:true,recommendOutline:targetWords/wpm>8};
}

export function validateContentForGeneration(brief){
  const errors=[];
  if(![brief.topic,brief.idea,brief.sourceText].some(v=>v.trim().length>0))errors.push('CONTENT_SOURCE_REQUIRED');
  if(brief.modelIds.length===0)errors.push('CONTENT_MODEL_REQUIRED');
  return {valid:errors.length===0,errors,estimate:estimateContent(brief)};
}

function initialBrief(video){
  const preset=video.effectivePreset?.content??video.preset?.content??{};
  return normalizeContentBrief({topic:'',idea:video.brief??'',sourceText:'',freePrompt:'',
    target:{mode:'duration',durationMinutes:Math.min(120,Math.max(1,Math.round((video.targetDurationSec??2100)/60))),wordCount:5075,wpm:145,chapterTargetWords:1100},
    styleOverrides:{},modelIds:[]});
}

export class ContentBriefRepository{
  constructor(repo){this.repo=repo;this.db=repo.db;this.clock=repo.clock;}
  get(videoId){
    const video=this.repo.getVideo(videoId);
    if(!video||video.deletedAt!==null)err('VIDEO_NOT_FOUND',404);
    const row=this.db.prepare('SELECT * FROM content_briefs WHERE video_id=?').get(videoId);
    const brief=row?JSON.parse(row.data_json):initialBrief(video);
    // The video-level effective preset is an immutable snapshot + explicit
    // overrides, not the latest mutable channel preset.
    const preset=video.effectivePreset?.content??video.preset?.content??{};
    return {videoId,revision:row?.revision??0,brief,estimate:estimateContent(brief),
      inherited:{style:preset.style??'',tone:preset.tone??'',audience:preset.audience??'',language:preset.language??'vi'},
      updatedAt:row?.updated_at??null};
  }
  history(videoId){
    this.get(videoId); // ownership and tombstone validation
    return this.db.prepare('SELECT revision,created_at FROM content_brief_revisions WHERE video_id=? ORDER BY revision DESC LIMIT 100')
      .all(videoId).map(r=>({revision:r.revision,createdAt:r.created_at}));
  }
  revision(videoId,revision){
    this.get(videoId);
    if(!whole(revision,1,2147483647))err('INVALID_CONTENT_REVISION');
    const r=this.db.prepare('SELECT * FROM content_brief_revisions WHERE video_id=? AND revision=?').get(videoId,revision);
    if(!r)err('CONTENT_REVISION_NOT_FOUND',404);
    return {videoId,revision,brief:JSON.parse(r.data_json),createdAt:r.created_at};
  }
  /** Optimistic lock + immutable history in one SQLite transaction. */
  save(videoId,input){
    if(!plainObject(input)||!whole(input.expectedRevision,0,2147483647)||!Object.hasOwn(input,'brief')||
       Object.keys(input).some(k=>!['expectedRevision','brief'].includes(k)))err('INVALID_CONTENT_REQUEST');
    const brief=normalizeContentBrief(input.brief);
    let unchanged=false;
    transact(this.db,()=>{
      const video=this.repo.getVideo(videoId);
      if(!video||video.deletedAt!==null)err('VIDEO_NOT_FOUND',404);
      const row=this.db.prepare('SELECT * FROM content_briefs WHERE video_id=?').get(videoId);
      if((row?.revision??0)!==input.expectedRevision)err('CONTENT_VERSION_CONFLICT',409);
      const serialized=JSON.stringify(brief);
      if(row?.data_json===serialized){unchanged=true;return;}
      const revision=input.expectedRevision+1,now=this.clock();
      // Never emit source text or free prompt to audit events or API logs.
      this.db.prepare('INSERT INTO content_brief_revisions(video_id,revision,data_json,created_at) VALUES(?,?,?,?)')
        .run(videoId,revision,serialized,now);
      this.db.prepare(`INSERT INTO content_briefs(video_id,revision,data_json,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(video_id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json,updated_at=excluded.updated_at`)
        .run(videoId,revision,serialized,now);
      this.repo.event('video',videoId,'content.brief.saved',{revision});
    });
    return {...this.get(videoId),unchanged};
  }
  validate(videoId,input){
    this.get(videoId);
    const brief=normalizeContentBrief(input);
    const status=validateContentForGeneration(brief);
    const availableIds=new Set(this.db.prepare(`SELECT m.id FROM provider_models m
      JOIN provider_accounts a ON a.id=m.account_id
      WHERE m.kind='llm' AND m.status='active' AND a.status='active'`).all().map(r=>r.id));
    const unavailable=brief.modelIds.filter(id=>!availableIds.has(id));
    // A selected model may be paid or lack quota; this endpoint NEVER grants
    // generation permission. Later job dispatch must recheck cost policy.
    if(unavailable.length)status.errors.push('CONTENT_MODEL_UNAVAILABLE');
    return {valid:status.errors.length===0,errors:[...new Set(status.errors)],estimate:status.estimate,
      modelIdsAvailable:brief.modelIds.filter(id=>availableIds.has(id)),
      requiresPaidApproval:brief.modelIds.some(id=>this.db.prepare("SELECT cost_tier FROM provider_models WHERE id=?").get(id)?.cost_tier==='paid'),
      willGenerate:false};
  }
  estimate(videoId,input){this.get(videoId);return estimateContent(normalizeContentBrief(input));}
}
