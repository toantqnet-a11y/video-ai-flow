/**
 * R2-03: Scene narration is a user-initiated batch operation, not an automatic
 * consequence of editing text or switching channel defaults. Edge is online.
 * Only the server decides whether the stored voice matches the latest script.
 */
import React,{useEffect,useState} from 'react';
import {api,getSceneVoiceAudio} from './api.js';
import {selectiveBody,assertSourceUnchanged} from './selective-regeneration-view.mjs';
import {useStudio} from './store.js';

const choices=[['vi-VN-HoaiMyNeural','Hoài My (nữ)'],['vi-VN-NamMinhNeural','Nam Minh (nam)']];
const label=s=>({not_generated:'Chưa tạo',pending:'Đang chờ',running:'Đang tạo',paused:'Tạm dừng',
  succeeded:'Chờ xác nhận file',failed:'Lỗi — xem Jobs',cancelled:'Đã hủy',ready:'Sẵn sàng'}[s]??s);
const running=s=>['pending','running','succeeded'].includes(s);
export function SceneVoiceWorkspace({video}){
  const [scenes,setScenes]=useState([]),[statuses,setStatuses]=useState({});
  const [provider,setProvider]=useState('edge'),[voice,setVoice]=useState('vi-VN-HoaiMyNeural'),
    [localOptions,setLocalOptions]=useState([]),[fallbackProvider,setFallbackProvider]=useState(''),
    [speed,setSpeed]=useState(1),[consent,setConsent]=useState(false);
  const [page,setPage]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [audioUrl,setAudioUrl]=useState(null),[audioScene,setAudioScene]=useState(null);
  useEffect(()=>{setVoice(choices.some(x=>x[0]===video.effectivePreset?.voice?.voice)?video.effectivePreset.voice.voice:choices[0][0]);
    setSpeed(video.effectivePreset?.voice?.speed??1);setConsent(false);setFallbackProvider('');setProvider('edge');
  },[video.id,video.configRevision]);
  useEffect(()=>{let active=true;
    api('/tts/local-providers').then(x=>{if(active)setLocalOptions(x.items??[])}).catch(()=>{
      if(active)setLocalOptions([]);
    });return()=>{active=false};
  },[]);
  const configured=localOptions.filter(x=>x.configured);
  const primaryOptions=provider==='edge'?choices:configured.filter(x=>x.provider===provider).map(x=>[x.voice,`${x.provider} · ${x.voice}`]);
  const changeProvider=id=>{setProvider(id);setFallbackProvider('');
    setVoice(id==='edge'?(choices.some(x=>x[0]===video.effectivePreset?.voice?.voice)?video.effectivePreset.voice.voice:choices[0][0]):
      (configured.find(x=>x.provider===id)?.voice??''));};
  useEffect(()=>{let active=true;setStatuses({});setScenes([]);setPage(0);
    api(`/videos/${video.id}/scenes`).then(x=>{if(active)setScenes(x.items??[])}).catch(()=>{if(active)setError('Không tải được scene')});
    return()=>{active=false};
  },[video.id]);
  useEffect(()=>()=>{if(audioUrl)URL.revokeObjectURL(audioUrl)},[audioUrl]);
  const shown=scenes.slice(page*50,page*50+50);
  const current=shown.map(s=>statuses[s.id]).filter(Boolean);
  const pending=current.some(x=>running(x.state));
  useEffect(()=>{if(!shown.length)return;let active=true;
    const fetchStatuses=async()=>{
      const all=await Promise.allSettled(shown.map(s=>api(`/scenes/${s.id}/voice/status`)));
      if(!active)return;
      setStatuses(previous=>({...previous,...Object.fromEntries(all.flatMap((v,i)=>v.status==='fulfilled'?[[shown[i].id,v.value]]:[]))}));
    };
    void fetchStatuses();const timer=setInterval(()=>void fetchStatuses(),pending?2500:10000);
    return()=>{active=false;clearInterval(timer)};
  },[video.id,page,scenes.map(s=>s.id).join(','),pending]);
  const run=async(sceneIds)=>{
    if(provider==='edge'&&!consent){setError('Cần xác nhận trước mỗi đợt gọi Edge TTS trực tuyến.');return}
    setError('');setNotice('');setBusy(true);
    try{
      const opts={provider,voice,speed,remoteConsent:provider==='edge'&&consent,
        ...(provider==='edge'&&fallbackProvider?{fallbackProvider,fallbackVoice:configured.find(x=>x.provider===fallbackProvider)?.voice}:{})};
      const output=sceneIds.length===1
        ?await api(`/scenes/${sceneIds[0]}/voice/jobs`,{method:'POST',body:opts})
        :await api(`/videos/${video.id}/voice/jobs`,{method:'POST',body:{...opts,sceneIds}});
      setNotice(output.cached?'Đã sử dụng file voice hợp lệ có sẵn.':
        `Đã lên hàng đợi ${output.items?.length??1} scene; xem tiến độ ở tab Jobs.`);
      const results=await Promise.all(sceneIds.map(id=>api(`/scenes/${id}/voice/status`)));
      setStatuses(previous=>({...previous,...Object.fromEntries(results.map((v,i)=>[sceneIds[i],v]))}));
    }catch(e){setError(e.code??e.message)}finally{setBusy(false)}
  };
  const play=async id=>{
    setBusy(true);setError('');
    try{
      const blob=await getSceneVoiceAudio(id),url=URL.createObjectURL(blob);
      setAudioUrl(url);setAudioScene(id);
    }catch(e){setError(e.code??e.message)}finally{setBusy(false)}
  };
  return <section className="frame">
    <header className="frame-title"><div><h2>🎙️ Voice theo Scene</h2>
      <p>Chọn giọng và tốc độ, tạo audio hàng loạt. File đã tạo đúng phiên bản sẽ được tái sử dụng.</p></div></header>
    <div className="form-grid">
      <label>Dịch vụ giọng đọc<select value={provider} onChange={e=>changeProvider(e.target.value)}>
        <option value="edge">Edge · Trực tuyến</option>
        {configured.map(x=><option key={x.provider} value={x.provider}>{x.provider} · Máy tính local</option>)}
      </select></label>
      <label>Giọng tiếng Việt<select value={voice} onChange={e=>setVoice(e.target.value)}>{primaryOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label>Tốc độ ({speed.toFixed(2)}×)<input aria-label="Tốc độ giọng đọc" type="range" min="0.5" max="2" step="0.05" value={speed} onChange={e=>setSpeed(Number(e.target.value))}/></label>
    </div>
    {provider==='edge'&&<>
      <label className="info"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
        Tôi đồng ý gửi lời thoại của lần tạo này đến Edge TTS trực tuyến. Không tự bật API trả phí.</label>
      <label>Fallback local khi Edge lỗi (tùy chọn; KHÔNG tự động chuyển nếu bỏ trống)
        <select value={fallbackProvider} onChange={e=>setFallbackProvider(e.target.value)}>
          <option value="">Không fallback</option>
          {configured.map(x=><option key={x.provider} value={x.provider}>{x.provider} · {x.voice}</option>)}
        </select></label></>}
    <p className="muted">Piper/VieNeu chỉ được sử dụng khi operator cấu hình endpoint loopback; không có dịch vụ giả lập tự động. Thời lượng thực tế đo bằng FFprobe, không tự sửa timeline.</p>
    <div className="toolbar"><button className="btn" disabled={busy||(provider==='edge'&&!consent)||!shown.length} onClick={()=>run(shown.map(s=>s.id))}>Tạo / kiểm tra cache {shown.length} scene trên trang</button>
      <button className="btn secondary" disabled={busy} onClick={()=>useStudio.getState().setTab('jobs')}>Xem Jobs</button></div>
    {error&&<div className="error">{error}</div>}{notice&&<p className="info">{notice}</p>}
    <p>Trang {page+1}/{Math.max(1,Math.ceil(scenes.length/50))} · {scenes.length} scene
      {' '}<button className="btn secondary" disabled={page===0} onClick={()=>setPage(p=>p-1)}>←</button>
      <button className="btn secondary" disabled={(page+1)*50>=scenes.length} onClick={()=>setPage(p=>p+1)}>→</button></p>
    <div className="scene-list">{shown.map(s=>{
      const status=statuses[s.id];const generated=status?.durationMs;
      return <article key={s.id} className="scene-card"><div className="scene-card-head"><strong>Scene {s.index+1}</strong>
        <small>{label(status?.state??'not_generated')}{status?.stale?' · cần tạo lại':''}</small></div>
        <p>{s.text.length>280?s.text.slice(0,280)+'…':s.text}</p>
        <div className="toolbar"><span>Dự kiến {(s.durationMs/1000).toFixed(1)}s</span>
          {generated!==null&&generated!==undefined&&<strong>Thực tế {(generated/1000).toFixed(2)}s · {status?.voiceAsset?.provider}{status?.voiceAsset?.fallbackUsed?' (fallback)':''}</strong>}
          <button className="btn secondary" disabled={busy||(provider==='edge'&&!consent)} onClick={()=>run([s.id])}>🎙️ Tạo voice</button>
          <button className="btn secondary" disabled={busy||(provider==='edge'&&!consent)} onClick={async()=>{
            setBusy(true);setError('');setNotice('');try{
              const rows=await api(`/videos/${video.id}/scenes`);const scene=rows.items.find(x=>x.id===s.id);
              if(!scene)throw Error('SCENE_NOT_FOUND');
              assertSourceUnchanged(s,scene,'voice');
              await api(`/scenes/${s.id}/assets/regenerate`,{method:'POST',body:selectiveBody('voice',scene.rowVersion,
                {provider,voice,speed,remoteConsent:provider==='edge'&&consent,
                  ...(provider==='edge'&&fallbackProvider?{fallbackProvider,fallbackVoice:configured.find(x=>x.provider===fallbackProvider)?.voice}:{})},crypto.randomUUID())});
              setNotice(`Đã xếp tạo phiên bản voice MỚI cho scene ${s.index+1}.`);
              if(provider==='edge')setConsent(false); // Consent for this one remote request only.
            }catch(e){setError(e.code??e.message)}finally{setBusy(false)}
          }}>↻ Làm lại voice</button>
          <button className="btn secondary" disabled={busy||!status?.voiceAsset} onClick={()=>play(s.id)}>▶ Nghe</button></div>
        {audioScene===s.id&&audioUrl&&<audio controls autoPlay src={audioUrl} style={{width:'100%'}}/>}
      </article>
    })}</div>
  </section>;
}
