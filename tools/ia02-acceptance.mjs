/**
 * IA-02 release gate inventory. Evidence is explicit: PASS, BLOCKED or FAIL.
 * Offline checks must never be portrayed as proof of real Windows UI or
 * HyperFrames renders. Never install packages or contact paid providers.
 *
 * Usage:
 *  node tools/ia02-acceptance.mjs --with-media --report=docs/evidence/IA02_gates.json
 *  node tools/ia02-acceptance.mjs --strict --with-media [--hyperframes-output=path]
 */
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runIntegrationAcceptance} from './integration-acceptance.mjs';
import {runIa02HyperframesAcceptance} from './ia02-hyperframes-acceptance.mjs';
import {makeHyperframesHtml} from '../packages/core/src/render-hyperframes.mjs';
import {prepareFiveSceneAcceptance} from './integration-acceptance.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
export const mark=(id,status,detail)=>({id,status,detail});
export function classifyReadiness(gates){
 if(gates.some(g=>g.status==='FAIL'))return 'FAILED';
 return gates.some(g=>g.status!=='PASS')?'NOT_READY':'READY_FOR_MANUAL_REVIEW';
}
function availability(name){
 try{require.resolve(name,{paths:[root]});return true;}catch{return false;}
}
function tool(name,args=['-version']){
 const p=spawnSync(name,args,{stdio:'ignore',timeout:7000,windowsHide:true});
 return {installed:p.status===0,code:p.error?.code??null};
}
function scopedModule(name){
 const path=join(root,'node_modules',name,'package.json');
 return existsSync(path)?path:null;
}
/** Require a local (lockable) HyperFrames package, not `npx`/global. */
export function localHyperframesPresent(){
 const filename=scopedModule('hyperframes');
 if(!filename)return false;
 try{
  const pkg=JSON.parse(readFileSync(filename,'utf8'));
  const bin=typeof pkg.bin==='string'?pkg.bin:pkg.bin?.hyperframes;
  if(!bin||!/\.[cm]?js$/.test(bin))return false;
  const dir=realpathSync(join(root,'node_modules','hyperframes'));
  const target=realpathSync(resolve(dir,bin));
  return target.startsWith(dir+sep);
 }catch{return false;}
}
const opts=process.argv.slice(2);
const flag=x=>opts.includes(x);
const arg=x=>opts.find(y=>y.startsWith(`--${x}=`))?.slice(x.length+3)??null;

