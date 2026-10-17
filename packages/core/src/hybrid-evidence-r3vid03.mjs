/** R3-VID-03: derive FFprobe/SHA quality from files, not reported values.
 * A four-second fixture can pass technical checks but NEVER long-form
 * acceptance. Human native GPU/Windows/recovery attestations remain distinct.
 */
import {realpath,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {assessHybridVideoGate} from './hybrid-acceptance-r3vid03.mjs';
import {probeMp4,safePinnedPath} from './render-ffmpeg-r2ext04.mjs';

const fileSha=path=>new Promise((ok,bad)=>{const h=createHash('sha256');
 const stream=createReadStream(path);stream.on('data',d=>h.update(d));
 stream.on('error',bad);stream.on('end',()=>ok(h.digest('hex')));});
const inside=(root,path)=>{const rel=relative(root,path);return !!rel&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)};
const reject=(code)=>{throw Object.assign(new Error(code),{code})};

/** Default status remains NOT_READY, even after correct FFprobe, until REAL
 * witnessed GPU source, 35min render, crash recovery and human review exist.
 * Paths and sensitive composition text are never copied into public reports.
 */
export async function verifyHybridArtifacts({composition,dataRoot,renderPath,expectedRenderSha256,
 ffprobe='ffprobe',signal,operatorEvidence={}}={}){
 const report={taskId:'R3-VID-03',status:'NOT_READY',accepted:false,
   fileChecks:{publishedMp4:false,checksumVerified:false,verifiedLocalAssets:false,
     ffprobeQa:false},mediaSha256:null,metadata:null,blockers:[]};
 if(!composition||typeof composition!=='object'||!Array.isArray(composition.scenes))
  reject('R3VID03_COMPOSITION_REQUIRED');
 if(!dataRoot||!renderPath)reject('R3VID03_INPUT_PATH_REQUIRED');
 const root=await realpath(dataRoot),candidate=resolve(renderPath);
 if(!inside(root,candidate))reject('R3VID03_UNSAFE_RENDER_PATH');
 const relativeOutput=relative(root,candidate).split(sep).join('/');
 const videoId=composition.videoId;
 if(typeof videoId!=='string'||!/^[A-Za-z0-9-]{1,100}$/.test(videoId)||
   !new RegExp('^renders/'+videoId+'/[a-f0-9]{64}\\.mp4$').test(relativeOutput))
  reject('R3VID03_UNPUBLISHED_RENDER_PATH');
 const st=await lstat(candidate);
 if(!st.isFile()||st.isSymbolicLink()||st.size<100||await realpath(candidate)!==candidate)
  reject('R3VID03_INVALID_RENDER_FILE');
 report.fileChecks.publishedMp4=true;
 const digest=await fileSha(candidate);
 report.mediaSha256=digest;
 const expected=expectedRenderSha256;
 report.fileChecks.checksumVerified=typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected)&&expected===digest;
 let pinned=true;
 for(const scene of composition.scenes){
  for(const asset of [scene.voice?.asset,scene.visual?.asset]){
   try{if(!asset||await safePinnedPath(root,asset)===null)pinned=false;}
   catch{pinned=false;}
  }
 }
 report.fileChecks.verifiedLocalAssets=pinned&&composition.scenes.length>0;
 let metadata=null;
 try{metadata=await probeMp4(candidate,{ffprobe,signal});}catch{/* Record blocker below. */}
 report.metadata=metadata&&{videoCodec:metadata.videoCodec,audioCodec:metadata.audioCodec,
  width:metadata.width,height:metadata.height,fps:metadata.fps,
  frameCount:metadata.frameCount,durationSeconds:metadata.durationSeconds,bytes:metadata.bytes};
 const expectedSec=Number.isSafeInteger(composition.totalFrames)&&composition.profile?.fps>0?
  composition.totalFrames/composition.profile.fps:null;
 report.fileChecks.ffprobeQa=!!metadata&&metadata.videoCodec==='h264'&&metadata.audioCodec==='aac'&&
  metadata.width===composition.profile?.width&&metadata.height===composition.profile?.height&&
  metadata.fps===`${composition.profile.fps}/1`&&metadata.frameCount===composition.totalFrames&&
  Number.isFinite(expectedSec)&&Math.abs(metadata.durationSeconds-expectedSec)<=0.25;
 const native=operatorEvidence?.nativeAiEvidence??null;
 const gate=assessHybridVideoGate({composition,renderMetadata:metadata,
  nativeAiEvidence:native,
  verifiedLocalAssets:report.fileChecks.verifiedLocalAssets,
  windowsOperatorApproved:operatorEvidence?.windowsOperatorApproved===true,
  recoveryApproved:operatorEvidence?.recoveryApproved===true,
  paidRequestCount:Number.isInteger(operatorEvidence?.paidRequestCount)?operatorEvidence.paidRequestCount:null});
 const automated=[];
 if(!report.fileChecks.checksumVerified)automated.push('R3VID03_OUTPUT_SHA256_UNVERIFIED');
 if(!report.fileChecks.ffprobeQa)automated.push('R3VID03_FFPROBE_MISMATCH');
 if(!report.fileChecks.verifiedLocalAssets)automated.push('R3VID03_PINNED_FILES_INVALID');
 return {...report,accepted:gate.accepted&&automated.length===0,
   status:gate.accepted&&automated.length===0?'OPERATOR_ATTESTED_ACCEPTANCE':'NOT_READY',
   blockers:[...new Set([...automated,...gate.blockers])],
   warnings:['Human witness fields are operator attestations, not cryptographic proof of GPU execution.'],
   // Never leak source text, absolute disk paths, or ComfyUI workflow prompts.
   sceneCount:composition.scenes.length};
}
