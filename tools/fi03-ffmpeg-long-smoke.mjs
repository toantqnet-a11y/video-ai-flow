#!/usr/bin/env node
/** Operator opt-in 35-minute FFmpeg endurance control. Uses synthetic media
 * and never passes a production HyperFrames release gate; 360p is deliberate
 * to make this a low-cost smoke test, NOT a 1080p stress claim. */
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {probeMp4} from '../packages/core/src/render-ffmpeg-r2ext04.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const opt=process.argv.slice(2);
const find=k=>opt.find(a=>a.startsWith(`${k}=`))?.slice(k.length+1);
const out=resolve(root,find('--output')??'docs/evidence/FI03_ffmpeg_35min_360p_control.mp4');
const report=resolve(root,find('--report')??'docs/evidence/FI03_ffmpeg_35min_control.json');
await mkdir(dirname(out),{recursive:true});
const t=performance.now();
const args=['-hide_banner','-nostdin','-loglevel','error','-f','lavfi','-i',
 'color=c=0x102038:s=640x360:r=30','-f','lavfi','-i',
 'sine=frequency=320:sample_rate=48000','-t','2100',
 '-map','0:v','-map','1:a','-c:v','libx264','-preset','ultrafast',
 '-crf','37','-pix_fmt','yuv420p','-threads','2','-c:a','aac',
 '-b:a','32k','-movflags','+faststart','-y',out];
const result=spawnSync('ffmpeg',args,{encoding:'utf8',timeout:1200000,maxBuffer:1024*1024});
if(result.status!==0){console.error(`FI03_FFMPEG_LONG_CONTROL_FAILED:${result.error?.code??result.status}`);process.exit(1);}
const media=await probeMp4(out);const duration=2100,expected=63000;
const success=media.videoCodec==='h264'&&media.audioCodec==='aac'&&
 media.width===640&&media.height===360&&media.frameCount===expected&&
 Math.abs(media.durationSeconds-duration)<.1;
const proof={task:'FI-03',evidenceType:'FFMPEG_ONLY_SYNTHETIC_360P_CONTROL',passed:success,
 releaseGateSatisfied:false,notEvidenceFor:['HyperFrames real render','1080p','scene edits','Windows','crash recovery','AI providers'],
 timestamp:new Date().toISOString(),expectedFrames:expected,expectedSeconds:duration,
 media,bytes:(await stat(out)).size,wallClockMs:Math.round(performance.now()-t)};
await mkdir(dirname(report),{recursive:true});await writeFile(report,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof,null,2));
if(!success)process.exitCode=1;
