/**
 * R2-13 release gate snapshot, deliberately non-billable and non-destructive.
 * An available executable is a prerequisite, NOT proof that browser, Windows,
 * GPU, native provider or a 35-minute export has been accepted.
 */
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function commandAvailable(executable){
  const out=spawnSync(executable,['-version'],{encoding:'utf8',timeout:4000,windowsHide:true,stdio:'ignore'});
  return !out.error && out.status===0;
}
/** An explicit evidence gate: local readiness cannot imply end-to-end release. */
export function assessR213({platform='unknown',nodeVersion='',viteAvailable=false,
  ffmpegAvailable=false,ffprobeAvailable=false}={}){
  return {
    task:'R2-13',result:'OFFLINE_VERIFICATION_ONLY',releaseStatus:'NOT_READY',
    prerequisites:{platform,nodeVersion,viteAvailable,ffmpegAvailable,ffprobeAvailable},
    automatedCoverage:{
      G3:'Run npm run test:r213 and npm run test:all; lossless scene/source checks',
      G4:'Run npm run test:r213; 106 assets, restart, rollback and corruption checks',
      G5:'Run npm run test:r213 and npm run test:negative-control; consent, retry, fence checks'
    },
    outstandingGates:[
      {id:'G6-WINDOWS',status:'PENDING_HARDWARE_VALIDATION',action:'Execute test suite and launcher on Windows target'},
      {id:'G6-BROWSER',status:'PENDING_BROWSER_VALIDATION',action:'Install Vite and run build, HTTP smoke and UI browser acceptance'},
      {id:'G6-PROVIDERS',status:'PENDING_LIVE_PROVIDER_VALIDATION',action:'Run native Edge/Piper/VieNeu, real ComfyUI checkpoint and verify costs'},
      {id:'G6-STORAGE',status:'PENDING_HARDWARE_VALIDATION',action:'Validate real ENOSPC/crash/filesystem protection with backups'},
      {id:'G6-LONG_FORM',status:'PENDING_LONG_FORM_VALIDATION',action:'Benchmark 30–40 minute workload and eventual MP4 export once renderer is implemented'}
    ],
    warning:'This snapshot performs no AI inference, remote API requests, render, or browser tests.'
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const outfile=process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length);
  const data=assessR213({platform:process.platform,nodeVersion:process.version,
    viteAvailable:existsSync(join(root,'node_modules','.bin',process.platform==='win32'?'vite.cmd':'vite')),
    ffmpegAvailable:commandAvailable('ffmpeg'),ffprobeAvailable:commandAvailable('ffprobe')});
  const serialized=JSON.stringify(data,null,2)+'\n';
  if(outfile){
    const dest=resolve(root,outfile);
    if(!dest.startsWith(resolve(root,'docs','evidence')+'/') &&
       !dest.startsWith(resolve(root,'docs','evidence')+'\\')){
      console.error('output must be under docs/evidence');process.exitCode=2;
    }else{mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,serialized);}
  }
  process.stdout.write(serialized);
}
