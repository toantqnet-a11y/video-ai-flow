/**
 * Unified Fastify application. No second queue or database: all domain tables
 * and SP-04 jobs share one SQLite file and WAL; file promotion reconciles the
 * unavoidable gap between a file rename and a DB transaction.
 */
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync,mkdirSync} from 'node:fs';
import {openProjectDb,StudioRepository,AssetManifest,promotePendingQueueAssets,PaidPolicyRepository,createPaidInvocationPolicy,ChannelAvatarService,SceneVoiceRepository,createAssetDagHandlers,QuotaLedgerRepository} from '../../../packages/core/src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {installSecurity} from './security.mjs';
import {safeRequestLog} from './request-policy.mjs';
import {PassphraseVault,createCredentialAccess} from '../../../packages/security/src/index.mjs';
import {registerVaultRoutes} from './vault-routes.mjs';
import {registerStudioRoutes} from './routes.mjs';
import {createControllers} from './controllers.mjs';
import {setupProviders} from './providers.mjs';
import {createJobHandlers} from './handlers.mjs';
import {createOutlineJobHandler} from './outline-generation.mjs';
import {createChapterJobHandler} from './chapter-generation.mjs';
import {createEvaluationJobHandler} from './content-evaluation.mjs';
import {createContentRetryJobHandler} from './content-retry.mjs';
import {createVisualPromptJobHandler} from './visual-prompt-generation.mjs';
import {createDiagnosticsService} from './diagnostics.mjs';
import {createVoicePreview,registerVoicePreviewRoute} from './voice-preview.mjs';
import {createLlmDispatcher} from './llm-dispatch.mjs';
import {registerChannelAvatarRoutes} from './channel-avatar.mjs';
import {registerSceneVoiceAudioRoute} from './scene-voice-audio.mjs';
import {registerSceneImageFileRoute} from './scene-image-file.mjs';
import {registerSceneClipFileRoute} from './scene-video-file.mjs';
import {RenderExportService} from './render-export-r2ext0406.mjs';
import {CompositionRepository,SceneClipService,readClipResourceLimits} from '../../../packages/core/src/index.mjs';
import {cleanupOrphanRenderStages} from '../../../packages/core/src/render-safety-r313.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const port=Number(process.env.CONTENTSTUDIO_PORT||4311);
if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('INVALID_PORT');
const dataRoot=resolve(process.env.CONTENTSTUDIO_DATA_DIR||join(root,'data'));
mkdirSync(dataRoot,{recursive:true});
const dbFile=join(dataRoot,'studio.sqlite');

