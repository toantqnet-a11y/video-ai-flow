/** R3-14 release-gate report, NOT a release certificate.
 * Offline successful tests, a long timeline PLAN, and FFmpeg control output
 * must never substitute for a real HyperFrames+Windows+browser+35-min job.
 * No package installation, AI inference, remote calls, or fake gates.
 *
 * node tools/r314-acceptance.mjs --with-media --with-long-plan --report=docs/evidence/R314_acceptance.json
 * node tools/r314-acceptance.mjs --strict [--long-mp4=/path/output.mp4]
 */
import {spawnSync} from 'node:child_process';
import {mkdir,stat,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildGates,classifyReadiness,mark} from './ia02-acceptance.mjs';
import {runLongFormPlan} from './long-form-plan-acceptance.mjs';
import {checkRenderDisk} from '../packages/core/src/render-safety-r313.mjs';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),enabled=v=>args.includes(v),value=v=>args.find(x=>x.startsWith(`--${v}=`))?.slice(v.length+3);

function runTest(files){
 const child=spawnSync(process.execPath,['--test',...files],{cwd:base,timeout:90_000,windowsHide:true,encoding:'utf8'});
 return {status:child.status,summary:child.status===0?'all requested test files passed':'one or more requested test files failed',error:child.error?.code??null};
}

/** External file probe verifies bytes, codecs and frame clock only, never
 * claims the file came from the application's durable render queue. */
export async function checkLongMp4(path){
 const data=await stat(path);
 if(!data.isFile()||data.size<1_000_000)return {status:'FAIL',detail:'Invalid or implausibly small MP4'};
 const run=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,nb_frames,r_frame_rate','-of','json',path],{timeout:25000,encoding:'utf8',windowsHide:true});
 if(run.status!==0)return {status:'FAIL',detail:'ffprobe did not verify the MP4'};
 let metadata;try{metadata=JSON.parse(run.stdout);}catch{return {status:'FAIL',detail:'invalid ffprobe JSON'};}
 const duration=Number(metadata.format?.duration),v=metadata.streams?.find(s=>s.codec_type==='video'),a=metadata.streams?.find(s=>s.codec_type==='audio');
 const fpsParts=(v?.r_frame_rate??'').split('/').map(Number),fps=fpsParts.length===2?fpsParts[0]/fpsParts[1]:NaN,frames=Number(v?.nb_frames);
 if(!Number.isFinite(duration)||duration<1800||duration>2400||v?.codec_name!=='h264'||a?.codec_name!=='aac'||
    !Number.isSafeInteger(frames)||!Number.isFinite(fps)||fps<24||fps>60||Math.abs(frames/fps-duration)>1)
    return {status:'FAIL',detail:'35-minute MP4 codec/frame/duration QA failed'};
 return {status:'PASS',detail:`${Math.round(duration)}s H.264/AAC; ${frames} measured frames (external-file QA only)`};
}

export async function buildR314Gates({withMedia=false,withLongPlan=false,longMp4=null,withTests=true}={}){
 const ia02=await buildGates({withMedia});
 const gates=[...ia02.gates];
 try{
  const root=process.env.CONTENTSTUDIO_DATA_DIR?resolve(process.env.CONTENTSTUDIO_DATA_DIR):base;
  const capacity=await checkRenderDisk(root,{profile:{width:1920,height:1080,fps:30},totalFrames:63000,scenes:[]});
  gates.push(mark('35min-disk-headroom',capacity.ready?'PASS':'BLOCKED',
    `${Math.ceil(capacity.requiredBytes/1048576)}MiB estimated scratch + ${Math.ceil(capacity.reserveBytes/1048576)}MiB reserve; capacity is not an output guarantee`));
 }catch{gates.push(mark('35min-disk-headroom','BLOCKED','Cannot verify writable filesystem capacity'));}
 if(withTests){
  const cases=runTest(['packages/core/test/render-safety-r313.test.mjs','packages/core/test/project-zip-r311.test.mjs']);
  gates.push(mark('crash-disk-zip-tests',cases.status===0?'PASS':'FAIL',cases.summary));
 }else gates.push(mark('crash-disk-zip-tests','BLOCKED','Pass --with-tests to record focused regression (enabled by default)'));
 if(withLongPlan){try{
  const plan=await runLongFormPlan({sceneCount:300,voiceMs:7000,paddingMs:250});
  gates.push(mark('35min-plan-300-scenes','PASS',`${plan.totalFrames} frames, ${plan.expectedTimelineMinutes}min; NOT a rendered video`));
 }catch{gates.push(mark('35min-plan-300-scenes','FAIL','Planning/FFprobe fixture failed'));}}
 else gates.push(mark('35min-plan-300-scenes','BLOCKED','Not run; pass --with-long-plan'));
 if(longMp4){try{const result=await checkLongMp4(resolve(longMp4));gates.push(mark('long-mp4-technical-qa',result.status,result.detail));}
 catch{gates.push(mark('long-mp4-technical-qa','FAIL','Long output not readable'));}}
 else gates.push(mark('long-mp4-technical-qa','BLOCKED','No actual 30–40 minute MP4 provided'));
 // Provenance + live editing + AI path require first-party observed test results,
 // not a user-supplied arbitrary MP4 or successful mock provider tests.
 gates.push(mark('35min-app-job-provenance','BLOCKED','No real HyperFrames 35-minute completed SP-04 job with QA evidence'));
 gates.push(mark('render-recovery-process-kill','BLOCKED','OS-level kill/restart while encoding a real long project remains untested'));
 return {id:'R3-14',at:new Date().toISOString(),platform:process.platform,primaryEngine:'hyperframes',
  ffmpegManualFallbackOnly:true,remotePaidCalls:0,
  release:classifyReadiness(gates),summary:{pass:gates.filter(g=>g.status==='PASS').length,
   blocked:gates.filter(g=>g.status==='BLOCKED').length,fail:gates.filter(g=>g.status==='FAIL').length},gates};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await buildR314Gates({withMedia:enabled('--with-media'),withLongPlan:enabled('--with-long-plan'),longMp4:value('long-mp4')});
 const out=value('report');if(out){await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(resolve(out),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));
 if(report.release==='FAILED'||(enabled('--strict')&&report.release!=='READY_FOR_MANUAL_REVIEW'))process.exitCode=1;
}
