#!/usr/bin/env node
/**
 * Localhost web E2E: genuine Chromium DOM + real Fastify socket/SQLite + production Vite.
 * No mocked API, no Playwright dependency, no external AI or paid requests.
 * The pairing code is passed only to CDP Input.insertText and never logged.
 * This is NOT HyperFrames MP4, GPU inference, or human audiovisual acceptance.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {existsSync,accessSync,constants} from 'node:fs';
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
 // A hosted runner under media encode load may take >2.5s just to run
 // chrome --version. Check the executable path, then prove Chrome by CDP,
 // instead of falsely classifying a slow but installed browser as missing.
 const names=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean);
 const dirs=(process.env.PATH??'').split(':').filter(Boolean);
 for(const name of names){
  const paths=name.includes('/')?[name]:dirs.map(dir=>join(dir,name));
  for(const path of paths){
   try{accessSync(path,constants.X_OK);return path}catch{}
  }
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
   clearTimeout(task.timer);if(payload.error){
   // CDP method/code only: never log evaluated JavaScript or browser data.
   console.error('LOCALHOST_CDP_DIAGNOSTIC '+JSON.stringify({method:task.method,code:payload.error.code??null}));
   task.no(Error('E2E_CDP_CALL_'+task.method));
  }else task.ok(payload.result);return;}
  if(payload.method)for(const fn of listeners.get(payload.method)||[])fn(payload.params??{});
 });
 ws.addEventListener('close',()=>{for(const task of pending.values()){clearTimeout(task.timer);task.no(Error('E2E_CDP_CLOSED'));}pending.clear()});
 const call=async(method,params={})=>{
  await ready;const id=++nextId;
  return await new Promise((ok,no)=>{
   const timer=setTimeout(()=>{pending.delete(id);no(Error('E2E_CDP_TIMEOUT'))},12000);
   pending.set(id,{ok,no,timer,method});ws.send(JSON.stringify({id,method,params}));
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
 // Browser UI must follow the standard authenticated Blob-download branch,
 // not open a native picker in headless CI. Register once before the hard
 // refresh performed by the end-to-end scenario (no mid-download CDP eval).
 await cdp.call('Page.addScriptToEvaluateOnNewDocument',{
  source:"Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true})"
 });
 return {child,cdp};
}
async function runBrowser(cdp,code,repo,store,security,manifest,withRenderFixture=false,downloads=[]){
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
 let rejectedDialogs=0,acceptNextDialog=false;
 cdp.on('Page.javascriptDialogOpening',()=>{
  const accept=acceptNextDialog;acceptNextDialog=false;
  if(!accept)rejectedDialogs++;
  void cdp.call('Page.handleJavaScriptDialog',{accept}).catch(()=>{});
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
 mark('video_browser_sqlite');lastStage='NAV_CONTENT';
 assert(await until(()=>click('Nội dung','.production-flow-step'),'CONTENT_NAV_BUTTON'),'E2E_CONTENT_BUTTON_MISSING');
 await wait('.content-brief-tabs','CONTENT_TABS');lastStage='NAV_MASTER';
 assert(await until(()=>click('Bản chuẩn & Duyệt','.content-brief-tabs button'),'MASTER_NAV_BUTTON'),'E2E_MASTER_TAB_MISSING');
 await wait('.master-workspace','MASTER_UI');lastStage='MASTER_MANUAL';
 assert(await until(()=>click('Nhập kịch bản thủ công','.master-mode button'),'MASTER_MANUAL_BUTTON'),'E2E_MASTER_MANUAL_MISSING');
 lastStage='MASTER_TEXT';
 const sentence='Xin chào mọi người, đây là nội dung hướng dẫn để kiểm tra quy trình tạo video trên trình duyệt nội bộ. ';
 const script=sentence.repeat(14).trim();
 await type('textarea.master-text',script,'MASTER_TEXT');
 lastStage='MASTER_PREVIEW_SUBMIT';
 assert(await until(()=>click('Kiểm tra kịch bản','.master-workspace button'),'MASTER_PREVIEW_BUTTON'),'preview master');
 await until(()=>expectText('.master-workspace','Kịch bản nhập tay hợp lệ'),'MASTER_PREVIEW');
 lastStage='MASTER_SAVE';
 assert(await until(()=>click('Lưu phiên bản chưa duyệt','.master-workspace button'),'MASTER_SAVE_BUTTON'),'save master');
 await until(()=>expectText('.master-workspace','Đã lưu bản ứng viên'),'MASTER_SAVED');
 // A master approval is always explicit; warnings cannot be silently accepted.
 const ack=await ev(`(()=>{const el=document.querySelector('.master-ack input[type=checkbox]');
  if(!el)return false;el.click();return true})()`);
 assert(await until(()=>click('Duyệt Bản chuẩn','.master-workspace button'),'MASTER_APPROVE_BUTTON'),'approve master');
 await until(()=>expectText('.master-workspace','Đã chốt Bản chuẩn'),'MASTER_APPROVED');
 assert.equal(repo.getVideo(videoId).masterScript,script,'exact approved script must persist');
 mark('master_browser_approval');
 assert(await until(()=>click('Mở Scene Builder','.master-workspace button'),'OPEN_SCENE_BUILDER'),'E2E_BUILDER_BUTTON_MISSING');
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
 assert(await until(()=>click('Lưu Scene & Phiên bản','.scene-builder button'),'SCENE_SAVE_BUTTON'),'commit scenes');
 await until(()=>repo.listScenes(videoId).length>0,'SCENE_PERSIST');
 await until(()=>click('Tiếp: Tạo Voice','.scene-builder button'),'VOICE_BUTTON');
 await wait('.content-brief-tabs','VOICE_TABS');
 assert(await until(()=>ev(`document.querySelector('.content-brief-tabs button.selected')?.textContent.includes('Voice TTS')`),'VOICE_ACTIVE'),'must navigate to voice');
 mark('scene_revision_voice_navigation');
 assert(await until(()=>click('Timeline','.production-flow-step'),'TIMELINE_BUTTON'),'open Timeline');
 await until(()=>visible('.timeline-r302')||visible('.timeline-render-layout'),'TIMELINE_UI');
 assert(await click('Xuất MP4','.production-flow-step'),'focus renderer');
 await until(()=>visible('.render-drawer-r312'),'RENDER_DRAWER');
 await wait('select[aria-label="Lịch sử xuất MP4"]','RENDER_HISTORY_DROPDOWN');
 assert.equal(await ev(`document.querySelector('select[aria-label="Lịch sử xuất MP4"]')?.value`),'',
  'new video must not report a prior output');
 mark('render_history_no_fake_output');
 const isDisabled=await ev(`[...document.querySelectorAll('.render-drawer-r312 button')]
   .some(b=>b.textContent.includes('Render MP4 local')&&b.disabled)`);
 assert.equal(isDisabled,true,'no render on missing voice/media');
 assert.equal(store.countByStatus().total,0,'UI journey must not dispatch any AI/paid/render jobs');
 mark('timeline_real_drawer_fail_closed');
 // Hard reload intentionally clears the browser's memory-only credentials.
 // The host terminal (never an HTTP endpoint) explicitly rotates pairing.
 await cdp.call('Page.reload',{ignoreCache:true});
 await wait('.pairing form','REFRESH_PAIRING_UI');
 assert.equal(repo.listScenes(videoId).length,7,'refresh must not lose SQLite scenes');
 security.rearmFromLocalOperator();
 const newCode=security.pairingCodeForTerminal();
 assert.notEqual(newCode,code,'rotation must mint a different one-time code');
 await type('.pairing form input',newCode,'REPAIR_CODE');
 assert(await click('Kết nối','.pairing button'),'new one-time code accepted');
 await wait('.shell .side','REPAIR_SUCCESS');
 assert.equal(repo.listChannels().length,1);
 assert(await until(()=>click('Video','.channel-tile .tile-actions button'),'RESTORED_CHANNEL_LINK'),'open existing channel');
 await wait('.video-library-card','RESTORED_VIDEO_LIST');
 assert(await click('Tiếp tục','.video-library-card button'),'resume existing video');
 await wait('.production-flow','RESTORED_VIDEO_FLOW');
 assert.equal(repo.listScenes(videoId).length,7,'re-pair must not alter saved scenes');
 assert(await click('Timeline','.production-flow-step'),'open restored timeline');
 await wait('select[aria-label="Lịch sử xuất MP4"]','REPAIRED_RENDER_HISTORY');
 assert.equal(await ev(`document.querySelector('select[aria-label="Lịch sử xuất MP4"]')?.value`),'',
  're-pair must not invent a render job');
 mark('render_history_restored_without_new_job');
 assert.equal(store.countByStatus().total,0,'re-pair must not trigger render or AI');
 mark('browser_refresh_operator_repair_preserves_sqlite');
 // Optional real local fixture: drive HyperFrames via the authenticated
 // BROWSER button and SP-04 job. Committed PNG/WAV are test assets, not AI.
 let realRender=null;
 if(withRenderFixture){
  lastStage='RENDER_FIXTURE_SETUP';
  const sha=s=>createHash('sha256').update(s).digest('hex');
  // Use the *browser-created, explicitly approved Master + revisioned scenes*.
  // An unapproved synthetic video must never bypass the application's flow.
  const v=repo.getVideo(videoId),savedScenes=repo.listScenes(videoId);
  assert(savedScenes.length>0);
  for(let i=0;i<savedScenes.length;i++){
   const sc=savedScenes[i],seq=String(i%5+1).padStart(2,'0');
   const inputHash=sha('browser-fixture-voice-'+sc.id),jobTag='browser-fixture-'+sc.id;
   await manifest.importFile({sceneId:sc.id,kind:'voice',source:'mock-tts',
    inputPath:join(root,`spikes/EXT-03/assets/voice-${seq}.wav`),
    metadata:{queueJobId:jobTag,inputHash,textSha256:sha(sc.text),providerId:'piper'}});
   repo.db.prepare(`INSERT INTO scene_voice_intents
    (scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(sc.id,jobTag,inputHash,sha(sc.text),
     repo.getVideo(v.id).configRevision,'piper','fixture',0,Date.now());
   const image=await manifest.importFile({sceneId:sc.id,kind:'image',source:'manual_import',
    inputPath:join(root,`spikes/EXT-03/assets/background-${seq}.png`)});
   repo.db.prepare('INSERT INTO scene_image_manual_selections(scene_id,asset_id,selected_at) VALUES(?,?,?)')
    .run(sc.id,image.id,Date.now());
  }
  // The exact backend timed preview, not static UI text, is the oracle for
  // fixture readiness. Never bypass a blocker to turn an E2E red into green.
  const {TimedCompositionRepository,CompositionRepository}=await import('../packages/core/src/index.mjs');
  const timedFixture=new TimedCompositionRepository({compositions:new CompositionRepository({repo,manifest}),manifest});
  const fixturePreview=await timedFixture.preview(v.id,{tailPaddingMs:250});
  console.log('LOCALHOST_E2E_FIXTURE_READINESS '+JSON.stringify({
    ready:fixturePreview.readiness.ready,sceneCount:fixturePreview.scenes.length,
    blockerCodes:fixturePreview.readiness.blockers.map(x=>x.code).slice(0,15)}));
  assert.equal(fixturePreview.readiness.ready,true,'real browser fixture must be ready before approval');
  // The operator explicitly presses Refresh to re-evaluate current pins,
  // then Approve; importing test WAVs never auto-submits a render.
  assert(await until(()=>click('Cập nhật','.frame-title button'),'RENDER_MEDIA_REFRESH'),'refresh media readiness');
  await wait('.timeline-render-layout','RENDER_FIXTURE_TIMELINE');
  assert(await until(()=>click('Phê duyệt timing','.timeline-render-layout ~ .actions button'),'RENDER_TIMING_APPROVAL'), 'user approval');
  await until(()=>expectText('.timeline-render-layout','Timing Lock'),'RENDER_TIMELINE_LOADED');
  await until(()=>repo.db.prepare("SELECT revision FROM composition_revisions WHERE video_id=? ORDER BY revision DESC LIMIT 1").get(v.id)?.revision>=1,'RENDER_TIMING_COMMITTED');
  await until(()=>expectText('.frame','Đã phê duyệt Composition v2 #'),'RENDER_TIMING_UI_COMMITTED');
  mark('real_media_timing_approved_from_browser');
  // Diagnostic is limited to test-only booleans and known preflight codes.
  const uiReadiness=await ev(`(()=>{
    const root=document.querySelector('.render-drawer-r312');
    const btn=[...(root?.querySelectorAll('button')??[])].find(x=>x.textContent.includes('Render MP4 local'));
    const notices=[...(root?.querySelectorAll('[role=status],.warn')??[])].map(x=>x.textContent?.trim()??'');
    return {buttonFound:!!btn,buttonDisabled:btn?.disabled??null,
      statusCodes:notices.flatMap(x=>x.match(/[A-Z][A-Z0-9_]{4,}/g)??[]).slice(0,12),
      approved:document.body.textContent.includes('Đã phê duyệt Composition'),
      revisionVisible:root?.textContent?.includes('Nguồn xuất: Composition đã duyệt')??false,
      missingRevision:root?.textContent?.includes('Cần lưu thay đổi và phê duyệt Composition')??false,
      checking:root?.textContent?.includes('Đang kiểm tra tài nguyên')??false,
      ready:root?.textContent?.includes('Preflight đạt')??false,
      blocked:root?.textContent?.includes('Không thể render:')??false,
      timelineDirty:document.querySelector('.timeline-render-layout')?.textContent?.includes('chưa lưu')??false,
      styleSaves:[...document.querySelectorAll('button')].filter(x=>x.textContent?.includes('Lưu phiên bản style')).map(x=>x.disabled)};
  })()`);
  const allApprovalRows=repo.db.prepare("SELECT video_id,revision,digest FROM composition_revisions ORDER BY created_at DESC LIMIT 8").all();
  const approvedRows=allApprovalRows.filter(x=>x.video_id===v.id);
  const probe=await ev(`(()=>{
   const root=document.querySelector('.render-drawer-r312');
   const alert=document.querySelector('.timeline-render-layout')?.closest('section.frame')?.querySelector('div.info')?.textContent??'';
   const state=root?.querySelector('[role=status]')?.textContent??'';
   return {noticeApproved:alert.includes('Đã phê duyệt Composition'),
    noticeHasRevision:/Composition v2 #[1-9]/.test(alert),
    revisionInfo:root?.textContent?.includes('Nguồn xuất:')??false,
    isPending:state.includes('Đang kiểm tra'),isReady:state.includes('Preflight đạt'),
    isBlocked:state.includes('Không thể render:')};
  })()`);
  console.log('LOCALHOST_E2E_APPROVAL_DB '+JSON.stringify({
   count:approvedRows.length,allCount:allApprovalRows.length,foreignRows:allApprovalRows.length-approvedRows.length,
   latest:approvedRows[0]?.revision??0,
   schema:approvedRows.map(x=>x.revision),probe})); 
  console.log('LOCALHOST_E2E_RENDER_PREFLIGHT '+JSON.stringify(uiReadiness));
  assert(await until(()=>ev(`(()=>{
    const b=[...document.querySelectorAll('.render-drawer-r312 button')].find(x=>x.textContent.includes('Render MP4 local'));
    if(!b||b.disabled)return false;b.click();return true;
   })()`),'RENDER_BROWSER_SUBMIT',35000),'must explicitly click real Render button');
  mark('hyperframes_render_submitted_via_browser');
  const job=await until(()=>{
   const candidate=store.list({limit:20}).find(j=>j.kind==='render:hyperframes'&&j.payload?.projectId===v.id);
   return candidate??null;
  },'SP04_PERSISTED_RENDER_JOB');
  const succeeded=await until(()=>{
   const q=store.get(job.id);
   if(q?.status==='failed')throw Error('E2E_REAL_RENDER_FAILED');
   return q?.status==='succeeded'?q:null;
  },'HYPERFRAMES_MP4_COMPLETE',240000);
  assert.equal(succeeded.result?.engine,'hyperframes');
  assert.equal(succeeded.result?.qa?.passed,true);
  assert.equal(succeeded.result?.videoId,v.id);
  const bytes=await readFile(join(manifest.dataRoot,succeeded.result.relativePath));
  assert(bytes.length>1000);
  const digest=sha(bytes);
  assert.deepEqual(succeeded.result.segmentCache,{reused:0,encoded:savedScenes.length,total:savedScenes.length},
   'first real HyperFrames render must encode the new scene');
  mark('hyperframes_scene_cache_cold_miss');
  // A second EXPLICIT browser click with the SAME immutable composition proves
  // a genuine cache hit. It must not dispatch AI or re-encode the scene.
  assert(await until(()=>ev(`(()=>{
    const b=[...document.querySelectorAll('.render-drawer-r312 button')].find(x=>x.textContent.includes('Render MP4 local'));
    if(!b||b.disabled)return false;b.click();return true;
  })()`),'RENDER_CACHED_SUBMIT',30000));
  const reusedJob=await until(()=>store.list({limit:20})
    .find(j=>j.kind==='render:hyperframes'&&j.payload?.projectId===v.id&&j.id!==job.id),
   'SP04_SECOND_RENDER_JOB');
  const reusedDone=await until(()=>{
   const q=store.get(reusedJob.id);
   if(q?.status==='failed')throw Error('E2E_CACHE_RENDER_FAILED');
   return q?.status==='succeeded'?q:null;
  },'HYPERFRAMES_CACHE_HIT_COMPLETE',180000);
  assert.deepEqual(reusedDone.result?.segmentCache,{reused:savedScenes.length,encoded:0,total:savedScenes.length},
   'unchanged scene must be reused from verified HyperFrames segment cache');
  const cachedBytes=await readFile(join(manifest.dataRoot,reusedDone.result.relativePath));
  assert.equal(sha(cachedBytes),digest,'cached export must preserve exact output bytes');
  mark('hyperframes_scene_cache_warm_hit');
  const downloadJobId=reusedJob.id;
  const downloadAvailable=()=>ev(`[...document.querySelectorAll('.production-render-section button')].some(
   b=>b.textContent.includes('Lưu MP4')&&!b.disabled)`);
  // The browser should normally update via SSE/poll. The explicit history
  // refresh is a supported recovery path after a disconnected/repaired tab.
  // Record fallback; don't silently count a stale status as automatic success.
  const autoUpdated=await until(downloadAvailable,'RENDER_DOWNLOAD_AUTOSYNC',15000).catch(()=>false);
  if(!autoUpdated&&process.argv.includes('--require-auto-render-status'))
   throw Error('E2E_RENDER_STATUS_AUTO_REFRESH_MISSING');
  if(!autoUpdated){
   const state=await ev(`(()=>{
    const root=document.querySelector('.render-drawer-progress');
    return {hasProgress:!!root,showsCompleted:root?.textContent?.includes('Hoàn thành')??false,
      showsRunning:root?.textContent?.includes('Đang')??false,
      hasHistory:!!document.querySelector('select[aria-label="Lịch sử xuất MP4"]')};
   })()`);
   console.log('LOCALHOST_E2E_DOWNLOAD_SYNC '+JSON.stringify(state));
   assert(await until(()=>click('Cập nhật bản xuất','.production-render-section button'),'REFRESH_FINISHED_EXPORT',12000));
  }
  await until(downloadAvailable,'RENDER_DOWNLOAD_BUTTON',18000);
  mark(autoUpdated?'mp4_download_auto_status':'mp4_download_after_manual_history_refresh');
  // Fastify onResponse is authoritative for actual HTTP completion. CDP's
  // optional Network domain is unreliable on some hosted Chromium targets.
  // Never extract the session bearer or invent a successful downloaded file.
  // The picker override was registered before the browser's hard refresh.
  // Chromium can abort Runtime.evaluate at the instant an anchor starts a
  // browser download. Never treat a CDP acknowledgement as media proof:
  // success requires Fastify to observe the exact authenticated MP4 200.
  let clickAcknowledged=false;
  try{clickAcknowledged=await click('Lưu MP4','.production-render-section button')}
  catch(e){if(!e?.message?.startsWith('E2E_CDP_CALL_'))throw e;}
  const matchingDownload=()=>downloads.some(x=>
    x.path===`/api/videos/${v.id}/renders/${downloadJobId}/mp4`&&
    x.status===200&&x.mime.startsWith('video/mp4'));
  const httpVerified=await until(matchingDownload,'BROWSER_AUTHENTICATED_MP4_DOWNLOAD',30000);
  assert(httpVerified,'download must complete through real authorized Fastify route');
  if(!clickAcknowledged)console.log('LOCALHOST_E2E_DOWNLOAD_CDP_ACK_LOST_HTTP_200_CONFIRMED');
  assert.equal(store.countByStatus().total,2,'exactly two explicitly clicked local renders, zero AI/paid calls');
  realRender={status:'PASS',engine:'hyperframes',bytes:bytes.length,sha256:digest,
    outputQa:true,sceneCount:savedScenes.length,coldCache:{reused:0,encoded:savedScenes.length},warmCache:{reused:savedScenes.length,encoded:0},source:'LOCAL_TEST_PNG_WAV_ONLY',browserAuthenticatedMp4Http:200};
  mark('browser_hyperframes_real_mp4_download');
 }

 // QA-B04/B06: real authenticated Chrome interaction + authoritative SQLite.
 // Run after the render fixture so timeline edits cannot invalidate its approved composition.
 lastStage='QA_B04_B06_TIMELINE';
 assert(await until(()=>click('Timeline','.production-flow-step'),'QA_TIMELINE_NAV'),'open editor');
 await wait('.timeline-r302','QA_TIMELINE_EDITOR');
 const timelineOrder=()=>repo.getTimeline(videoId).document.sceneOrder??repo.listScenes(videoId).map(x=>x.id);
 const beforeOrder=timelineOrder();
 assert.equal(beforeOrder.length,7,'QA fixture must have seven persisted scenes');
 const selectedBefore=await ev(`document.querySelector('.timeline-r302-move select')?.value`);
 assert(selectedBefore,'scene selector exists');
 assert(await until(()=>click('Dời phải','.timeline-r302-move button'),'QA_MOVE_RIGHT'),'reorder via real browser');
 await until(()=>ev(`document.querySelector('.timeline-r302-info')?.textContent.includes('chưa lưu')`),'QA_REORDER_DIRTY');
 assert.deepEqual(timelineOrder(),beforeOrder,'unsaved draft must not modify SQLite');
 acceptNextDialog=true;
 assert(await click('Lưu thứ tự','.timeline-r302-actions button'),'save reordered scenes');
 await until(()=>timelineOrder()[0]===beforeOrder[1]&&timelineOrder()[1]===beforeOrder[0],'QA_ORDER_SAVED');
 const movedOrder=timelineOrder();
 mark('qa_b04_browser_reorder_sqlite');
 assert(await until(()=>click('Undo','.timeline-r302-actions button'),'QA_UNDO_CLICK'),'undo browser');
 await until(()=>timelineOrder().join('|')===beforeOrder.join('|'),'QA_UNDO_SQLITE');
 mark('qa_b04_browser_undo_sqlite');
 assert(await until(()=>click('Redo','.timeline-r302-actions button'),'QA_REDO_CLICK'),'redo browser');
 await until(()=>timelineOrder().join('|')===movedOrder.join('|'),'QA_REDO_SQLITE');
 mark('qa_b04_browser_redo_sqlite');
 // QA-B06: read the actual cursor, since reordering may retain seek position.
 const clock=()=>ev(`document.querySelector('.timeline-r302-side strong')?.textContent`);
 const parseClock=value=>{const m=/^(\\d+):(\\d+)\\.(\\d)$/.exec(value??'');
  assert(m,'QA_B06_CLOCK_FORMAT');return (+m[1]*60+(+m[2]))*1000+(+m[3])*100;};
 const beforeClock=String(await clock()).split(' / ');
 const initial=parseClock(beforeClock[0]),total=parseClock(beforeClock[1]);
 assert(total>0,'QA_B06_TOTAL');
 assert(await click('5s ⏭','.timeline-r302-playbar button'),'seek forward');
 const forward=Math.min(total,initial+5000);
 await until(async()=>Math.abs(parseClock(String(await clock()).split(' / ')[0])-forward)<150,'QA_SEEK_5S');
 assert.equal(await ev(`document.querySelector('.timeline-r302 audio')?.paused`),true,'seek must not start playback');
 mark('qa_b06_browser_seek_preview_clock');
 assert(await click('⏮ 5s','.timeline-r302-playbar button'),'seek back');
 await until(async()=>Math.abs(parseClock(String(await clock()).split(' / ')[0])-Math.max(0,forward-5000))<150,'QA_SEEK_BACK');
 assert(await ev(`Boolean(document.querySelector('.timeline-r302-view'))`),'preview stage present');
 mark('qa_b06_browser_seek_return_preview');

 // QA-B05: use the persisted voice pointer, not merely the existence of
 // an imported WAV revision. A full reload invalidates stale editor state.
 lastStage='QA_B05_FIXTURE';
 const first=repo.listScenes(videoId)[0];
 if(!withRenderFixture){
  const inputHash=createHash('sha256').update('qa-b05-'+first.id).digest('hex');
  const textHash=createHash('sha256').update(first.text).digest('hex');
  const jobId='qa-b05-'+first.id;
  await manifest.importFile({sceneId:first.id,kind:'voice',source:'mock-tts',
   inputPath:join(root,'spikes/EXT-03/assets/voice-01.wav'),
   metadata:{queueJobId:jobId,inputHash,textSha256:textHash,providerId:'piper'}});
  repo.db.prepare(`INSERT INTO scene_voice_intents
   (scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at)
   VALUES(?,?,?,?,?,?,?,?,?)`).run(first.id,jobId,inputHash,textHash,
    repo.getVideo(videoId).configRevision,'piper','fixture',0,Date.now());
 }
 assert(repo.listScenes(videoId).some(x=>x.voiceAssetId),'QA_B05_NO_SELECTED_VOICE');
 // Re-enter the editor using supported app navigation; hard reload drops
 // the in-memory pairing session and incorrectly tests authentication instead.
 lastStage='QA_B05_REOPEN';
 assert(await click('Xuất MP4','.production-flow-step'),'leave Timeline');
 await wait('.render-drawer-r312','QA_B05_RENDER_DRAWER');
 assert(await until(()=>click('Timeline','.production-flow-step'),'QA_B05_NAV'),'reopen Timeline');
 await wait('.timeline-r302','QA_B05_EDITOR');
 lastStage='QA_B05_VOICE_DOM';
 await until(()=>ev(`Boolean(document.querySelector('.timeline-r302-clip.lane-voice')?.textContent?.includes('Audio'))`),'QA_B05_VOICE_DOM');
 lastStage='QA_B05_WAVEFORM';
 await until(()=>ev(`(()=>{
  const p=document.querySelector('.timeline-r302-clip.lane-voice svg.timeline-r306-wave path');
  return !!p?.getAttribute('d')?.startsWith('M')&&p.getAttribute('d').length>20;
 })()`),'QA_B05_WAVEFORM',25000);
 mark('qa_b05_real_waveform_chrome');
 assert.equal(store.countByStatus().total,withRenderFixture?2:0,'waveform must not queue paid work');
 mark('qa_b05_no_paid_jobs');
 
 // Browser test must not be promoted to AI/GPU or long-form proof.
 return {status:'PASS',browser:findChrome(),steps,sceneCount:repo.listScenes(videoId).length,
  finalRender:realRender??'BLOCKED_NO_MEDIA',aiInference:'NOT_EXECUTED',release:'NOT_READY'};
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
  const downloads=[];
  // Only the authenticated localhost MP4 route's status + MIME are recorded,
  // never query values, credentials, raw media, or binary HTTP data.
  runtime.app.addHook('onResponse',async(request,reply)=>{
   const path=String(request.raw.url??'').split('?')[0];
   if(request.method==='GET'&&new RegExp('^/api/videos/[a-zA-Z0-9-]+/renders/[a-zA-Z0-9-]+/mp4$').test(path))
    downloads.push({path,status:reply.statusCode,mime:String(reply.getHeader('content-type')??'')});
  });
  await runtime.app.listen({host:'127.0.0.1',port:apiPort});
  const url='http://127.0.0.1:'+apiPort;
  const health=await fetch(url+'/health');assert.equal(health.status,200);
  assert.equal((await fetch(url+'/api/channels')).status,401);
  chrome=await browserConnect(apiPort,debugPort,join(dir,'chrome-profile'));
  const evidence=await runBrowser(chrome.cdp,runtime.security.pairingCodeForTerminal(),runtime.repo,runtime.store,runtime.security,runtime.manifest,process.argv.includes('--render-fixture'),downloads);
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
