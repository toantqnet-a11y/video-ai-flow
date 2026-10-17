import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useStudio} from './store.js';
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
function Frame({title,subtitle,children,actions}){return <section className="frame"><header className="frame-title"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{actions}</header>{children}</section>}
function Pairing(){
  const connect=useStudio(s=>s.connect),loading=useStudio(s=>s.loading),error=useStudio(s=>s.error);
  const [code,setCode]=useState('');
  return <main className="pairing"><div className="brand-large">◈ Content<span>Studio</span></div><div className="pair-card"><div className="emoji">🔐</div><h1>Kết nối ContentStudio local</h1><p>Nhập mã ghép nối được hiển thị khi khởi chạy API trên máy. Mã chỉ dùng một lần, không lưu trong trình duyệt.</p><form onSubmit={e=>{e.preventDefault();connect(code.trim())}}><input autoFocus placeholder="Mã ghép nối từ terminal" value={code} onChange={e=>setCode(e.target.value)}/><Button disabled={loading||!code.trim()}>Kết nối</Button></form>{error&&<div className="error">{error}</div>}<small>Backend chỉ lắng nghe 127.0.0.1 · Free/local first · Không tự chuyển sang trả phí</small></div></main>;
}
function ContentEditor(){
  const video=useStudio(s=>s.currentVideo),[section,setSection]=useState('brief');
  useEffect(()=>setSection('brief'),[video?.id]);
  if(!video)return null;
  return <div><div className="content-brief-tabs"><button className={section==='brief'?'selected':''} onClick={()=>setSection('brief')}>① Brief & Cấu hình</button><button className={section==='outline'?'selected':''} onClick={()=>{if(useStudio.getState().contentBriefDirty&&!window.confirm('Có thay đổi chưa lưu. Tiếp tục?'))return;setSection('outline')}}>② Dàn ý chương</button><button className={section==='chapters'?'selected':''} onClick={()=>{if(useStudio.getState().contentBriefDirty&&!window.confirm('Hãy lưu dàn ý trước khi tạo nội dung. Tiếp tục?'))return;setSection('chapters')}}>③ Viết nội dung</button><button className={section==='evaluate'?'selected':''} onClick={()=>setSection('evaluate')}>④ AI Judge</button><button className={section==='script'?'selected':''} onClick={()=>{if(useStudio.getState().contentBriefDirty&&!window.confirm('Có thay đổi chưa lưu. Tiếp tục?'))return;setSection('script')}}>⑤ Bản chuẩn & Duyệt</button></div>
    {section==='brief'?<ContentBriefWorkspace video={video}/>:section==='outline'?<ContentOutlineWorkspace video={video} onBack={()=>setSection('brief')}/>:section==='chapters'?<ChapterGenerationWorkspace video={video} onBack={()=>setSection('outline')}/>:section==='evaluate'?<EvaluationWorkspace video={video} onBack={()=>setSection('chapters')}/>:<MasterScriptWorkspace video={video} onBack={()=>setSection('evaluate')} onApproved={()=>useStudio.getState().reloadVideo(video.id)} onCreateScenes={async(text)=>{await useStudio.getState().reloadVideo(video.id);const segments=text.split(/(?<=[.!?。])\s+|\n{2,}/).map(s=>s.trim()).filter(Boolean);await useStudio.getState().makeScenes(segments);}}/>}</div>;
}
function Scenes(){const video=useStudio(s=>s.currentVideo);const [pane,setPane]=useState('builder');
  useEffect(()=>setPane('builder'),[video?.id]);
  return video?<div><div className='content-brief-tabs'><button className={pane==='builder'?'selected':''} onClick={()=>setPane('builder')}>① Scene Builder</button><button className={pane==='voice'?'selected':''} onClick={()=>setPane('voice')}>② Voice TTS</button><button className={pane==='image'?'selected':''} onClick={()=>setPane('image')}>③ Hình ảnh</button><button className={pane==='assets'?'selected':''} onClick={()=>setPane('assets')}>④ Assets</button></div>{pane==='builder'?<SceneBuilderWorkspace video={video}/>:pane==='voice'?<SceneVoiceWorkspace video={video}/>:pane==='image'?<SceneImageWorkspace video={video}/>:<AssetLibraryWorkspace video={video}/>}</div>:null;}

