import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useStudio} from './store.js';
import {ProductionFlowGuide} from './ProductionFlowGuide.jsx';
import {flowTarget as targetTab,navigationWarning} from './production-flow.mjs';
import {api,streamJobs} from './api.js';
import {ChannelGrid,ChannelSettings} from './ChannelWorkspace.jsx';
import {DiagnosticsDashboard} from './DiagnosticsDashboard.jsx';
import {ProviderWorkspace} from './ProviderWorkspace.jsx';
import {VideoConfigWorkspace} from './VideoConfigWorkspace.jsx';
import {VideoWorkspace} from './VideoWorkspace.jsx';
import {JobCenter} from './JobCenter.jsx';
import {ContentBriefWorkspace} from './ContentBriefWorkspace.jsx';
import {ContentOutlineWorkspace} from './ContentOutlineWorkspace.jsx';
import {ChapterGenerationWorkspace} from './ChapterGenerationWorkspace.jsx';
import {EvaluationWorkspace} from './EvaluationWorkspace.jsx';
import {MasterScriptWorkspace} from './MasterScriptWorkspace.jsx';
import {SceneBuilderWorkspace} from './SceneBuilderWorkspace.jsx';
import {SceneVoiceWorkspace} from './SceneVoiceWorkspace.jsx';
import {SceneImageWorkspace} from './SceneImageWorkspace.jsx';
import {AssetLibraryWorkspace} from './AssetLibraryWorkspace.jsx';
import {TimelineRenderWorkspace} from './TimelineRenderWorkspace.jsx';
import './style.css';

function Button({children,onClick,secondary=false,disabled=false}){return <button className={secondary?'btn secondary':'btn'} onClick={onClick} disabled={disabled}>{children}</button>}
function Pairing(){
  const connect=useStudio(s=>s.connect),loading=useStudio(s=>s.loading),error=useStudio(s=>s.error);
  const [code,setCode]=useState('');
  return <main className="pairing"><div className="brand-large">◈ Content<span>Studio</span></div><div className="pair-card"><div className="emoji">🔐</div><h1>Kết nối ContentStudio local</h1><p>Nhập mã ghép nối được hiển thị khi khởi chạy API trên máy. Mã chỉ dùng một lần, không lưu trong trình duyệt. Nếu đã refresh trang và mất kết nối, nhập lệnh <code>pair</code> tại terminal đang chạy ứng dụng để tạo mã mới, không cần khởi động lại backend.</p><form onSubmit={e=>{e.preventDefault();connect(code.trim())}}><input autoFocus placeholder="Mã ghép nối từ terminal" value={code} onChange={e=>setCode(e.target.value)}/><Button disabled={loading||!code.trim()}>Kết nối</Button></form>{error&&<div className="error">{error}</div>}<small>Backend chỉ lắng nghe 127.0.0.1 · Free/local first · Không tự chuyển sang trả phí</small></div></main>;
}
function ContentEditor(){
  const video=useStudio(s=>s.currentVideo),[section,setSection]=useState('brief');
  useEffect(()=>setSection('brief'),[video?.id]);
  const changeSection=next=>{
    if(next===section)return;
    const dirty=useStudio.getState();
    if((dirty.contentBriefDirty||dirty.masterScriptDirty)&&
       !window.confirm('Nội dung có thay đổi chưa lưu. Tiếp tục?'))return;
    setSection(next);
  };
  if(!video)return null;
  return <div>
    <div className="content-brief-tabs">
      {[['brief','① Brief & Cấu hình'],['outline','② Dàn ý chương'],
        ['chapters','③ Viết nội dung'],['evaluate','④ AI Judge'],
        ['script','⑤ Bản chuẩn & Duyệt']].map(([id,label])=>
        <button key={id} className={section===id?'selected':''} onClick={()=>changeSection(id)}>{label}</button>)}
    </div>
    {section==='brief'?<ContentBriefWorkspace video={video}/>:
     section==='outline'?<ContentOutlineWorkspace video={video} onBack={()=>changeSection('brief')}/>:
     section==='chapters'?<ChapterGenerationWorkspace video={video} onBack={()=>changeSection('outline')}/>:
     section==='evaluate'?<EvaluationWorkspace video={video} onBack={()=>changeSection('chapters')}/>:
     <MasterScriptWorkspace video={video} onBack={()=>changeSection('evaluate')}
       onApproved={()=>useStudio.getState().reloadVideo(video.id)}
       onOpenSceneBuilder={async()=>{
         // Scene Builder derives a lossless proposal from the approved Master
         // revision. Do NOT use the deprecated direct /scenes PUT shortcut.
         await useStudio.getState().reloadVideo(video.id);
         useStudio.getState().setTab('scenes');
       }}/>}
  </div>;
}
function Scenes(){
  const video=useStudio(s=>s.currentVideo),[pane,setPane]=useState('builder');
  useEffect(()=>setPane('builder'),[video?.id]);
  const changePane=next=>{
    if(next===pane)return;
    if(pane==='builder'&&useStudio.getState().sceneBuilderDirty&&
       !window.confirm('Scene Builder có thay đổi chưa lưu. Tiếp tục?'))return;
    setPane(next);
  };
  return video?<div><div className="content-brief-tabs">
    {[['builder','① Scene Builder'],['voice','② Voice TTS'],['image','③ Hình ảnh'],
      ['assets','④ Assets']].map(([id,label])=><button key={id} className={pane===id?'selected':''}
      onClick={()=>changePane(id)}>{label}</button>)}
    </div>
    {pane==='builder'?<SceneBuilderWorkspace video={video} onNext={()=>changePane('voice')}/>:
     pane==='voice'?<SceneVoiceWorkspace video={video}/>:
     pane==='image'?<SceneImageWorkspace video={video}/>:
     <AssetLibraryWorkspace video={video}/>}
  </div>:null;
}

