#!/usr/bin/env node
/** R4-08: fail-closed, machine-readable release evidence. Only commands
 * actually executed during this invocation can mark automated gates PASS.
 * Never infer Windows/GPU/HyperFrames/long-render readiness from fixtures.
 */
import {access,readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dependencyReproducibility} from './fi01-release-preconditions.mjs';
import {findHyperframesCli} from '../packages/core/src/render-hyperframes.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),runTests=args.includes('--verify'),full=args.includes('--verify-full');
const has=async path=>{try{await access(path);return true}catch{return false}};
const command=(executable,argv,ms=8000)=>{
 const start=performance.now();const r=spawnSync(executable,argv,{cwd:root,encoding:'utf8',timeout:ms,windowsHide:true,
   // These may include project prompts/file paths, so never persist stdout.
   stdio:'ignore'});
 return {status:r.status===0?'PASS':'FAIL',exitCode:r.status,error:r.error?.code??null,durationMs:Math.round(performance.now()-start)};
};
const render=(status,reason,proof=null)=>({status,reason,...(proof?{proof}:{})});
const gates={};
gates.node22=render(Number(process.versions.node.split('.')[0])>=22?'PASS':'FAIL',`Node ${process.versions.node}`);
gates.ffmpeg=render(command('ffmpeg',['-version']).status,'local media encoder installed');
gates.ffprobe=render(command('ffprobe',['-version']).status,'local media probe installed');
const frontendDeps=await has(join(root,'node_modules/vite'))||await has(join(root,'apps/web/node_modules/vite'));
const backendDeps=await has(join(root,'node_modules/fastify'))||await has(join(root,'apps/api/node_modules/fastify'));
gates.frontendDeps=render(frontendDeps?'PASS':'BLOCKED',frontendDeps?'Vite dependency present':'Install locked dependencies on target machine');
gates.backendDeps=render(backendDeps?'PASS':'BLOCKED',backendDeps?'Fastify dependency present':'Install locked dependencies on target machine');
const deps=await dependencyReproducibility(root);
gates.dependencyLock=render(deps.lock,deps.reason);
gates.rendererPinned=render(deps.rendererPin,`Local HyperFrames pinned version: ${deps.rendererVersion??'missing'}`);
let hyperframesReady=false;
try{
 const cli=await findHyperframesCli();
 const probe=command(cli.binary,[...cli.argvPrefix,'--help'],15000);
 hyperframesReady=probe.status==='PASS';
 gates.hyperframesCli=render(hyperframesReady?'PASS':'BLOCKED','Exact local HyperFrames CLI availability (NOT rendered MP4 evidence)',probe);
}catch(e){gates.hyperframesCli=render('BLOCKED',`Verified local CLI not available: ${e?.code??'UNAVAILABLE'}`);}
let prior=null;try{prior=JSON.parse(await readFile(join(root,'docs/evidence/R314_release_gates.json'),'utf8'));}catch{}
gates.previousAcceptanceAvailable=render(prior?'PASS':'BLOCKED','Historical report exists; not a fresh production acceptance');
const workflows={
 r405_r406_realMp4:['node',['--test','apps/api/test/render-finishing-r405-r406.test.mjs'],180000],
 r402_r408_regression:['node',['--test','packages/core/test/r4-stabilization-402-408.test.mjs','apps/api/test/r4-api-r405-r407.test.mjs'],90000],
 r312_render_regression:['node',['--test','apps/api/test/render-drawer-r312.test.mjs','packages/core/test/render-drawer-r312.test.mjs'],120000],
 contract:['npm',['run','check'],90000],
 sdkTypecheck:['npm',['run','typecheck:sdk'],90000],
 negativeControl:['npm',['run','test:negative-control'],90000],
};
if(full)workflows.fullOfflineSuite=['npm',['run','test:all'],240000];
for(const [name,[executable,argv,timeout]] of Object.entries(workflows)){
 if(runTests||full){const proof=command(executable,argv,timeout);gates[name]=render(proof.status,'Executed locally (no remote model calls)',proof);}
 else gates[name]=render('BLOCKED','Not run: use --verify (or --verify-full)');
}
if(frontendDeps&&(runTests||full)){
 const result=command('npm',['run','build:web'],120000);gates.browserBuild=render(result.status,'Actual Vite build',result);
}else gates.browserBuild=render('BLOCKED','Vite not installed / build not executed');
if(backendDeps&&(runTests||full)){
 const result=command('npm',['run','test:live-http'],120000);gates.liveHttp=render(result.status,'Actual Fastify HTTP smoke',result);
}else gates.liveHttp=render('BLOCKED','Fastify not installed / live API not executed');
// These require an actual target-system operator run and provenance evidence.
for(const [name,reason] of Object.entries({
 liveWindowsBrowser:'No Windows browser drag/drop, subtitle and music playback evidence',
 real35MinMp4:'No 30–40 minute HyperFrames job completed with measured CPU/RAM/output frames',
 liveProviders:'No real local TTS/ComfyUI end-to-end run',
 restartLongRender:'No OS-kill/restart recovery acceptance on a long render',
 productionSecurityReview:'No dedicated security review, package audit or penetration test',
}))gates[name]=render('BLOCKED',reason);

