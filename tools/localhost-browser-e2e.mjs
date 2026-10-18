#!/usr/bin/env node
/**
 * Localhost web E2E: genuine Chromium DOM + real Fastify socket/SQLite + production Vite.
 * No mocked API, no Playwright dependency, no external AI or paid requests.
 * The pairing code is passed only to CDP Input.insertText and never logged.
 * This is NOT HyperFrames MP4, GPU inference, or human audiovisual acceptance.
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
let lastStage='BOOT';
async function freePort(){
 const s=createServer();
 await new Promise((ok,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',ok)});
 const port=s.address().port;await new Promise(ok=>s.close(ok));return port;
}
async function until(check,label,ms=18000){
 const deadline=Date.now()+ms;let last=null;
 do{try{const value=await check();if(value)return value;}catch(e){last=e;}await pause(180)}while(Date.now()<deadline);
 throw Error('LOCALHOST_E2E_TIMEOUT_'+label+(last?.message?.startsWith('E2E_')?'_'+last.message:''));
}
function findChrome(){
 const list=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean);
 for(const cmd of list){
  const r=spawnSync(cmd,['--version'],{encoding:'utf8',timeout:2500,stdio:'ignore'});
  if(r.status===0)return cmd;
 }
 throw Error('LOCALHOST_E2E_BROWSER_MISSING');
}
function cdpConnect(url){
 const u=new URL(url);
 if(u.protocol!=='ws:'||u.hostname!=='127.0.0.1')throw Error('E2E_UNSAFE_CDP');
 const ws=new WebSocket(url),pending=new Map(),listeners=new Map();let nextId=0;
 const ready=new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',()=>no(Error('E2E_CDP_CONNECT')),{once:true})});
 ws.addEventListener('message',event=>{
  let payload;try{payload=JSON.parse(String(event.data));}catch{return;}
  if(payload.id&&pending.has(payload.id)){const task=pending.get(payload.id);pending.delete(payload.id);
   clearTimeout(task.timer);payload.error?task.no(Error('E2E_CDP_CALL')):task.ok(payload.result);return;}
  if(payload.method)for(const fn of listeners.get(payload.method)||[])fn(payload.params??{});
 });
 ws.addEventListener('close',()=>{for(const task of pending.values()){clearTimeout(task.timer);task.no(Error('E2E_CDP_CLOSED'));}pending.clear()});
 const call=async(method,params={})=>{
  await ready;const id=++nextId;
  return await new Promise((ok,no)=>{
   const timer=setTimeout(()=>{pending.delete(id);no(Error('E2E_CDP_TIMEOUT'))},12000);
   pending.set(id,{ok,no,timer});ws.send(JSON.stringify({id,method,params}));
  });
 };
 return {call,on(event,fn){listeners.set(event,[...(listeners.get(event)||[]),fn])},
  close(){ws.close()}};
}
async function browserConnect(port,debugPort,profile){
 const binary=findChrome();
 const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions',
  '--disable-background-networking','--no-first-run','--no-default-browser-check','--no-proxy-server',
  '--user-data-dir='+profile,'--remote-debugging-port='+debugPort,'--window-size=1400,1000',
  'http://127.0.0.1:'+port+'/'];
 const child=spawn(binary,args,{cwd:root,stdio:'ignore',env:{...process.env,
  CONTENTSTUDIO_REMOTE_LLM_CONSENT:'0'}});
 const page=await until(async()=>{
  if(child.exitCode!==null)throw Error('E2E_BROWSER_EXITED');
  try{const res=await fetch('http://127.0.0.1:'+debugPort+'/json/list',{signal:AbortSignal.timeout(850)});
   if(!res.ok)return null;const pages=await res.json();
   return pages.find(p=>p.type==='page'&&p.webSocketDebuggerUrl&&
     p.url.startsWith('http://127.0.0.1:'+port+'/'));}catch{return null}
 },'BROWSER_BOOT',18000);
 const wsUrl=new URL(page.webSocketDebuggerUrl);wsUrl.hostname='127.0.0.1';
 const cdp=cdpConnect(wsUrl.toString());await cdp.call('Runtime.enable');
 await cdp.call('Page.enable');
 return {child,cdp};
}
async function runBrowser(cdp,code,repo,store){
 const ev=async expr=>{
  const result=await cdp.call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error('E2E_PAGE_EVALUATION');
  return result.result?.value;
 };
 const visible=css=>ev(`Boolean(document.querySelector(${JSON.stringify(css)}))`);
 const wait=(css,label)=>until(()=>visible(css),label);
 const click=(text,selector='button')=>ev(`(()=>{
  const found=[...document.querySelectorAll(${JSON.stringify(selector)})].find(
   el=>!el.disabled&&el.textContent?.trim().includes(${JSON.stringify(text)}));
  if(!found)return false;found.click();return true;
 })()`);
 const focus=css=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(css)});
  if(!e)return false;e.focus();return document.activeElement===e;})()`);
 const type=async(css,text,label)=>{
  assert(await until(()=>focus(css),label+'_INPUT'),label+'_INPUT');
  await cdp.call('Input.insertText',{text});
  assert(await until(()=>ev(`document.querySelector(${JSON.stringify(css)})?.value===${JSON.stringify(text)}`),label+'_VALUE'),label+'_VALUE');
 };
 const submit=css=>ev(`(()=>{const f=document.querySelector(${JSON.stringify(css)});
  if(!f)return false;f.requestSubmit();return true;})()`);
 const expectText=(css,value)=>ev(`document.querySelector(${JSON.stringify(css)})?.textContent?.includes(${JSON.stringify(value)})===true`);
 const steps=[];const mark=label=>{steps.push(label);lastStage=label;console.log('LOCALHOST_E2E_STAGE '+label)};
 // Decline a real native window.confirm from the guided bar. This exercises
 // the browser navigation guard instead of trusting a pure helper-only test.
 let rejectedDialogs=0;
 cdp.on('Page.javascriptDialogOpening',()=>{
  rejectedDialogs++;
  void cdp.call('Page.handleJavaScriptDialog',{accept:false}).catch(()=>{});
 });
 await wait('.pairing form','PAIRING_UI');mark('react_pairing_ui');
 assert.equal(await click('Kết nối','.pairing button'),false,'empty code must disable pairing');
 await type('.pairing form input',code,'PAIR_CODE');
 assert(await click('Kết nối','.pairing button'),'pair submit');
 await wait('.shell .side','PAIR_SUCCESS');mark('authenticated_pairing');
 assert.equal(repo.listChannels().length,0,'isolated SQLite must start empty');
 assert(await click('Tạo kênh','.channel-workspace button'),'open channel modal');
 await wait('.modal form','CHANNEL_MODAL');
 await type('.modal form input','Local Flow CI Channel','CHANNEL_NAME');
 assert(await submit('.modal form'),'channel form submit');
 await until(()=>repo.listChannels().length===1,'CHANNEL_PERSIST');
 mark('channel_browser_sqlite');
 assert(await until(()=>click('Video','.side button.nav'),'VIDEO_TAB_ENABLED'),'open videos');
 await wait('.video-library','VIDEO_LIBRARY');
 assert(await click('Video mới','.video-library button'),'open video modal');
 await wait('.video-library-modal','VIDEO_MODAL');
 await type('.video-library-modal label input','Localhost smoke video','VIDEO_TITLE');
 assert(await submit('.video-library-modal'),'video submit');
 await wait('.production-flow','VIDEO_CREATED_FLOW');
 const channel=repo.listChannels()[0],videos=repo.listVideoPage(channel.id,{limit:20}).items;
 assert.equal(videos.length,1,'video must be persisted in real SQLite');
 const videoId=videos[0].id;
 mark('video_browser_sqlite');
 assert(await click('Nội dung','.production-flow-step'),'enter Content');
 await wait('.content-brief-tabs','CONTENT_TABS');
 assert(await click('Bản chuẩn & Duyệt','.content-brief-tabs button'),'open master');
 await wait('.master-workspace','MASTER_UI');
 assert(await click('Nhập kịch bản thủ công','.master-mode button'),'manual mode');
 const sentence='Xin chào mọi người, đây là nội dung hướng dẫn để kiểm tra quy trình tạo video trên trình duyệt nội bộ. ';
 const script=sentence.repeat(14).trim();
 await type('textarea.master-text',script,'MASTER_TEXT');
 assert(await click('Kiểm tra kịch bản','.master-workspace button'),'preview master');
 await until(()=>expectText('.master-workspace','Kịch bản nhập tay hợp lệ'),'MASTER_PREVIEW');
 assert(await click('Lưu phiên bản chưa duyệt','.master-workspace button'),'save master');
 await until(()=>expectText('.master-workspace','Đã lưu bản ứng viên'),'MASTER_SAVED');
 // A master approval is always explicit; warnings cannot be silently accepted.
 const ack=await ev(`(()=>{const el=document.querySelector('.master-ack input[type=checkbox]');
  if(!el)return false;el.click();return true})()`);
 assert(await click('Duyệt Bản chuẩn','.master-workspace button'),'approve master');
 await until(()=>expectText('.master-workspace','Đã chốt Bản chuẩn'),'MASTER_APPROVED');
 assert.equal(repo.getVideo(videoId).masterScript,script,'exact approved script must persist');
 mark('master_browser_approval');
 assert(await click('Mở Scene Builder','.master-workspace button'),'open canonical builder');
 await wait('.scene-builder','BUILDER_UI');
 await until(()=>ev(`document.querySelector('.scene-builder button')?.disabled===false`),'BUILDER_READY').catch(()=>{});
 assert(await until(()=>click('Tự động chia scene','.scene-builder button'),'BUILDER_PREVIEW_BUTTON'),'split');
 await wait('.scene-builder-item','BUILDER_PREVIEW');
 assert.equal(repo.listScenes(videoId).length,0,'preview must not save');
 const nextDisabled=await ev(`(()=>{const b=[...document.querySelectorAll('.scene-builder button')]
  .find(x=>x.textContent.includes('Tiếp: Tạo Voice'));return b?.disabled===true})()`);
 assert.equal(nextDisabled,true,'cannot skip unsaved split');
 assert(await click('Timeline','.production-flow-step'),'attempt to leave pending proposal');
 await until(()=>rejectedDialogs===1,'NATIVE_UNSAVED_CONFIRM');
 assert(await visible('.scene-builder'),'cancelling native dialog must keep Scene Builder visible');
 assert.equal(repo.listScenes(videoId).length,0,'cancelled navigation must not save scenes');
 mark('browser_unsaved_navigation_guard');
 mark('builder_preview_no_premature_write');
 assert(await click('Lưu Scene & Phiên bản','.scene-builder button'),'commit scenes');
 await until(()=>repo.listScenes(videoId).length>0,'SCENE_PERSIST');
 await until(()=>click('Tiếp: Tạo Voice','.scene-builder button'),'VOICE_BUTTON');
 await wait('.content-brief-tabs','VOICE_TABS');
 assert(await until(()=>ev(`document.querySelector('.content-brief-tabs button.selected')?.textContent.includes('Voice TTS')`),'VOICE_ACTIVE'),'must navigate to voice');
 mark('scene_revision_voice_navigation');
 assert(await click('Timeline','.production-flow-step'),'open Timeline');
 await until(()=>visible('.timeline-r302')||visible('.timeline-render-layout'),'TIMELINE_UI');
 assert(await click('Xuất MP4','.production-flow-step'),'focus renderer');
 await until(()=>visible('.render-drawer-r312'),'RENDER_DRAWER');
 const isDisabled=await ev(`[...document.querySelectorAll('.render-drawer-r312 button')]
   .some(b=>b.textContent.includes('Render MP4 local')&&b.disabled)`);
 assert.equal(isDisabled,true,'no render on missing voice/media');
 assert.equal(store.countByStatus().total,0,'UI journey must not dispatch any AI/paid/render jobs');
 mark('timeline_real_drawer_fail_closed');
 // Browser test must not be promoted to actual MP4 render or GPU proof.
 return {status:'PASS',browser:findChrome(),steps,sceneCount:repo.listScenes(videoId).length,
  finalRender:'BLOCKED_NO_MEDIA',aiInference:'NOT_EXECUTED',release:'NOT_READY'};
}
async function main(){
 assert(existsSync(join(root,'apps/web/dist/index.html')),'E2E_WEB_BUILD_REQUIRED');
 const dir=await mkdtemp(join(tmpdir(),'contentstudio-local-browser-'));
 const apiPort=await freePort(),debugPort=await freePort();
 process.env.CONTENTSTUDIO_DATA_DIR=join(dir,'data');
 process.env.CONTENTSTUDIO_PORT=String(apiPort);
 process.env.NODE_ENV='production';
 process.env.CONTENTSTUDIO_REMOTE_LLM_CONSENT='0';
 let runtime,chrome;
 try{
  const {startApi}=await import('../apps/api/src/server.mjs');
  runtime=await startApi({listen:false});
  await runtime.app.listen({host:'127.0.0.1',port:apiPort});
  const url='http://127.0.0.1:'+apiPort;
  const health=await fetch(url+'/health');assert.equal(health.status,200);
  assert.equal((await fetch(url+'/api/channels')).status,401);
  chrome=await browserConnect(apiPort,debugPort,join(dir,'chrome-profile'));
  const evidence=await runBrowser(chrome.cdp,runtime.security.pairingCodeForTerminal(),runtime.repo,runtime.store);
  console.log('LOCALHOST_BROWSER_E2E '+JSON.stringify(evidence));
 }catch(e){
  // Do not print URLs, DOM, SQLite data or pairing code on errors.
  console.error('LOCALHOST_BROWSER_E2E_FAILED '+lastStage+' '+(/^[A-Z0-9_]{3,120}$/.test(e?.message??'')?e.message:'E2E_ASSERTION_OR_INTEGRATION_FAILED'));
  process.exitCode=1;
 }finally{
  chrome?.cdp?.close();
  if(chrome?.child&&chrome.child.exitCode===null){
   chrome.child.kill('SIGTERM');await Promise.race([new Promise(ok=>chrome.child.once('exit',ok)),pause(2500)]);
   if(chrome.child.exitCode===null)chrome.child.kill('SIGKILL');
  }
  await runtime?.app?.close().catch(()=>{process.exitCode=1});
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:150}).catch(()=>{process.exitCode=1});
 }
}
await main();