async function buildGates({withMedia=false,hyperframesOutput=null,ffmpegOutput=null}={}){
 const gates=[];
 const record=(id,condition,detail)=>gates.push(mark(id,condition?'PASS':'BLOCKED',detail));
 record('node-22',Number(process.versions.node.split('.')[0])>=22,process.version);
 const ffmpeg=tool('ffmpeg'),ffprobe=tool('ffprobe');
 record('ffmpeg-cli',ffmpeg.installed,ffmpeg.installed?'installed':ffmpeg.code??'not functional');
 record('ffprobe-cli',ffprobe.installed,ffprobe.installed?'installed':ffprobe.code??'not functional');
 // Stronger than `node --check`: release requires built app + live HTTP.
 record('vite-installed',availability('vite'),'Needed for actual compiled React UI');
 record('react-installed',availability('react'),'Needed for browser UI');
 record('fastify-installed',availability('fastify'),'Needed for live HTTP/API tests');
 record('hyperframes-local',localHyperframesPresent(),'Only a project-local package is accepted; no npx auto-install');
 const win=process.platform==='win32';
 record('windows-host',win,win?'Windows host detected (not equivalent to UI acceptance)':'Target Windows host not tested');
 let sessionDir=null;
 try{
  sessionDir=await mkdtemp(join(tmpdir(),'ia02-contract-'));
  const fixture=await prepareFiveSceneAcceptance({dataRoot:sessionDir});
  try{
   const html=makeHyperframesHtml(fixture.composition);
   if(!html.includes('data-no-timeline')||!html.includes('data-start="0"')||
      /<script[\s>]/i.test(html)||/https?:\/\//i.test(html))throw Error('HTML_CONTRACT_FAILED');
   gates.push(mark('hyperframes-html-contract','PASS','5 real pinned PNG/WAV scenes; root has no-timeline and zero start'));
  }finally{fixture.store.close();fixture.db.close();}
 }catch(e){gates.push(mark('hyperframes-html-contract','FAIL',e.code??e.message));}
 finally{if(sessionDir)await rm(sessionDir,{recursive:true,force:true});}
 // A gate is skipped only for missing dependencies, never counted as passing.
 if(availability('vite')){
  const p=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','build:web'],{cwd:root,encoding:'utf8',timeout:120000,windowsHide:true,shell:process.platform==='win32'});
  gates.push(mark('web-build',p.status===0?'PASS':'FAIL',p.status===0?'production UI bundles successfully':'Vite build failed; inspect npm run build:web'));
 }else gates.push(mark('web-build','BLOCKED','Vite missing; web build NOT_RUN'));
 if(availability('fastify')){
  const p=spawnSync(process.execPath,['tools/live-http-smoke.mjs'],{cwd:root,encoding:'utf8',timeout:120000,windowsHide:true});
  gates.push(mark('fastify-live-http',p.status===0?'PASS':'FAIL',p.status===0?'Real Fastify inject/auth/avatar PASS':'Live HTTP smoke FAILED'));
 }else gates.push(mark('fastify-live-http','BLOCKED','Fastify missing; live HTTP NOT_RUN'));
 if(withMedia){
  if(ffmpeg.installed&&ffprobe.installed){
   try{const report=await runIntegrationAcceptance({profile:'portrait-hd',outputPath:ffmpegOutput});
    gates.push(mark('ffmpeg-five-scene','PASS',`${report.totalFrames} actual H264/AAC frames; ${report.renderSha256.slice(0,12)} SHA`));
   }catch(e){gates.push(mark('ffmpeg-five-scene','FAIL',e.code??e.message));}
  }else gates.push(mark('ffmpeg-five-scene','BLOCKED','ffmpeg/ffprobe unavailable'));
  if(localHyperframesPresent()){
   try{const report=await runIa02HyperframesAcceptance({outputPath:hyperframesOutput});
    gates.push(mark('hyperframes-real-five-scene','PASS',`${report.frames} measured MP4 frames, persisted queue/idempotency`));
   }catch(e){gates.push(mark('hyperframes-real-five-scene','FAIL',e.code??e.message));}
  }else gates.push(mark('hyperframes-real-five-scene','BLOCKED','HyperFrames missing; NEVER replaced with FFmpeg'));
 }else{
  gates.push(mark('ffmpeg-five-scene','BLOCKED','Re-run with --with-media'));
  gates.push(mark('hyperframes-real-five-scene','BLOCKED','Re-run with --with-media'));
 }
 gates.push(mark('production-ai-providers','BLOCKED','Real LLM/TTS/ComfyUI with consent not tested'));
 gates.push(mark('30-40min-mp4','BLOCKED','Long timeline planned only; long MP4 not rendered'));
 gates.push(mark('browser-ux','BLOCKED','No completed interactive visual review or Playwright acceptance'));
 return {id:'IA-02',at:new Date().toISOString(),platform:process.platform,localFirst:true,paidApiCalls:0,
  primaryEngine:'hyperframes',manualFallback:'ffmpeg-fastpath',release:classifyReadiness(gates),gates};
}
export {buildGates};
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await buildGates({withMedia:flag('--with-media'),hyperframesOutput:arg('hyperframes-output'),ffmpegOutput:arg('ffmpeg-output')});
 const target=arg('report');if(target){mkdirSync(dirname(resolve(target)),{recursive:true});writeFileSync(resolve(target),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));
 if(report.release==='FAILED'||(flag('--strict')&&report.release!=='READY_FOR_MANUAL_REVIEW'))process.exitCode=1;
}
