/**
 * R0-01 Windows launcher primitives, deliberately free of npm dependencies.
 * Validate local prerequisites and lock the data directory BEFORE running an API
 * that can migrate SQLite. Never print user paths, environment values, or secrets.
 */
import {open,readFile,unlink,mkdir} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

// A missing local HyperFrames install must be visible at first boot, not
// discovered only after an expensive render job has entered the queue.
export const REQUIRED_RUNTIME_PACKAGES=Object.freeze(['fastify','vite','react','hyperframes']);

export class LaunchError extends Error {
  constructor(code) { super(code); this.code=code; }
}

/** Pure argument parsing prevents flags from being confused with commands. */
export function parseOptions(args=[]) {
  const modes=['start','test','diagnose'];
  let mode='start', usedMode=false;
  const flags={skipInstall:false,skipBuild:false,noBrowser:false};
  const map={'--skip-install':'skipInstall','--skip-build':'skipBuild','--no-browser':'noBrowser'};
  for(const arg of args){
    if(modes.includes(arg)&&!usedMode){mode=arg;usedMode=true;continue;}
    if(!map[arg]||flags[map[arg]])throw new LaunchError('INVALID_LAUNCH_ARGUMENT');
    flags[map[arg]]=true;
  }
  if(mode!=='start'&&(flags.skipBuild||flags.skipInstall||flags.noBrowser))throw new LaunchError('INVALID_LAUNCH_ARGUMENT');
  return {mode,...flags};
}

export function assertNodeVersion(version=process.versions.node){
  const match=/^(\d+)\.(\d+)\.(\d+)/.exec(version||'');
  if(!match||Number(match[1])<22||(Number(match[1])===22&&Number(match[2])<13))throw new LaunchError('NODE_22_13_REQUIRED');
  return version;
}

export function resolveConfig(root,env=process.env){
  const portString=String(env.CONTENTSTUDIO_PORT??'4311');
  if(!/^[0-9]{4,5}$/.test(portString))throw new LaunchError('INVALID_PORT');
  const port=Number(portString);
  if(port<1024||port>65535)throw new LaunchError('INVALID_PORT');
  // Always keep launcher and API paths identical when CONTENTSTUDIO_DATA_DIR
  // is relative. An accidental cwd mismatch would risk a second database.
  const dataDir=resolve(root,env.CONTENTSTUDIO_DATA_DIR||'data');
  return {root:resolve(root),dataDir,port,url:`http://127.0.0.1:${port}/`};
}

/** Port probing does not contact other apps and refuses to reuse their socket. */
export async function assertPortAvailable(port){
  const server=createServer();
  try{
    await new Promise((done,fail)=>{
      server.once('error',fail);
      server.listen({host:'127.0.0.1',port,exclusive:true},done);
    });
  }catch(e){
    if(e.code==='EADDRINUSE'||e.code==='EACCES')throw new LaunchError('LOCAL_PORT_UNAVAILABLE');
    throw e;
  }finally{
    if(server.listening)await new Promise(resolveClose=>server.close(resolveClose));
  }
}

function isAlive(pid){
  if(!Number.isSafeInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}
}

/**
 * Write-exclusive lock. On an unclean shutdown, a dead PID can be recovered;
 * an alive PID is NEVER killed. The random token protects newer lock owners
 * from an older process releasing somebody else's lock.
 */
export async function acquireLauncherLock(dataDir,{pid=process.pid,alive=isAlive}={}){
  await mkdir(dataDir,{recursive:true});
  const path=join(dataDir,'.contentstudio-launcher.lock');
  const token=randomUUID();
  for(let attempt=0;attempt<3;attempt++){
    try{
      const fd=await open(path,'wx',0o600);
      try{await fd.writeFile(JSON.stringify({pid,token,createdAt:new Date().toISOString()}));}
      finally{await fd.close();}
      let released=false;
      return async()=>{
        if(released)return;
        released=true;
        try{const current=JSON.parse(await readFile(path,'utf8'));
          if(current.token===token)await unlink(path);
        }catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
      };
    }catch(e){
      if(e.code!=='EEXIST')throw e;
      let stale=false;
      try{const existing=JSON.parse(await readFile(path,'utf8'));stale=!alive(existing.pid);}
      catch(readError){if(readError.code==='ENOENT')continue;throw new LaunchError('LAUNCH_LOCK_NEEDS_REVIEW');}
      if(!stale)throw new LaunchError('CONTENTSTUDIO_ALREADY_RUNNING');
      // Stale locks are only removed after verifying the owner is dead.
      // Recheck immediately; second instance still competes via open('wx').
      try{await unlink(path);}catch(unlinkError){if(unlinkError.code!=='ENOENT')throw unlinkError;}
    }
  }
  throw new LaunchError('LAUNCH_LOCK_BUSY');
}

/** Only the loopback /health endpoint is polled, never a remote provider. */
export async function waitForHealth({url,timeoutMs=20000,intervalMs=250,fetchImpl=fetch,isExited=()=>false}){
  const end=Date.now()+timeoutMs;
  const health=new URL('health',url);
  while(Date.now()<end){
    if(isExited())throw new LaunchError('API_PROCESS_EXITED_EARLY');
    try{
      const response=await fetchImpl(health,{signal:AbortSignal.timeout(800)});
      if(response.ok){const body=await response.json();if(body?.status==='ok'&&body?.service==='contentstudio')return true;}
    }catch{ /* Not yet bound; retry while the child is alive. */ }
    await new Promise(r=>setTimeout(r,intervalMs));
  }
  throw new LaunchError('API_STARTUP_TIMEOUT');
}
