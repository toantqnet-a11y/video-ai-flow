import {SubtitleDraftsR405,previewSubtitleEdits,inspectVisualConsistency} from '../../../packages/core/src/r4-editor-music-style.mjs';
/**
 * Framework-independent API controller. Production Fastify and Node unit tests
 * execute these exact methods; domain code never depends on HTTP internals.
 */
import {CONTENT_RUBRIC_V1,DomainError,ProviderAccountRepository,VideoCapabilityRepository,ContentBriefRepository,ContentOutlineRepository,ChapterGenerationRepository,ContentEvaluationRepository,ContentRetryRepository,MasterScriptRepository,SceneBuilderRepository,VisualPromptRepository,SceneVoiceRepository,SceneImageRepository,voiceSnapshot,transact,AssetDagRepository,QuotaLedgerRepository,AssetLibraryR209,SelectiveRegenerationR211,ProviderMonitorR212,CompositionRepository,TimedCompositionRepository,MotionBrandRepository,routeVisuals,MOTION_TEMPLATES,scriptSkillCatalog,buildScriptSkillPlan,exportApprovedScript,SceneInspectorR301,TimelineEditorR304,TimelineHistoryR307} from '../../../packages/core/src/index.mjs';
import {createJobCenter,publicJob} from './job-center.mjs';
import {importSceneVideoStream} from '../../../packages/core/src/scene-video-stream-r2vid03.mjs';
import {ProjectZipServiceR311} from './project-zip-r311.mjs';
import {WaveformR306} from './voice-waveform-r306.mjs';
import {localTtsCatalog} from './local-tts-catalog.mjs';
import {fingerprint} from '../../../packages/providers/src/index.mjs';
import {presetCapabilities} from '../../../packages/core/src/preset-schema.mjs';
import {providerReadiness} from '../../../packages/providers/src/readiness.mjs';
const safeId=(id)=>typeof id==='string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
export function createControllers({repo,store,registry,manifest,vault,paidPolicy=null,remoteLlmEnabled=false,renderExports=null,clips=null}) {
  const providers = new ProviderAccountRepository(repo.db,{clock:repo.clock});
  const quotaLedger = new QuotaLedgerRepository(repo.db,{clock:repo.clock});
  const providerMonitor = new ProviderMonitorR212(repo.db,{clock:repo.clock});
  const videoCapabilities=new VideoCapabilityRepository(repo.db,{clock:repo.clock});
  const jobCenter=createJobCenter(store);
  const contentBriefs=new ContentBriefRepository(repo);
  const contentOutlines=new ContentOutlineRepository(repo,{store,allowRemoteModels:remoteLlmEnabled});
  const chapterGenerations=new ChapterGenerationRepository(repo,{store,allowRemoteModels:remoteLlmEnabled});
  const evaluations=new ContentEvaluationRepository(repo,{store,allowRemoteModels:remoteLlmEnabled});
  const contentRetries=new ContentRetryRepository(repo,{store,allowRemoteModels:remoteLlmEnabled});
  const masters=new MasterScriptRepository(repo);
  const sceneBuilder=new SceneBuilderRepository(repo);
  const sceneInspector=new SceneInspectorR301(repo);
  const timelineEditor=new TimelineEditorR304(repo);
  const timelineHistory=new TimelineHistoryR307(repo);
  const visualPrompts=store?new VisualPromptRepository(repo,{store}):null;
  const sceneVoices=new SceneVoiceRepository(repo,{store,manifest,localVoices:registry.localVoiceDefaults??{}});
  const waveforms=new WaveformR306({readVoice:id=>sceneVoices.audio(id)});
  const sceneImages=new SceneImageRepository(repo,{store,manifest,registry});
  const assetLibrary=new AssetLibraryR209({repo,manifest});
  const compositions=new CompositionRepository({repo,manifest});
  const timedCompositions=new TimedCompositionRepository({compositions,manifest});
  const styles=new MotionBrandRepository(repo);
  const projectZip=new ProjectZipServiceR311({repo,compositions,manifest});
  const subtitleDrafts=new SubtitleDraftsR405(repo.db);
  const subtitleDocument=(id,revision)=>{
    if(!Number.isSafeInteger(revision)||revision<1)throw new DomainError('R4_SUBTITLE_INVALID',400);
    const latest=compositions.history(id)[0];
    if(latest?.revision!==revision)throw new DomainError('R4_SUBTITLE_SOURCE_STALE',409);
    const document=compositions.revision(id,revision).composition;
    if(document.schemaVersion!==2)throw new DomainError('R4_SUBTITLE_REQUIRES_V2',409);
    return document;
  };
  const selective=new SelectiveRegenerationR211({repo,manifest,sceneVoices,sceneImages});
  const assetDags=new AssetDagRepository({repo,store,manifest,registry,localVoices:registry.localVoiceDefaults??{}});
  // Credential association is checked against vault metadata; the key itself
  // is never copied into SQLite or returned in HTTP responses.
  const checkCredential=async(providerId,credentialId)=>{
    if(!credentialId)return;
    if(!vault)throw new DomainError('VAULT_UNAVAILABLE',503);
    let rows;
    try {rows=await vault.list();}catch{throw new DomainError('VAULT_NOT_READY',423);}
    if(!rows.some(row=>row.id===credentialId&&row.providerId===providerId))
      throw new DomainError('CREDENTIAL_PROVIDER_MISMATCH',409);
  };
  return {
    channels:(query={})=>repo.listChannels({status:query.status??'all'}).map(ch=>({...ch,summary:repo.getChannelSummary(ch.id)})),
    channelSummary:id=>repo.getChannelSummary(id),
    subtitleDraft:id=>{repo.getVideo(id)??missing('VIDEO_NOT_FOUND');return subtitleDrafts.get(id);},
    subtitlePreview:(id,body)=>previewSubtitleEdits(subtitleDocument(id,body?.compositionRevision),body?.overrides),
    subtitleSave:(id,body)=>subtitleDrafts.save(id,{document:subtitleDocument(id,body?.compositionRevision),overrides:body?.overrides,expectedRevision:body?.expectedRevision}),
    visualConsistency:(id,body)=>{repo.getVideo(id)??missing('VIDEO_NOT_FOUND');return inspectVisualConsistency({scenes:repo.listScenes(id),styleProfile:body});},
    archiveChannel:(id,body)=>repo.archiveChannel(id,body),
    restoreChannel:(id,body)=>repo.restoreChannel(id,body),
    deleteChannel:(id,body)=>repo.softDeleteChannel(id,body),
    channel:(id)=>repo.getChannel(id)??missing('CHANNEL_NOT_FOUND'),
    createChannel:body=>repo.createChannel(body),
    updateChannel:(id,body)=>repo.updateChannel(id,body),
    presets:id=>repo.listPresetRevisions(id),
    presetRevision:(id,version)=>repo.getPresetRevision(id,Number(version)),
    savePresetRevision:(id,body)=>repo.savePresetRevision(id,body),
    presetCapabilities:()=>presetCapabilities,
    videos:(id,query={})=>repo.listVideoPage(id,{
      search:query.search??'',status:query.status??'all',limit:query.limit===undefined?20:Number(query.limit),
      cursor:query.cursor,deleted:query.deleted==='true'
    }),
    createVideo:(id,body)=>repo.createVideo(id,body),
    video:id=>repo.getVideo(id)??missing('VIDEO_NOT_FOUND'),
    scopedVideo:(channelId,videoId)=>repo.getScopedVideo(channelId,videoId),
    resumeVideo:(channelId,videoId)=>repo.resumeVideo(channelId,videoId),
    renameVideo:(id,body)=>repo.renameVideo(id,body),
    saveVideoStep:(id,body)=>repo.updateVideoStep(id,body),
    cloneVideo:(id,body)=>repo.cloneVideo(id,body),
    deleteVideo:(id,body)=>repo.softDeleteVideo(id,body),
    restoreVideo:(id,body)=>repo.restoreVideo(id,body),
    videoConfig:id=>repo.getVideoConfig(id),
    videoConfigHistory:id=>repo.listVideoConfigRevisions(id),
    videoConfigRevision:(id,version)=>repo.getVideoConfig(id,Number(version)),
    previewVideoConfig:(id,body)=>repo.previewVideoConfig(id,body),
    updateVideoConfig:(id,body)=>repo.updateVideoConfig(id,body),
    previewChannelPresetDiff:(id,body)=>repo.previewChannelPresetDiff(id,body),
    applyChannelPresetDiff:(id,body)=>repo.applyChannelPresetDiff(id,body),
    // Brief editing is deliberately independent of the final master script.
    contentBrief:id=>contentBriefs.get(id),
    saveContentBrief:(id,body)=>contentBriefs.save(id,body),
    validateContentBrief:(id,body)=>contentBriefs.validate(id,body),
    estimateContentBrief:(id,body)=>contentBriefs.estimate(id,body),
    contentBriefHistory:id=>contentBriefs.history(id),
    contentBriefRevision:(id,version)=>contentBriefs.revision(id,Number(version)),
    // R1-EXT-01: recipe catalog, frozen brief plan and approved-text export.
    // These are read-only, never dispatch LLM/research, score, or approve.
    scriptSkills:()=>({items:scriptSkillCatalog()}),
    previewScriptSkill:(id,body={})=>{
      if(!body||Object.keys(body).some(k=>!['briefRevision','scriptSkillId'].includes(k))||
         !Number.isSafeInteger(body.briefRevision)||body.briefRevision<1)throw new DomainError('SCRIPT_SKILL_PLAN_INVALID');
      const saved=contentBriefs.revision(id,body.briefRevision);
      return {videoId:id,briefRevision:saved.revision,...buildScriptSkillPlan(saved.brief,body.scriptSkillId??saved.brief.scriptSkillId)};
    },
    exportScriptSkill:(id,body={})=>{
      if(!body||Object.keys(body).some(k=>!['approvedRevision','scriptSkillId'].includes(k))||
        !Number.isSafeInteger(body.approvedRevision)||body.approvedRevision<1)
        throw new DomainError('SCRIPT_SKILL_EXPORT_INVALID');
      const state=masters.state(id);
      if(state.approvedRevision!==body.approvedRevision)throw new DomainError('MASTER_APPROVAL_REQUIRED',409);
      const revision=masters.revision(id,body.approvedRevision);
      if(!revision.approvedAt||masters.video(id).masterScript!==revision.text)
        throw new DomainError('MASTER_SOURCE_STALE',409);
      const saved=contentBriefs.get(id).brief;
      return exportApprovedScript({videoId:id,masterRevision:body.approvedRevision,
        scriptText:revision.text,scriptSha256:revision.sha256,
        skillId:body.scriptSkillId??saved.scriptSkillId??'educational',wpm:saved.target.wpm});
    },
    // CT02 outline stays a proposal until the user accepts it; chapter
    // generation and master approval are later R1 tasks.
    contentOutline:id=>contentOutlines.get(id),
    saveContentOutline:(id,body)=>contentOutlines.save(id,body),
    contentOutlineHistory:id=>contentOutlines.history(id),
    contentOutlineRevision:(id,v)=>contentOutlines.revision(id,Number(v)),
    generateContentOutline:(id,body)=>contentOutlines.requestRun(id,body),
    contentOutlineRuns:id=>contentOutlines.runs(id),
    contentOutlineRun:(id,runId)=>contentOutlines.getRun(id,runId),
    acceptContentOutlineRun:(id,runId,body)=>contentOutlines.acceptRun(id,runId,body),
    // Independent model chains produce immutable chapter drafts, never a master script.
    queueChapterGeneration:(id,body)=>chapterGenerations.requestBatch(id,body),
    chapterGenerationBatches:id=>chapterGenerations.batches(id),
    chapterGenerationBatch:(id,batchId)=>chapterGenerations.batch(id,batchId),
    retryChapterGeneration:(id,batchId)=>chapterGenerations.retryFailed(id,batchId),
    // EP04 US-4.5: read immutable judge history per draft. No edits to content.
    contentEvaluationRubric:()=>CONTENT_RUBRIC_V1,
    queueContentEvaluation:(id,variantId,body)=>evaluations.request(id,variantId,body),
    contentEvaluations:(id,variantId)=>evaluations.list(id,variantId),
    contentEvaluation:(id,variantId,evaluationId)=>evaluations.get(id,variantId,evaluationId),
    retryContentEvaluation:(id,variantId,evaluationId)=>evaluations.retry(id,variantId,evaluationId),
    // R1-05: immutable retries scoped by original variant and chosen evaluation.
    queueContentRetry:(id,variantId,body)=>contentRetries.request(id,variantId,body),
    listContentRetries:(id,variantId)=>contentRetries.list(id,variantId),
    getContentRetry:(id,variantId,retryId)=>contentRetries.get(id,variantId,retryId),
    retryFailedContentRetry:(id,variantId,retryId)=>contentRetries.retryFailed(id,variantId,retryId),
    compareContentRetry:(id,variantId,retryId)=>contentRetries.compare(id,variantId,retryId),
    // The new editor's Save and Approve are separate operations. AI scores
    // and draft completion cannot implicitly publish a master script.
    masterState:id=>masters.state(id),
    masterPreview:(id,body)=>masters.assemble(id,body),
    masterSave:(id,body)=>masters.save(id,body),
    masterApprove:(id,body)=>masters.approve(id,body),
    masterHistory:id=>masters.history(id),
    masterRevision:(id,revision)=>masters.revision(id,Number(revision)),
    script:(id,body)=>repo.updateScript(id,body),
    // R2-01 scene builder requires a frozen approved master; preview has no side effects.
    sceneBuildState:id=>sceneBuilder.state(id),
    previewSceneBuild:(id,body)=>sceneBuilder.preview(id,body),
    commitSceneBuild:(id,body)=>sceneBuilder.apply(id,body),
    sceneBuildHistory:id=>sceneBuilder.history(id),
    sceneBuildRevision:(id,version)=>sceneBuilder.revision(id,Number(version)),
    requestVisualPrompts:(id,body)=>visualPrompts.request(id,body),
    listVisualPrompts:id=>visualPrompts.list(id),
    getVisualPrompts:(id,runId)=>visualPrompts.get(id,runId),
    scenes:id=>repo.listScenes(id),
    previewSceneMutation:(id,body)=>sceneInspector.inspect(id,body),
    saveSceneMutation:(id,body)=>sceneInspector.save(id,body),
    replaceScenes:(id,body)=>repo.replaceScenes(id,body),
    timeline:id=>repo.getTimeline(id),
    timelineManifest:id=>timelineEditor.manifest(id),
    timelineHistory:id=>timelineHistory.state(id),
    moveTimelineHistory:(id,body)=>({...timelineHistory.move(id,body),manifest:timelineEditor.manifest(id)}),
    sceneWaveform:(id,query)=>waveforms.get(id,query),
    reorderTimeline:(id,body)=>timelineEditor.reorder(id,body),
    trimTimelineVisual:(id,body)=>timelineEditor.trimVisual(id,body),
    updateTimeline:(id,body)=>repo.updateTimeline(id,body),
    providers:()=>registry.list(),
    providerTemplates:()=>providers.templates(),
    providerAccounts:()=>providers.listAccounts(),
    createProviderAccount:async body=>{
      await checkCredential(body?.providerId,body?.credentialId);
      return providers.createAccount(body);
    },
    updateProviderAccount:async(id,body)=>{
      const old=providers.getAccount(id);
      if(!old)throw new DomainError('PROVIDER_ACCOUNT_NOT_FOUND',404);
      if(body?.credentialId!==undefined)await checkCredential(old.providerId,body.credentialId);
      return providers.updateAccount(id,body);
    },
    providerModels:accountId=>providers.listModels(accountId),
    providerReadiness:async(accountId,probe=false)=>{
      const account=providers.getAccount(accountId);
      if(!account)throw new DomainError('PROVIDER_ACCOUNT_NOT_FOUND',404);
      let hasCredential=false;
      if(account.credentialId&&vault){
        try{hasCredential=(await vault.list()).some(x=>x.id===account.credentialId&&x.providerId===account.providerId)}catch{}
      }
      return providerReadiness({account,models:providers.listModels(accountId),hasCredential,probe});
    },
    createProviderModel:(accountId,body)=>providers.createModel(accountId,body),
    updateProviderModel:(id,body)=>providers.updateModel(id,body),
    updateProviderQuota:(id,body)=>providers.setQuota(id,body),
    providerRoutePlan:body=>providers.planRoute(body),
    providerQuotaLedger:(id,limit)=>({summary:quotaLedger.snapshot(id),...quotaLedger.list(id,{limit})}),
    providerMonitor:(limit)=>providerMonitor.snapshot({limit}),
    // R0-VID-01 safe read/config/preflight operations only: neither invoke a
    // model nor queue a paid remote job based on a frontend approval flag.
    videoProviderCapabilities:()=>({items:videoCapabilities.list()}),
    saveVideoProviderCapabilities:(id,body)=>videoCapabilities.save(id,body),
    preflightVideoProvider:body=>videoCapabilities.preflight(body),
    // Paid approval action MUST be explicit and job-scoped. Frontend plan
    // preview never passes an authorization token to a worker.
    approvePaid:body=>{
      if(!paidPolicy)throw new DomainError('PAID_POLICY_UNAVAILABLE',503);
      const job=store.get(body?.jobId);
      if(!job)throw new DomainError('JOB_NOT_FOUND',404);
      if(!/^(asset:|llm:|content:)/.test(job.kind))throw new DomainError('JOB_NOT_BILLABLE',409);
      // The planned paid target must be frozen in the queued job. A user may
      // not authorize an unrelated model for a free/local job by submitting IDs.
      if(job.payload?.providerModelId!==body.modelId||job.payload?.providerAccountId!==body.accountId)
        throw new DomainError('PAID_JOB_TARGET_REQUIRED',409);
      if(['succeeded','cancelled'].includes(job.status))throw new DomainError('JOB_NOT_BILLABLE',409);
      return paidPolicy.approve(body);
    },
    paidApprovals:jobId=>{
      if(!paidPolicy)throw new DomainError('PAID_POLICY_UNAVAILABLE',503);
      return paidPolicy.list(jobId);
    },
    paidAudit:jobId=>{
      if(!paidPolicy)throw new DomainError('PAID_POLICY_UNAVAILABLE',503);
      return paidPolicy.audit(jobId);
    },
    revokePaid:id=>{
      if(!paidPolicy)throw new DomainError('PAID_POLICY_UNAVAILABLE',503);
      return paidPolicy.revoke(id);
    },
    jobs:(query)=>jobCenter.list(query),
    job:(id)=>jobCenter.get(id),
    jobAction:(id,action)=>jobCenter.transition(id,action),
    jobEvents:(after,limit)=>jobCenter.events(after,limit),
    queueAsset:(sceneId,body)=>{
      const scene=repo.getScene(sceneId);if(!scene)throw new DomainError('SCENE_NOT_FOUND',404);
      if(!body||!['voice','image','video'].includes(body.kind)||typeof body.idempotencyKey!=='string'||!(/^[a-zA-Z0-9_-]{1,100}$/).test(body.idempotencyKey))throw new DomainError('INVALID_ASSET_JOB');
      const kind=body.kind;
      // Use this video's resolved settings (not the channel's latest preset).
      // Per-scene overrides remain explicit; fingerprint incorporates the
      // effective input so caching cannot reuse the wrong voice/image style.
      const config=repo.getVideo(scene.videoId).effectivePreset;
      if(kind==='voice' && (body.provider??'edge')==='edge' && body.remoteConsent!==true)throw new DomainError('REMOTE_CONSENT_REQUIRED',403);
      // Legacy voice POST delegates to the same immutable R2-03 snapshot and
      // intent fence as the new UI. Job metadata stays sanitized for clients.
      if(kind==='image')throw new DomainError('USE_SCENE_IMAGE_JOBS',409);
      if(kind==='voice'){
        if(body.rate!==undefined&&(!Number.isInteger(body.rate)||body.rate< -50||body.rate>100))
          throw new DomainError('INVALID_VOICE_SPEED');
        const queued=sceneVoices.enqueueWithoutCache(sceneId,{provider:body.provider??'edge',voice:body.voice,
          speed:body.rate===undefined?undefined:1+body.rate/100,remoteConsent:body.remoteConsent,
          idempotencyKey:body.idempotencyKey});
        return {job:queued.job?publicJob(store.get(queued.job.id)):null,reused:queued.reused,cached:queued.cached};
      }
      const details=kind==='image'?{prompt:scene.visualPrompt||scene.text,style:body.style??config.media.style,seed:body.seed??1,width:body.width??1024,height:body.height??576}
        :{request:body.request};
      if(kind==='video'){
        if(!body.request||typeof body.request!=='object'||Array.isArray(body.request))
          throw new DomainError('VIDEO_REQUEST_REQUIRED');
        // A video request must not bypass the selected model's capability
        // constraints by skipping the preview screen or forging a paid flag.
        if(typeof body.providerModelId!=='string')throw new DomainError('VIDEO_MODEL_REQUIRED');
        const r=body.request;
        const preflight=videoCapabilities.preflight({modelId:body.providerModelId,
          mode:r.mode,durationSec:r.durationSeconds,width:r.width,height:r.height,fps:r.fps,
          allowRemote:body.remoteConsent===true,fallbackImageMotion:false});
        if(!preflight.canPlan)throw new DomainError('VIDEO_PREFLIGHT_BLOCKED',409);
        const configured=videoCapabilities.list().find(m=>m.id===body.providerModelId);
        // The production job handler currently understands ONLY a configured
        // local ComfyUI workflow. Remote/paid providers require a future
        // explicit adapter and dispatch-specific billing approval (R2).
        if(configured.providerId!=='comfyui'||configured.location!=='local'||configured.costTier!=='local')
          throw new DomainError('VIDEO_PROVIDER_NOT_IMPLEMENTED',409);
        // Scene-image references must be loaded in the trusted worker, not
        // deserialized as raw imageBytes from untrusted JSON over HTTP.
        if(r.mode==='image_to_video')throw new DomainError('VIDEO_REFERENCE_ASSET_REQUIRED',409);
        if(typeof r.prompt!=='string'||r.prompt.trim().length<2||r.prompt.length>12000||
          Object.keys(r).some(k=>!['mode','prompt','negativePrompt','durationSeconds','width','height','fps','seed'].includes(k))||
          (r.seed!==undefined&&(!Number.isSafeInteger(r.seed)||r.seed<0)))
          throw new DomainError('INVALID_VIDEO_REQUEST');
        details.providerModelId=body.providerModelId;
      }
      const input={...details,sceneId,kind};
      const revisionId=fingerprint(input);
      const payload={projectId:scene.videoId,sceneId,revisionId,remoteConsent:body.remoteConsent===true,...details};
      // Never return raw queued payload: visual prompts and scene text may be
      // private and an adapter might later add provider-specific secrets.
      const queued=store.enqueue({key:`asset:${body.idempotencyKey}`,kind:`asset:${kind}`,payload,maxAttempts:kind==='video'?1:3});
      return {job:publicJob(queued.job),reused:queued.reused};
    },
    queueDiagnostic:(body)=>{
      if(body&&Object.keys(body).some(k=>!['idempotencyKey'].includes(k))) throw new DomainError('INVALID_DIAGNOSTIC',400);
      const key=body?.idempotencyKey;
      if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(key)) throw new DomainError('INVALID_IDEMPOTENCY_KEY');
      const queued=store.enqueue({key:`diagnostic:${key}`,kind:'system:diagnostic',payload:{}});
      return {job:publicJob(queued.job),reused:queued.reused};
    },
    sceneAssets:id=>manifest.listScene(id),
    selectiveRegenerate:(id,body)=>selective.regenerate(id,body),
    selectSceneVoice:(id,body)=>selective.selectVoice(id,body),
    previewComposition:(id,body)=>compositions.preview(id,body),
    previewTimedComposition:(id,body)=>timedCompositions.preview(id,body),
    publishTimedComposition:(id,body)=>timedCompositions.publish(id,body),
    publishComposition:(id,body)=>compositions.publish(id,body),
    // EXT-07 is proposal-only. Even a forged `includePaidCandidates` flag
    // never grants permission to call remote or billable providers.
    visualRoutePreview:async(id,body={})=>{
      if(!body||Object.keys(body).some(k=>!['mode','includePaidCandidates'].includes(k)))throw new DomainError('VISUAL_ROUTE_INVALID_OPTIONS',400);
      const doc=await timedCompositions.preview(id,{});
      return routeVisuals({composition:doc,mode:body.mode??'balanced',
        localComfyConfigured:!!registry.imageAdapter,includePaidCandidates:body.includePaidCandidates===true});
    },
    motionStylePresets:()=>({items:MOTION_TEMPLATES}),
    motionStyleCurrent:id=>styles.latest(id),
    motionStyleRevision:(id,rev)=>styles.revision(id,Number(rev)),
    motionStylePublish:(id,body)=>styles.publish(id,body),
    projectZip:(id,revision)=>projectZip.export(id,revision),
    renderPreflight:(id,body)=>renderExports?.preflight(id,body)??missing('RENDER_UNAVAILABLE'),
    renderQueue:(id,body)=>renderExports?.enqueue(id,body)??missing('RENDER_UNAVAILABLE'),
    musicImport:(id,body)=>renderExports?.importMusic(id,body)??missing('RENDER_UNAVAILABLE'),
    musicList:(id)=>renderExports?.listMusic(id)??missing('RENDER_UNAVAILABLE'),
    renderJob:(id,jobId)=>renderExports?.job(id,jobId)??missing('RENDER_UNAVAILABLE'),
    renderFile:(id,jobId)=>renderExports?.file(id,jobId)??missing('RENDER_UNAVAILABLE'),
    renderSubtitle:(id,jobId)=>renderExports?.subtitle(id,jobId)??missing('RENDER_UNAVAILABLE'),
    renderThumbnail:(id,jobId)=>renderExports?.thumbnail(id,jobId)??missing('RENDER_UNAVAILABLE'),
    compositionHistory:id=>({items:compositions.history(id)}),
    compositionRevision:(id,revision)=>compositions.revision(id,Number(revision)),
    videoAssetLibrary:(id,query)=>assetLibrary.page(id,query),
    videoAssetRecompute:id=>assetLibrary.recompute(id),
    assetDagPreview:(videoId,body)=>assetDags.preview(videoId,body),
    assetDagSubmit:(videoId,body)=>assetDags.submit(videoId,body),
    assetDagRuns:(videoId,query={})=>assetDags.list(videoId,{limit:query.limit===undefined?25:Number(query.limit)}),
    assetDagRun:(videoId,runId)=>assetDags.get(videoId,runId),
    assetDagRetry:(videoId,runId,body)=>assetDags.retry(videoId,runId,body),
    imageProvider:async(probe=false)=>{
      const adapter=registry.imageAdapter;
      if(!adapter)return {provider:'comfyui',configured:false,health:'not_configured'};
      if(!probe)return {provider:'comfyui',configured:true,health:'not_probed'};
      const result=await adapter.diagnose();
      return {provider:'comfyui',configured:true,health:result.reachable?'reachable':'unavailable',
        note:'Connectivity only; model/workflow/GPU inference not verified'};
    },
    // Local AI Video: all policy writes require revision, all GPU jobs are
    // explicit SP-04 jobs. No remote fallback and no automatic paid dispatch.
    videoMediaPolicy:(scope,id)=>clips.getScopePolicy(scope,id),
    saveVideoMediaPolicy:(scope,id,body)=>clips.saveScopePolicy(scope,id,body),
    videoMediaPolicyHistory:(scope,id)=>clips.history(scope,id),
    videoClipStatus:id=>clips.status(id),
    videoClipPreflight:id=>clips.preflight(id),
    queueVideoClip:(id,body)=>clips.queue(id,body),
    queueVideoClipBatch:(id,body)=>clips.enqueueBatch(id,body),
    importVideoClip:(id,body)=>clips.importBase64(id,body),
    importVideoClipStream:(id,stream,headers)=>importSceneVideoStream({clips,sceneId:id,stream,...headers}),
    selectVideoClip:(id,body)=>clips.select(id,body),
    fallbackVideoToImage:(id,body)=>clips.fallbackToImage(id,body),
    videoClipFile:id=>clips.activeBytes(id),
    videoClipRevisionFile:(id,assetId)=>clips.revisionBytes(id,assetId),
    queueSceneImage:(id,body)=>sceneImages.queue(id,body),
    sceneImageStatus:id=>sceneImages.status(id),
    selectSceneImage:(id,body)=>sceneImages.select(id,body),
    importSceneImage:(id,body)=>sceneImages.importBase64(id,body),
    sceneImageBytes:id=>sceneImages.image(id),
    queueSceneVoice:(id,body)=>sceneVoices.queue(id,body),
    queueVideoVoices:(id,body)=>sceneVoices.batch(id,body),
    sceneVoiceStatus:id=>sceneVoices.status(id),
    localTtsProviders:probe=>localTtsCatalog(registry,{probe}),
    domainEvents:()=>repo.db.prepare('SELECT seq,entity_type,entity_id,event_name,created_at FROM domain_events ORDER BY seq DESC LIMIT 100').all(),
  };
}
function missing(code){throw new DomainError(code,404);}
