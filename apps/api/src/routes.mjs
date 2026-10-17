/** HTTP adapter: only whitelist valid routes, parse schemas in the domain. */
import {validCursor,jobEventFrame} from './job-center.mjs';
import {DomainError} from '../../../packages/core/src/index.mjs';

export function registerStudioRoutes(app,{controllers,store,diagnostics}) {
  // Consistent error shape and no stack traces / prompts / secrets in responses.
  const use = (fn) => async (request,reply) => {
    try {return await fn(request,reply);}
    catch(error){
      // Internal bugs must be 500 with no raw message. Calling them 400 would
      // hide regressions from operators and break stable SDK error handling.
      const status=error instanceof DomainError?error.status:500;
      const code=error instanceof DomainError?error.code:'INTERNAL_ERROR';
      request.log.warn({code},'request rejected');
      return reply.code(status).send({error:code});
    }
  };
  app.get('/api/channels',use(req=>({items:controllers.channels(req.query)})));
  app.post('/api/channels',use((req,reply)=>reply.code(201).send(controllers.createChannel(req.body))));
  app.get('/api/channels/:id',use(req=>controllers.channel(req.params.id)));
  app.patch('/api/channels/:id',use(req=>controllers.updateChannel(req.params.id,req.body)));
  app.get('/api/channels/:id/summary',use(req=>controllers.channelSummary(req.params.id)));
  app.post('/api/channels/:id/archive',use(req=>controllers.archiveChannel(req.params.id,req.body)));
  app.post('/api/channels/:id/restore',use(req=>controllers.restoreChannel(req.params.id,req.body)));
  // DELETE is reversible soft-delete; require explicit rowVersion in request body.
  app.delete('/api/channels/:id',use(req=>controllers.deleteChannel(req.params.id,req.body)));
  app.get('/api/channels/:id/presets',use(req=>({items:controllers.presets(req.params.id)})));
  app.get('/api/channels/:id/presets/:version',use(req=>controllers.presetRevision(req.params.id,Number(req.params.version))));
  app.post('/api/channels/:id/presets/revisions',use(req=>controllers.savePresetRevision(req.params.id,req.body)));
  app.get('/api/preset-capabilities',use(()=>controllers.presetCapabilities()));
  app.get('/api/channels/:id/videos',use(req=>controllers.videos(req.params.id,req.query??{})));
  app.post('/api/channels/:id/videos',use((req,reply)=>reply.code(201).send(controllers.createVideo(req.params.id,req.body))));
  // Scoped video endpoints prevent accidental cross-channel navigation.
  app.get('/api/channels/:id/videos/:videoId',use(req=>controllers.scopedVideo(req.params.id,req.params.videoId)));
  app.get('/api/channels/:id/videos/:videoId/resume',use(req=>controllers.resumeVideo(req.params.id,req.params.videoId)));
  app.get('/api/videos/:id',use(req=>controllers.video(req.params.id)));
  // R4-05 drafts are deliberately separate from immutable Composition/render.
  app.get('/api/videos/:id/subtitles/draft',use(req=>controllers.subtitleDraft(req.params.id)));
  app.post('/api/videos/:id/subtitles/preview',use(req=>controllers.subtitlePreview(req.params.id,req.body)));
  app.put('/api/videos/:id/subtitles/draft',use(req=>controllers.subtitleSave(req.params.id,req.body)));
  // R4-07 deterministic heuristic only: no character generation or paid API.
  app.post('/api/videos/:id/visual-consistency/preview',use(req=>controllers.visualConsistency(req.params.id,req.body)));

  // R2-EXT-01: composition preview is a local read-only operation; publish
  // requires a matching digest and exact editor rowVersion (no AI/render).
  // EXT-02 opt-in v2 measured timing. V1 endpoints continue to produce v1.
  app.post('/api/videos/:id/composition/timing/preview',use(req=>controllers.previewTimedComposition(req.params.id,req.body??{})));
  app.post('/api/videos/:id/composition/timing/revisions',use((req,reply)=>reply.code(201).send(controllers.publishTimedComposition(req.params.id,req.body))));
  app.post('/api/videos/:id/composition/preview',use(req=>controllers.previewComposition(req.params.id,req.body??{})));
  app.post('/api/videos/:id/composition/revisions',use((req,reply)=>reply.code(201).send(controllers.publishComposition(req.params.id,req.body))));
  app.get('/api/videos/:id/composition/revisions',use(req=>controllers.compositionHistory(req.params.id)));
  app.get('/api/videos/:id/composition/revisions/:revision',use(req=>controllers.compositionRevision(req.params.id,req.params.revision)));
  app.post('/api/videos/:id/visual-route/preview',use(req=>controllers.visualRoutePreview(req.params.id,req.body??{})));
  app.get('/api/motion-style/presets',use(()=>controllers.motionStylePresets()));
  app.get('/api/videos/:id/motion-style',use(req=>controllers.motionStyleCurrent(req.params.id)));
  app.get('/api/videos/:id/motion-style/revisions/:revision',use(req=>controllers.motionStyleRevision(req.params.id,req.params.revision)));
  app.post('/api/videos/:id/motion-style/revisions',use((req,reply)=>reply.code(201).send(controllers.motionStylePublish(req.params.id,req.body))));
  // R3-12 preview uses identical guards to dispatch but never reserves a job.
  app.get('/api/videos/:id/music',use(req=>controllers.musicList(req.params.id)));
  app.post('/api/videos/:id/music/import',use((req,reply)=>reply.code(201).send(controllers.musicImport(req.params.id,req.body))));
  app.post('/api/videos/:id/renders/preflight',use(req=>controllers.renderPreflight(req.params.id,req.body)));
  app.post('/api/videos/:id/renders',use((req,reply)=>reply.code(202).send(controllers.renderQueue(req.params.id,req.body))));
  app.get('/api/videos/:id/renders/:jobId',use(req=>controllers.renderJob(req.params.id,req.params.jobId)));
  // R3-11: authenticated ZIP64 project bundle; delete private staging bytes
  // after download completes or disconnects. Nothing is persisted to the DB.
  app.get('/api/videos/:id/exports/project.zip',use(async(req,reply)=>{
    const revision=Number(req.query?.revision);
    if(!/^[1-9]\d*$/.test(String(req.query?.revision??''))||!Number.isSafeInteger(revision))
      throw new DomainError('PROJECT_ZIP_INVALID_REVISION',400);
    const file=await controllers.projectZip(req.params.id,revision);
    const {rm}=await import('node:fs/promises');
    let cleaned=false;
    const cleanup=()=>{if(cleaned)return;cleaned=true;void rm(file.path,{force:true}).catch(()=>{});};
    file.stream.once('close',cleanup);
    reply.raw.once('close',()=>{file.stream.destroy();cleanup();});
    return reply.header('cache-control','no-store, private')
      .header('content-disposition',`attachment; filename=\"${file.filename}\"`)
      .header('content-length',file.size).type('application/zip').send(file.stream);
  }));
  app.get('/api/videos/:id/renders/:jobId/thumbnail',use(async(req,reply)=>{
    const file=await controllers.renderThumbnail(req.params.id,req.params.jobId);
    return reply.header('cache-control','no-store, private').header('content-disposition','attachment; filename=thumbnail.jpg')
      .header('content-length',file.size).type('image/jpeg').send(file.stream);
  }));
  app.get('/api/videos/:id/renders/:jobId/srt',use(async(req,reply)=>{
    const file=await controllers.renderSubtitle(req.params.id,req.params.jobId);
    return reply.header('cache-control','no-store, private')
      .header('content-disposition','attachment; filename=subtitles.srt')
      .header('content-length',file.size).type('application/x-subrip; charset=utf-8').send(file.stream);
  }));
  app.get('/api/videos/:id/renders/:jobId/mp4',use(async(req,reply)=>{
    const file=await controllers.renderFile(req.params.id,req.params.jobId);
    return reply.header('cache-control','no-store, private').header('content-disposition','attachment; filename=video.mp4')
      .header('content-length',file.size).type('video/mp4').send(file.stream);
  }));


  // R2-07: preview never dispatches. POST requires an explicit request key and
  // provider choices; DAG, intents and run ledger commit as one batch.
  app.post('/api/videos/:id/assets/dag/preview',use(req=>controllers.assetDagPreview(req.params.id,req.body)));
  app.post('/api/videos/:id/assets/dag',use((req,reply)=>reply.code(202).send(controllers.assetDagSubmit(req.params.id,req.body))));
  // R2-09: browsing/analysis only; never queues inference or deletes files.
  app.get('/api/videos/:id/assets/library',use(req=>controllers.videoAssetLibrary(req.params.id,req.query??{})));
  app.get('/api/videos/:id/assets/recompute-plan',use(req=>controllers.videoAssetRecompute(req.params.id)));
  app.get('/api/videos/:id/assets/dag',use(req=>controllers.assetDagRuns(req.params.id,req.query)));
  app.get('/api/videos/:id/assets/dag/:runId',use(req=>controllers.assetDagRun(req.params.id,req.params.runId)));
  app.post('/api/videos/:id/assets/dag/:runId/retry',use(req=>controllers.assetDagRetry(req.params.id,req.params.runId,req.body))); 
  app.patch('/api/videos/:id',use(req=>controllers.renameVideo(req.params.id,req.body)));
  app.put('/api/videos/:id/step',use(req=>controllers.saveVideoStep(req.params.id,req.body)));
  app.post('/api/videos/:id/clone',use((req,reply)=>reply.code(201).send(controllers.cloneVideo(req.params.id,req.body))));
  app.delete('/api/videos/:id',use(req=>controllers.deleteVideo(req.params.id,req.body)));
  app.post('/api/videos/:id/restore',use(req=>controllers.restoreVideo(req.params.id,req.body)));
  app.get('/api/videos/:id/config',use(req=>controllers.videoConfig(req.params.id)));
  app.get('/api/videos/:id/config/revisions',use(req=>({items:controllers.videoConfigHistory(req.params.id)})));
  app.get('/api/videos/:id/config/revisions/:version',use(req=>controllers.videoConfigRevision(req.params.id,req.params.version)));
  app.post('/api/videos/:id/config/preview',use(req=>controllers.previewVideoConfig(req.params.id,req.body)));
  app.put('/api/videos/:id/config',use(req=>controllers.updateVideoConfig(req.params.id,req.body)));
  app.post('/api/videos/:id/config/diff',use(req=>controllers.previewChannelPresetDiff(req.params.id,req.body)));
  app.post('/api/videos/:id/config/apply',use(req=>controllers.applyChannelPresetDiff(req.params.id,req.body)));
  // R1-01: GET/PUT/validate/estimate are side-effect free except explicit PUT.
  // Validation must not queue jobs or return any prompt in server logs.
  // Read-only skill plan and approved script JSON export (no provider calls).
  app.get('/api/content/script-skills',use(()=>controllers.scriptSkills()));
  app.post('/api/videos/:id/content/script-skills/plan',use(req=>controllers.previewScriptSkill(req.params.id,req.body)));
  app.post('/api/videos/:id/content/script-skills/export',use(req=>controllers.exportScriptSkill(req.params.id,req.body)));
  app.get('/api/videos/:id/content/brief',use(req=>controllers.contentBrief(req.params.id)));
  app.put('/api/videos/:id/content/brief',use(req=>controllers.saveContentBrief(req.params.id,req.body)));
  app.post('/api/videos/:id/content/brief/validate',use(req=>controllers.validateContentBrief(req.params.id,req.body)));
  app.post('/api/videos/:id/content/estimate',use(req=>controllers.estimateContentBrief(req.params.id,req.body)));
  app.get('/api/videos/:id/content/brief/revisions',use(req=>({items:controllers.contentBriefHistory(req.params.id)})));
  app.get('/api/videos/:id/content/brief/revisions/:version',use(req=>controllers.contentBriefRevision(req.params.id,req.params.version)));
  // R1-02 CT02. Queued generation is local Ollama only and requires an
  // explicitly saved brief revision + registered local model.
  app.get('/api/videos/:id/content/outline',use(req=>controllers.contentOutline(req.params.id)));
  app.put('/api/videos/:id/content/outline',use(req=>controllers.saveContentOutline(req.params.id,req.body)));
  app.get('/api/videos/:id/content/outline/revisions',use(req=>({items:controllers.contentOutlineHistory(req.params.id)})));
  app.get('/api/videos/:id/content/outline/revisions/:version',use(req=>controllers.contentOutlineRevision(req.params.id,req.params.version)));
  app.post('/api/videos/:id/content/outline/generate',use((req,reply)=>reply.code(202).send(controllers.generateContentOutline(req.params.id,req.body))));
  app.get('/api/videos/:id/content/outline/runs',use(req=>({items:controllers.contentOutlineRuns(req.params.id)})));
  app.get('/api/videos/:id/content/outline/runs/:runId',use(req=>controllers.contentOutlineRun(req.params.id,req.params.runId)));
  app.post('/api/videos/:id/content/outline/runs/:runId/accept',use(req=>controllers.acceptContentOutlineRun(req.params.id,req.params.runId,req.body)));
  // R1-03: authenticated generation only; drafts remain separate from master script.
  app.post('/api/videos/:id/content/chapters/generate',use((req,reply)=>reply.code(202).send(controllers.queueChapterGeneration(req.params.id,req.body))));
  app.get('/api/videos/:id/content/chapters/batches',use(req=>({items:controllers.chapterGenerationBatches(req.params.id)})));
  app.get('/api/videos/:id/content/chapters/batches/:batchId',use(req=>controllers.chapterGenerationBatch(req.params.id,req.params.batchId)));
  app.post('/api/videos/:id/content/chapters/batches/:batchId/retry',use(req=>{
    if(req.body!==undefined&&(req.body===null||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length))
      throw new DomainError('INVALID_CHAPTER_RETRY',400);
    return controllers.retryChapterGeneration(req.params.id,req.params.batchId);
  }));
  // Judge outputs are queued, validated and immutable; list/get scoped to video.
  app.get('/api/content/evaluation-rubric',use(()=>controllers.contentEvaluationRubric()));
  app.post('/api/videos/:id/content/variants/:variantId/evaluations',use((req,reply)=>reply.code(202).send(
    controllers.queueContentEvaluation(req.params.id,req.params.variantId,req.body))));
  app.get('/api/videos/:id/content/variants/:variantId/evaluations',use(req=>({items:
    controllers.contentEvaluations(req.params.id,req.params.variantId)})));
  app.get('/api/videos/:id/content/variants/:variantId/evaluations/:evaluationId',use(req=>
    controllers.contentEvaluation(req.params.id,req.params.variantId,req.params.evaluationId)));
  app.post('/api/videos/:id/content/variants/:variantId/evaluations/:evaluationId/retry',use(req=>{
    if(req.body!==undefined&&(req.body===null||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length))
      throw new DomainError('INVALID_EVALUATION_RETRY',400);
    return controllers.retryContentEvaluation(req.params.id,req.params.variantId,req.params.evaluationId);
  }));
  // R1-05: retry only one evaluated chapter; never change source/master script.
  app.post('/api/videos/:id/content/variants/:variantId/retries',use((req,reply)=>reply.code(202).send(
    controllers.queueContentRetry(req.params.id,req.params.variantId,req.body))));
  app.get('/api/videos/:id/content/variants/:variantId/retries',use(req=>({items:
    controllers.listContentRetries(req.params.id,req.params.variantId)})));
  app.get('/api/videos/:id/content/variants/:variantId/retries/:retryId',use(req=>
    controllers.getContentRetry(req.params.id,req.params.variantId,req.params.retryId)));
  app.get('/api/videos/:id/content/variants/:variantId/retries/:retryId/compare',use(req=>
    controllers.compareContentRetry(req.params.id,req.params.variantId,req.params.retryId)));
  app.post('/api/videos/:id/content/variants/:variantId/retries/:retryId/retry-job',use(req=>{
    if(req.body!==undefined&&(req.body===null||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length))
      throw new DomainError('INVALID_CONTENT_RETRY_JOB',400);
    return controllers.retryFailedContentRetry(req.params.id,req.params.variantId,req.params.retryId);
  }));
  // R1-06: preview and candidate saves cannot publish; approval is explicit.
  app.get('/api/videos/:id/content/master',use(req=>controllers.masterState(req.params.id)));
  app.post('/api/videos/:id/content/master/preview',use(req=>controllers.masterPreview(req.params.id,req.body)));
  app.put('/api/videos/:id/content/master',use(req=>controllers.masterSave(req.params.id,req.body)));
  app.post('/api/videos/:id/content/master/approve',use(req=>controllers.masterApprove(req.params.id,req.body)));
  app.get('/api/videos/:id/content/master/revisions',use(req=>controllers.masterHistory(req.params.id)));
  app.get('/api/videos/:id/content/master/revisions/:revision',use(req=>controllers.masterRevision(req.params.id,req.params.revision)));
  app.put('/api/videos/:id/script',use(req=>controllers.script(req.params.id,req.body)));
  // R2-01: all scene proposals originate from approved immutable Master Script.
  app.get('/api/videos/:id/scenes/builder',use(req=>controllers.sceneBuildState(req.params.id)));
  app.post('/api/videos/:id/scenes/builder/preview',use(req=>controllers.previewSceneBuild(req.params.id,req.body??{})));
  app.put('/api/videos/:id/scenes/builder',use(req=>controllers.commitSceneBuild(req.params.id,req.body)));
  app.get('/api/videos/:id/scenes/builder/revisions',use(req=>controllers.sceneBuildHistory(req.params.id)));
  app.get('/api/videos/:id/scenes/builder/revisions/:revision',use(req=>controllers.sceneBuildRevision(req.params.id,req.params.revision)));
  // R2-02: AI proposals are review-only. Never mutate a scene at job completion.
  app.post('/api/videos/:id/scenes/visual-prompts/generate',use((req,reply)=>reply.code(202).send(controllers.requestVisualPrompts(req.params.id,req.body))));
  app.get('/api/videos/:id/scenes/visual-prompts/runs',use(req=>controllers.listVisualPrompts(req.params.id)));
  app.get('/api/videos/:id/scenes/visual-prompts/runs/:runId',use(req=>controllers.getVisualPrompts(req.params.id,req.params.runId)));
  app.get('/api/videos/:id/scenes',use(req=>({items:controllers.scenes(req.params.id)})));
  app.put('/api/videos/:id/scenes',use(req=>({items:controllers.replaceScenes(req.params.id,req.body)})));
  // R3-01 inspector edit: preview impacts, then explicit optimistic-lock PATCH.
  app.post('/api/scenes/:id/impacts',use(req=>controllers.previewSceneMutation(req.params.id,req.body)));
  app.patch('/api/scenes/:id',use(req=>controllers.saveSceneMutation(req.params.id,req.body)));
  app.get('/api/videos/:id/timeline',use(req=>controllers.timeline(req.params.id)));
  app.get('/api/videos/:id/timeline/manifest',use(req=>controllers.timelineManifest(req.params.id)));
  app.get('/api/videos/:id/timeline/history',use(req=>controllers.timelineHistory(req.params.id)));
  app.post('/api/videos/:id/timeline/history',use(req=>controllers.moveTimelineHistory(req.params.id,req.body)));
  app.patch('/api/videos/:id/timeline/order',use(req=>controllers.reorderTimeline(req.params.id,req.body)));
  app.patch('/api/videos/:id/timeline/visual-window',use(req=>controllers.trimTimelineVisual(req.params.id,req.body)));
  app.put('/api/videos/:id/timeline',use(req=>controllers.updateTimeline(req.params.id,req.body)));
  app.post('/api/scenes/:id/assets/jobs',use((req,reply)=>reply.code(202).send(controllers.queueAsset(req.params.id,req.body))));
  app.get('/api/scenes/:id/assets',use(req=>({items:controllers.sceneAssets(req.params.id)})));
  // R2-11: ONLY a user-confirmed, one-scene voice OR image rerun.
  app.post('/api/scenes/:id/assets/regenerate',use((req,reply)=>reply.code(202).send(controllers.selectiveRegenerate(req.params.id,req.body))));
  app.post('/api/scenes/:id/voice/select',use(req=>controllers.selectSceneVoice(req.params.id,req.body)));
  // R2-05: strictly local ComfyUI; queue uses committed scene visual prompt.
  app.get('/api/images/local-provider',use(req=>controllers.imageProvider(req.query?.probe==='true')));
  // R2-VID-01..05: actual policy provenance + queued LOCAL video generation.
  app.get('/api/video-media/policy/:scope/:id',use(req=>controllers.videoMediaPolicy(req.params.scope,req.params.id)));
  app.put('/api/video-media/policy/:scope/:id',use(req=>controllers.saveVideoMediaPolicy(req.params.scope,req.params.id,req.body)));
  app.get('/api/video-media/policy/:scope/:id/history',use(req=>controllers.videoMediaPolicyHistory(req.params.scope,req.params.id)));
  app.get('/api/scenes/:id/video/status',use(req=>controllers.videoClipStatus(req.params.id)));
  app.get('/api/scenes/:id/video/preflight',use(req=>controllers.videoClipPreflight(req.params.id)));
  app.post('/api/scenes/:id/video/jobs',use((req,reply)=>reply.code(202).send(controllers.queueVideoClip(req.params.id,req.body))));
  app.post('/api/videos/:id/video/jobs',use((req,reply)=>reply.code(202).send(controllers.queueVideoClipBatch(req.params.id,req.body))));
  // Explicit 8MiB MP4 via base64; Fastify default 1MiB is too small, but
  // this single route has a bounded ~12MiB decoded JSON body (not global).
  app.post('/api/scenes/:id/video/import',{bodyLimit:12*1024*1024},use((req,reply)=>reply.code(201).send(controllers.importVideoClip(req.params.id,req.body))));
  app.post('/api/scenes/:id/video/select',use(req=>controllers.selectVideoClip(req.params.id,req.body)));
  app.post('/api/scenes/:id/video/fallback',use(req=>controllers.fallbackVideoToImage(req.params.id,req.body)));
  app.post('/api/scenes/:id/image/jobs',use((req,reply)=>reply.code(202).send(controllers.queueSceneImage(req.params.id,req.body))));
  app.get('/api/scenes/:id/image/status',use(req=>controllers.sceneImageStatus(req.params.id)));
  app.post('/api/scenes/:id/image/select',use(req=>controllers.selectSceneImage(req.params.id,req.body)));
  app.post('/api/scenes/:id/image/import',use((req,reply)=>reply.code(201).send(controllers.importSceneImage(req.params.id,req.body))));
  // R2-03: explicit consent for Edge's online service, versioned input/cache.
  app.post('/api/scenes/:id/voice/jobs',use((req,reply)=>reply.code(202).send(controllers.queueSceneVoice(req.params.id,req.body))));
  app.post('/api/videos/:id/voice/jobs',use((req,reply)=>reply.code(202).send(controllers.queueVideoVoices(req.params.id,req.body))));
  app.get('/api/scenes/:id/voice/status',use(req=>controllers.sceneVoiceStatus(req.params.id)));
  app.get('/api/scenes/:id/voice/waveform',use(req=>controllers.sceneWaveform(req.params.id,req.query??{})));
  app.get('/api/tts/local-providers',use(req=>controllers.localTtsProviders(req.query?.probe==='true')));
  app.get('/api/providers',use(()=>({items:controllers.providers()})));
  // R0-07 account/model metadata routes. No raw credential, URL probe,
  // provider invocation, or automatic paid account switch is exposed here.
  app.get('/api/providers/templates',use(()=>({items:controllers.providerTemplates()})));
  app.get('/api/provider-accounts',use(()=>({items:controllers.providerAccounts()})));
  app.post('/api/provider-accounts',use(async(req,reply)=>reply.code(201).send(await controllers.createProviderAccount(req.body))));
  app.patch('/api/provider-accounts/:id',use(req=>controllers.updateProviderAccount(req.params.id,req.body)));
  app.get('/api/provider-accounts/:id/models',use(req=>({items:controllers.providerModels(req.params.id)})));
  app.get('/api/provider-accounts/:id/readiness',use(req=>controllers.providerReadiness(req.params.id,req.query?.probe==='true')));
  app.post('/api/provider-accounts/:id/models',use((req,reply)=>reply.code(201).send(controllers.createProviderModel(req.params.id,req.body))));
  app.get('/api/provider-models',use(()=>({items:controllers.providerModels()})));
  app.patch('/api/provider-models/:id',use(req=>controllers.updateProviderModel(req.params.id,req.body)));
  app.put('/api/provider-models/:id/quota',use(req=>controllers.updateProviderQuota(req.params.id,req.body)));
  // R2-08: authenticated, read-only accounting metadata. No ledger writes via HTTP.
  // R2-12: bounded local metadata read, no provider network requests, no AI dispatch.
  app.get('/api/providers/monitor',use(req=>controllers.providerMonitor(req.query?.limit===undefined?20:Number(req.query.limit))));
  app.get('/api/provider-models/:id/quota-ledger',use(req=>controllers.providerQuotaLedger(req.params.id,req.query?.limit===undefined?50:Number(req.query.limit))));
  app.post('/api/providers/route-preview',use(req=>controllers.providerRoutePlan(req.body)));
  // R0-VID-01 – metadata only; these routes never perform AI inference.
  app.get('/api/video-providers/capabilities',use(()=>controllers.videoProviderCapabilities()));
  app.put('/api/provider-models/:id/video-capabilities',use(req=>controllers.saveVideoProviderCapabilities(req.params.id,req.body)));
  app.post('/api/video-providers/preflight',use(req=>controllers.preflightVideoProvider(req.body)));
  // All writes pass existing global bearer+CSRF middleware. Never place an
  // approval ID in a query parameter or log the billing acknowledgement.
  app.post('/api/paid/approvals',use((req,reply)=>reply.code(201).send(controllers.approvePaid(req.body))));
  app.get('/api/jobs/:id/paid-approvals',use(req=>({items:controllers.paidApprovals(req.params.id)})));
  app.get('/api/jobs/:id/paid-audit',use(req=>({items:controllers.paidAudit(req.params.id)})));
  app.post('/api/paid/approvals/:id/revoke',use(req=>{
    if(req.body!==undefined&&(req.body===null||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length))
      throw new DomainError('INVALID_REVOKE_REQUEST',400);
    return controllers.revokePaid(req.params.id);
  }));
  // Protected by the same global pairing/auth boundary as all other /api paths.
  // The response is allowlisted metadata: no paths, usernames, model prompts,
  // raw subprocess output or secret-bearing provider URLs.
  if(diagnostics){
    app.get('/api/system/diagnostics',use(()=>diagnostics.get()));
    app.post('/api/system/diagnostics/refresh',use(req=>{
      if(req.body!==undefined&&(req.body===null||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length))
        throw new DomainError('INVALID_DIAGNOSTICS_REQUEST',400);
      return diagnostics.get({force:true});
    }));
  }
  app.get('/api/jobs',use(req=>controllers.jobs(req.query??{})));
  app.get('/api/jobs/:id',use(req=>controllers.job(req.params.id)));
  for(const action of ['pause','resume','cancel','retry']){
    app.post(`/api/jobs/:id/${action}`,use(req=>{
      // Never accept provider input or opaque data in a queue-control action.
      if(req.body!==undefined&&(req.body===null||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length))
        throw new DomainError('INVALID_JOB_ACTION_BODY',400);
      return controllers.jobAction(req.params.id,action);
    }));
  }
  // Polling cursor complements SSE when a long-lived connection is blocked.
  app.get('/api/jobs/events/history',use(req=>({items:controllers.jobEvents(req.query?.after??'0',req.query?.limit===undefined?100:Number(req.query.limit))})));
  app.post('/api/jobs/diagnostic',use((req,reply)=>reply.code(202).send(controllers.queueDiagnostic(req.body))));
  app.get('/api/activity',use(()=>({items:controllers.domainEvents()})));

  // SSE replays durable outbox events. The browser passes its bearer via
  // Authorization on fetch(), not URL query parameters or EventSource URLs.
  app.get('/api/jobs/events',async(req,reply)=>{
    let after;
    try {after=validCursor(req.headers['last-event-id']??'0');}
    catch {return reply.code(400).send({error:'INVALID_EVENT_CURSOR'});}
    reply.hijack();
    const res=reply.raw;
    res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache,no-store','connection':'keep-alive','x-accel-buffering':'no'});
    res.write(': connected\n\n');
    let closed=false,draining=false;
    const cleanup=()=>{closed=true;clearInterval(timer);res.off('drain',onDrain);};
    const onDrain=()=>{draining=false;flush();};
    res.on('close',cleanup);res.on('drain',onDrain);
    const flush=()=>{
      if(closed||draining)return;
      try {
        // Bound per-tick work to avoid starving HTTP. The next flush repeats
        // from a durable cursor; never skip a frame on network backpressure.
        for(const e of store.events({after,limit:100})) {
          const frame=jobEventFrame(e);
          after=e.seq;
          if(!res.write(frame)){draining=true;return;}
        }
        if(!res.write(': heartbeat\n\n'))draining=true;
      } catch {cleanup();res.end();}
    };
    const timer=setInterval(flush,750);
    flush();
  });
}
