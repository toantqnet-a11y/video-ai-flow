/**
 * R2-02 / EP05 US-5.1 — AI visual-prompt proposals for approved scene plans.
 *
 * WHY: a proposal is NOT an edit to a scene. A queue job pins an immutable scene
 * revision and resolved video-style snapshot. The AI result stays in the fenced
 * SP-04 job result until a person reviews it. Saved custom prompts are never
 * replaced by applying suggestions in the editor; another normal Scene Builder
 * commit (with optimistic locking and asset safety) is required.
 */
import {randomUUID,createHash} from 'node:crypto';
import {transact} from './db.mjs';
import {DomainError} from './domain.mjs';
import {SceneBuilderRepository} from './scene-builder.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s);
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const CHUNK_SIZE=8;
const MEDIA_TYPES=new Set(['image_motion','ai_video','import_video']);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

/** Fail closed on partial, reordered, fabricated or oversized LLM output. */
export function normalizeVisualPromptOutput(raw,expected){
  if(!plain(raw)||Object.keys(raw).some(k=>k!=='items')||!Array.isArray(raw.items)||raw.items.length!==expected.length)
    fail('VISUAL_PROMPT_OUTPUT_INVALID',422);
  const seen=new Set();
  const items=raw.items.map(item=>{
    if(!plain(item)||Object.keys(item).some(k=>!['index','prompt','mediaType','reason'].includes(k))||
      !integer(item.index,0,1199)||seen.has(item.index)||typeof item.prompt!=='string'||
      !item.prompt.trim()||item.prompt.length>1800||typeof item.reason!=='string'||item.reason.length>320||
      !MEDIA_TYPES.has(item.mediaType))fail('VISUAL_PROMPT_OUTPUT_INVALID',422);
    seen.add(item.index);
    // AI cannot set an import-video option that requires a real user file.
    if(item.mediaType==='import_video')fail('VISUAL_PROMPT_OUTPUT_INVALID',422);
    return {index:item.index,prompt:item.prompt.trim(),mediaType:item.mediaType,reason:item.reason.trim()};
  });
  if(expected.some(e=>!seen.has(e.index)))fail('VISUAL_PROMPT_OUTPUT_MISMATCH',422);
  return {items:items.sort((a,b)=>a.index-b.index)};
}

/** UI suggestions are not proof of GPU, quota or provider readiness. */
export function sceneMediaAdvice(s){
  if(s.mediaType==='import_video')return {status:'requires_import',message:'Cần nhập clip và xác minh tệp trước khi tạo media.'};
  if(s.mediaType==='ai_video')return {status:'requires_preflight',message:'Cần kiểm tra model, GPU/quota và chính sách chi phí trước khi xếp hàng AI Video.'};
  return {status:'requires_image_provider',message:'Cần kiểm tra provider ảnh hoặc nhập ảnh trước khi tạo Image Motion.'};
}

