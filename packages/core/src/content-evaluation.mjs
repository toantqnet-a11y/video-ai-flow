/**
 * R1-04 / EP04 US-4.5 — immutable, per-chapter AI Judge evaluations.
 *
 * WHY: draft and evaluation history must survive retries/restarts, and model
 * scores are untrusted. We derive a weighted total on the server, never accept
 * a total supplied by the evaluator. Model invocation happens exclusively in
 * the existing SP-04 persistent queue and remains local-only until R1-07.
 */
import {randomUUID,createHash} from 'node:crypto';
import {DomainError} from './domain.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
const keys=(o,allowed)=>Object.keys(o).every(k=>allowed.includes(k));
const sha256=text=>createHash('sha256').update(text,'utf8').digest('hex');

// Rubric is versioned and immutable. Future versions must not recalculate old evaluations.
export const CONTENT_RUBRIC_V1=Object.freeze({
  version:1,
  criteria:Object.freeze([
    Object.freeze({id:'coherence',label:'Mạch lạc & cấu trúc',weight:25}),
    Object.freeze({id:'accuracy',label:'Tính chính xác',weight:25}),
    Object.freeze({id:'style',label:'Phù hợp phong cách',weight:20}),
    Object.freeze({id:'engagement',label:'Khả năng thu hút',weight:15}),
    Object.freeze({id:'completeness',label:'Đầy đủ ý chính',weight:15})
  ])
});

/** Strict schema; no unknown keys, missing criteria, NaN, or out-of-range data. */
export function normalizeEvaluation(raw,rubric=CONTENT_RUBRIC_V1){
  if(!object(raw)||!keys(raw,['criteria','feedback','suggestions'])||!object(raw.criteria)||
     !keys(raw.criteria,rubric.criteria.map(c=>c.id))||
     typeof raw.feedback!=='string'||raw.feedback.trim().length<10||raw.feedback.length>4000||
     !Array.isArray(raw.suggestions)||raw.suggestions.length<1||raw.suggestions.length>8||
     raw.suggestions.some(x=>typeof x!=='string'||x.trim().length<5||x.length>600))fail('EVALUATION_INVALID_OUTPUT');
  let weighted=0;const criteria={};
  for(const criterion of rubric.criteria){
    const value=raw.criteria[criterion.id];
    if(!object(value)||!keys(value,['score','feedback'])||
       typeof value.score!=='number'||!Number.isFinite(value.score)||value.score<0||value.score>10||
       typeof value.feedback!=='string'||value.feedback.trim().length<5||value.feedback.length>1200)
      fail('EVALUATION_INVALID_OUTPUT');
    criteria[criterion.id]={score:value.score,feedback:value.feedback.trim(),weight:criterion.weight};
    weighted+=value.score*criterion.weight/10;
  }
  // Server-owned score normalized to 0–100. The model cannot inflate its total.
  const total=Math.round(weighted*10)/10;
  return {rubricVersion:rubric.version,total,criteria,feedback:raw.feedback.trim(),
    suggestions:raw.suggestions.map(x=>x.trim())};
}