function Timeline(){return <TimelineRenderWorkspace/>;}

function Shell(){
  const tab=useStudio(s=>s.tab),channel=useStudio(s=>s.currentChannel),video=useStudio(s=>s.currentVideo),flowTarget=useStudio(s=>s.flowTarget);
  // One exit guard for sidebar and guided navigation. Renderer focus stays in
  // the same Timeline component and never bypasses dirty editor checks.
  const navigate=stage=>{const destination=targetTab(stage)??stage;
    const warning=navigationWarning(destination,tab,useStudio.getState());
    if(warning&&!window.confirm(warning))return;
    if(stage==='render')useStudio.setState(s=>({tab:'timeline',flowTarget:'render',renderFocusToken:s.renderFocusToken+1}));
    else useStudio.getState().setTab(destination);
  };
  const tabs=[['channels','▦','Kênh'],['channel-settings','⚙','Cấu hình kênh'],['videos','▣','Video'],['content','✍','Nội dung'],['video-config','⚙','Cấu hình video'],['scenes','◫','Scenes'],['timeline','▤','Timeline'],['jobs','◉','Job Center'],['providers','✦','AI Models & Quota'],['system','⚙','Hệ thống']];
  // Persist step only after prerequisites are present; the backend validates
  // each transition and stores the final usable step for next session.
  useEffect(()=>{if(video&&['content','scenes','timeline','video-config'].includes(tab))
    useStudio.getState().saveCurrentStep(tab).catch(()=>{});},[video?.id,tab]);
  useEffect(()=>{const controller=new AbortController();streamJobs(e=>{if(e?.type)useStudio.getState().refreshJobs().catch(()=>{})},{signal:controller.signal}).catch(()=>{});return()=>controller.abort()},[]);
  return <div className="shell"><aside className="side"><div className="logo">◈ <b>Content<span>Studio</span></b></div><div className="side-caption">AI VIDEO FLOW</div>{tabs.map(([id,icon,label])=><button key={id} className={'nav '+(tab===id?'selected':'')} disabled={((id==='videos'||id==='channel-settings')&&!channel)||(['content','video-config','scenes','timeline'].includes(id)&&!video)} onClick={()=>navigate(id)}><span>{icon}</span>{label}</button>)}<div className="side-footer">🟢 Localhost Web<br/><small>Chỉ gọi AI đã cấu hình · Paid API OFF mặc định</small></div></aside>
    <main className="main"><div className="topbar"><div className="crumb">ContentStudio / {channel?.name||'Kênh'} {video&&`/ ${video.title}`}</div><span className="status-dot">● Local-first</span></div>
      {video&&<ProductionFlowGuide video={video} tab={tab} flowTarget={flowTarget} onNavigate={navigate}/>}
      {tab==='channels'&&<ChannelGrid/>}{tab==='channel-settings'&&channel&&<ChannelSettings/>}{tab==='videos'&&<VideoWorkspace/>}{tab==='content'&&<ContentEditor/>}{tab==='video-config'&&video&&<VideoConfigWorkspace/>}{tab==='scenes'&&<Scenes/>}{tab==='timeline'&&<Timeline/>}{tab==='jobs'&&<JobCenter/>}{tab==='providers'&&<ProviderWorkspace/>}{tab==='system'&&<DiagnosticsDashboard/>}
      <footer>Web App localhost · AI/render theo cấu hình &amp; quyền cho phép · Không tự động sử dụng dịch vụ trả phí</footer>
    </main></div>;
}
function App(){const paired=useStudio(s=>s.paired);return paired?<Shell/>:<Pairing/>}

createRoot(document.getElementById('root')).render(<App/>);
