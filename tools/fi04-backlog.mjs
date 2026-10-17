/** FI-04: merge EP13 AI-video roadmap into the existing FI-02 functional backlog.
 * A task is never marked implemented merely because another component can
 * render still images, or because a prior Spike supports mock protocols.
 */
const ids=['SP-VID-01','R0-VID-01',...Array.from({length:6},(_,i)=>`R2-VID-0${i+1}`),...Array.from({length:3},(_,i)=>`R3-VID-0${i+1}`),...Array.from({length:3},(_,i)=>`R4-VID-0${i+1}`)];
const notes={
 'SP-VID-01':{status:'SPIKE_PROTOCOL_AND_IMPORT_TESTED__GPU_REAL_BLOCKED',evidence:['spikes/SP-VID-01/src/comfy-video.mjs','spikes/SP-VID-01/test/adapter.test.mjs','docs/TEST_REPORT_R0VID01.md'],remainingGate:['real Windows GPU ComfyUI/Wan inference, VRAM/RAM/time benchmark and model license review'],acceptance:'Mock ComfyUI protocol / actual playable imported FFmpeg fixture, NOT generative AI output'},
 'R0-VID-01':{status:'CODE_COMPLETE_TESTED_OFFLINE__PROVIDER_REAL_BLOCKED',evidence:['packages/core/src/video-capabilities.mjs','apps/api/test/video-capabilities-r0vid01.test.mjs','apps/web/src/VideoProviderCapabilities.jsx'],remainingGate:['live ComfyUI handshake, Windows browser, official provider capabilities and consent verification'],acceptance:'Capability metadata/preflight, v11 SQLite, API/UI; declared limits remain unverified'},
 'R2-VID-01':{status:'PARTIAL_MEDIA_POLICY__PER_SCENE_PERSISTENCE_UNVERIFIED',evidence:['apps/web/src/ChannelWorkspace.jsx','apps/web/src/SceneBuilderWorkspace.jsx','apps/web/src/SceneInspectorR301.jsx'],remainingGate:['persisted versioned per-scene I2V/T2V media policy, targeted impact/voice stability'],acceptance:'Media options visible; not a complete dedicated policy implementation'},
 'R2-VID-02':{status:'SPIKE_ADAPTER_MOCK_ONLY__PRODUCTION_INFERENCE_UNVERIFIED',evidence:['spikes/SP-VID-01/src/comfy-video.mjs'],remainingGate:['production worker adapter and actual Wan GPU I2V/T2V output, FFprobe and Windows QA'],acceptance:'SPIKE ComfyUI protocol is not a production AI-video generator'},
 'R2-VID-03':{status:'SPIKE_IMPORT_ONLY__PRODUCTION_ROUTES_UNVERIFIED',evidence:['spikes/SP-VID-01/src/service.mjs','spikes/SP-VID-01/src/media.mjs'],remainingGate:['authenticated production clip import, revisions/provenance UI and destructive-path tests'],acceptance:'Working Spike import checks real MP4 bytes, but lacks production scene contract'},
 'R2-VID-04':{status:'SPIKE_QUEUE_BRIDGE_ONLY__FULL_REGEN_UNVERIFIED',evidence:['spikes/SP-VID-01/src/service.mjs'],remainingGate:['production clip batch DAG, bounded GPU mutex, idempotency and crash recovery'],acceptance:'Spike reuses SP-04; complete production clip queue not confirmed'},
 'R2-VID-05':{status:'NOT_VERIFIED_IN_PRODUCTION',evidence:[],remainingGate:['scene clip preview, compare, activate revision and still-image fallback E2E'],acceptance:'No verified production scene clip UI'},
 'R2-VID-06':{status:'PARTIAL_GENERIC_GUARDS_ONLY',evidence:['packages/core/src/video-capabilities.mjs','packages/core/src/paid-policy.mjs'],remainingGate:['video-specific VRAM/time cost estimator, preflight consent + execution blocking'],acceptance:'Generic paid guard and capability preflight do not verify clip costs'},
 'R3-VID-01':{status:'PARTIAL_TIMELINE_NO_REAL_CLIP_PREVIEW',evidence:['apps/web/src/TimelineEditorR302.jsx','packages/core/src/render-ffmpeg-r2ext04.mjs'],remainingGate:['actual clip filmstrip seeking and mute/hold/loop fitting voice in browser'],acceptance:'Four-track timeline exists; real AI/imported clip preview not proven'},
 'R3-VID-02':{status:'PARTIAL_RENDER_SUPPORT__HYBRID_E2E_UNVERIFIED',evidence:['packages/core/src/render-ffmpeg-r2ext04.mjs'],remainingGate:['normalization of real imported/AI MP4/MOV, scene segment cache and mixed-video FFprobe QA'],acceptance:'Partial video-frame support is not complete hybrid normalize/render'},
 'R3-VID-03':{status:'BLOCKED_REAL_AI_VIDEO_AND_WINDOWS',evidence:[],remainingGate:['real 35 min mixed timeline, at least one authentic AI clip, crash/restart and no unauthorized paid request'],acceptance:'No E2E video with genuine generative clip'},
 'R4-VID-01':{status:'NOT_VERIFIED_OPTIONAL_PAID_OFF',evidence:[],remainingGate:['official Seedance adapter only with explicit user approval, pricing and security review'],acceptance:'Optional paid provider; not MVP release prerequisite'},
 'R4-VID-02':{status:'NOT_VERIFIED_OPTIONAL_PAID_OFF',evidence:[],remainingGate:['official Gemini Veo adapter only with explicit user approval, pricing and security review'],acceptance:'Optional paid provider; Flow website remains import-only'},
 'R4-VID-03':{status:'NOT_VERIFIED_OPTIONAL_LOCAL',evidence:[],remainingGate:['real alternative checkpoint license and performance benchmark'],acceptance:'Not essential for no-cost MVP'}
};
export const expectedVideoIds=Object.freeze([...ids]);
export function parseVideoRoadmap(markdown){
 const sections=[...markdown.matchAll(/^####\s+(SP-VID-01|R0-VID-01|R[234]-VID-0[1-6])\s+—\s+(.+)$/gm)];
 const entries=new Map();
 for(const match of sections){
  const id=match[1];if(!ids.includes(id)||entries.has(id))throw new Error(`FI04_UNEXPECTED_VIDEO_ID: ${id}`);
  const end=markdown.indexOf('\n#### ',match.index+match[0].length);
  const body=markdown.slice(match.index+match[0].length,end<0?undefined:end);
  const priority=/·\s+(P[012])\s+·/.exec(match[2])?.[1];
  const depends=/Phụ thuộc:\*\*\s+([^\n]+?)\.?\s*$/m.exec(body)?.[1]??'';
  const dependsOn=depends==='Không'?[]:depends.split(',').map(x=>x.trim().replace(/\.$/,'')).filter(x=>/^[A-Z][A-Z0-9-]*\d$/.test(x));
  if(!priority)throw new Error(`FI04_PRIORITY_MISSING: ${id}`);
  const title=match[2].split(' · ')[0].trim();
  entries.set(id,{id,title,priority,dependsOn,source:'roadmap-v3-2026-10-13',...notes[id],verifiedTests:notes[id].evidence.length?['prior focused/offline reference only; NOT new FI04 live acceptance']:[]});
 }
 if(entries.size!==ids.length||ids.some(x=>!entries.has(x)))throw new Error('FI04_VIDEO_ROADMAP_INCOMPLETE');
 return ids.map(x=>entries.get(x));
}
export function mergeBacklog(base,videoTasks,{fi04Status='FI0410_HOSTED_WINDOWS_PARTIAL_ACCEPTANCE__PRODUCTION_NOT_READY'}={}){
 if(!Array.isArray(base.tasks)||videoTasks.length!==ids.length)throw new Error('FI04_BAD_INPUT');
 const seen=new Set();
 for(const task of [...base.tasks,...videoTasks]){
  if(!task?.id||seen.has(task.id))throw new Error(`FI04_DUPLICATE_TASK: ${task?.id}`);
  seen.add(task.id);
 }
 if(ids.some(id=>!seen.has(id)))throw new Error('FI04_VIDEO_TASK_MISSING');
 const newTasks=[
  {id:'FI-04-01',title:'Bounded, reproducible offline suite and hang diagnostics',priority:'P0',status:'CODE_COMPLETE_TESTED_OFFLINE__WINDOWS_SOAK_PENDING',dependsOn:['FI-03'],remainingGate:['multiple-run Windows test soak and actual root-cause proof for historical intermittent hang']},
  {id:'FI-04-02',title:'Reproducible dependencies and verified pinned lock',priority:'P0',status:'HOSTED_WINDOWS_NPM_LOCK_AND_HYPERFRAMES_PIN_VERIFIED__WIN11_PENDING',dependsOn:['FI-03'],remainingGate:['Repeat exact locked installation on user Windows 11; audited dependency and release approval separate']},
  {id:'FI-04-03',title:'Actual Vite production build and live Fastify HTTP',priority:'P0',status:'HOSTED_WINDOWS_VITE_BUILD_FASTIFY_HTTP_PASS__WIN11_PENDING',dependsOn:['FI-04-02'],remainingGate:['Authenticated interactive browser and target Windows 11 operator acceptance remain separate']},
  {id:'FI-04-04',title:'Real pinned HyperFrames five-scene queued render with multi-cue Vietnamese subtitles and background music',priority:'P0',status:'HOSTED_WINDOWS_REAL_HYPERFRAMES_MP4_AUTOMATION_PASS__MANUAL_AV_REVIEW_PENDING',dependsOn:['FI-04-02','FI-04-03'],remainingGate:['Manually inspect saved 5-scene review MP4 for Vietnamese subtitle glyph legibility and audible music','Repeat on target Windows 11; real 35+ minute video is separately FI-04-06']},
  {id:'FI-04-05',title:'Windows timeline usability, keyboard, visual trim and single-audio acceptance',priority:'P0',status:'CODE_UX_HARDENED__OFFLINE_TESTED__WINDOWS_BROWSER_BLOCKED',dependsOn:['FI-04-03','R3-02','R3-03','R3-04','R3-05','R3-06','R3-07'],remainingGate:['reviewed npm lock and actual Vite/Fastify build','paired authenticated video timeline in Chrome/Edge Windows','manually verify drag reorder, undo/redo, trim save/cancel, waveform voice timing, zoom and 500-scene viewport','strict Windows browser evidence in FI0405 gate']},
  {id:'FI-04-06',title:'Actual Windows HyperFrames 35–40-minute queued Full HD video, captions and music',priority:'P0',status:'REAL_PROJECT_ACCEPTANCE_CODE_COMPLETE__WINDOWS_RENDER_BLOCKED',dependsOn:['FI-04-04','FI-04-05'],remainingGate:['approved lock + Windows HyperFrames real CLI','real project published Composition v2 >=2100s 1080p, explicit music+subtitle selection','actual queued encode measured and QA','manual caption/voice/music appearance & audibility','reviewed renderer/GPU peak-memory metrics']},
  {id:'FI-04-07',title:'OS crash and durable queue recovery during genuine long HyperFrames render',priority:'P0',status:'PROCESS_KILL_SQLITE_LEASE_SIMULATION_PASS__REAL_WINDOWS_LONG_RECOVERY_BLOCKED',dependsOn:['FI-04-06','R3-13'],remainingGate:['real Windows long-job OS kill and application restart','verify durable lease recovery, no partial output published, video checksum and final MP4 QA']},
  {id:'FI-04-08',title:'Real native local LLM/TTS/ComfyUI provider E2E with consent and cost guard',priority:'P0',status:'LOCAL_HANDSHAKE_GATES_CODE_COMPLETE__INFERENCE_BLOCKED',dependsOn:['FI-04-02','R2-04','R2-05'],remainingGate:['local configured native inference and authentic media files','user-approved provider calls with quota/cost/429 logs and zero unauthorized paid requests','Windows TTS/Vietnamese audio and GPU ComfyUI measured tests']},
  {id:'FI-04-09',title:'Production security, dependencies and performance acceptance',priority:'P0',status:'SECURITY_REGRESSION_AUDIT_HARNESS_COMPLETE__PRODUCTION_REVIEW_BLOCKED',dependsOn:['FI-04-02','FI-04-06','FI-04-07'],remainingGate:['network-enabled npm audit with reviewed lock','Windows credentials and renderer child process audit','actual render CPU/RAM/GPU/VRAM/disk measurements and threat review']},
  {id:'FI-04-10',title:'Final reproducible release gate matrix and operator signoff',priority:'P0',status:'FAIL_CLOSED_RELEASE_INVENTORY_CODE_COMPLETE__NOT_READY',dependsOn:['FI-04-06','FI-04-07','FI-04-08','FI-04-09'],remainingGate:['all release gates fresh PASS with real Windows evidence','full completed green suite after changes','operator visual/audio signoff and explicit release decision']}
 ];
 // Updated only after genuine hosted Windows run 39024552073 passed. Code is
 // testable, but target Windows 11 user gestures/GPU/35min are NOT evidenced.
 const hostedEvidence='GitHub Actions Windows Server 2022 run 39024552073';
 const acceptedHosted={
  'FI-04-05':{
   status:'HOSTED_WINDOWS_TIMELINE_REGRESSIONS_PASS__AUTHENTICATED_UX_PENDING',
   remainingGate:['Paired authenticated Timeline on target Windows 11 Chrome/Edge, witnessed mouse drag/reorder, trim save/cancel, undo/redo, waveform and zoom','Real 120/500-scene browser performance and human A/V review'],
   verifiedTests:['npm run test:fi0405 (hosted Windows)',hostedEvidence+' live pairing React DOM only (not authenticated editor)']},
  'FI-04-06':{
   status:'LONG_RENDER_CODE_AND_CANONICAL_MEDIA_QA_HARDENED__REAL_35MIN_PENDING',
   remainingGate:['Real published 2100–2400-second 1080p Composition v2 on Windows 11 using pinned local HyperFrames','Witness H264/AAC/SRT/music/voice 35+ minute encode and GPU/CPU/RAM/disk resource measurements'],
   verifiedTests:['npm run test:fi0406-fi0410 (hosted Windows)','canonical media-path negative controls; NO 35min MP4 executed']},
  'FI-04-07':{
   status:'HOSTED_WINDOWS_SYNTHETIC_OS_KILL_SQLITE_FENCING_PASS__REAL_RECOVERY_PENDING',
   remainingGate:['Witness OS termination during genuine 35min HyperFrames encoding, restart and durable lease recovery','Verify no published partial output and full resulting MP4 checksum/codecs and audio'],
   verifiedTests:[hostedEvidence+' real child OS kill with synthetic handler, two attempts; not media recovery','post-recovery genuine MP4 assessor code and negatives']},
  'FI-04-08':{
   status:'READ_ONLY_LOCAL_PROVIDER_MEDIA_GATES_TESTED__LIVE_INFERENCE_PENDING',
   remainingGate:['Explicitly approved authentic local Vietnamese TTS, LLM, ComfyUI/Wan GPU inference and measured media QA','Test native quotas, HTTP429, cost guards; zero unauthorized paid/remote requests'],
   verifiedTests:['hosted read-only provider inventory (no local inference)','canonical local voice file SHA/path/audio probe unit controls']},
  'FI-04-09':{
   status:'HOSTED_WINDOWS_NPM_AUDIT_0_VULNS_SECURITY_REGRESSION_PASS__MANUAL_REVIEW_PENDING',
   remainingGate:['Windows production credential/process isolation and security threat assessment','Measured real long render child/GPU/VRAM peak RAM/CPU/disk and performance signoff'],
   verifiedTests:[hostedEvidence+' npm audit --audit-level=high, 0 vulnerabilities','hosted Windows focused security regression PASS']},
  'FI-04-10':{
   status:'HOSTED_WINDOWS_FAIL_CLOSED_RELEASE_MATRIX_PASS__NOT_READY',
   remainingGate:['FI-04-05 manual Windows 11 UX and FI-04-04 subtitle/music visual-audible signoff','FI-04-06/07 real Full HD 35min render and recovery','FI-04-08 native local inference and FI-04-09 human security/performance review','Full fresh green suite on release commit, explicit operator go/no-go approval'],
   verifiedTests:[hostedEvidence+' hosted partial matrix; releaseReady=false','npm run test:fi0406-fi0410 + tools/fi0405-fi0410-hosted.test.mjs']},
 };
 for(const t of newTasks)if(acceptedHosted[t.id])Object.assign(t,acceptedHosted[t.id]);
 for(const t of newTasks)if(seen.has(t.id))throw new Error(`FI04_DUPLICATE_TASK: ${t.id}`);
 const wiTasks=[{id:'WI-01',title:'Windows prerequisites triage with fail-closed actionable machine report',priority:'P0',status:'HOSTED_WINDOWS_PREFLIGHT_10_PASS_2_BLOCKED__MEDIA_PENDING',dependsOn:['FI-04-02','FI-04-03','FI-04-04'],remainingGate:['Run preflight on supported Windows 11 x64/arm64 host with reviewed lock, npm ci, Chrome/Edge, FFmpeg and exact local HyperFrames','Complete actual Vite/Fastify, HyperFrames MP4, browser, 35-min restart and provider/security gates separately'],verifiedTests:['npm run test:wi01'],acceptance:'Preflight report never approves browser/media/security/release. No dependencies installed or providers invoked.'}];
 wiTasks.push({id:'WI-02',title:'Reproducible Windows bootstrap, real loopback Fastify and Vite runtime verification',priority:'P0',status:'HOSTED_WINDOWS_FASTIFY_VITE_VERIFIED__USER_DESKTOP_PENDING',dependsOn:['WI-01','FI-04-02','FI-04-03'],remainingGate:['Use operator-reviewed package-lock then npm ci on supported Windows host', 'Actual npm run build:web and real 127.0.0.1 Fastify HTTP lifecycle smoke with auth/static/security checks', 'Production HyperFrames MP4, Chrome/Edge UI, 35-minute video and manual security gates remain separate'],verifiedTests:['npm run test:wi02'],acceptance:'Live verification uses real socket + disposable SQLite worker and graceful IPC shutdown. No auto install, cloud call, browser interaction or release assertion.'});
 wiTasks.push({"id":"WI-03","title":"Hosted Windows integration verification: reviewed deps, Vite, Fastify TCP, Edge/Chrome pairing DOM","priority":"P0","status":"HOSTED_WINDOWS_RUNTIME_VERIFIED__MEDIA_DESKTOP_PENDING","dependsOn":["WI-02","FI-04-03"],"remainingGate":["Install trusted FFmpeg/FFprobe; hosted Windows Chocolatey package feed returned HTTP 504","Run genuine HyperFrames queued MP4 with subtitles and music; no synthetic FFmpeg stand-in","Witness authenticated Timeline drag/trim on user Windows 11 (runner is Windows Server 2022)","Run long Full HD job/recovery/GPU inference and production security acceptance"],"verifiedTests":["GitHub Actions WI-03 hosted run 39014629188: runtime/browser/real socket PASS","Windows WI01/WI02 focused 19/19 PASS","WI03 acceptance classifier regression"],"acceptance":"Hosted Windows build + browser pairing-page React DOM + production Fastify live TCP and cleanup PASS; no authenticated Timeline, media render, paid AI calls, GPU or release approval."});
 for(const t of wiTasks)if(seen.has(t.id))throw new Error(`FI04_DUPLICATE_TASK: ${t.id}`);
 const tasks=[...base.tasks,...videoTasks,...newTasks,...wiTasks];
 const groups={existingFI02:base.tasks.length,aiVideo:videoTasks.length,fi04:newTasks.length,windowsAcceptance:wiTasks.length};
 return {version:'2026-10-17-fi0410-hosted-windows-acceptance-partial',status:fi04Status,releaseStatus:'NOT_READY',origin:{existing:'docs/VIDEO_AI_FLOW_EXTENSION_BACKLOG.json',video:'docs/reference/VIDEO_AI_FLOW_EXECUTION_PLAN_V3.md',baseline:'FI-03 workspace'},constraints:[...base.constraints],taskCount:tasks.length,groups,tasks,
  milestones:[{name:'MVP_no_paid',required:['WI-01','WI-02','WI-03','FI-04-01','FI-04-02','FI-04-03','FI-04-04','FI-04-05','FI-04-06','FI-04-07','FI-04-08','FI-04-09','FI-04-10','FI-02','R3-14'],note:'Requires HyperFrames actual render/35min, Windows UI, real provider and security gates'},
   {name:'AI_video_local',required:['SP-VID-01','R0-VID-01','R2-VID-01','R2-VID-02','R2-VID-03','R2-VID-04','R2-VID-05','R2-VID-06','R3-VID-01','R3-VID-02','R3-VID-03'],note:'Requires authentic local AI generated video; Spike-only mock is insufficient'}],
  statusEvidence:{fi03BaselineBeforeEdits:'859/859 PASS',fi03Focused:'6/6 PASS',fi03PostEditSuite:'INCOMPLETE historical',fi02ReleaseGateBaseline:'8 PASS / 12 BLOCKED / 0 FAIL',wi03WindowsHosted:'GitHub Actions run 39014629188: Windows Vite + Fastify real HTTP + Edge/Chrome React DOM PASS; FFmpeg/FFprobe BLOCKED in that historical run',fi0404WindowsHosted:'GitHub Actions run 39022682686: SHA256-pinned FFmpeg/FFprobe, real HyperFrames 0.8.159 SP-04 5-scene MP4 10 cues + music; ffprobe H264/AAC 429 frames PASS; manual AV/Windows11/35min pending',fi0405to10WindowsHosted:'GitHub Actions 39024552073 PASS: hosted Vite/Fastify/Edge pairing DOM, FI0405-10 tests, synthetic OS kill/SQLite fencing, npm audit 0 vulnerabilities, fail-closed release matrix; all actual Windows11/35min/native GPU and human gates BLOCKED',referenceOnly:true},
  note:'Do not claim code complete from mock protocols; retained FI02 task statuses are historical and must be freshly revalidated.'};
}