export class VisualPromptRepository{
  constructor(repo,{store}={}){
    if(!store)throw new Error('VISUAL_JOB_STORE_REQUIRED');
    this.repo=repo;this.db=repo.db;this.store=store;this.sceneBuilder=new SceneBuilderRepository(repo);
  }
  model(modelId){
    if(!validId(modelId))fail('INVALID_VISUAL_MODEL');
    const m=this.db.prepare(`SELECT m.*,a.provider_id,a.status account_status FROM provider_models m
      JOIN provider_accounts a ON a.id=m.account_id WHERE m.id=?`).get(modelId);
    // R2-02 local-only implementation. Never implicitly send private scripts
    // to an API merely because a provider account is labeled free.
    if(!m||m.kind!=='llm'||m.status!=='active'||m.account_status!=='active'||
      m.provider_id!=='ollama'||m.location!=='local'||m.cost_tier!=='local')fail('VISUAL_LOCAL_MODEL_REQUIRED',409);
    return m;
  }
  /** Freeze exactly which edited scene text and channel styling the AI sees. */
  request(videoId,body={}){
    if(!plain(body)||Object.keys(body).some(k=>!['sceneRevision','videoRowVersion','modelId','requestKey','indices'].includes(k))||
      !integer(body.sceneRevision,1,2147483647)||!integer(body.videoRowVersion,1,2147483647)||
      !validId(body.modelId)||!validId(body.requestKey)||
      (body.indices!==undefined&&(!Array.isArray(body.indices)||body.indices.length>1200||body.indices.some(i=>!integer(i,0,1199)))))
      fail('INVALID_VISUAL_RUN_REQUEST');
    const scene=this.sceneBuilder.state(videoId);
    if(body.sceneRevision!==scene.sceneRevision||body.videoRowVersion!==scene.videoRowVersion)
      fail('VISUAL_SCENE_VERSION_CONFLICT',409);
    const snapshot=this.sceneBuilder.revision(videoId,scene.sceneRevision);
    if(snapshot.approvedMasterRevision!==scene.approvedMasterRevision||snapshot.sourceSha256!==scene.sourceSha256)
      fail('VISUAL_MASTER_SOURCE_CONFLICT',409);
    const config=this.repo.getVideoConfig(videoId);
    const model=this.model(body.modelId);
    const unique=body.indices===undefined?snapshot.scenes.flatMap((s,i)=>s.mediaType==='import_video'?[]:[i]):[...new Set(body.indices)].sort((a,b)=>a-b);
    if(!unique.length||unique.some(i=>i>=snapshot.scenes.length))fail('INVALID_VISUAL_SCENE_INDICES');
    if(unique.some(index=>snapshot.scenes[index].mediaType==='import_video'))fail('VISUAL_IMPORT_MEDIA_HAS_NO_PROMPT',409);
    const selected=unique.map(index=>({index,sourceStart:snapshot.scenes[index].sourceStart,sourceEnd:snapshot.scenes[index].sourceEnd,
      text:snapshot.scenes[index].text,mediaType:snapshot.scenes[index].mediaType,
      currentPrompt:snapshot.scenes[index].visualPrompt}));
    const style={mediaStyle:config.effectivePreset.media.style,aspectRatio:config.effectivePreset.media.aspectRatio,
      characterName:config.effectivePreset.voice.characterName??'',characterDescription:config.effectivePreset.voice.characterDescription??'',
      contentStyle:config.effectivePreset.content.style,tone:config.effectivePreset.content.tone,
      language:config.effectivePreset.content.language,seed:parseInt(hash({videoId,style:config.effectivePreset.media.style}).slice(0,8),16)};
    const inputHash=hash({sceneRevision:body.sceneRevision,videoRowVersion:body.videoRowVersion,modelId:body.modelId,
      selected,style,configRevision:config.version});
    const previous=this.db.prepare('SELECT * FROM scene_visual_runs WHERE video_id=? AND request_key=?').get(videoId,body.requestKey);
    if(previous){
      if(previous.input_hash!==inputHash)fail('VISUAL_REQUEST_KEY_CONFLICT',409);
      return this.ensureQueued(previous);
    }
    const id=randomUUID(),now=this.repo.clock();
    transact(this.db,()=>{
      this.db.prepare(`INSERT INTO scene_visual_runs
        (id,video_id,request_key,scene_revision,video_row_version,config_revision,source_sha256,model_id,input_hash,scenes_json,style_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,videoId,body.requestKey,scene.sceneRevision,scene.videoRowVersion,
        config.version,snapshot.sourceSha256,model.id,inputHash,JSON.stringify(selected),JSON.stringify(style),now);
    });
    return this.ensureQueued(this.db.prepare('SELECT * FROM scene_visual_runs WHERE id=?').get(id));
  }
  /** Retry missing enqueues after a crash between the domain and job stores. */
  ensureQueued(run){
    const count=JSON.parse(run.scenes_json).length;
    for(let from=0;from<count;from+=CHUNK_SIZE){
      const payload={runId:run.id,from,to:Math.min(count,from+CHUNK_SIZE),providerModelId:run.model_id,
        providerAccountId:this.model(run.model_id).account_id};
      try{this.store.enqueue({kind:'scene:visual-prompt',key:`visual:${run.id}:${from}`,payload,maxAttempts:3});}
      catch(e){if(!/idempotency key conflict/.test(e.message))throw e;fail('VISUAL_JOB_CONFLICT',409)}
    }
    return this.get(run.video_id,run.id);
  }
  list(videoId){this.sceneBuilder.source(videoId);
    return {items:this.db.prepare('SELECT id FROM scene_visual_runs WHERE video_id=? ORDER BY created_at DESC LIMIT 40')
      .all(videoId).map(({id})=>this.get(videoId,id))};
  }
  get(videoId,runId){
    this.sceneBuilder.source(videoId);
    if(!validId(runId))fail('INVALID_VISUAL_RUN_ID');
    const run=this.db.prepare('SELECT * FROM scene_visual_runs WHERE video_id=? AND id=?').get(videoId,runId);
    if(!run)fail('VISUAL_RUN_NOT_FOUND',404);
    const selected=JSON.parse(run.scenes_json),jobs=[],items=[];
    for(let from=0;from<selected.length;from+=CHUNK_SIZE){
      const jobRow=this.store.db.prepare('SELECT id FROM jobs WHERE idem_key=?').get(`visual:${runId}:${from}`);
      const job=jobRow?this.store.get(jobRow.id):null;
      jobs.push({id:job?.id??null,from,to:Math.min(selected.length,from+CHUNK_SIZE),status:job?.status??'not_queued'});
      if(job?.status==='succeeded'){
        try{items.push(...normalizeVisualPromptOutput(job.result,selected.slice(from,from+CHUNK_SIZE)).items);}
        catch{fail('VISUAL_RESULT_CORRUPTED',409)}
      }
    }
    const complete=jobs.every(j=>j.status==='succeeded');
    const stale=(()=>{try{const state=this.sceneBuilder.state(videoId),cfg=this.repo.getVideoConfig(videoId);
      return state.sceneRevision!==run.scene_revision||state.videoRowVersion!==run.video_row_version||cfg.version!==run.config_revision;
    }catch{return true}})();
    return {id:run.id,videoId,sceneRevision:run.scene_revision,videoRowVersion:run.video_row_version,
      configRevision:run.config_revision,modelId:run.model_id,sceneCount:selected.length,
      sceneRefs:selected.map(({index,sourceStart,sourceEnd,text})=>({index,sourceStart,sourceEnd,text})),
      status:complete?'succeeded':jobs.some(j=>j.status==='failed'||j.status==='cancelled')?'needs_attention':
        jobs.some(j=>j.status==='running')?'running':'queued',stale,items:items.sort((a,b)=>a.index-b.index),jobs,
      createdAt:run.created_at};
  }
}