function LegacyTimeline(){
  const scenes=useStudio(s=>s.scenes),video=useStudio(s=>s.currentVideo);
  const [order,setOrder]=useState([]),[selected,setSelected]=useState(null),[current,setCurrent]=useState(0),[zoom,setZoom]=useState(1),[saved,setSaved]=useState('');
  const [timelineVersion,setTimelineVersion]=useState(1);
  useEffect(()=>{setOrder(scenes.map(s=>s.id));setSelected(scenes[0]?.id||null);setCurrent(0);if(video)api(`/videos/${video.id}/timeline`).then(t=>setTimelineVersion(t.rowVersion)).catch(()=>{})},[video?.id,scenes]);
  const ordered=order.map(id=>scenes.find(s=>s.id===id)).filter(Boolean);
  const currentScene=ordered.find(s=>s.id===selected)??ordered[0];
  const total=ordered.reduce((sum,s)=>sum+s.durationMs,0);
  const items=ordered.map((s,i)=>({id:s.id,index:i,startMs:ordered.slice(0,i).reduce((a,x)=>a+x.durationMs,0),durationMs:s.durationMs}));
  const chooseAt=ms=>{let t=0;for(const s of ordered){if(ms<t+s.durationMs){setSelected(s.id);break}t+=s.durationMs}setCurrent(ms)};
  function reorder(from,to){if(from===to)return;setOrder(old=>{const next=[...old];next.splice(to,0,...next.splice(from,1));return next});setSaved('Chưa lưu')}
  async function save(){try{const clips=items.map(x=>({sceneId:x.id,startMs:x.startMs,durationMs:x.durationMs}));const result=await api(`/videos/${video.id}/timeline`,{method:'PUT',body:{rowVersion:timelineVersion,document:{tracks:['media','text','voice','music'],clips}}});setTimelineVersion(result.rowVersion);setSaved('Đã lưu')}catch(e){setSaved(e.message)}}
  return <Frame title="Timeline Editor" subtitle={`4 track · ${ordered.length} scene · ${(total/60000).toFixed(1)} phút. Preview scene, chưa phát media thực.`} actions={<div className="actions"><label>Zoom <input className="range" type="range" min="0.5" max="2.5" step="0.25" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label><Button onClick={save}>Lưu timeline</Button><span className="muted">{saved}</span></div>}>
    <div className="editor-shell"><div className="scene-nav"><h3>SCENES</h3>{ordered.slice(0,200).map((s,i)=><button className={s.id===currentScene?.id?'scene-nav-item active':'scene-nav-item'} key={s.id} onClick={()=>{setSelected(s.id);chooseAt(items[i].startMs)}}><span>{String(i+1).padStart(2,'0')}</span>{s.text.slice(0,32)}</button>)}{ordered.length>200&&<p>Hiển thị 200 scene đầu. Bản SP-05 có virtualization 500 scene.</p>}</div>
      <div className="preview-col"><div className="preview"><div className="mock-photo">▥</div><div className="subtitle">{currentScene?.text||'Chọn một scene để xem preview'}</div><div className="preview-note">PREVIEW DỮ LIỆU · Chưa render media</div></div><div className="transport"><button onClick={()=>chooseAt(Math.max(0,current-5000))}>⏮</button><button onClick={()=>chooseAt(Math.min(total,current+5000))}>▶ / +5s</button><strong>{new Date(current).toISOString().slice(14,23)} / {new Date(total).toISOString().slice(14,23)}</strong></div></div>
      <div className="properties"><h3>Scene inspector</h3><p>{currentScene?.text}</p><div className="info">Voice: {(video.effectivePreset??video.preset).voice.voice}</div><div className="info">Media: {currentScene?.mediaType}</div><div className="info">Thời lượng: {currentScene?.durationMs/1000}s</div><p className="muted">Tạo lại asset, trim nâng cao và playback thực triển khai ở R2/R3.</p></div></div>
    <div className="timeline-scroll"><div className="timeline-ruler" style={{width:Math.max(900,ordered.length*75*zoom)}}>{Array.from({length:Math.max(1,Math.ceil(total/60000))},(_,i)=><span key={i}>{String(i).padStart(2,'0')}:00</span>)}</div>
      {['🖼 Media','📝 Text','🎙 Voice','🎵 Music'].map((track,row)=><div className="track" key={track}><div className="track-label">{track}</div><div className="track-clips">{row===3?<div className="music-strip">Nhạc nền · chưa có file</div>:items.map((item,i)=><div key={item.id} className={`clip clip-${row} ${selected===item.id?'active':''}`} draggable={row===0} onDragStart={e=>e.dataTransfer.setData('text/plain',String(i))} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();reorder(Number(e.dataTransfer.getData('text/plain')),i)}} style={{width:Math.max(65,item.durationMs/1000*5*zoom)}} onClick={()=>{setSelected(item.id);setCurrent(item.startMs)}} title={`Scene ${i+1}`}><small>{row===0?`#${i+1}`:row===1?'Text':'Voice'}</small>{row===1?ordered[i].text.slice(0,15):row===2?'▂▅▃▆▂▃▆':'▥'}</div>)}</div></div>)}</div>
  </Frame>;
}