export async function startApi({listen=true}={}) {
  // Late import lets Node unit tests exercise domain/security without npm install.
  const {default:Fastify}=await import('fastify');
  const app=Fastify({logger:{
    // Fastify logs a request URL by default. Redact it completely: an attacker
    // can place a secret in a query string even when the guard rejects it.
    serializers:{req:safeRequestLog},
    redact:['req.headers.authorization','req.headers.x-contentstudio-csrf','req.body','res.body']
  },bodyLimit:1024*1024,trustProxy:false});
  // A library/plugin error must never echo the submitted prompt or API key.
  app.setErrorHandler((error,request,reply)=>{
    const status=error.statusCode>=400&&error.statusCode<500?error.statusCode:500;
    request.log.warn({code:error.code??'REQUEST_FAILED'},'http request failed');
    return reply.code(status).send({error:status===500?'INTERNAL_ERROR':'INVALID_REQUEST'});
  });
  app.addHook('onSend',async(request,reply,payload)=>{
    reply.header('x-content-type-options','nosniff');
    reply.header('referrer-policy','no-referrer');
    reply.header('x-frame-options','DENY');
    if(request.url.startsWith('/api/')) reply.header('cache-control','no-store');
    if(!request.url.startsWith('/api/')) reply.header('content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
    return payload;
  });
  // Install raw binary ingestion only on the real Fastify instance. Fake
  // route registries used by contract tests intentionally do not support
  // content-type parser extensions.
  app.addContentTypeParser('application/octet-stream',(req,stream,done)=>done(null,stream));
  const db=openProjectDb(dbFile),repo=new StudioRepository(db);
  // Any call still reserved after a crash has unknown billing/token outcome.
  // Keep its quota hold; an app restart is never proof of a free retry.
  new QuotaLedgerRepository(db).recover();
  const store=new JobStore({path:dbFile,leaseMs:10_000,baseBackoffMs:1000,maxBackoffMs:30_000});
  // Workflow API exports must be configured explicitly; missing configs mean
  // image/video providers are unregistered, NOT substituted with mock media.
  const workflowOption=(prefix)=>{
    const file=process.env[`CONTENTSTUDIO_${prefix}_WORKFLOW`];
    if(!file)return undefined;
    const bindingString=process.env[`CONTENTSTUDIO_${prefix}_BINDINGS_JSON`];
    if(!bindingString)throw new Error(`${prefix}_BINDINGS_REQUIRED`);
    return {path:resolve(file),bindings:JSON.parse(bindingString)};
  };
  const registry=setupProviders({dataRoot,comfyUrl:process.env.CONTENTSTUDIO_COMFY_URL||'http://127.0.0.1:8188',
    imageWorkflow:workflowOption('IMAGE'),videoWorkflow:workflowOption('VIDEO')});
  const manifest=new AssetManifest({db,repository:repo,dataRoot});
  // R0-13: Job/account/model-scoped spending approvals are checked in the
  // provider registry at dispatch. Requests may not submit spoofed consent.
  const paidPolicy=new PaidPolicyRepository(db,{jobLookup:id=>store.get(id)});
  registry.setPaidPolicy(createPaidInvocationPolicy(paidPolicy));
  // Read-only diagnostics share the *already open* SQLite connection; no
  // parallel schema/migration initialization or uncontrolled remote AI calls.
  const diagnostics=createDiagnosticsService({dataRoot,db,registry,
    comfyOrigin:process.env.CONTENTSTUDIO_COMFY_URL||'http://127.0.0.1:8188',
    localComfyConfigured:Boolean(process.env.CONTENTSTUDIO_IMAGE_WORKFLOW||process.env.CONTENTSTUDIO_VIDEO_WORKFLOW)});
  // R1-07: Remote egress is opt-in, even for accounts labeled free. The
  // allowlist must come from confirmed non-billable account entitlements, NOT
  // the editable model costTier field. Paid models need verified price caps.
  const vault=new PassphraseVault(join(dataRoot,'secure'));
  const credentialAccess=createCredentialAccess(vault);
  const allowRemote=process.env.CONTENTSTUDIO_REMOTE_LLM_CONSENT==='1';
  const confirmedFreeModelIds=(process.env.CONTENTSTUDIO_CONFIRMED_NO_BILLING_MODEL_IDS||'')
    .split(',').map(x=>x.trim()).filter(Boolean);
  let verifiedCostCapsMicroUsd={};
  if(process.env.CONTENTSTUDIO_VERIFIED_LLM_PRICE_CAPS_JSON){
    // Operator-only local configuration; treat malformed configuration as a
    // startup error, never silently enable billable dispatch.
    const configured=JSON.parse(process.env.CONTENTSTUDIO_VERIFIED_LLM_PRICE_CAPS_JSON);
    if(!configured||Array.isArray(configured)||typeof configured!=='object')throw new Error('INVALID_LLM_PRICE_CAP_CONFIG');
    verifiedCostCapsMicroUsd=configured;
  }
  // Operator-defined quota reservation amounts are deliberate bounds, never
  // inferred from a label like 'free'. Absence fails closed for capped LLMs.
  let quotaReservationUnitsByModel={};
  if(process.env.CONTENTSTUDIO_LLM_QUOTA_RESERVATIONS_JSON){
    const supplied=JSON.parse(process.env.CONTENTSTUDIO_LLM_QUOTA_RESERVATIONS_JSON);
    if(!supplied||Array.isArray(supplied)||typeof supplied!=='object'||
       Object.values(supplied).some(x=>!Number.isSafeInteger(x)||x<1||x>1e9))
      throw new Error('INVALID_LLM_QUOTA_RESERVATIONS');
    quotaReservationUnitsByModel=supplied;
  }
  const remoteDispatcher=createLlmDispatcher({db,store,credentialAccess,paidPolicy,
    allowRemote,confirmedFreeModelIds,verifiedCostCapsMicroUsd,quotaReservationUnitsByModel});
  // Operator-owned, fail-closed limits: no model/provider calls during parse.
  const videoResourceLimits=readClipResourceLimits(process.env);
  const clips=new SceneClipService({repo,manifest,store,
    videoAdapter:registry.videoAdapter??null,resourceLimits:videoResourceLimits});
  const handlers=createJobHandlers({repo,registry,dataRoot});
  handlers['scene:ai-video']=clips.handler();
  // Exactly one durable SP-04 queue. Remote LLM only via guarded dispatcher.
  const llmOptions={repo,store,remoteDispatcher};
  handlers['content:outline']=createOutlineJobHandler(llmOptions);
  handlers['content:chapter']=createChapterJobHandler(llmOptions);
  handlers['content:evaluate']=createEvaluationJobHandler(llmOptions);
  handlers['content:retry']=createContentRetryJobHandler(llmOptions);
  // R2-02: proposals remain in fenced queue results, not scene records.
  handlers['scene:visual-prompt']=createVisualPromptJobHandler({repo,store});
  Object.assign(handlers,createAssetDagHandlers({repo,store,manifest}));
  const renderExports=new RenderExportService({repo,store,manifest,compositions:new CompositionRepository({repo,manifest})});
  handlers['render:ffmpeg']=renderExports.handler('ffmpeg-fastpath');
  handlers['render:hyperframes']=renderExports.handler('hyperframes');
  const runner=new JobRunner(store,handlers,{concurrency:2,pollMs:200,heartbeatMs:2000});
  const security=installSecurity(app,{port,devFrontend:process.env.NODE_ENV!=='production'});
  registerVaultRoutes(app,{vault,isCredentialUsed:id=>Boolean(db.prepare('SELECT 1 FROM provider_accounts WHERE credential_id=? LIMIT 1').get(id))});
  app.get('/health',async()=>({status:'ok',service:'contentstudio',version:'arc01'}));
  const controllers=createControllers({repo,store,registry,manifest,vault,paidPolicy,remoteLlmEnabled:allowRemote,renderExports,clips});
  registerStudioRoutes(app,{controllers,store,diagnostics});
  registerSceneImageFileRoute(app,controllers);
  registerSceneClipFileRoute(app,controllers);
  registerVoicePreviewRoute(app,createVoicePreview({repo}));
  registerSceneVoiceAudioRoute(app,new SceneVoiceRepository(repo,{store,manifest,localVoices:registry.localVoiceDefaults??{}}));
  registerChannelAvatarRoutes(app,new ChannelAvatarService({repo,dataRoot}));
  // The frontend build can be served same-origin; while developing, Vite proxies /api.
  const built=join(root,'apps/web/dist');
  if(existsSync(join(built,'index.html'))) {
    const {default:staticPlugin}=await import('@fastify/static');
    await app.register(staticPlugin,{root:built,prefix:'/'});
    app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({error:'NOT_FOUND'}):reply.sendFile('index.html'));
  }
  const initial=await promotePendingQueueAssets(manifest);
  if(initial.failed.length) app.log.warn({count:initial.failed.length},'asset promotion requires reconciliation');
  let promoting=false;
  const promotionTimer=setInterval(async()=>{
    if(promoting)return;
    promoting=true;
    try {const result=await promotePendingQueueAssets(manifest);if(result.failed.length)app.log.warn({count:result.failed.length},'asset promotion incomplete');}
    catch{app.log.error('asset promotion failed');}
    finally {promoting=false;}
  },2000);
  // R3-13: reclaim old disposable staging from killed jobs before workers start.
  // Conservative 24h grace avoids deleting work from another still-live instance.
  try{await cleanupOrphanRenderStages(dataRoot)}catch{app.log.warn('render staging cleanup incomplete');}
  runner.start();
  app.addHook('onClose',async()=>{
    clearInterval(promotionTimer);
    await runner.stop({abort:true});
    vault.lock();store.close();db.close();
  });
  if (listen) {
    await app.listen({host:'127.0.0.1',port});
    // Pairing is a console-only one-time session code, never written to disk.
    process.stdout.write(`\nContentStudio API: http://127.0.0.1:${port}\nPairing code: ${security.pairingCodeForTerminal()}\nDo not share this code.\n`);
  }
  return {app,repo,store,registry,manifest,runner,security,vault,credentialAccess,paidPolicy,diagnostics,dataRoot};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  startApi().catch(error=>{
    // A malformed environment setting can contain secrets. Never echo parser
    // errors or provider URLs that may include credentials into terminal logs.
    console.error(`STARTUP_FAILED: ${typeof error.code==='string'&&/^[A-Z0-9_]{2,80}$/.test(error.code)?error.code:'CHECK_CONFIGURATION'}`);
    process.exitCode=1;
  });
}
