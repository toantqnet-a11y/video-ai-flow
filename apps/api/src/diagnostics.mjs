/**
 * R0-04 — Read-only and privacy-preserving machine diagnostics.
 * WHY this is separate from SP-01: the CLI's raw report contains filesystem
 * paths and machine details that are unsuitable for an authenticated web API.
 * This service returns bounded, allowlisted facts, uses time-limited probes,
 * and caches concurrent requests so opening the dashboard cannot spawn many
 * FFmpeg/NVIDIA processes or accidentally call paid/remote AI providers.
 */
import os from 'node:os';
import {statfsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';

const execFileAsync=promisify(execFile);
const GiB=1024**3;
const STATE=new Set(['ready','warning','missing','unconfigured','unknown']);
const makeCheck=(id,state,detail,metrics={})=>({id,state:STATE.has(state)?state:'unknown',detail,metrics});
const finiteNumber=(value)=>(typeof value==='number'||typeof value==='bigint')&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
const gib=(bytes)=>finiteNumber(Number(bytes))===null?null:Math.round(Number(bytes)/GiB*10)/10;

/** Bounded command invocation. Never shell out through user-supplied command text. */
export async function systemCommand(command,args,{timeoutMs=2500}={}) {
  try {
    const {stdout}=await execFileAsync(command,args,{timeout:timeoutMs,maxBuffer:256*1024,
      windowsHide:true,shell:false,encoding:'utf8'});
    return {ok:true,text:String(stdout).slice(0,256*1024)};
  } catch(error) {
    // Do not return exception.message or captured stdout/stderr: both could
    // contain executable paths, environment fragments or unexpected secrets.
    return {ok:false,reason:error.code==='ENOENT'?'NOT_INSTALLED':error.killed||error.code==='ETIMEDOUT'?'TIMEOUT':'PROBE_FAILED'};
  }
}

/** Probe must never send prompts, credentials, or even a request to remote AI. */
export async function probeLocalComfy(origin,{fetchImpl=fetch,timeoutMs=1200}={}) {
  let u;
  try {u=new URL(origin);} catch{return {ok:false,reason:'INVALID_LOCAL_ENDPOINT'};}
  // Literal loopback only: no userinfo, hostnames, paths, query or redirect.
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||
    (u.pathname!=='/'&&u.pathname!=='')||u.search||u.hash||!u.port)
    return {ok:false,reason:'INVALID_LOCAL_ENDPOINT'};
  try {
    const r=await fetchImpl(`${u.origin}/system_stats`,{method:'GET',redirect:'manual',
      signal:AbortSignal.timeout(timeoutMs),headers:{accept:'application/json'}});
    // Check HTTP status only; never expose or log arbitrary ComfyUI response data.
    return r.ok?{ok:true}:{ok:false,reason:'LOCAL_ENDPOINT_UNAVAILABLE'};
  }catch{return {ok:false,reason:'LOCAL_ENDPOINT_UNAVAILABLE'};}
}

