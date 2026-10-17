#!/usr/bin/env node
/** FI-04-05: read-only DOM/keyboard probe against an ALREADY OPEN, authenticated
 * Chrome/Edge test tab. No browser pairing, remote hosts, project writes, model
 * calls, screenshot secrets, or fake Windows PASS from a Linux/DOM fixture.
 * Operator must separately inspect visual/A/V quality and drag interactions.
 */
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../',import.meta.url));
const DEFAULT_ENDPOINT='http://127.0.0.1:9222';
const DEFAULT_ORIGIN='http://127.0.0.1:5173';
const checklist=['browserChromeEdgeWindows','authenticatedTimelineVisible','keyboardSeeking','reorderDrag','reorderButtons','trimCancelAndSave','zoomScroll','undoRedo','waveformSync','500SceneViewport'];
const status=x=>x===true?'PASS':'BLOCKED';
function loopbackUrl(raw){
 const url=new URL(raw);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('FI0405_LOOPBACK_ONLY');
 return url;
}
export function safeReport(name){
 const out=resolve(project,name),base=join(project,'docs','evidence'),r=relative(base,out);
 if(!r||r.startsWith('..')||isAbsolute(r)||!out.endsWith('.json'))throw Error('FI0405_UNSAFE_REPORT_PATH');
 return out;
}
export function classifyBrowserEvidence({os,probe}){
 const gates=Object.fromEntries(checklist.map(key=>[key,{status:'BLOCKED',detail:'Not observed'}]));
 gates.browserChromeEdgeWindows={status:os==='win32'&&probe?.browser==='chrome-or-edge'&&/^Win/.test(probe?.platform??'')?'PASS':'BLOCKED',detail:os==='win32'?'Browser runtime must be Chrome/Edge':'Acceptance must run on Windows, not spoofed userAgent'};
 if(probe){
  for(const [name,ok] of Object.entries({authenticatedTimelineVisible:probe.timelineVisible,keyboardSeeking:probe.keyboardSeek})){gates[name]={status:status(ok),detail:ok?'Automated DOM/keyboard observation':'Browser DOM check unavailable'};}
  gates['500SceneViewport']={status:status(probe.sceneCount>=500&&probe.virtualized),detail:`Scenes ${probe.sceneCount??0}; clips ${probe.domClips??0}; requires actual >=500-scene seeded video`};
 }
 // Human judgment / editing actions need a separate, manually witnessed report.
 // Never accept a submitted boolean in --run as proof of Windows drag/trim.
 for(const key of ['reorderDrag','reorderButtons','trimCancelAndSave','zoomScroll','undoRedo','waveformSync']){
  gates[key]={status:'BLOCKED',detail:'Requires witnessed interactive Windows verification; DOM control existence is not edit, audio or render proof'};
 }
 return {status:Object.values(gates).every(x=>x.status==='PASS')?'PASS':'NOT_READY',gates,manualRequired:checklist.filter(k=>gates[k].status!=='PASS')};
}
async function readJson(url){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),3500);
 try{const result=await fetch(url,{signal:ctrl.signal});if(!result.ok)throw Error('FI0405_BROWSER_HTTP');return await result.json();}finally{clearTimeout(timer)}}
