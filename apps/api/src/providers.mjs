/**
 * Integrate actual SP-02/SP-03/SP-VID-01 adapters into one routing registry.
 * Dependencies/workflow exports must be installed by the local user before use.
 * NOTE Edge TTS is online despite having no API key; it needs remote consent.
 */
import {ProviderRegistry} from '../../../packages/providers/src/index.mjs';
import {EdgeTtsAdapter} from '../../../spikes/SP-02/src/edge.js';
import {LocalHttpTtsAdapter} from '../../../spikes/SP-02/src/local.js';
import {TtsService} from '../../../spikes/SP-02/src/service.js';
import {ComfyUiImageAdapter} from '../../../spikes/SP-03/src/comfy.js';
import {ImageService} from '../../../spikes/SP-03/src/service.js';
import {ComfyVideoAdapter} from '../../../spikes/SP-VID-01/src/comfy-video.mjs';
import {VideoAssetService} from '../../../spikes/SP-VID-01/src/service.mjs';

/** R2-04: only operator-owned LITERAL loopback HTTP endpoints, never URLs from
 * scene JSON. Reject hostnames and queries to eliminate DNS rebinding, remote
 * redirects and accidental credentials in URL/logs. No local server is started.
 * Contract: POST endpoint with {text,voice,rate} JSON -> audio/wav|mpeg bytes;
 * GET /health returns HTTP 2xx when its local runtime is ready.
 */
export function localTtsConfig(env=process.env){
  const config={};
  for(const [id,key,voiceKey] of [
    ['piper','CONTENTSTUDIO_PIPER_TTS_URL','CONTENTSTUDIO_PIPER_TTS_VOICE'],
    ['vieneu','CONTENTSTUDIO_VIENEU_TTS_URL','CONTENTSTUDIO_VIENEU_TTS_VOICE']]){
    if(!env[key])continue;
    let url;
    try{url=new URL(env[key]);}catch{throw Error('INVALID_LOCAL_TTS_CONFIG')}
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||
      url.hash||url.search||url.pathname==='/'||!/^\/[a-zA-Z0-9/_-]+$/.test(url.pathname))
      throw Error('INVALID_LOCAL_TTS_CONFIG');
    const voice=env[voiceKey]||'default';
    if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(voice))throw Error('INVALID_LOCAL_TTS_VOICE');
    const bodyFormat=env[`CONTENTSTUDIO_${id.toUpperCase()}_TTS_BODY_FORMAT`]||'json';
    if(!['json','text'].includes(bodyFormat))throw Error('INVALID_LOCAL_TTS_BODY_FORMAT');
    config[id]={endpoint:url.toString(),healthUrl:`${url.origin}/health`,voice,bodyFormat};
  }
  return config;
}

export function setupProviders({dataRoot,comfyUrl='http://127.0.0.1:8188',imageWorkflow,videoWorkflow,localConfig=localTtsConfig()}={}) {
  const registry=new ProviderRegistry();
  const edge=new EdgeTtsAdapter();
  const tts=new TtsService({dataRoot,adapters:[edge]});
  registry.register({id:'edge',kind:'tts',location:'remote',costTier:'free_unverified',noChargeConfirmed:true,
    invoke:async ({projectId,sceneId,text,voice,rate=0},{signal})=>{
      const result=await tts.synthesize({projectId,sceneId,text,voice,rate},{signal});
      return {path:result.path,metadata:{durationSec:result.durationSec,format:result.format,voice:result.voice}};
    }});
  // Use the same SP-02 atomic-file + FFprobe service as Edge; local endpoints
  // are registered only when explicitly configured. They never incur cloud fees.
  registry.localTtsAdapters=new Map();
  registry.localVoiceDefaults={};
  for(const [id,options] of Object.entries(localConfig)){
    if(!['piper','vieneu'].includes(id))throw Error('INVALID_LOCAL_TTS_CONFIG');
    const adapter=new LocalHttpTtsAdapter({endpoint:options.endpoint,
      healthUrl:options.healthUrl,voice:options.voice,bodyFormat:options.bodyFormat??'json',timeoutMs:90000});
    const service=new TtsService({dataRoot,adapters:[adapter]});
    registry.localTtsAdapters.set(id,adapter);
    registry.localVoiceDefaults[id]=options.voice;
    registry.register({id,kind:'tts',location:'local',costTier:'local',
      invoke:async({projectId,sceneId,text,voice,rate=0},{signal})=>{
        const output=await service.synthesize({projectId,sceneId,text,voice,rate},{signal});
        return {path:output.path,metadata:{durationSec:output.durationSec,format:output.format,voice:output.voice}};
      }});
  }
  if(imageWorkflow){
    const comfy=new ComfyUiImageAdapter({endpoint:comfyUrl,workflowPath:imageWorkflow.path,bindings:imageWorkflow.bindings});
    registry.imageAdapter=comfy;
    const service=new ImageService({dataRoot,adapters:[comfy]});
    registry.register({id:'comfyui',kind:'image',location:'local',costTier:'local',
      invoke:async ({projectId,sceneId,prompt,style,seed,width,height},{signal})=>{
        const result=await service.generate({projectId,sceneId,prompt,style,seed,width,height},{signal,providerIds:['comfyui']});
        return {path:`${dataRoot}/${result.relativePath}`,metadata:result};
      }});
  }
  if(videoWorkflow){
    const comfyVideo=new ComfyVideoAdapter({origin:comfyUrl,workflowPath:videoWorkflow.path,bindings:videoWorkflow.bindings});
    const service=new VideoAssetService({dataRoot,adapter:comfyVideo});
    registry.register({id:'comfyui-video',kind:'video',location:'local',costTier:'local',
      invoke:async ({projectId,sceneId,request},{signal})=>{
        const result=await service.generateScene({projectId,sceneId,request},{signal});
        return {path:result.filePath,metadata:result};
      }});
  }
  return registry;
}