/** Pure evaluator is independently testable, including partial probe failures. */
export function evaluateSystem({platform,arch,nodeVersion,cpuCores,totalRamBytes,freeRamBytes,
  diskBytes,diskFreeBytes,diskError,sqliteOk,sqliteWal,ffmpeg,ffprobe,encoders,gpu,
  providers=[],comfyCheck=null,comfyConfigured=false,now=new Date().toISOString(),ttlMs=30000}={}) {
  const ffmpegOk=ffmpeg?.ok===true,probeOk=ffprobe?.ok===true;
  const canRender=ffmpegOk&&probeOk&&encoders?.h264===true&&encoders?.aac===true;
  const storagePresent=finiteNumber(diskFreeBytes)!==null;
  const storageLow=storagePresent&&diskFreeBytes<2*GiB;
  const diskState=diskError?'unknown':!storagePresent?'unknown':storageLow?'warning':'ready';
  const checks=[
    makeCheck('cpu','ready','CPU_DETECTED',{cores:finiteNumber(cpuCores)}),
    makeCheck('ram',finiteNumber(freeRamBytes)===null?'unknown':freeRamBytes<2*GiB?'warning':'ready',
      finiteNumber(freeRamBytes)===null?'MEMORY_PROBE_ERROR':freeRamBytes<2*GiB?'LOW_AVAILABLE_RAM':'MEMORY_AVAILABLE',
      {totalGiB:gib(totalRamBytes),freeGiB:gib(freeRamBytes)}),
    makeCheck('disk',diskState,diskError?'DISK_PROBE_ERROR':storageLow?'LOW_DISK_SPACE':'DISK_SPACE_AVAILABLE',
      {totalGiB:gib(diskBytes),freeGiB:gib(diskFreeBytes)}),
    makeCheck('sqlite',sqliteOk?sqliteWal?'ready':'warning':'missing',
      sqliteOk?sqliteWal?'SQLITE_CONNECTED':'SQLITE_WAL_NOT_ACTIVE':'SQLITE_UNAVAILABLE'),
    makeCheck('ffmpeg',!ffmpegOk?'missing':encoders?.h264&&encoders?.aac?'ready':'warning',
      !ffmpegOk?ffmpeg?.reason||'FFMPEG_NOT_FOUND':encoders?.h264&&encoders?.aac?'FFMPEG_RENDER_CODECS_AVAILABLE':'REQUIRED_ENCODER_MISSING',
      {h264:encoders?.h264===true,aac:encoders?.aac===true}),
    makeCheck('ffprobe',probeOk?'ready':'missing',probeOk?'FFPROBE_AVAILABLE':ffprobe?.reason||'FFPROBE_NOT_FOUND'),
    makeCheck('gpu',gpu?.ok&&gpu.count>0?'ready':gpu?.reason==='NOT_INSTALLED'?'missing':'unknown',
      gpu?.ok&&gpu.count>0?'NVIDIA_DETECTED':gpu?.reason==='NOT_INSTALLED'?'NVIDIA_NOT_DETECTED':'GPU_NOT_VERIFIED',
      {nvidiaCount:gpu?.ok?gpu.count:0,memoryMiB:gpu?.ok?gpu.memoryMiB:null}),
    makeCheck('windows',platform==='win32'?'warning':'unconfigured',
      platform==='win32'?'WINDOWS_HARDWARE_TEST_PENDING':'WINDOWS_TEST_DEFERRED'),
  ];
  // Registration means an adapter is configured, NOT proof of real inference.
  for(const provider of providers) {
    if(!provider||typeof provider.id!=='string'||!(/^[a-z0-9_-]{2,60}$/).test(provider.id)||!['tts','image','video'].includes(provider.kind)||
      !['local','remote'].includes(provider.location))continue;
    const id=provider.id.slice(0,60);
    const isLocal=provider.location==='local';
    const state=isLocal?(comfyCheck?.ok?'ready':'warning'):'unknown';
    checks.push(makeCheck(`provider:${id}`,state,isLocal?
      comfyCheck?.ok?'LOCAL_ENDPOINT_RESPONDING':'LOCAL_PROVIDER_NOT_VERIFIED':'REMOTE_PROVIDER_NOT_PROBED',
      {kind:provider.kind,location:provider.location,costTier:['local','free_unverified','paid'].includes(provider.costTier)?provider.costTier:'unknown',
        inferenceVerified:false}));
  }
  // Display ComfyUI even if its workflows are missing, so the UI explains why
  // Image/Video AI is not yet ready. This is NOT a network/provider action.
  if(!checks.some(c=>c.id==='provider:comfyui'))
    checks.push(makeCheck('comfyui',!comfyConfigured?'unconfigured':comfyCheck?.ok?'ready':'warning',
      !comfyConfigured?'COMFY_WORKFLOW_NOT_CONFIGURED':comfyCheck?.ok?'LOCAL_ENDPOINT_RESPONDING':'LOCAL_PROVIDER_NOT_VERIFIED'));
  const flags={editing:sqliteOk===true,render:canRender&&sqliteOk===true&&!storageLow,
    localAiVideo:false}; // A health endpoint cannot certify actual model inference.
  const counts={ready:0,warning:0,missing:0,unconfigured:0,unknown:0};
  for(const check of checks) counts[check.state]++;
  return {schemaVersion:1,collectedAt:now,cacheTtlMs:ttlMs,
    environment:{platform:['win32','linux','darwin'].includes(platform)?platform:'other',arch:arch==='x64'?'x64':arch==='arm64'?'arm64':'other',
      nodeMajor:Number.parseInt(String(nodeVersion||'').replace(/^v/,''),10)||null},
    summary:{state:flags.editing&&flags.render?'attention':'needs_action',...counts},
    readiness:flags,validation:{windowsHardware:false,providerInference:false,fullLengthRender:false},
    checks,
    note:'Diagnostics only; provider inference, native Windows security and 35-minute 1080p rendering remain unverified.'};
}

