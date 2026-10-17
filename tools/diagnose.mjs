/** Offline readiness report; never claims untested GPU/Windows benchmarks. */
import {spawnSync} from 'node:child_process';
import {platform,totalmem,cpus} from 'node:os';
const tool=name=>{const r=spawnSync(name,['-version'],{stdio:'ignore',timeout:3000,windowsHide:true});return r.status===0;};
console.log(JSON.stringify({node:process.version,platform:platform(),cpus:cpus().length,ramGiB:Math.round(totalmem()/1024**3),ffmpeg:tool('ffmpeg'),ffprobe:tool('ffprobe'),
  liveComfyUiVerified:false,edgeTtsNetworkVerified:false,windowsHardwareValidated:false},null,2));
