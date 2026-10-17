/**
 * R2-07 — explicit, crash-resumable asset DAG on the existing SP-04 queue.
 * Planning never calls a provider. Submission is one WAL transaction: stage
 * jobs, their DAG edges, immutable intent snapshots, and run ledger either all
 * persist or all roll back. Worker-side gates verify promoted media, not just
 * the (possibly successful) provider job status.
 */
import {createHash,randomUUID} from 'node:crypto';
import {DomainError} from './domain.mjs';
import {voiceSnapshot,voiceIntentMatches} from './scene-voice.mjs';
import {imageSnapshot,imageIntentMatches} from './scene-image.mjs';
import {promoteQueueAsset} from './manifest.mjs';

const digest=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const fail=(code,status=400)=>{throw new DomainError(code,status)};
const requestKey=/^[a-zA-Z0-9_-]{1,100}$/;
const plain=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const own=(o,key)=>Object.prototype.hasOwnProperty.call(o,key);

export class AssetDagRepository {
  constructor({repo,store,manifest,registry,localVoices={}}){
    this.repo=repo;this.store=store;this.manifest=manifest;
    this.registry=registry;this.localVoices=localVoices;
  }
  validate(videoId,body,{submit=false}={}){
    if(!plain(body)||Object.keys(body).some(k=>!['requestKey','sceneIds','voice','image'].includes(k))||
      (submit&&!requestKey.test(body.requestKey??'')))fail('INVALID_ASSET_DAG_REQUEST');
    if(!own(body,'voice')&&!own(body,'image'))fail('EMPTY_ASSET_DAG_REQUEST');
    if(body.voice!==null&&body.voice!==undefined&&!plain(body.voice))fail('INVALID_ASSET_DAG_REQUEST');
    if(body.image!==null&&body.image!==undefined&&!plain(body.image))fail('INVALID_ASSET_DAG_REQUEST');
    if(!plain(body.voice)&&!plain(body.image))fail('EMPTY_ASSET_DAG_REQUEST');
    const video=this.repo.getVideo(videoId);
    if(!video||video.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
    const scenes=this.repo.listScenes(videoId);
    if(!scenes.length)fail('ASSET_DAG_NO_SCENES',409);
    let selected=scenes;
    if(own(body,'sceneIds')){
      if(!Array.isArray(body.sceneIds)||body.sceneIds.length<1||body.sceneIds.length>200||
        body.sceneIds.some(id=>typeof id!=='string'||!requestKey.test(id))||
        new Set(body.sceneIds).size!==body.sceneIds.length)fail('INVALID_ASSET_DAG_SCENES');
      const byId=new Map(scenes.map(s=>[s.id,s]));
      if(body.sceneIds.some(id=>!byId.has(id)))fail('ASSET_DAG_SCENE_SCOPE_MISMATCH',404);
      selected=body.sceneIds.map(id=>byId.get(id));
    }
    if(selected.length>200)fail('ASSET_DAG_BATCH_TOO_LARGE',422);
    return {video,selected};
  }
  /** Provider config is validated before any mutation; only explicit voice
   * consent can authorize Edge, ComfyUI image is local-only. */
  async prepare(videoId,body,{submit=false}={}){
    const {video,selected}=this.validate(videoId,body,{submit});
    const existing=await this.manifest.planRecompute(videoId);
    const previous=new Map(existing.scenes.map(s=>[s.sceneId,s]));
    const tasks=[];
    for(const scene of selected){
      const state=previous.get(scene.id),current=this.repo.getScene(scene.id);
      let voice=null,image=null,manualImageId=null;
      if(plain(body.voice)){
        const candidate=voiceSnapshot(scene,video,body.voice,this.localVoices);
        const asset=current.voiceAssetId?this.manifest.get(current.voiceAssetId):null;
        if(state.voice!=='reuse'||asset?.metadata?.inputHash!==candidate.inputHash)voice=candidate;
      }
      if(plain(body.image)&&scene.mediaType==='image_motion'){
        const selectedManual=this.repo.db.prepare('SELECT asset_id FROM scene_image_manual_selections WHERE scene_id=?').get(scene.id)?.asset_id??null;
        if(selectedManual&&state.visual!=='manual_preserved')fail('ASSET_DAG_MANUAL_IMAGE_UNHEALTHY',409);
        if(state.visual==='manual_preserved')manualImageId=current.visualAssetId;
        else {
          if(!this.registry.imageAdapter||!this.registry.list().some(p=>p.id==='comfyui'&&p.kind==='image'&&p.location==='local'&&p.costTier==='local'))
            fail('LOCAL_IMAGE_NOT_CONFIGURED',503);
          const seed='0'.repeat(64);
          const initial=imageSnapshot(scene,video,body.image,seed);
          let workflow;
          try {workflow=await this.registry.imageAdapter.loadWorkflow(initial);}
          catch {fail('LOCAL_IMAGE_WORKFLOW_INVALID',503);}
          const candidate=imageSnapshot(scene,video,body.image,digest(JSON.stringify(workflow)));
          const asset=current.visualAssetId?this.manifest.get(current.visualAssetId):null;
          if(state.visual!=='reuse'||asset?.metadata?.inputHash!==candidate.inputHash)image=candidate;
        }
      }
      tasks.push({scene,voice,image,manualImageId,state,expectVoice:plain(body.voice),
        expectImage:plain(body.image)&&scene.mediaType==='image_motion',
        voiceInputHash:plain(body.voice)?(voice?.inputHash??this.manifest.get(current.voiceAssetId)?.metadata?.inputHash):null,
        imageInputHash:plain(body.image)&&scene.mediaType==='image_motion'&&!manualImageId?
          (image?.inputHash??this.manifest.get(current.visualAssetId)?.metadata?.inputHash):null,
        // These revision/selection snapshots prevent a manual change between
        // disk verification and the DB writer lock from being silently lost.
        snapshot:{text:scene.text,visualPrompt:scene.visualPrompt,mediaType:scene.mediaType,
          configRevision:video.configRevision,voiceAssetId:current.voiceAssetId,
          visualAssetId:current.visualAssetId,
          manualImageId:this.repo.db.prepare('SELECT asset_id FROM scene_image_manual_selections WHERE scene_id=?').get(scene.id)?.asset_id??null}
      });
    }
    return {video,tasks};
  }
  async preview(videoId,body){
    const {video,tasks}=await this.prepare(videoId,body);
    return {videoId:video.id,configRevision:video.configRevision,sceneCount:tasks.length,
      generateVoice:tasks.filter(t=>t.voice).length,generateImage:tasks.filter(t=>t.image).length,
      scenes:tasks.map(t=>({sceneId:t.scene.id,index:t.scene.index,
        voice:t.expectVoice?(t.voice?'generate':'reuse'):'not_requested',
        image:t.expectImage?(t.image?'generate':t.manualImageId?'manual_preserved':'reuse'):'not_requested'})),
      queued:false,requiresExplicitSubmit:true};
  }
  /** Store.enqueueManyAtomic and SP-04 jobs use the same underlying SQLite
   * file. Unlike separate enqueue() calls, failure cannot leave a half-DAG. */
  async submit(videoId,body){
    const {video}=this.validate(videoId,body,{submit:true});
    const requestHash=digest({sceneIds:body.sceneIds??null,voice:body.voice??null,image:body.image??null});
    const existing=this.store.db.prepare('SELECT * FROM asset_dag_runs WHERE video_id=? AND request_key=?')
      .get(videoId,body.requestKey);
    if(existing){
      if(existing.request_hash!==requestHash)fail('ASSET_DAG_IDEMPOTENCY_CONFLICT',409);
      return {...this.get(videoId,existing.id),reused:true};
    }
    const {tasks}=await this.prepare(videoId,body,{submit:true});
    const runId=randomUUID(),jobs=[],nodes=[];
    for(const t of tasks){
      const deps=[];
      if(t.voice){
        const id=randomUUID();
        jobs.push({id,key:`scene-voice:${t.scene.id}:${t.voice.inputHash}`,kind:'asset:voice',payload:t.voice,maxAttempts:3});
        deps.push(id);nodes.push({sceneId:t.scene.id,stage:'voice',jobId:id});
      }
      if(t.image){
        const id=randomUUID();
        jobs.push({id,key:`scene-image:${t.scene.id}:${t.image.inputHash}`,kind:'asset:image',payload:t.image,maxAttempts:2});
        deps.push(id);nodes.push({sceneId:t.scene.id,stage:'image',jobId:id});
      }
      const gateId=randomUUID();
      jobs.push({id:gateId,key:`asset-dag:${runId}:${t.scene.id}:gate`,kind:'workflow:scene-assets',
        payload:{runId,videoId,sceneId:t.scene.id,
          voiceJobId:nodes.find(n=>n.sceneId===t.scene.id&&n.stage==='voice')?.jobId??null,
          imageJobId:nodes.find(n=>n.sceneId===t.scene.id&&n.stage==='image')?.jobId??null,
          voiceInputHash:t.voiceInputHash,imageInputHash:t.imageInputHash,
          manualImageId:t.manualImageId,expectVoice:t.expectVoice,expectImage:t.expectImage},
        deps,maxAttempts:2});
      nodes.push({sceneId:t.scene.id,stage:'gate',jobId:gateId});
    }
    const finalId=randomUUID();
    jobs.push({id:finalId,key:`asset-dag:${runId}:final`,kind:'workflow:video-assets',
      payload:{runId,videoId,sceneCount:tasks.length},
      deps:nodes.filter(n=>n.stage==='gate').map(n=>n.jobId),maxAttempts:2});
    // One locked transaction, includes the queue DAG and scene intents.
    // Validate against fresh SQLite snapshots; read-only previews are never consent.
    const outcome=this.store.enqueueManyAtomic(jobs,(created,db)=>{
      const prior=db.prepare('SELECT * FROM asset_dag_runs WHERE video_id=? AND request_key=?').get(videoId,body.requestKey);
      if(prior)fail('ASSET_DAG_IDEMPOTENCY_CONFLICT',409);
      const freshVideo=db.prepare('SELECT config_revision,deleted_at FROM videos WHERE id=?').get(videoId);
      if(!freshVideo||freshVideo.deleted_at!==null||freshVideo.config_revision!==video.configRevision)
        fail('ASSET_DAG_SNAPSHOT_CONFLICT',409);
      const resolved=new Map(jobs.map((spec,i)=>[spec.id,created[i].job.id]));
      for(const t of tasks){
        const fresh=db.prepare('SELECT * FROM scenes WHERE id=? AND video_id=?').get(t.scene.id,videoId);
        const s=t.snapshot;
        const manual=db.prepare('SELECT asset_id FROM scene_image_manual_selections WHERE scene_id=?').get(t.scene.id)?.asset_id??null;
        if(!fresh||fresh.text!==s.text||fresh.visual_prompt!==s.visualPrompt||fresh.media_type!==s.mediaType||
          fresh.voice_asset_id!==s.voiceAssetId||fresh.visual_asset_id!==s.visualAssetId||manual!==s.manualImageId)
          fail('ASSET_DAG_SNAPSHOT_CONFLICT',409);
      }
      db.prepare(`INSERT INTO asset_dag_runs(id,video_id,request_key,request_hash,config_revision,final_job_id,created_at)
        VALUES(?,?,?,?,?,?,?)`).run(runId,videoId,body.requestKey,requestHash,video.configRevision,resolved.get(finalId),Date.now());
      for(const t of tasks){
        const v=nodes.find(n=>n.sceneId===t.scene.id&&n.stage==='voice');
        const i=nodes.find(n=>n.sceneId===t.scene.id&&n.stage==='image');
        if(v){
          const jobId=resolved.get(v.jobId),s=t.voice;
          db.prepare(`INSERT INTO scene_voice_intents
            (scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,fallback_provider_id,fallback_voice_id,requested_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(scene_id) DO UPDATE SET
            job_id=excluded.job_id,input_hash=excluded.input_hash,text_sha256=excluded.text_sha256,
            config_revision=excluded.config_revision,provider_id=excluded.provider_id,voice_id=excluded.voice_id,
            rate=excluded.rate,fallback_provider_id=excluded.fallback_provider_id,
            fallback_voice_id=excluded.fallback_voice_id,requested_at=excluded.requested_at`)
            .run(t.scene.id,jobId,s.inputHash,s.textSha256,s.configRevision,s.providerId,s.voice,s.rate,
              s.fallbackProvider,s.fallbackVoice,Date.now());
        }
        if(i){
          db.prepare('DELETE FROM scene_image_manual_selections WHERE scene_id=?').run(t.scene.id);
          const jobId=resolved.get(i.jobId),s=t.image;
          db.prepare(`INSERT INTO scene_image_intents(scene_id,job_id,input_hash,source_sha256,config_revision,requested_at)
            VALUES(?,?,?,?,?,?) ON CONFLICT(scene_id) DO UPDATE SET job_id=excluded.job_id,
            input_hash=excluded.input_hash,source_sha256=excluded.source_sha256,
            config_revision=excluded.config_revision,requested_at=excluded.requested_at`)
            .run(t.scene.id,jobId,s.inputHash,s.sourceSha256,s.configRevision,Date.now());
        }
      }
      for(const n of nodes)db.prepare(`INSERT INTO asset_dag_nodes(run_id,scene_id,stage,job_id) VALUES(?,?,?,?)`)
        .run(runId,n.sceneId,n.stage,resolved.get(n.jobId));
    });
    return {...this.get(videoId,runId),reused:false,newJobs:outcome.filter(x=>!x.reused).length};
  }
  /** Only an explicit retry action re-arms failed DAG nodes. Edge provider
   * retries require NEW remote consent, not consent inherited from history.
   * Stale scene/intent state and manually pinned images fail closed before
   * a local or remote provider can execute again.
   */
  retry(videoId,runId,body={}){
    if(!plain(body)||Object.keys(body).some(k=>!['confirmRemote'].includes(k))||
      (body.confirmRemote!==undefined&&typeof body.confirmRemote!=='boolean'))
      fail('INVALID_ASSET_DAG_RETRY');
    const run=this.get(videoId,runId);
    const db=this.store.db;
    const rows=db.prepare(`SELECT n.stage,n.scene_id,n.job_id,j.status,j.payload_json
      FROM asset_dag_nodes n JOIN jobs j ON j.id=n.job_id
      WHERE n.run_id=? ORDER BY CASE n.stage WHEN 'voice' THEN 0 WHEN 'image' THEN 1 ELSE 2 END`)
      .all(runId);
    const failed=rows.filter(r=>r.status==='failed');
    if(!failed.length&&run.status!=='failed')return {...run,retried:0};
    if(rows.some(r=>r.status==='cancelled'))fail('ASSET_DAG_CANCELLED',409);
    const runMeta=db.prepare('SELECT * FROM asset_dag_runs WHERE id=?').get(runId);
    const runFinal=db.prepare('SELECT status FROM jobs WHERE id=?').get(runMeta.final_job_id);
    const idList=[...failed.map(r=>r.job_id),...(runFinal.status==='failed'?[runMeta.final_job_id]:[])];
    if(!idList.length)return {...run,retried:0};
    for(const row of failed){
      if(row.stage==='voice'){
        const p=JSON.parse(row.payload_json);
        if(p.providerId==='edge'&&body.confirmRemote!==true)fail('REMOTE_CONSENT_REQUIRED',403);
        if(!voiceIntentMatches(this.repo,p,row.job_id))fail('ASSET_DAG_STALE_RETRY',409);
      }
      if(row.stage==='image'){
        const p=JSON.parse(row.payload_json);
        if(!imageIntentMatches(this.repo,p,row.job_id))fail('ASSET_DAG_STALE_RETRY',409);
      }
    }
    // The same single SQLite file is the source of truth for authorization,
    // jobs, dependencies and scene intents. Recheck under the writer lock.
    let retried=0;
    try{retried=this.store.retryFailedBatch(idList,locked=>{
      const live=locked.prepare('SELECT config_revision,deleted_at FROM videos WHERE id=?').get(videoId);
      if(!live||live.deleted_at!==null||live.config_revision!==runMeta.config_revision)fail('ASSET_DAG_STALE_RETRY',409);
      for(const row of failed){
        if(row.stage==='voice'){
          const p=JSON.parse(row.payload_json);
          const scene=locked.prepare('SELECT text FROM scenes WHERE id=?').get(row.scene_id);
          const intent=locked.prepare('SELECT job_id,input_hash FROM scene_voice_intents WHERE scene_id=?').get(row.scene_id);
          if(!scene||digest(scene.text)!==p.textSha256||intent?.job_id!==row.job_id||intent.input_hash!==p.inputHash)
            fail('ASSET_DAG_STALE_RETRY',409);
        }
        if(row.stage==='image'){
          const p=JSON.parse(row.payload_json);
          const scene=locked.prepare('SELECT text,visual_prompt,media_type FROM scenes WHERE id=?').get(row.scene_id);
          const intent=locked.prepare('SELECT job_id,input_hash FROM scene_image_intents WHERE scene_id=?').get(row.scene_id);
          const pinned=locked.prepare('SELECT asset_id FROM scene_image_manual_selections WHERE scene_id=?').get(row.scene_id);
          const source=scene&&digest({text:scene.text,visualPrompt:scene.visual_prompt,mediaType:scene.media_type});
          if(!scene||source!==p.sourceSha256||pinned||intent?.job_id!==row.job_id||intent.input_hash!==p.inputHash)
            fail('ASSET_DAG_STALE_RETRY',409);
        }
      }
    });}catch(error){if(error instanceof DomainError)throw error;fail('ASSET_DAG_RETRY_CONFLICT',409);}
    return {...this.get(videoId,runId),retried};
  }
  get(videoId,runId){
    const row=this.store.db.prepare('SELECT * FROM asset_dag_runs WHERE id=? AND video_id=?').get(runId,videoId);
    if(!row)fail('ASSET_DAG_RUN_NOT_FOUND',404);
    const rows=this.store.db.prepare(`SELECT n.scene_id,n.stage,n.job_id,j.status,j.attempt,j.last_error
      FROM asset_dag_nodes n JOIN jobs j ON j.id=n.job_id WHERE n.run_id=?
      ORDER BY n.scene_id,n.stage`).all(runId);
    const final=this.store.get(row.final_job_id);
    const t=final?.status==='succeeded'?final.result?.timing:null;
    const timing=t&&Number.isSafeInteger(t.measuredVoiceDurationMs)&&Number.isSafeInteger(t.estimatedSceneDurationMs)
      ?{measuredVoiceDurationMs:t.measuredVoiceDurationMs,estimatedSceneDurationMs:t.estimatedSceneDurationMs,
        measuredVoiceScenes:t.measuredVoiceScenes,estimatedScenes:t.estimatedScenes,
        syncPending:true,timebase:'ms'}:null;
    return {runId:row.id,videoId:row.video_id,configRevision:row.config_revision,
      createdAt:row.created_at,status:final?.status??'unknown',finalJobId:row.final_job_id,timing,
      sceneCount:rows.filter(x=>x.stage==='gate').length,
      nodes:rows.map(x=>({sceneId:x.scene_id,stage:x.stage,jobId:x.job_id,status:x.status,attempt:x.attempt,
        errorCode:/^(?:WORKER_ERROR|LEASE_EXPIRED|DEPENDENCY_FAILED)$/.test(x.last_error??'')?x.last_error:null}))};
  }
  list(videoId,{limit=25}={}){
    if(!this.repo.getVideo(videoId))fail('VIDEO_NOT_FOUND',404);
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail('INVALID_ASSET_DAG_LIMIT');
    return {items:this.store.db.prepare('SELECT id FROM asset_dag_runs WHERE video_id=? ORDER BY created_at DESC LIMIT ?')
      .all(videoId,limit).map(row=>this.get(videoId,row.id))};
  }
}

/** Gate jobs only inspect and promote already successful dependencies. They
 * cannot invoke AI, charge an account, or alter a manually pinned image. */
export function createAssetDagHandlers({repo,store,manifest}){
  return {
    'workflow:scene-assets':async p=>{
      const run=store.db.prepare('SELECT id FROM asset_dag_runs WHERE id=? AND video_id=?').get(p.runId,p.videoId);
      if(!run)throw Object.assign(new Error('RUN_MISSING'),{retryable:false,code:'INVALID_INPUT'});
      for(const jobId of [p.voiceJobId,p.imageJobId].filter(Boolean)){
        try {await promoteQueueAsset({manifest,jobId});}
        catch {throw Object.assign(new Error('PROMOTION_NOT_READY'),{retryable:false,code:'INVALID_INPUT'});}
      }
      const plan=(await manifest.planRecompute(p.videoId,{sceneIds:[p.sceneId]})).scenes.find(r=>r.sceneId===p.sceneId);
      const scene=repo.getScene(p.sceneId);
      if(!scene||!plan)throw Object.assign(new Error('SCENE_MISSING'),{retryable:false,code:'INVALID_INPUT'});
      if(p.expectVoice){
        const asset=scene.voiceAssetId?manifest.get(scene.voiceAssetId):null;
        if(plan.voice!=='reuse'||!asset||asset.metadata?.inputHash!==p.voiceInputHash)
          throw Object.assign(new Error('VOICE_NOT_CURRENT'),{retryable:false,code:'INVALID_INPUT'});
      }
      if(p.expectImage){
        const asset=scene.visualAssetId?manifest.get(scene.visualAssetId):null;
        const healthy=plan.visual==='reuse'||plan.visual==='manual_preserved';
        if(!healthy||!asset||(p.manualImageId?
          scene.visualAssetId!==p.manualImageId||plan.visual!=='manual_preserved':
          asset.metadata?.inputHash!==p.imageInputHash))
          throw Object.assign(new Error('IMAGE_NOT_CURRENT'),{retryable:false,code:'INVALID_INPUT'});
      }
      const voice=scene.voiceAssetId?manifest.get(scene.voiceAssetId):null;
      const duration=p.expectVoice?voice?.metadata?.durationMs:null;
      return {result:{runId:p.runId,sceneId:p.sceneId,assetsVerified:true,
        // FFprobe-derived voice duration is authoritative but never silently
        // overrides the editor's estimated scene/timeline duration here.
        estimatedSceneDurationMs:scene.durationMs,
        measuredVoiceDurationMs:Number.isSafeInteger(duration)&&duration>0?duration:null}};
    },
    'workflow:video-assets':async p=>{
      const nodes=store.db.prepare(`SELECT j.status,j.result_json FROM asset_dag_nodes n
        JOIN jobs j ON j.id=n.job_id WHERE n.run_id=? AND n.stage='gate'`).all(p.runId);
      if(nodes.length!==p.sceneCount||nodes.some(n=>n.status!=='succeeded'))
        throw Object.assign(new Error('DAG_GATE_INCOMPLETE'),{retryable:false,code:'INVALID_INPUT'});
      const durations=nodes.map(n=>JSON.parse(n.result_json||'null'));
      const timed=durations.filter(d=>Number.isSafeInteger(d?.measuredVoiceDurationMs)&&d.measuredVoiceDurationMs>0);
      return {result:{runId:p.runId,videoId:p.videoId,sceneCount:p.sceneCount,
        assetsPrepared:true,rendered:false,
        timing:{estimatedSceneDurationMs:durations.reduce((sum,d)=>sum+(d?.estimatedSceneDurationMs??0),0),
          estimatedScenes:durations.length,measuredVoiceDurationMs:timed.reduce((sum,d)=>sum+d.measuredVoiceDurationMs,0),
          measuredVoiceScenes:timed.length,syncPending:true,timebase:'ms'}}};
    }
  };
}
