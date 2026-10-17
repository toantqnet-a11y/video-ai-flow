/**
 * R0-01 single-command local bootstrap. Installs/builds only when necessary,
 * then runs the production same-origin UI + Fastify server in ONE process.
 * Pairing code stays in the interactive console (never a logfile/URL).
 */
import {existsSync,statfsSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from 'node:process';
import {acquireLauncherLock,assertNodeVersion,assertPortAvailable,LaunchError,parseOptions,resolveConfig,waitForHealth,REQUIRED_RUNTIME_PACKAGES} from './launcher-core.mjs';
import {verifyWorkspaceLock} from './fi02-lock-policy.mjs';
import {planLauncherInstall} from './fi03-launcher-install.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const status=(code)=>process.stdout.write(`[ContentStudio] ${code}\n`);
const fail=(code)=>process.stderr.write(`[ContentStudio] ${code}\n`);
const bin=(name)=>process.platform==='win32'?`${name}.cmd`:name;

function toolReady(tool){
  const result=spawnSync(tool,['-version'],{stdio:'ignore',timeout:2500,windowsHide:true});
  return result.status===0;
}
function hasDependencies(){
  return REQUIRED_RUNTIME_PACKAGES.every(p=>existsSync(join(root,'node_modules',p)));
}
function assertExistingBuild(){
  if(!existsSync(join(root,'apps/web/dist/index.html')))throw new LaunchError('UI_BUILD_MISSING');
}

async function npmRun(args){
  // npm.cmd needs cmd.exe on Windows. Args are constant literals, never
  // interpolated from an API key, endpoint, or project title.
  status(`RUN_NPM_${args[0].toUpperCase()}`);
  const child=spawn(bin('npm'),args,{cwd:root,stdio:'inherit',shell:process.platform==='win32',windowsHide:false});
  const code=await new Promise((ok,failSpawn)=>{child.once('error',failSpawn);child.once('exit',(c)=>ok(c));});
  if(code!==0)throw new LaunchError(`NPM_${args[0].toUpperCase()}_FAILED`);
}
function maybeLoadLocalEnv(){
  const filename=join(root,'.env');
  if(existsSync(filename)){
    // Explicit local configuration only; do not print env values.
    try{loadEnvFile(filename);}catch{throw new LaunchError('INVALID_ENV_CONFIGURATION');}
  }
}
async function diagnostic(config){
  status(`NODE_OK ${process.version}`);
  status(`PLATFORM ${process.platform}`);
  status(`FFMPEG_${toolReady('ffmpeg')?'READY':'MISSING_OPTIONAL'}`);
  status(`FFPROBE_${toolReady('ffprobe')?'READY':'MISSING_OPTIONAL'}`);
  status(`NPM_DEPENDENCIES_${hasDependencies()?'READY':'MISSING'}`);
  const lock=await verifyWorkspaceLock(root);
  status(`PACKAGE_LOCK_${lock.status}`);
  status(`UI_BUILD_${existsSync(join(root,'apps/web/dist/index.html'))?'READY':'MISSING'}`);
  try{
    const disk=statfsSync(existsSync(config.dataDir)?config.dataDir:root,{bigint:true});
    const freeGiB=Number(disk.bavail*disk.bsize)/1024**3;
    if(freeGiB<1)status('DISK_SPACE_LOW_WARNING');
  }catch{status('DISK_SPACE_UNVERIFIED');}
}
async function run(){
  const opts=parseOptions(process.argv.slice(2));
  assertNodeVersion();
  maybeLoadLocalEnv();
  const config=resolveConfig(root);
  if(opts.mode==='diagnose'){await diagnostic(config);return;}
  if(opts.mode==='test'){await npmRun(['run','test:all']);return;}
  // Fail early if another process owns the selected local port, rather than
  // attempting to pair with / terminate an unrelated local service.
  await assertPortAvailable(config.port);
  const release=await acquireLauncherLock(config.dataDir);
  let child;
  let closing=false;
  const stopChild=()=>{
    if(!child||child.exitCode!==null||child.signalCode!==null)return;
    try{child.kill('SIGTERM');}catch{/* already exiting */}
  };
  const handleSignal=()=>{closing=true;stopChild();};
  process.on('SIGINT',handleSignal);
  process.on('SIGTERM',handleSignal);
  try{
    await diagnostic(config);
    // FI-02: production start never performs unpinned npm install. An
    // operator must first create/review/commit the lock on a networked PC.
    // A locked graph is also required when modules are already installed.
    const locked=await verifyWorkspaceLock(root);
    let installPlan;
    try{installPlan=planLauncherInstall(locked,{
      dependenciesPresent:hasDependencies(),skipInstall:opts.skipInstall});}
    catch(e){throw new LaunchError(e.code??'PACKAGE_LOCK_UNVERIFIED');}
    if(installPlan){
      await npmRun(installPlan);
      if(!hasDependencies())throw new LaunchError('DEPENDENCIES_STILL_MISSING');
    }
    if(!opts.skipBuild)await npmRun(['run','build:web']);
    assertExistingBuild();
    if(closing)throw new LaunchError('LAUNCH_CANCELLED');
    await assertPortAvailable(config.port);
    const launchArgs=['apps/api/src/server.mjs'];
    child=spawn(process.execPath,launchArgs,{cwd:root,env:{...process.env,NODE_ENV:'production'},stdio:'inherit',windowsHide:false});
    let exited=false;
    const exitPromise=new Promise((resolveExit)=>{child.once('exit',code=>{exited=true;resolveExit(code);});child.once('error',()=>{exited=true;resolveExit(1);});});
    await waitForHealth({url:config.url,isExited:()=>exited||closing});
    status(`READY ${config.url}`);
    status('PAIR_USING_TERMINAL_CODE_ONLY');
    if(!opts.noBrowser&&process.platform==='win32'){
      // URL is exclusively loopback + a validated numeric port.
      const openBrowser=spawn('cmd.exe',['/d','/s','/c',`start "" "${config.url}"`],{cwd:root,stdio:'ignore',windowsHide:true});
      openBrowser.on('error',()=>status('OPEN_BROWSER_MANUALLY'));
    }
    const exitCode=await exitPromise;
    if(!closing&&exitCode!==0)throw new LaunchError('API_PROCESS_FAILED');
  }finally{
    stopChild();
    // Give the API a chance to close SQLite before another launcher can
    // acquire the file lock. In a forced termination, the next startup
    // still verifies both the lock owner and loopback port.
    if(child&&child.exitCode===null&&child.signalCode===null){
      await Promise.race([
        new Promise(done=>child.once('exit',done)),
        new Promise(done=>setTimeout(done,5000))
      ]);
    }
    process.removeListener('SIGINT',handleSignal);
    process.removeListener('SIGTERM',handleSignal);
    await release();
  }
}
run().catch(error=>{
  fail(error instanceof LaunchError?error.code:'LAUNCH_UNEXPECTED_FAILURE');
  process.exitCode=1;
});
