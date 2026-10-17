#!/usr/bin/env node
/** FI-04-08: local endpoint handshake inventory; NOT synthetic inference or
 * model output. Fixed routes, no arbitrary URL fetch, no secret env reads,
 * no paid/remote fallback, and no internal/LAN host scanning. */
import {resolve} from 'node:path';
import {verifiedEvidenceFile} from './fi04-final-gate-core.mjs';
import {probeMp4} from '../packages/core/src/render-ffmpeg-r2ext04.mjs';
import {fileURLToPath} from 'node:url';
import {options,reportFile,output,timestamp} from './fi04-final-gate-core.mjs';

export function safeLoopbackPort(raw){
 const n=Number(raw);if(!Number.isSafeInteger(n)||n<1024||n>65535)throw Error('FI0408_PORT_INVALID');return n;
}
export function providerInventory({ollama,comfyui,ttsFileVerified=false,operatorConsent=false}={}){
 const gates={ollamaHandshake:ollama===true?'PASS':'BLOCKED',comfyUiHandshake:comfyui===true?'PASS':'BLOCKED',
  nativeTtsVietnameseAudio:ttsFileVerified&&operatorConsent?'MANUAL_REVIEW_REQUIRED':'BLOCKED',
  localModelInference:'BLOCKED',liveTtsInference:'BLOCKED',liveComfyVideoOrImageInference:'BLOCKED',
  quotaAndHttp429Real:'BLOCKED',paidOrCloudCalls:'DISABLED'};
 return {status:'NOT_READY',gates,paidProviderCalls:0,actualInferenceVerified:false};
}
async function probeLocal(port,path,expected,fetchImpl=fetch){
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),2500);
 try{
  const res=await fetchImpl(`http://127.0.0.1:${port}${path}`,{method:'GET',redirect:'error',signal:ctrl.signal,headers:{accept:'application/json'},credentials:'omit'});
  if(!res.ok||Number(res.headers.get('content-length')??0)>131072)return false;
  const body=await res.text();if(body.length>131072)return false;
  const json=JSON.parse(body);return expected(json);
 }catch{return false}finally{clearTimeout(timeout)}
}
export async function inspectLocalProviders({ollamaPort=11434,comfyPort=8188,fetchImpl=fetch}={}){
 const o=safeLoopbackPort(ollamaPort),c=safeLoopbackPort(comfyPort);
 const [ollama,comfyui]=await Promise.all([
  probeLocal(o,'/api/tags',x=>Array.isArray(x.models),fetchImpl),
  probeLocal(c,'/system_stats',x=>typeof x==='object'&&x!==null&&('system'in x||'devices'in x),fetchImpl),
 ]);
 return providerInventory({ollama,comfyui});
}
/** Local existing WAV/MP3 probe is never native Vietnamese TTS inference evidence. */
export async function inspectExistingLocalVoice({dataRoot,relativeVoicePath,probe=probeMp4}={}){
 if(!dataRoot||!relativeVoicePath)return {status:'BLOCKED',code:'FI0408_AUDIO_NOT_SELECTED'};
 try{
  const file=await verifiedEvidenceFile(dataRoot,relativeVoicePath);
  if(file.bytes<100||file.bytes>100*1024*1024)return {status:'BLOCKED',code:'FI0408_AUDIO_SIZE_INVALID'};
  const info=await probe(file.path);
  return {status:info.audioCodec&&info.durationSeconds>0?'LOCAL_AUDIO_FILE_VERIFIED':'BLOCKED',
   actualInferenceVerified:false,requiresHumanVietnameseAudioApproval:true};
 }catch{return {status:'BLOCKED',code:'FI0408_AUDIO_FILE_UNAVAILABLE_OR_UNSAFE'};}
}
async function main(){const a=options(process.argv.slice(2),['inspect','probe-local','inspect-voice'],['ollama-port','comfy-port','data-root','voice-relative','report']);
 if([a.inspect,a['probe-local'],a['inspect-voice']].filter(Boolean).length!==1)throw Error('FI0408_MODE_REQUIRED');
 // Inspect is fully offline. Probe-local permits only fixed loopback GETs.
 // Voice-file probe uses only a caller-approved existing local directory.
 let r={task:'FI-04-08',timestamp:timestamp(),...providerInventory(),mode:'inspect'};
 if(a['probe-local'])r={...r,...await inspectLocalProviders({ollamaPort:a['ollama-port']??11434,comfyPort:a['comfy-port']??8188}),mode:'read-only-loopback-handshake'};
 if(a['inspect-voice']){
  if(!a['data-root']||!a['voice-relative'])throw Error('FI0408_EXISTING_LOCAL_VOICE_REQUIRED');
  const localVoice=await inspectExistingLocalVoice({dataRoot:a['data-root'],relativeVoicePath:a['voice-relative']});
  r={...r,mode:'existing-file-audio-probe',localVoice};
 }
 await reportFile(a.report,r);output(r,!!a['probe-local']||!!a['inspect-voice']);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
