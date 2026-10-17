#!/usr/bin/env node
/** WI-01: local Windows readiness triage, NOT acceptance or production signoff.
 * Read-only preflight: no package installation, shell invocation, model calls,
 * browser attachment, secret collection or remote requests. Command probes
 * emit exit codes only. Evidence deliberately contains no filesystem paths.
 */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,statfs,writeFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectRuntime,safeGateReportPath} from './fi04-runtime-gates.mjs';
import {inspectFi04Hyperframes} from './fi04-hyperframes-acceptance.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const GIB=1024**3;
const CODE=Object.freeze({
 windowsHost:'RUN_ON_WINDOWS_11',node22:'INSTALL_NODE_22_13_PLUS',architecture:'USE_64_BIT_NODE',
 npmLock:'RESOLVE_REVIEW_AND_COMMIT_LOCK_ON_TRUSTED_NETWORK',vite:'RUN_REVIEWED_NPM_CI',
 fastify:'RUN_REVIEWED_NPM_CI',hyperframes:'INSTALL_PINNED_HYPERFRAMES_0_8_159_WITH_NPM_CI',
 rendererCli:'VERIFY_PROJECT_LOCAL_HYPERFRAMES_CLI',ffmpeg:'INSTALL_LOCAL_FFMPEG',
 ffprobe:'INSTALL_LOCAL_FFPROBE',browser:'INSTALL_CHROME_OR_EDGE',disk:'FREE_20_GIB_ON_PROJECT_VOLUME'
});
function flag(ok,detail){return {status:ok?'PASS':'BLOCKED',detail};}
/** Pure policy; tests can inject mocked observations without spoofing the host.
 * FAIL on an inconsistent lock, BLOCKED on missing prerequisites. */
export function classifyWindowsPreflight(x){
 const checks={
  windowsHost:flag(x.platform==='win32','Windows acceptance host required (Windows 11 target)'),
  node22:flag(x.nodeVersion?.major>22||x.nodeVersion?.major===22&&x.nodeVersion?.minor>=13,'Node >=22.13'),
  architecture:flag(['x64','arm64'].includes(x.arch),'64-bit Node required'),
  npmLock:{status:x.lock==='FAIL'?'FAIL':x.lock==='PASS'?'PASS':'BLOCKED',detail:'Verified local npm workspace lock required'},
  vite:flag(x.vite==='PASS','Installed Vite resolved from workspace'),
  fastify:flag(x.fastify==='PASS','Installed Fastify resolved from workspace'),
  hyperframes:flag(x.hyperframes==='PASS','Installed HyperFrames resolved from project'),
  rendererCli:flag(x.rendererCli===true&&x.rendererPin==='0.8.159','Local pinned HyperFrames CLI 0.8.159 required'),
  ffmpeg:flag(x.ffmpeg===true,'Local FFmpeg binary exits successfully'),
  ffprobe:flag(x.ffprobe===true,'Local FFprobe binary exits successfully'),
  browser:flag(x.browser===true&&x.platform==='win32','Chrome/Edge installed on Windows (not interaction verified)'),
  disk:flag(Number.isSafeInteger(x.freeBytes)&&x.freeBytes>=20*GIB,'Conservative 20 GiB free-disk preflight threshold; not a video benchmark')
 };
 const actions=Object.entries(checks).filter(([,v])=>v.status!=='PASS').map(([k])=>({gate:k,action:CODE[k]}));
 return {status:actions.length?'BLOCKED':'PREREQUISITES_OK',checks,actions,operatorAcceptanceStatus:'NOT_RUN',releaseStatus:'NOT_READY'};
}
export function binaryPresent(name){
 const r=spawnSync(name,['-version'],{encoding:'utf8',timeout:4000,windowsHide:true,shell:false,maxBuffer:64*1024});
 return r.status===0&&!r.error;
}
/** Presence is not browser proof. Avoid launching Chrome or probing user tabs. */
export function windowsBrowserInstalled(env=process.env,os=process.platform){
 if(os!=='win32')return false;
 const roots=[env['ProgramFiles'],env['ProgramFiles(x86)'],env.LOCALAPPDATA].filter(Boolean);
 const paths=[['Google','Chrome','Application','chrome.exe'],['Microsoft','Edge','Application','msedge.exe']];
 return roots.some(base=>paths.some(segments=>existsSync(join(base,...segments))));
}
export async function inspectWindowsPreflight({platform=process.platform}={}){
 const runtime=await inspectRuntime(root);
 const cli=await inspectFi04Hyperframes();
 let freeBytes=null;
 try{const s=await statfs(root);freeBytes=Number(BigInt(s.bavail)*BigInt(s.bsize));}catch{}
 const [major,minor]=process.versions.node.split('.').map(Number);
 const observations={platform,nodeVersion:{major,minor},arch:process.arch,
  lock:runtime.lock.status,vite:runtime.vite.status,fastify:runtime.fastify.status,
  hyperframes:runtime.hyperframes.status,rendererCli:cli.cliInstalled&&cli.dependencyLock==='PASS',
  rendererPin:cli.rendererPin,ffmpeg:binaryPresent('ffmpeg'),ffprobe:binaryPresent('ffprobe'),
  browser:windowsBrowserInstalled(process.env,platform),freeBytes:Number.isSafeInteger(freeBytes)?freeBytes:null};
 return {schemaVersion:1,task:'WI-01',timestamp:new Date().toISOString(),hostPlatform:process.platform,
  ...classifyWindowsPreflight(observations),diskFreeGiB:observations.freeBytes===null?null:Math.floor(observations.freeBytes/GIB),
  warning:'Preflight checks binaries and workspace state only. No browser actions, real HyperFrames MP4, AI inference, or Windows acceptance have been performed.'};
}
export function parseArgs(args){
 let strict=false,report=null,inspect=false;
 for(const x of args){
  if(x==='--inspect'&&!inspect)inspect=true;
  else if(x==='--strict'&&!strict)strict=true;
  else if(x.startsWith('--report=')&&report===null&&x.length>9)report=x.slice(9);
  else throw Error('WI01_UNSUPPORTED_ARGUMENT');
 }
 if(!inspect)throw Error('WI01_INSPECT_REQUIRED');return {inspect,strict,report};
}
async function main(){
 const {strict,report}=parseArgs(process.argv.slice(2));
 const result=await inspectWindowsPreflight();
 if(report){const target=safeGateReportPath(root,report);await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(result,null,2)+'\n',{mode:0o600});}
 console.log(JSON.stringify(result,null,2));
 if(strict&&result.status!=='PREREQUISITES_OK')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