export class ContentEvaluationRepository{
  constructor(repo,{store=null,allowRemoteModels=false}={}){this.repo=repo;this.db=repo.db;this.store=store;this.allowRemoteModels=allowRemoteModels;this.clock=repo.clock;}
  /** Scope every lookup by video_id — untrusted callers cannot view other videos. */
  variant(videoId,variantId){
    if(!id(variantId))fail('EVALUATION_VARIANT_INVALID');
    if(!this.repo.getVideo(videoId))fail('VIDEO_NOT_FOUND',404);
    const row=this.db.prepare(`SELECT v.id,v.batch_id,v.model_id,v.chapter_idx,d.text,d.summary,d.word_count,
        b.video_id,b.outline_json FROM content_draft_variants v
        JOIN content_chapter_drafts d ON d.batch_id=v.batch_id AND d.model_id=v.model_id AND d.chapter_idx=v.chapter_idx
        JOIN content_generation_batches b ON b.id=v.batch_id
        WHERE v.id=? AND b.video_id=?`).get(variantId,videoId);
    if(!row)fail('EVALUATION_VARIANT_NOT_FOUND',404);
    return {...row,chapterTitle:JSON.parse(row.outline_json).chapters[row.chapter_idx].title};
  }
  /** Only enabled local Ollama LLMs can evaluate. No paid or remote fallback. */
  evaluator(modelId){
    if(!id(modelId))fail('EVALUATOR_MODEL_INVALID');
    const model=this.db.prepare(`SELECT m.*,a.provider_id,a.status AS account_status
      FROM provider_models m JOIN provider_accounts a ON a.id=m.account_id WHERE m.id=?`).get(modelId);
    if(!model||model.kind!=='llm'||model.status!=='active'||model.account_status!=='active'||
       !(model.provider_id==='ollama'&&model.location==='local'&&model.cost_tier==='local')&&
       !(this.allowRemoteModels&&['gemini','groq','openrouter'].includes(model.provider_id)&&model.location==='remote'&&
         ['free_unverified','paid'].includes(model.cost_tier)))
      fail('EVALUATOR_LOCAL_MODEL_REQUIRED',409);
    return model;
  }
  /** Create a durable job with a pinned source fingerprint and immutable rubric. */
  request(videoId,variantId,input={}){
    if(!object(input)||!keys(input,['evaluatorModelId','requestKey'])||
       !id(input.evaluatorModelId)||!id(input.requestKey))fail('INVALID_EVALUATION_REQUEST');
    const variant=this.variant(videoId,variantId);
    const existing=this.db.prepare(`SELECT * FROM content_evaluation_runs WHERE variant_id=? AND request_key=?`)
      .get(variantId,input.requestKey);
    if(existing){
      if(existing.evaluator_model_id!==input.evaluatorModelId||existing.draft_sha256!==sha256(variant.text))
        fail('EVALUATION_REQUEST_CONFLICT',409);
      return this.enqueue(existing);
    }
    this.evaluator(input.evaluatorModelId);
    const row={id:randomUUID(),video_id:videoId,variant_id:variantId,evaluator_model_id:input.evaluatorModelId,
      request_key:input.requestKey,rubric_version:CONTENT_RUBRIC_V1.version,draft_sha256:sha256(variant.text),created_at:this.clock()};
    this.db.prepare(`INSERT INTO content_evaluation_runs
      (id,video_id,variant_id,evaluator_model_id,request_key,rubric_version,draft_sha256,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(row.id,row.video_id,row.variant_id,row.evaluator_model_id,row.request_key,
      row.rubric_version,row.draft_sha256,row.created_at);
    return this.enqueue(row);
  }
  enqueue(row){
    if(!this.store)fail('EVALUATION_QUEUE_UNAVAILABLE',503);
    let job;
    try{job=this.store.enqueue({key:`eval:${row.id}`,kind:'content:evaluate',
      payload:{evaluationId:row.id,providerModelId:row.evaluator_model_id,providerAccountId:this.evaluator(row.evaluator_model_id).account_id},maxAttempts:2}).job;}
    catch{fail('EVALUATION_QUEUE_UNAVAILABLE',503)}
    this.db.prepare(`UPDATE content_evaluation_runs SET job_id=? WHERE id=? AND job_id IS NULL`).run(job.id,row.id);
    return this.get(row.video_id,row.variant_id,row.id);
  }
  /** Project only committed/fenced job successes into an immutable score row. */
  get(videoId,variantId,evaluationId){
    this.variant(videoId,variantId);
    if(!id(evaluationId))fail('EVALUATION_NOT_FOUND',404);
    const row=this.db.prepare(`SELECT * FROM content_evaluation_runs
      WHERE id=? AND variant_id=? AND video_id=?`).get(evaluationId,variantId,videoId);
    if(!row)fail('EVALUATION_NOT_FOUND',404);
    const job=row.job_id?this.store?.get(row.job_id):null;
    if(job?.status==='succeeded'&&job.result){
      const result=normalizeEvaluation(job.result);
      this.db.prepare(`INSERT OR IGNORE INTO content_evaluation_results
        (evaluation_id,score_total,result_json,created_at) VALUES(?,?,?,?)`)
        .run(row.id,result.total,JSON.stringify(result),this.clock());
    }
    const saved=this.db.prepare('SELECT * FROM content_evaluation_results WHERE evaluation_id=?').get(row.id);
    const status=saved?'succeeded':job?.status??'pending';
    return {id:row.id,videoId:row.video_id,variantId:row.variant_id,evaluatorModelId:row.evaluator_model_id,
      rubricVersion:row.rubric_version,jobId:row.job_id,status,errorCode:status==='failed'?job?.last_error??'EVALUATION_FAILED':null,
      result:saved?JSON.parse(saved.result_json):null,createdAt:row.created_at};
  }
  list(videoId,variantId){this.variant(videoId,variantId);
    return this.db.prepare(`SELECT id FROM content_evaluation_runs
      WHERE video_id=? AND variant_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100`).all(videoId,variantId)
      .map(row=>this.get(videoId,variantId,row.id));
  }
  retry(videoId,variantId,evaluationId){
    const row=this.get(videoId,variantId,evaluationId);
    if(row.status!=='failed')fail('EVALUATION_RETRY_NOT_ALLOWED',409);
    this.evaluator(row.evaluatorModelId);
    if(!row.jobId||!this.store)fail('EVALUATION_QUEUE_UNAVAILABLE',503);
    try{this.store.retry(row.jobId);}catch{fail('EVALUATION_RETRY_NOT_ALLOWED',409)}
    return this.get(videoId,variantId,evaluationId);
  }
}