function Timeline(){return <TimelineRenderWorkspace/>;}

function Shell(){
  const tab=useStudio(s=>s.tab),setTab=useStudio(s=>s.setTab),channel=useStudio(s=>s.currentChannel),video=useStudio(s=>s.currentVideo);
  const tabs=[['channels','▦','Kênh'],['channel-settings','⚙','Cấu hình kênh'],['videos','▣','Video'],['content','✍','Nội dung'],['video-config','⚙','Cấu hình video'],['scenes','◫','Scenes'],['timeline','▤','Timeline'],['jobs','◉','Job Center'],['providers','✦','AI Models & Quota'],['system','⚙','Hệ thống']];
  // Persist step only after prerequisites are present; the backend validates
  // each transition and stores the final usable step for next session.
  useEffect(()=>{if(video&&['content','scenes','timeline','video-config'].includes(tab))
    useStudio.getState().saveCurrentStep(tab).catch(()=>{});},[video?.id,tab]);
  useEffect(()=>{const controller=new AbortController();streamJobs(e=>{if(e?.type)useStudio.getState().refreshJobs().catch(()=>{})},{signal:controller.signal}).catch(()=>{});return()=>controller.abort()},[]);
  return <div className="shell"><aside className="side"><div className="logo">◈ <b>Content<span>Studio</span></b></div><div className="side-caption">AI VIDEO FLOW</div>{tabs.map(([id,icon,label])=><button key={id} className={'nav '+(tab===id?'selected':'')} disabled={((id==='videos'||id==='channel-settings')&&!channel)||(['content','video-config','scenes','timeline'].includes(id)&&!video)} onClick={()=>{if(id!==tab&&useStudio.getState().contentBriefDirty&&!window.confirm('Brief chưa lưu. Rời màn hình có thể làm mất dữ liệu. Tiếp tục?'))return;setTab(id);}}><span>{icon}</span>{label}</button>)}<div className="side-footer">🟢 Local · Paid API OFF<br/><small>R0-04 · Diagnostics</small></div></aside>
    <main className="main"><div className="topbar"><div className="crumb">ContentStudio / {channel?.name||'Kênh'} {video&&`/ ${video.title}`}</div><span className="status-dot">● Local-first</span></div>
      {tab==='channels'&&<ChannelGrid/>}{tab==='channel-settings'&&channel&&<ChannelSettings/>}{tab==='videos'&&<VideoWorkspace/>}{tab==='content'&&<ContentEditor/>}{tab==='video-config'&&video&&<VideoConfigWorkspace/>}{tab==='scenes'&&<Scenes/>}{tab==='timeline'&&<Timeline/>}{tab==='jobs'&&<JobCenter/>}{tab==='providers'&&<ProviderWorkspace/>}{tab==='system'&&<DiagnosticsDashboard/>}
      <footer>Prototype tích hợp API thật · Chưa kết nối LLM/render · Không sử dụng AI trả phí tự động</footer>
    </main></div>;
}
function App(){const paired=useStudio(s=>s.paired);return paired?<Shell/>:<Pairing/>}

createRoot(document.getElementById('root')).render(<App/>);
