/**
 * EP04 / R1-02 — CT02 outline and versioned chapter planning.
 * Responsibility: validate human and generated outlines; store immutable
 * revisions and a pinned brief snapshot per AI run. Never touch master_script.
 * Paid/remote inference is deliberately unsupported in this task; the worker
 * rechecks a local Ollama model at execution, not just at scheduling time.
 */
import {randomUUID} from 'node:crypto';
import {transact} from './db.mjs';
import {DomainError} from './domain.mjs';
import {ContentBriefRepository,estimateContent,validateContentForGeneration} from './content-brief.mjs';

const error=(code,status=400)=>{throw new DomainError(code,status)};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const str=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=max;
const LIMIT=50;
const idRe=/^[a-zA-Z0-9_-]{1,80}$/;

/** Convert an editable/AI outline into one canonical ordered chapter list. */
export function normalizeOutline(input){
  if(!object(input)||!Array.isArray(input.chapters)||input.chapters.length<1||input.chapters.length>LIMIT||
    Object.keys(input).some(k=>k!=='chapters'))error('INVALID_OUTLINE');
  const ids=new Set();let total=0;
  const chapters=input.chapters.map((c,i)=>{
    if(!object(c)||Object.keys(c).some(k=>!['id','index','title','objective','keyPoints','targetWords'].includes(k))||
      !str(c.title,180)||!str(c.objective,1000)||!integer(c.targetWords,50,5000)||
      (c.keyPoints!==undefined&&(!Array.isArray(c.keyPoints)||c.keyPoints.length>8||c.keyPoints.some(p=>!str(p,240)))))error('INVALID_OUTLINE_CHAPTER');
    const id=c.id??randomUUID();
    if(typeof id!=='string'||!idRe.test(id)||ids.has(id))error('INVALID_OUTLINE_CHAPTER_ID');
    ids.add(id);total+=c.targetWords;
    return {id,index:i,title:c.title.trim(),objective:c.objective.trim(),
      keyPoints:(c.keyPoints??[]).map(p=>p.trim()),targetWords:c.targetWords};
  });
  if(total>20000)error('OUTLINE_TOO_LONG');
  return {chapters};
}

/** Distribute the pinned target words deterministically; do not trust an LLM's math. */
export function normalizeGeneratedOutline(raw,brief){
  if(!object(raw)||!Array.isArray(raw.chapters)||raw.chapters.length<1||raw.chapters.length>LIMIT)
    error('INVALID_MODEL_OUTLINE');
  const target=estimateContent(brief).targetWords, n=raw.chapters.length;
  if(n>Math.floor(target/50))error('OUTLINE_TOO_MANY_CHAPTERS');
  const weights=raw.chapters.map(c=>Number.isSafeInteger(c?.targetWords)&&c.targetWords>0?c.targetWords:1);
  const sum=weights.reduce((a,b)=>a+b,0);
  let remaining=target;
  const chapters=raw.chapters.map((c,i)=>{
    // Minimum 50 words per chapter; residual goes to last chapter to avoid
    // rounding loss and guarantee the planned total matches the brief.
    const words=i===n-1?remaining:Math.max(50,Math.min(5000,Math.round(target*weights[i]/sum),remaining-50*(n-i-1)));
    remaining-=words;
    return {title:c?.title,objective:c?.objective,keyPoints:c?.keyPoints??[],targetWords:words};
  });
  if(chapters.some(c=>c.targetWords>5000||c.targetWords<50))error('MODEL_OUTLINE_DISTRIBUTION_FAILED');
  try{return normalizeOutline({chapters});}
  catch{error('INVALID_MODEL_OUTLINE')}
}

const safeRun=r=>r?({id:r.id,videoId:r.video_id,briefRevision:r.brief_revision,baseOutlineRevision:r.outline_revision,
  modelId:r.model_id,jobId:r.job_id,status:r.status,result:r.result_json?JSON.parse(r.result_json):null,
  createdAt:r.created_at,updatedAt:r.updated_at}):null;

