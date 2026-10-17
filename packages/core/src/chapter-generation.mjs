/**
 * R1-03 — Durable, revision-pinned parallel chapter generation.
 * WHY: a 35-minute script cannot be safely generated as one AI request.
 * Each model has an ordered chain of chapter jobs (continuity), while
 * independent model chains run concurrently on the existing SP-04 queue.
 * Queue completion fences stale workers; only successfully committed results
 * are projected into immutable chapter drafts. Never change master_script.
 */
import {randomUUID} from 'node:crypto';
import {transact} from './db.mjs';
import {DomainError} from './domain.mjs';
import {ContentBriefRepository,validateContentForGeneration} from './content-brief.mjs';
import {ContentOutlineRepository} from './content-outline.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
const isObject=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
const int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;

/** Strict model output: arbitrary HTML/control envelopes must not be trusted. */
export function normalizeChapterDraft(input){
  if(!isObject(input)||Object.keys(input).some(k=>!['text','summary','wordCount'].includes(k))||
    typeof input.text!=='string'||typeof input.summary!=='string')fail('INVALID_CHAPTER_RESPONSE');
  const text=input.text.trim(),summary=input.summary.trim();
  // Approximate lengths are guardrails, NOT assurances of target timing.
  if(text.length<100||text.length>45000||summary.length<12||summary.length>1800)
    fail('CHAPTER_LENGTH_INVALID');
  const wordCount=text.split(/\s+/u).filter(Boolean).length;
  return {text,summary,wordCount};
}

const publicBatch=row=>({id:row.id,videoId:row.video_id,briefRevision:row.brief_revision,
  outlineRevision:row.outline_revision,modelIds:JSON.parse(row.model_ids_json),createdAt:row.created_at});
