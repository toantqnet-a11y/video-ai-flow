/** Runtime job handlers. These are REAL adapters, not simulated AI providers.
 * Jobs are only queued explicitly; missing workflow/model fails transparently.
 * SP-04 fences DB commits; reconciliation promotes file revisions afterwards.
 */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {voiceIntentMatches,imageIntentMatches} from '../../../packages/core/src/index.mjs';
import {probeAudio,detectAudioFormat} from '../../../spikes/SP-02/src/audio.js';
import {resolve,sep} from 'node:path';

async function ffmpegExists(){
  return new Promise(resolve=>{
    const child=spawn('ffmpeg',['-version'],{stdio:'ignore',windowsHide:true});
    child.once('error',()=>resolve(false));child.once('close',code=>resolve(code===0));
  });
}

export function createJobHandlers({repo,registry,dataRoot,providerIds={},probeVoice=probeAudio} ) {
  const jobs={
    'system:diagnostic':async()=>({result:{ffmpegAvailable:await ffmpegExists(),platform:process.platform,node:process.version}})
  };
  // Inject providers only for integration tests or explicit route configuration.
  // Defaults preserve the production mapping; mocks are never auto-enabled.
  for(const [kind,defaultProviderId] of [['voice','edge'],['image','comfyui'],['video','comfyui-video']]) {
    const providerId=providerIds[kind]??defaultProviderId;
    const type=`asset:${kind}`;
    jobs[type]=async(payload,{signal,jobId})=>{
      const scene=repo.getScene(payload.sceneId);
      if(!scene)throw Object.assign(new Error('SCENE_NOT_FOUND'),{retryable:false});
      const video=repo.getVideo(scene.videoId);
      if(!video)throw Object.assign(new Error('VIDEO_NOT_FOUND'),{retryable:false});
      // Both primary and fallback are frozen in the queue snapshot. Never
      // infer a cloud fallback from account priority or mutable channel prefs.
      if(kind==='voice'&&(!jobId||!voiceIntentMatches(repo,payload,jobId)||
        !['edge','piper','vieneu'].includes(payload.providerId)||
        (payload.providerId==='edge'&&payload.remoteConsent!==true)||
        (payload.providerId!=='edge'&&payload.fallbackProvider)||
        (payload.fallbackProvider&&!['piper','vieneu'].includes(payload.fallbackProvider))))
        throw Object.assign(new Error('STALE_VOICE_JOB'),{code:'STALE_VOICE_JOB',retryable:false});
      if(kind==='image'&&(!jobId||payload.providerId!=='comfyui'||payload.remoteConsent!==false||
        !imageIntentMatches(repo,payload,jobId)||providerId!=='comfyui'||!registry.imageAdapter))
        throw Object.assign(new Error('STALE_IMAGE_JOB'),{code:'STALE_IMAGE_JOB',retryable:false});
      if(kind==='image'){
        // Frozen workflow fingerprint must still match operator configuration.
        const current=await registry.imageAdapter.loadWorkflow(payload);
        if(createHash('sha256').update(JSON.stringify(current)).digest('hex')!==payload.workflowHash)
          throw Object.assign(new Error('IMAGE_WORKFLOW_CHANGED'),{code:'IMAGE_WORKFLOW_CHANGED',retryable:false});
      }
      let result,actualProviderId=kind==='voice'?payload.providerId:providerId;
      let actualVoice=payload.voice,fallbackUsed=false;
      try{
        result=await registry.invoke(actualProviderId,{...payload,scene,video,projectId:video.id},
          {signal,allowRemote:kind==='voice'?payload.providerId==='edge'&&payload.remoteConsent===true:payload.remoteConsent===true,
            paidApproval:payload.paidApproval});
      }catch(error){
        // Retryable *upstream* Edge failures alone allow operator-approved
        // local fallback; invalid inputs, cancellation and billing errors fail
        // closed. This must NOT dispatch another Edge request implicitly.
        const fallbackEligible=kind==='voice'&&payload.providerId==='edge'&&payload.fallbackProvider&&
          ['PROVIDER_UNAVAILABLE','ALL_PROVIDERS_FAILED','TIMEOUT','RATE_LIMITED',
           'DEPENDENCY_UNAVAILABLE','NETWORK_ERROR'].includes(error?.code)&&error?.retryable!==false;
        if(!fallbackEligible||signal?.aborted)throw error;
        if(!voiceIntentMatches(repo,payload,jobId))
          throw Object.assign(new Error('STALE_VOICE_JOB'),{code:'STALE_VOICE_JOB',retryable:false});
        actualProviderId=payload.fallbackProvider;actualVoice=payload.fallbackVoice;
        result=await registry.invoke(actualProviderId,{...payload,voice:actualVoice,scene,video,projectId:video.id},
          {signal,allowRemote:false});
        fallbackUsed=true;
      }
      if(kind==='image'&&!imageIntentMatches(repo,payload,jobId))
        throw Object.assign(new Error('STALE_IMAGE_JOB'),{code:'STALE_IMAGE_JOB',retryable:false});
      const path=resolve(result.path);
      if(!path.startsWith(resolve(dataRoot)+sep))throw Object.assign(new Error('UNSAFE_PROVIDER_OUTPUT'),{retryable:false});
      const bytes=await readFile(path);
      const checksum=createHash('sha256').update(bytes).digest('hex');
      let voiceMetadata={};
      if(kind==='voice'){
        // Independently probe the actual generated file: estimates and adapter
        // claims never become the timing authority in narration assets.
        const format=detectAudioFormat(bytes);
        const metadata=await probeVoice(path);
        if(!Number.isFinite(metadata?.durationSec)||metadata.durationSec<=0||
          metadata.durationSec>7200||typeof metadata.codec!=='string'||
          (format==='mp3'&&!['mp3'].includes(metadata.codec))||
          (format==='wav'&&!['pcm_s16le','pcm_s24le','pcm_f32le'].includes(metadata.codec)))
          throw Object.assign(new Error('INVALID_VOICE_AUDIO'),{code:'INVALID_AUDIO',retryable:false});
        if(!voiceIntentMatches(repo,payload,jobId))
          throw Object.assign(new Error('STALE_VOICE_JOB'),{code:'STALE_VOICE_JOB',retryable:false});
        voiceMetadata={voiceInputHash:payload.inputHash,textSha256:payload.textSha256,
          configRevision:payload.configRevision,voice:actualVoice,rate:payload.rate,
          fallbackUsed,durationSec:metadata.durationSec,codec:metadata.codec};
      }
      if(kind==='image'){
        const {detectImage,validateImageBytes}=await import('../../../spikes/SP-03/src/image.js');
        validateImageBytes(bytes); // decoded pixels are already verified in SP-03 ImageService.
        const dimensions=detectImage(bytes);
        if(dimensions.width!==payload.width||dimensions.height!==payload.height)
          throw Object.assign(new Error('IMAGE_DIMENSION_MISMATCH'),{code:'IMAGE_DIMENSION_MISMATCH',retryable:false});
        if(!imageIntentMatches(repo,payload,jobId))
          throw Object.assign(new Error('STALE_IMAGE_JOB'),{code:'STALE_IMAGE_JOB',retryable:false});
      }
      // Result is allowlisted metadata only; raw scene text stays in queue payload.
      return {result:{sceneId:scene.id,kind,providerId:actualProviderId,...voiceMetadata,
          ...(kind==='image'?{imageInputHash:payload.inputHash,sourceSha256:payload.sourceSha256,
            configRevision:payload.configRevision,workflowHash:payload.workflowHash,width:payload.width,height:payload.height,seed:payload.seed}:{})},
        asset:{logicalKey:`${kind}:${scene.id}:${kind==='voice'||kind==='image'?payload.inputHash:payload.revisionId}`,
          filePath:path,checksum}};
    };
  }
  return jobs;
}