export class ContentOutlineRepository{
  constructor(repo,{store=null,allowRemoteModels=false}={}){this.repo=repo;this.db=repo.db;this.clock=repo.clock;this.store=store;this.allowRemoteModels=allowRemoteModels;this.briefs=new ContentBriefRepository(repo);}
  ensureVideo(videoId){this.briefs.get(videoId);}
  get(videoId){
    this.ensureVideo(videoId);
    const row=this.db.prepare('SELECT * FROM content_outlines WHERE video_id=?').get(videoId);
    const data=row?JSON.parse(row.data_json):{chapters:[]};
    return {videoId,revision:row?.revision??0,outline:data,sourceRunId:row?.source_run_id??null,
      totalWords:data.chapters.reduce((a,c)=>a+c.targetWords,0),updatedAt:row?.updated_at??null};
  }
  history(videoId){this.ensureVideo(videoId);return this.db.prepare(`SELECT revision,source_run_id,created_at FROM content_outline_revisions
    WHERE video_id=? ORDER BY revision DESC LIMIT 100`).all(videoId)
    .map(r=>({revision:r.revision,sourceRunId:r.source_run_id,createdAt:r.created_at}));}
  revision(videoId,revision){this.ensureVideo(videoId);
    if(!integer(revision,1,2147483647))error('INVALID_OUTLINE_REVISION');
    const row=this.db.prepare('SELECT * FROM content_outline_revisions WHERE video_id=? AND revision=?').get(videoId,revision);
    if(!row)error('OUTLINE_REVISION_NOT_FOUND',404);
    return {videoId,revision,outline:JSON.parse(row.data_json),sourceRunId:row.source_run_id,createdAt:row.created_at};
  }
  /** Persist one immutable revision, guarded against concurrent saves. */
  save(videoId,input={},sourceRunId=null){
    // Only the trusted acceptRun() path may set sourceRunId. HTTP clients
    // cannot spoof a generated provenance or smuggle hidden provider options.
    if(!object(input)||Object.keys(input).some(k=>!['expectedRevision','outline'].includes(k)))error('INVALID_OUTLINE_REQUEST');
    const {expectedRevision,outline}=input;
    if(!integer(expectedRevision,0,2147483647))error('INVALID_OUTLINE_REQUEST');
    const normalized=normalizeOutline(outline);
    return transact(this.db,()=>{
      this.ensureVideo(videoId);
      const old=this.db.prepare('SELECT revision,data_json FROM content_outlines WHERE video_id=?').get(videoId);
      if((old?.revision??0)!==expectedRevision)error('OUTLINE_VERSION_CONFLICT',409);
      const data=JSON.stringify(normalized);
      if(old?.data_json===data)return {...this.get(videoId),unchanged:true};
      const rev=expectedRevision+1,now=this.clock();
      this.db.prepare('INSERT INTO content_outline_revisions(video_id,revision,data_json,source_run_id,created_at) VALUES(?,?,?,?,?)')
        .run(videoId,rev,data,sourceRunId,now);
      this.db.prepare(`INSERT INTO content_outlines(video_id,revision,data_json,source_run_id,updated_at) VALUES(?,?,?,?,?)
        ON CONFLICT(video_id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json,
        source_run_id=excluded.source_run_id,updated_at=excluded.updated_at`).run(videoId,rev,data,sourceRunId,now);
      this.repo.event('video',videoId,'content.outline.saved',{revision:rev,chapterCount:normalized.chapters.length});
      return {...this.get(videoId),unchanged:false};
    });
  }
  model(videoId,modelId,{briefRevision=null}={}){
    this.ensureVideo(videoId);
    if(typeof modelId!=='string'||!idRe.test(modelId))error('INVALID_OUTLINE_MODEL');
    const model=this.db.prepare(`SELECT m.*,a.provider_id,a.status AS account_status
      FROM provider_models m JOIN provider_accounts a ON a.id=m.account_id WHERE m.id=?`).get(modelId);
    // Remote provider routing/paid approval stays in R1-03/R1-07; R1-02's
    // safe MVP explicitly accepts only enabled, locally hosted Ollama.
    if(!model||model.kind!=='llm'||model.status!=='active'||model.account_status!=='active'||
      !(model.provider_id==='ollama'&&model.location==='local'&&model.cost_tier==='local')&&
      !(this.allowRemoteModels&&['gemini','groq','openrouter'].includes(model.provider_id)&&model.location==='remote'&&
        ['free_unverified','paid'].includes(model.cost_tier)))
      error('OUTLINE_LOCAL_MODEL_REQUIRED',409);
    if(briefRevision!==null&&this.briefs.revision(videoId,briefRevision).brief.modelIds.includes(modelId)===false)
      error('OUTLINE_MODEL_NOT_IN_BRIEF',409);
    return model;
  }
  /** Create idempotent pinned run before enqueue; retrying after enqueue fault is safe. */
  requestRun(videoId,input={}){
    if(!object(input)||Object.keys(input).some(k=>!['briefRevision','expectedOutlineRevision','modelId','requestKey'].includes(k)))error('INVALID_OUTLINE_RUN_REQUEST');
    const {briefRevision,expectedOutlineRevision,modelId,requestKey}=input;
    if(!integer(briefRevision,1,2147483647)||!integer(expectedOutlineRevision,0,2147483647)||
      typeof requestKey!=='string'||!idRe.test(requestKey))error('INVALID_OUTLINE_RUN_REQUEST');
    const old=this.db.prepare('SELECT * FROM content_outline_runs WHERE video_id=? AND request_key=?').get(videoId,requestKey);
    if(old){
      if(old.brief_revision!==briefRevision||old.outline_revision!==expectedOutlineRevision||old.model_id!==modelId)
        error('OUTLINE_REQUEST_CONFLICT',409);
      return this.enqueueExisting(old);
    }
    const current=this.get(videoId);
    if(current.revision!==expectedOutlineRevision)error('OUTLINE_VERSION_CONFLICT',409);
    const pinned=this.briefs.revision(videoId,briefRevision);
    const valid=validateContentForGeneration(pinned.brief);
    if(!valid.valid)error(valid.errors[0],409);
    this.model(videoId,modelId,{briefRevision});
    const id=randomUUID(),now=this.clock();
    // Pin effective channel/video content style at scheduling time. Later
    // edits to channel defaults or video overrides must not change this run.
    const frozenBrief={...pinned.brief,
      styleOverrides:{...this.briefs.get(videoId).inherited,...pinned.brief.styleOverrides}};
    transact(this.db,()=>{
      this.db.prepare(`INSERT INTO content_outline_runs
        (id,video_id,request_key,brief_revision,outline_revision,model_id,brief_json,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,'pending',?,?)`).run(id,videoId,requestKey,briefRevision,expectedOutlineRevision,modelId,JSON.stringify(frozenBrief),now,now);
    });
    return this.enqueueExisting(this.db.prepare('SELECT * FROM content_outline_runs WHERE id=?').get(id));
  }
  enqueueExisting(run){
    if(run.status!=='pending'&&run.status!=='queued')return safeRun(run);
    if(!this.store)error('OUTLINE_QUEUE_UNAVAILABLE',503);
    let queued;
    try {queued=this.store.enqueue({key:`outline:${run.id}`,kind:'content:outline',payload:{runId:run.id,providerModelId:run.model_id,providerAccountId:this.model(run.video_id,run.model_id).account_id},maxAttempts:3});}
    catch {error('OUTLINE_QUEUE_UNAVAILABLE',503)}
    // If a worker claims the durable job immediately, the pinned run is still
    // present; updating the queue pointer does not mutate the brief snapshot.
    this.db.prepare("UPDATE content_outline_runs SET status='queued',job_id=?,updated_at=? WHERE id=? AND status IN ('pending','queued')")
      .run(queued.job.id,this.clock(),run.id);
    return this.getRun(run.video_id,run.id);
  }
  getRun(videoId,runId){this.ensureVideo(videoId);
    const row=this.db.prepare('SELECT * FROM content_outline_runs WHERE video_id=? AND id=?').get(videoId,runId);
    if(!row)error('OUTLINE_RUN_NOT_FOUND',404);
    const run=safeRun(row);
    if(['pending','queued'].includes(run.status)&&run.jobId&&this.store){
      const job=this.store.get(run.jobId);
      if(job?.status==='failed'||job?.status==='cancelled')run.status='failed';
      if(job?.status==='running')run.status='running';
      if(job?.status==='succeeded'&&job?.result?.outline){
        // SP-04 fenced the result before it becomes visible here. Workers must
        // NEVER update a domain table before the queue accepts their lease.
        run.result=job.result.outline;
        run.status=this.get(run.videoId).revision===run.baseOutlineRevision?'generated':'needs_review';
      }
    }
    return run;
  }
  runs(videoId){this.ensureVideo(videoId);return this.db.prepare('SELECT id FROM content_outline_runs WHERE video_id=? ORDER BY created_at DESC LIMIT 25').all(videoId)
    .map(r=>this.getRun(videoId,r.id));}
  /**
   * A queued worker does NOT write proposal rows directly: it returns the
   * proposal to the fenced SP-04 JobStore.complete() call. This prevents an
   * expired worker's response overwriting a newer result after a restart.
   */
  acceptRun(videoId,runId,{expectedRevision}={}){
    const run=this.getRun(videoId,runId);
    if(!['generated','needs_review'].includes(run.status)||!run.result)error('OUTLINE_RUN_NOT_READY',409);
    return this.save(videoId,{expectedRevision,outline:run.result},runId);
  }
}
