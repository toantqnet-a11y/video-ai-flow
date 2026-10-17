/**
 * R1-05 / EP04 US-4.6 — revision-preserving Retry with Feedback.
 *
 * WHY: the existing chapter-generation tables already enforce immutable draft
 * bodies and provide stable IDs understood by the AI Judge. A retry is modeled
 * as a private, single-chapter generation batch, NOT a mutation of its source.
 * `retry:` batches are excluded from the ordinary multi-model batch browser.
 * The retry row pins the exact source variant, evaluator result and the user's
 * edited feedback; queue replays cannot silently change any of these inputs.
 * Only local Ollama models are allowed until R1-07 installs paid/remote guards.
 */
import {randomUUID,createHash} from 'node:crypto';
import {DomainError} from './domain.mjs';
import {transact} from './db.mjs';
import {ChapterGenerationRepository,normalizeChapterDraft} from './chapter-generation.mjs';
import {ContentEvaluationRepository} from './content-evaluation.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');

export class ContentRetryRepository {
  constructor(repo,{store=null,allowRemoteModels=false}={}){
    this.repo=repo;this.db=repo.db;this.store=store;this.clock=repo.clock;
    this.chapters=new ChapterGenerationRepository(repo,{store,allowRemoteModels});
    this.evaluations=new ContentEvaluationRepository(repo,{store,allowRemoteModels});
  }
  /** Enqueue one revision from a *successful* specific evaluation; no implicit approval. */
  request(videoId,sourceVariantId,input={}){
    if(!plain(input)||Object.keys(input).some(k=>!['evaluationId','modelId','feedback','requestKey'].includes(k))||
      !validId(sourceVariantId)||!validId(input.evaluationId)||!validId(input.modelId)||!validId(input.requestKey)||
      typeof input.feedback!=='string'||input.feedback.trim().length<10||input.feedback.length>4000)
      fail('INVALID_CONTENT_RETRY');
    const source=this.evaluations.variant(videoId,sourceVariantId);
    const evaluation=this.evaluations.get(videoId,sourceVariantId,input.evaluationId);
    if(evaluation.status!=='succeeded'||!evaluation.result)fail('CONTENT_RETRY_REQUIRES_SCORE',409);
    const old=this.db.prepare(`SELECT * FROM content_retry_runs WHERE source_variant_id=? AND request_key=?`)
      .get(sourceVariantId,input.requestKey);
    const feedback=input.feedback.trim();
    if(old){
      if(old.evaluation_id!==input.evaluationId||old.model_id!==input.modelId||old.feedback!==feedback||old.source_hash!==hash(source.text))
        fail('CONTENT_RETRY_REQUEST_CONFLICT',409);
      return this.enqueue(old);
    }
    const batch=this.db.prepare('SELECT * FROM content_generation_batches WHERE id=? AND video_id=?').get(source.batch_id,videoId);
    if(!batch)fail('CONTENT_RETRY_SOURCE_MISSING',409);
    const brief=JSON.parse(batch.brief_json);
    this.chapters.model(input.modelId,{brief}); // Reject paid/unregistered/ineligible models at dispatch boundary.
    const runId=randomUUID();
    const row={id:runId,video_id:videoId,source_variant_id:sourceVariantId,evaluation_id:input.evaluationId,
      model_id:input.modelId,request_key:input.requestKey,source_hash:hash(source.text),feedback,
      batch_id:randomUUID(),chapter_idx:source.chapter_idx,created_at:this.clock()};
    // Atomic metadata creation prevents orphaned private chapter batches.
    transact(this.db,()=>{
      this.db.prepare(`INSERT INTO content_generation_batches
        (id,video_id,request_key,brief_revision,outline_revision,model_ids_json,brief_json,outline_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(row.batch_id,videoId,`retry:${row.id}`,batch.brief_revision,
          batch.outline_revision,JSON.stringify([input.modelId]),batch.brief_json,batch.outline_json,row.created_at);
      this.db.prepare(`INSERT INTO content_retry_runs
        (id,video_id,source_variant_id,evaluation_id,model_id,request_key,source_hash,feedback,batch_id,chapter_idx,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(row.id,row.video_id,row.source_variant_id,row.evaluation_id,row.model_id,
          row.request_key,row.source_hash,row.feedback,row.batch_id,row.chapter_idx,row.created_at);
    });
    return this.enqueue(row);
  }
  enqueue(row){
    if(!this.store)fail('CONTENT_RETRY_QUEUE_UNAVAILABLE',503);
    let job;
    try{
      job=this.store.enqueue({key:`content-retry:${row.id}`,kind:'content:retry',payload:{retryId:row.id,providerModelId:row.model_id,providerAccountId:this.chapters.model(row.model_id).account_id},maxAttempts:2}).job;
    }catch{fail('CONTENT_RETRY_QUEUE_UNAVAILABLE',503)}
    this.db.prepare('UPDATE content_retry_runs SET job_id=? WHERE id=? AND job_id IS NULL').run(job.id,row.id);
    // The standard chapter projector can materialize retry results because the
    // private batch is a real chapter batch with the same immutable constraints.
    this.db.prepare(`INSERT OR IGNORE INTO content_generation_jobs(batch_id,model_id,chapter_idx,job_id)
      VALUES(?,?,?,?)`).run(row.batch_id,row.model_id,row.chapter_idx,job.id);
    return this.get(row.video_id,row.source_variant_id,row.id);
  }
  /** Job result is visible only after the queue's fencing/commit succeeds. */
  get(videoId,sourceVariantId,retryId){
    this.evaluations.variant(videoId,sourceVariantId);
    if(!validId(retryId))fail('CONTENT_RETRY_NOT_FOUND',404);
    const row=this.db.prepare(`SELECT * FROM content_retry_runs WHERE id=? AND video_id=? AND source_variant_id=?`)
      .get(retryId,videoId,sourceVariantId);
    if(!row)fail('CONTENT_RETRY_NOT_FOUND',404);
    const job=row.job_id?this.store?.get(row.job_id):null;
    if(job?.status==='succeeded'&&job.result){
      normalizeChapterDraft(job.result);
      this.chapters.batch(videoId,row.batch_id,{includeText:false});
    }
    const variant=this.db.prepare(`SELECT v.id,d.text,d.summary,d.word_count FROM content_draft_variants v
      JOIN content_chapter_drafts d ON d.batch_id=v.batch_id AND d.model_id=v.model_id AND d.chapter_idx=v.chapter_idx
      WHERE v.batch_id=? AND v.model_id=? AND v.chapter_idx=?`).get(row.batch_id,row.model_id,row.chapter_idx);
    const status=variant?'succeeded':job?.status??'pending';
    return {id:row.id,videoId:row.video_id,sourceVariantId:row.source_variant_id,evaluationId:row.evaluation_id,
      modelId:row.model_id,feedback:row.feedback,variantId:variant?.id??null,chapterIndex:row.chapter_idx,
      jobId:row.job_id,status,errorCode:status==='failed'?job?.last_error??'CONTENT_RETRY_FAILED':null,
      createdAt:row.created_at,wordCount:variant?.word_count??null,
      text:variant?.text??null,summary:variant?.summary??null};
  }
  list(videoId,sourceVariantId){this.evaluations.variant(videoId,sourceVariantId);
    return this.db.prepare(`SELECT id FROM content_retry_runs WHERE video_id=? AND source_variant_id=?
      ORDER BY created_at DESC,rowid DESC LIMIT 100`).all(videoId,sourceVariantId)
      .map(row=>this.get(videoId,sourceVariantId,row.id));
  }
  retryFailed(videoId,sourceVariantId,retryId){
    const row=this.get(videoId,sourceVariantId,retryId);
    if(row.status!=='failed'||!row.jobId||!this.store)fail('CONTENT_RETRY_NOT_RETRYABLE',409);
    const source=this.evaluations.variant(videoId,sourceVariantId);
    const run=this.db.prepare('SELECT * FROM content_retry_runs WHERE id=?').get(retryId);
    if(hash(source.text)!==run.source_hash)fail('CONTENT_RETRY_SOURCE_CHANGED',409);
    const batch=this.db.prepare('SELECT brief_json FROM content_generation_batches WHERE id=?').get(run.batch_id);
    this.chapters.model(row.modelId,{brief:JSON.parse(batch.brief_json)});
    try{this.store.retry(row.jobId)}catch{fail('CONTENT_RETRY_NOT_RETRYABLE',409)}
    return this.get(videoId,sourceVariantId,retryId);
  }
  compare(videoId,sourceVariantId,retryId){
    const source=this.evaluations.variant(videoId,sourceVariantId),retry=this.get(videoId,sourceVariantId,retryId);
    return {source:{variantId:sourceVariantId,text:source.text,wordCount:source.word_count},retry};
  }
}