function inspectorSocket(wsUrl){
 const url=new URL(wsUrl);if(url.protocol!=='ws:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('FI0405_UNSAFE_CDP_WS');
 const socket=new WebSocket(url),pending=new Map();let next=0;
 socket.addEventListener('message',e=>{try{const msg=JSON.parse(e.data);if(msg.id&&pending.has(msg.id)){const row=pending.get(msg.id);pending.delete(msg.id);msg.error?row.reject(Error(msg.error.message)):row.resolve(msg.result);}}catch{}});
 socket.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('FI0405_CDP_CLOSED'));pending.clear()});
 const ready=new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',()=>no(Error('FI0405_CDP_UNAVAILABLE')),{once:true});});
 const call=async(method,params={})=>{await ready;const id=++next;
  return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(Error('FI0405_CDP_TIMEOUT'))},6000);
   pending.set(id,{resolve:x=>{clearTimeout(timeout);resolve(x)},reject:x=>{clearTimeout(timeout);reject(x)}});socket.send(JSON.stringify({id,method,params}));});};
 return {call,close:()=>socket.close()};
}
const inPage=expression=>({expression,returnByValue:true,awaitPromise:false});
export async function browserProbe({endpoint=DEFAULT_ENDPOINT,origin=DEFAULT_ORIGIN}={}){
 const ep=loopbackUrl(endpoint),app=loopbackUrl(origin),pages=await readJson(new URL('/json/list',ep));
 // Attach ONLY to exactly the selected local test origin; never inspect other tabs.
 const target=pages.find(x=>x.type==='page'&&x.url&&new URL(x.url).origin===app.origin&&x.webSocketDebuggerUrl);
 if(!target)throw Error('FI0405_TEST_TAB_NOT_FOUND');
 const c=inspectorSocket(target.webSocketDebuggerUrl);
 try{
  await c.call('Runtime.enable');
  const evalJs=async js=>{
   const r=await c.call('Runtime.evaluate',inPage(js));if(r.exceptionDetails)throw Error('FI0405_PAGE_EVALUATION');return r.result?.value;
  };
  const info=await evalJs(`(()=>{const t=document.querySelector('.timeline-r302');const s=t?.querySelector('.timeline-r302-scroll');const clips=t?.querySelectorAll('.timeline-r302-clip').length??0;
   const match=t?.querySelector('.timeline-r302-info')?.innerText?.match(/(\\d+) scenes/);
   return {timelineVisible:!!(t&&s&&t.querySelector('[aria-label="Zoom timeline"]')),sceneCount:Number(match?.[1]||0),domClips:clips,
    virtualized:!!match&&Number(match[1])>=500&&clips<500,zoomControl:!!t?.querySelector('[aria-label="Zoom timeline"]'),
    undoRedoControls:!!t?.querySelector('button[title*="Ctrl+Z"]')&&!!t?.querySelector('button[title*="Ctrl+Y"]'),
    waveformElement:!!t?.querySelector('.timeline-r302-trackrow .lane-voice')};})()`);
  if(!info?.timelineVisible)throw Error('FI0405_TIMELINE_NOT_OPEN_OR_UNAUTHENTICATED');
  const platform=await evalJs('navigator.platform');
  const browserUa=await evalJs('navigator.userAgent');
  // Probe keyboard only: no scene edit, upload, provider or server-write action.
  await evalJs(`document.querySelector('.timeline-r302-scroll').focus();true`);
  await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36,nativeVirtualKeyCode:36});
  await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36,nativeVirtualKeyCode:36});
  await new Promise(r=>setTimeout(r,250));
  const before=await evalJs(`(()=>{const e=document.querySelector('.timeline-r302-playhead');return e?Number.parseFloat(e.style.left):-1})()`);
  await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35,nativeVirtualKeyCode:35});
  await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35,nativeVirtualKeyCode:35});
  await new Promise(r=>setTimeout(r,250));
  const end=await evalJs(`(()=>{const e=document.querySelector('.timeline-r302-playhead');return e?Number.parseFloat(e.style.left):-1})()`);
  await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36,nativeVirtualKeyCode:36});
  await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36,nativeVirtualKeyCode:36});
  await new Promise(r=>setTimeout(r,250));
  const home=await evalJs(`(()=>{const e=document.querySelector('.timeline-r302-playhead');return e?Number.parseFloat(e.style.left):-1})()`);
  return {...info,browser:/Chrome|Edg\//.test(browserUa)?'chrome-or-edge':'other',platform,
   keyboardSeek:end>before&&home===0};
 }finally{c.close()}
}
async function main(){
 const args=process.argv.slice(2),flag=args.find(x=>x==='--run'||x==='--inspect');
 if(!flag||args.filter(x=>x==='--run'||x==='--inspect').length!==1||args.some(x=>x!==flag&&!/^--(endpoint|origin|report)=/.test(x)))throw Error('FI0405_INVALID_ARGUMENTS');
 const keyvals={};for(const arg of args){if(arg===flag)continue;const [key,...value]=arg.slice(2).split('=');if(keyvals[key]!==undefined||!value.length)throw Error('FI0405_DUPLICATE_OR_EMPTY_ARG');keyvals[key]=value.join('=')}
 const result={schemaVersion:1,task:'FI-04-05',mode:flag.slice(2),platform:process.platform,timestamp:new Date().toISOString(),
  note:'Automated keyboard/DOM smoke is not Windows drag/trim human acceptance or a rendered video. Missing proof always BLOCKED.',status:'NOT_READY'};
 if(flag==='--run'){
  try{result.probe=await browserProbe({endpoint:keyvals.endpoint??DEFAULT_ENDPOINT,origin:keyvals.origin??DEFAULT_ORIGIN})}
  catch(e){result.blockedReason=e.message??'FI0405_BROWSER_PROBE_ERROR'}
 }else result.blockedReason='INSPECT_ONLY_NO_BROWSER_PROOF';
 Object.assign(result,classifyBrowserEvidence({os:process.platform,probe:result.probe}));
 if(keyvals.report){const path=safeReport(keyvals.report);await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(result,null,2)+'\n')}
 console.log(JSON.stringify(result,null,2));if(flag==='--run'&&result.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