// Optional real HyperFrames run uses the durable render queue and *genuine*
// pinned local CLI. Never infer runtime success from --help or mock CLI tests.
if(args.includes('--verify-real-hyperframes')&&hyperframesReady){
 try{
  const {runIa02HyperframesAcceptance}=await import('./ia02-hyperframes-acceptance.mjs');
  const proof=await runIa02HyperframesAcceptance({maxWaitMs:300000});
  gates.realHyperframesMp4=render('PASS','Actual 5-scene HyperFrames render, FFprobe, output SHA and SQLite recovery',proof);
 }catch(e){gates.realHyperframesMp4=render('FAIL',`Real HyperFrames queue render failed: ${e?.code??'INTEGRATION_ERROR'}`);}
}else gates.realHyperframesMp4=render('BLOCKED',hyperframesReady
 ? 'Not executed: pass --verify-real-hyperframes to run a real queue render'
 : 'Exact local HyperFrames not installed/validated; no real MP4 proof');

if(args.includes('--verify-real-hyperframes')&&hyperframesReady){
 try{
  const {liveHyperframesSubtitleMusicProof}=await import('./fi01-hyperframes-finishing.mjs');
  const proof=await liveHyperframesSubtitleMusicProof();
  gates.realHyperframesSubtitleMusic=render('PASS','Real pinned CLI + queued, edited two-cue subtitle/music MP4 with FFprobe QA',proof);
 }catch(e){gates.realHyperframesSubtitleMusic=render('FAIL',`Real subtitle/music render failed: ${e?.code??'INTEGRATION_ERROR'}`);}
}else gates.realHyperframesSubtitleMusic=render('BLOCKED','Genuine HyperFrames edited-cues + music finishing test not executed or CLI unavailable');
const statuses=Object.values(gates).map(x=>x.status);
const report={schemaVersion:2,checkedAt:new Date().toISOString(),platform:process.platform,
 primaryEngine:'hyperframes',ffmpegFallback:'manual',status:statuses.every(x=>x==='PASS')?'READY_FOR_REVIEW':'NOT_READY',
 summary:{pass:statuses.filter(x=>x==='PASS').length,blocked:statuses.filter(x=>x==='BLOCKED').length,fail:statuses.filter(x=>x==='FAIL').length},
 gates,warning:'BLOCKED is not PASS. An FFmpeg control render does not establish HyperFrames, Windows, GPU, long-video or security acceptance.',
 next:'Generate/commit package-lock.json on networked developer machine; npm ci on Windows; verify genuine HyperFrames+subtitle+music output, browser, 35min and crash recovery.'};
const target=args.find(x=>x.startsWith('--report='))?.slice(9);if(target){
 const path=join(root,target);await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
if(args.includes('--strict')&&report.status!=='READY_FOR_REVIEW')process.exitCode=1;