export class ChapterGenerationRepository{
  constructor(repo,{store=null,allowRemoteModels=false}={}){this.repo=repo;this.db=repo.db;this.store=store;this.allowRemoteModels=allowRemoteModels;this.clock=repo.clock;
    this.briefs=new ContentBriefRepository(repo);this.outlines=new ContentOutlineRepository(repo);}
  model(modelId,{brief}={}){
    if(!validId(modelId))fail('CHAPTER_MODEL_INVALID');
    const row=this.db.prepare(`SELECT m.*,a.provider_id,a.status account_status,a.id account_id FROM provider_models m
      JOIN provider_accounts a ON a.id=m.account_id WHERE m.id=?`).get(modelId);
    // R1-03 deliberately fails closed on paid/remote execution: secure paid
    // dispatch, vault credentials and remote quotas require R1-07 integration.
    if(!row||row.kind!=='llm'||row.status!=='active'||row.account_status!=='active'||
       !(row.provider_id==='ollama'&&row.location==='local'&&row.cost_tier==='local')&&
       !(this.allowRemoteModels&&['gemini','groq','openrouter'].includes(row.provider_id)&&row.location==='remote'&&
         ['free_unverified','paid'].includes(row.cost_tier)))fail('CHAPTER_LOCAL_MODEL_REQUIRED',409);
    if(brief&&!brief.modelIds.includes(modelId))fail('CHAPTER_MODEL_NOT_IN_BRIEF',409);
    return row;
  }
  /** Store an immutable generation plan, then idempotently enqueue its DAG. */
  requestBatch(videoId,input={}){
    if(!isObject(input)||Object.keys(input).some(k=>!['briefRevision','outlineRevision','modelIds','requestKey'].includes(k))||
      !int(input.briefRevision,1,2147483647)||!int(input.outlineRevision,1,2147483647)||!validId(input.requestKey)||
      !Array.isArray(input.modelIds)||input.modelIds.length<1||input.modelIds.length>3||
      new Set(input.modelIds).size!==input.modelIds.length)fail('INVALID_CHAPTER_BATCH');
    const prior=this.db.prepare('SELECT * FROM content_generation_batches WHERE video_id=? AND request_key=?').get(videoId,input.requestKey);
    if(prior){
      if(prior.brief_revision!==input.briefRevision||prior.outline_revision!==input.outlineRevision||
        prior.model_ids_json!==JSON.stringify(input.modelIds))fail('CHAPTER_BATCH_CONFLICT',409);
      return this.enqueueBatch(prior);
    }
    const brief=this.briefs.revision(videoId,input.briefRevision).brief;
    if(!validateContentForGeneration(brief).valid)fail('CHAPTER_BRIEF_INCOMPLETE',409);
    const outline=this.outlines.revision(videoId,input.outlineRevision).outline;
    if(!outline.chapters.length)fail('CHAPTER_OUTLINE_REQUIRED',409);
    // A run uses saved (not unsaved) revisions and cannot silently generate
    // from a stale plan selected while the author was editing it.
    if(this.outlines.get(videoId).revision!==input.outlineRevision)fail('CHAPTER_OUTLINE_VERSION_CONFLICT',409);
    for(const id of input.modelIds)this.model(id,{brief});
    const source=this.briefs.get(videoId).inherited;
    const pinned={...brief,styleOverrides:{...source,...brief.styleOverrides}};
    const row={id:randomUUID(),video_id:videoId,request_key:input.requestKey,brief_revision:input.briefRevision,
      outline_revision:input.outlineRevision,model_ids_json:JSON.stringify(input.modelIds),
      brief_json:JSON.stringify(pinned),outline_json:JSON.stringify(outline),created_at:this.clock()};
    transact(this.db,()=>this.db.prepare(`INSERT INTO content_generation_batches
      (id,video_id,request_key,brief_revision,outline_revision,model_ids_json,brief_json,outline_json,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(row.id,row.video_id,row.request_key,row.brief_revision,row.outline_revision,
      row.model_ids_json,row.brief_json,row.outline_json,row.created_at));
    return this.enqueueBatch(row);
  }
  enqueueBatch(row){
    if(!this.store)fail('CHAPTER_QUEUE_UNAVAILABLE',503);
    const models=JSON.parse(row.model_ids_json),chapters=JSON.parse(row.outline_json).chapters;
    // Jobs are keyed deterministically. If enqueue fails after some insertions,
    // requesting the same batch again repairs missing jobs without duplicates.
    try {for(const modelId of models){let predecessor=null;
      for(let index=0;index<chapters.length;index++){
        const model=this.model(modelId);
        const payload={batchId:row.id,chapterIndex:index,modelId,providerModelId:modelId,providerAccountId:model.account_id};
        const job=this.store.enqueue({key:`chapter:${row.id}:${modelId}:${index}`,kind:'content:chapter',
          payload,deps:predecessor?[predecessor]:[],maxAttempts:3}).job;
        this.db.prepare(`INSERT OR IGNORE INTO content_generation_jobs(batch_id,model_id,chapter_idx,job_id)
          VALUES(?,?,?,?)`).run(row.id,modelId,index,job.id);
        predecessor=job.id;
      }
    }}catch{fail('CHAPTER_QUEUE_UNAVAILABLE',503)}
    return this.batch(row.video_id,row.id,{includeText:false});
  }
  /** Materialize only queue-fenced successes. JobStore owns authority for status. */
  batch(videoId,batchId,{includeText=true}={}){
    this.briefs.get(videoId);
    const row=this.db.prepare('SELECT * FROM content_generation_batches WHERE id=? AND video_id=?').get(batchId,videoId);
    if(!row)fail('CHAPTER_BATCH_NOT_FOUND',404);
    const jobs=this.db.prepare(`SELECT * FROM content_generation_jobs WHERE batch_id=?
      ORDER BY chapter_idx,model_id`).all(batchId);
    const chapters=JSON.parse(row.outline_json).chapters;
    const results=jobs.map(j=>{
      const job=this.store?.get(j.job_id);
      if(job?.status==='succeeded'&&job.result){
        const normalized=normalizeChapterDraft(job.result);
        // Materializing is idempotent after a crash; immutable drafts preserve
        // content even when the queue history is later archived.
        this.db.prepare(`INSERT OR IGNORE INTO content_chapter_drafts
          (batch_id,model_id,chapter_idx,text,summary,word_count,created_at) VALUES(?,?,?,?,?,?,?)`)
          .run(batchId,j.model_id,j.chapter_idx,normalized.text,normalized.summary,normalized.wordCount,this.clock());
      }
      const draft=this.db.prepare(`SELECT * FROM content_chapter_drafts
        WHERE batch_id=? AND model_id=? AND chapter_idx=?`).get(batchId,j.model_id,j.chapter_idx);
      // A stable variant ID lets scoring refer to the original immutable draft.
      if(draft)this.db.prepare(`INSERT OR IGNORE INTO content_draft_variants
        (id,batch_id,model_id,chapter_idx) VALUES(?,?,?,?)`)
        .run(randomUUID(),batchId,j.model_id,j.chapter_idx);
      const variant=draft?this.db.prepare(`SELECT id FROM content_draft_variants
        WHERE batch_id=? AND model_id=? AND chapter_idx=?`).get(batchId,j.model_id,j.chapter_idx):null;
      const status=draft?'succeeded':job?.status??'queued';
      return {variantId:variant?.id??null,modelId:j.model_id,chapterIndex:j.chapter_idx,chapterTitle:chapters[j.chapter_idx].title,
        targetWords:chapters[j.chapter_idx].targetWords,jobId:j.job_id,status,
        errorCode:status==='failed'?job?.last_error??'JOB_FAILED':null,
        wordCount:draft?.word_count??null,
        ...(includeText&&draft?{text:draft.text,summary:draft.summary}:{})};
    });
    const complete=results.length===chapters.length*JSON.parse(row.model_ids_json).length&&results.every(r=>r.status==='succeeded');
    return {...publicBatch(row),chapterCount:chapters.length,complete,
      counts:{total:results.length,succeeded:results.filter(r=>r.status==='succeeded').length,
        failed:results.filter(r=>r.status==='failed').length},results};
  }
  batches(videoId){this.briefs.get(videoId);
    return this.db.prepare("SELECT id FROM content_generation_batches WHERE video_id=? AND request_key NOT LIKE 'retry:%' ORDER BY created_at DESC LIMIT 30").all(videoId)
      .map(r=>{const b=this.batch(videoId,r.id,{includeText:false});return b;});}
  retryFailed(videoId,batchId){
    const batch=this.batch(videoId,batchId,{includeText:false});
    // Work topologically so blocked descendants only resume after their
    // ancestor is again queued. Never retry succeeded chapters.
    for(const modelId of batch.modelIds){
      for(const r of batch.results.filter(x=>x.modelId===modelId).sort((a,b)=>a.chapterIndex-b.chapterIndex)){
        if(r.status==='failed')this.store.retry(r.jobId);
      }
    }
    return this.batch(videoId,batchId,{includeText:false});
  }
}