/** Run each probe independently, avoiding all secret-bearing logs and URLs. */
export function createDiagnosticsService({dataRoot,db,registry,comfyOrigin='http://127.0.0.1:8188',
  localComfyConfigured=false,clock=()=>Date.now(),ttlMs=30000,
  command=systemCommand,localProbe=probeLocalComfy,host=os,
  filesystem={statfs:statfsSync}}={}) {
  if(!dataRoot||!db)throw new TypeError('DIAGNOSTICS_DEPENDENCIES_REQUIRED');
  if(!Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>600000)throw new RangeError('INVALID_CACHE_TTL');
  let cached=null,updatedAt=-Infinity,inFlight=null;
  async function collect() {
    // Even if a test-injected adapter throws unexpectedly, each independent
    // probe must degrade to 'unknown' rather than take down the dashboard.
    const safe=async promise=>Promise.resolve().then(promise).catch(()=>({ok:false,reason:'PROBE_FAILED'}));
    const probes=await Promise.all([
      safe(()=>command('ffmpeg',['-hide_banner','-version'])),
      safe(()=>command('ffprobe',['-hide_banner','-version'])),
      safe(()=>command('ffmpeg',['-hide_banner','-encoders'])),
      safe(()=>command('nvidia-smi',['--query-gpu=memory.total','--format=csv,noheader,nounits'])),
      // Never contact ComfyUI until an explicit local workflow was configured.
      localComfyConfigured?safe(()=>localProbe(comfyOrigin)):Promise.resolve(null),
    ]);
    const [ffmpeg,ffprobe,encoderProbe,nvidia,comfyCheck]=probes;
    const encoders=encoderProbe.ok?{h264:/\blibx264\b/.test(encoderProbe.text),aac:/\baac\b/.test(encoderProbe.text)}:{h264:false,aac:false};
    const gpuLines=nvidia.ok?nvidia.text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean):[];
    const memoryMiB=gpuLines.reduce((sum,line)=>{const match=/^(\d{1,7})(?:\s*MiB)?$/.exec(line);return sum+(match?Number(match[1]):0)},0);
    let diskInfo=null,diskError=false;
    try {
      const stat=filesystem.statfs(resolve(dataRoot),{bigint:true});
      diskInfo={total:Number(stat.blocks*stat.bsize),free:Number(stat.bavail*stat.bsize)};
    } catch {diskError=true;}
    let sqliteOk=false,sqliteWal=false;
    try {
      // Keep the dashboard inexpensive. Full PRAGMA quick_check is a separate
      // manual maintenance operation and can block SQLite on huge projects.
      sqliteOk=db.prepare('SELECT 1 AS ok').get()?.ok===1;
      sqliteWal=String(db.prepare('PRAGMA journal_mode').get()?.journal_mode).toLowerCase()==='wal';
    } catch { /* Fail closed; never expose SQLite error or DB path. */ }
    const memory=host.totalmem(),free=host.freemem();
    return evaluateSystem({platform:process.platform,arch:process.arch,nodeVersion:process.version,
      cpuCores:host.availableParallelism?.()??host.cpus().length,totalRamBytes:memory,freeRamBytes:free,
      diskBytes:diskInfo?.total,diskFreeBytes:diskInfo?.free,diskError,
      sqliteOk,sqliteWal,ffmpeg,ffprobe,encoders,
      gpu:{ok:nvidia.ok,reason:nvidia.reason,count:gpuLines.length,memoryMiB},
      providers:registry?.list()??[],comfyCheck,comfyConfigured:localComfyConfigured,
      now:new Date(clock()).toISOString(),ttlMs});
  }
  /**
   * Cache and collapse simultaneous requests. `force` bypasses TTL but not a
   * running probe; otherwise concurrent page refreshes can exhaust process slots.
   */
  async function get({force=false}={}) {
    if(inFlight)return inFlight;
    if(!force&&cached&&clock()-updatedAt<ttlMs)return cached;
    inFlight=Promise.resolve().then(collect).then(value=>{
      cached=value;updatedAt=clock();return value;
    }).finally(()=>{inFlight=null});
    return inFlight;
  }
  return {get};
}
