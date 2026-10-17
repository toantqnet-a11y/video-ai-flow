#!/usr/bin/env node
/** Offline / loopback-only native AI-video inspection.
 * No GPU inference, cloud call, model download or auto acceptance.
 */
import {readFile} from 'node:fs/promises';
import {inspectNativeVideoReadiness} from '../packages/core/src/native-video-diagnostics-r2vid02.mjs';
import {verifyHybridArtifacts} from '../packages/core/src/hybrid-evidence-r3vid03.mjs';
const args=process.argv.slice(2);
const flag=(name)=>args.includes(name);
const get=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const valid=new Set(['--help','--inspect','--probe','--verify','--composition','--root','--render','--sha256']);
try{
 for(let i=0;i<args.length;i++){const a=args[i];if(!valid.has(a))throw Error('UNKNOWN_NATIVE_GATE_OPTION');
  if(['--composition','--root','--render','--sha256'].includes(a)){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('MISSING_NATIVE_GATE_VALUE');i++;}
 }
 if(flag('--help')||!args.length){
  console.log('Native video QA: --inspect [--probe] or --verify --root <dataRoot> --composition <json> --render <mp4> --sha256 <hex>. No inference dispatched.');
 }else if(flag('--verify')){
  const root=get('--root'),comp=get('--composition'),render=get('--render'),digest=get('--sha256');
  if(!root||!comp||!render||!/^[a-f0-9]{64}$/.test(digest??''))throw Error('NATIVE_GATE_MISSING_INPUT');
  const composition=JSON.parse(await readFile(comp,'utf8'));
  const report=await verifyHybridArtifacts({composition,dataRoot:root,renderPath:render,expectedRenderSha256:digest});
  console.log(JSON.stringify(report,null,2));
  if(!report.accepted)process.exitCode=3;
 }else if(flag('--inspect')){
  let bindings;
  if(process.env.CONTENTSTUDIO_VIDEO_BINDINGS_JSON){
   try{bindings=JSON.parse(process.env.CONTENTSTUDIO_VIDEO_BINDINGS_JSON);}
   catch{throw Error('R2VID02_BINDINGS_JSON_INVALID');}
  }
  const report=await inspectNativeVideoReadiness({workflowPath:process.env.CONTENTSTUDIO_VIDEO_WORKFLOW,
   bindings,origin:process.env.CONTENTSTUDIO_COMFY_URL||'http://127.0.0.1:8188',probeLocal:flag('--probe')});
  console.log(JSON.stringify(report,null,2));
  // Readiness remains an expected incomplete operator assessment.
 }else throw Error('NATIVE_GATE_MODE_REQUIRED');
}catch(err){
 const safe=/^[A-Z][A-Z0-9_]{2,90}$/.test(err.code??'')?err.code:
  /^[A-Z][A-Z0-9_]{2,90}$/.test(err.message??'')?err.message:'NATIVE_GATE_ERROR';
 console.error(JSON.stringify({status:'NOT_READY',errorCode:safe}));
 process.exitCode=2;
}
