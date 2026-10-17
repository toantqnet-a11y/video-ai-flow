/** R2-VID-02: operator-local ComfyUI/Wan readiness. This DOES NOT run AI
 * inference or prove that a checkpoint exists, fits VRAM, or has valid rights.
 * Only a positive native GPU-generated job and operator review can close the
 * actual hardware gate. Never use remote/cloud/paid fallbacks.
 */
import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ComfyVideoAdapter} from '../../../spikes/SP-VID-01/src/comfy-video.mjs';
import {validateLocalOrigin} from '../../../spikes/SP-VID-01/src/contracts.mjs';

const SHA=data=>createHash('sha256').update(data).digest('hex');
const codes=Object.freeze({workflow:'R2VID02_WORKFLOW_NOT_CONFIGURED',
 binding:'R2VID02_BINDINGS_NOT_CONFIGURED',
 invalid:'R2VID02_WORKFLOW_INVALID',
 unreachable:'R2VID02_LOCAL_COMFY_UNREACHABLE',
 device:'R2VID02_NATIVE_GPU_NOT_VERIFIED',
 inference:'R2VID02_NATIVE_INFERENCE_NOT_WITNESSED',
 license:'R2VID02_CHECKPOINT_LICENSE_NOT_REVIEWED'});
const request={mode:'text_to_video',prompt:'Preflight workflow validation only',
 durationSeconds:2,seed:1,width:512,height:512,fps:16};
const safeError=e=>/^[A-Z][A-Z0-9_]{2,100}$/.test(e?.code??'')?e.code:'R2VID02_LOCAL_CHECK_FAILED';

/** Independent of HTTP server; intended to run before production GPU use. */
export async function inspectNativeVideoReadiness({workflowPath,bindings,origin='http://127.0.0.1:8188',
 probeLocal=false,fetchImpl=globalThis.fetch}={}){
 const blockers=[],result={taskId:'R2-VID-02',providerId:'comfyui-video',
   state:'NOT_READY',workflowSha256:null,workflowValidated:false,
   localApiReachable:null,deviceReported:false,nativeInferenceVerified:false,
   licenseReviewed:false,paidCallsMade:0,probeLocal:probeLocal===true};
 let endpoint;
 try{endpoint=validateLocalOrigin(origin);}
 catch{blockers.push('R2VID02_LOOPBACK_ONLY');return {...result,blockers};}
 if(typeof workflowPath!=='string'||!workflowPath)blockers.push(codes.workflow);
 if(!bindings||typeof bindings!=='object'||Array.isArray(bindings)||!bindings.prompt)blockers.push(codes.binding);
 if(blockers.length)return {...result,blockers};
 let adapter;
 try{
  const st=await lstat(workflowPath),real=await realpath(workflowPath);
  if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>2*1024*1024||!real)
   throw Object.assign(new Error('workflow unsafe'),{code:codes.invalid});
  const raw=await readFile(workflowPath);
  adapter=new ComfyVideoAdapter({origin:endpoint,workflowPath,bindings,fetchImpl,timeoutMs:8000,pollMs:500});
  const data=await adapter.loadWorkflow(request);
  result.workflowSha256=SHA(raw);
  result.workflowValidated=!!data.workflowHash&&Object.keys(data.workflow).length>0;
 }catch(e){blockers.push(codes.invalid);result.workflowErrorCode=safeError(e);return {...result,blockers};}
 if(probeLocal){
  try{
   const status=await adapter.status();
   result.localApiReachable=status.reachable===true;
   result.deviceReported=status.devices.some(d=>['cuda','gpu','mps'].some(type=>
    String(d.type??'').toLowerCase().includes(type))&&Number(d.vramTotal)>0);
  }catch(e){result.localApiReachable=false;result.apiErrorCode=safeError(e);blockers.push(codes.unreachable);}
 }
 // A reported GPU is not evidence that a local Wan checkpoint can run.
 if(!probeLocal||result.deviceReported!==true)blockers.push(codes.device);
 blockers.push(codes.inference,codes.license);
 return {...result,blockers};
}
