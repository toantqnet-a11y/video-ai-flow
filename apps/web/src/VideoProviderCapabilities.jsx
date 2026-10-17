/**
 * R0-VID-01: Declare limits and preview feasibility of AI video models.
 * Crucial UX boundary: a green configuration result never claims that ComfyUI
 * produced real AI video, that Google Flow offers a public free API, or that
 * permission was granted for any paid/remote call.
 */
import React,{useCallback,useEffect,useState} from 'react';
import {api} from './api.js';

const defaults={modes:['text_to_video','image_to_video'],maxDurationSec:6,maxWidth:1280,maxHeight:720,maxFps:24,minVramGb:null,requiresGpu:true};
const labels={text_to_video:'Text → Video',image_to_video:'Image → Video',
  MODEL_DISABLED:'Model/tài khoản đã tắt',CAPABILITIES_NOT_CONFIGURED:'Chưa khai báo khả năng',
  MODE_NOT_SUPPORTED:'Không hỗ trợ kiểu tạo clip',DURATION_EXCEEDED:'Vượt thời lượng clip',
  RESOLUTION_EXCEEDED:'Vượt kích thước video',FPS_EXCEEDED:'Vượt FPS cho phép',
  QUOTA_EXHAUSTED:'Quota đã hết (theo nguồn hiện tại)',REMOTE_CONSENT_REQUIRED:'Chưa đồng ý gửi dữ liệu ra ngoài',
  PAID_APPROVAL_REQUIRED:'Cần phê duyệt chi phí ở bước thực thi',FREE_TIER_NOT_VERIFIED:'Chưa xác minh miễn phí API',
  GPU_NOT_VERIFIED:'Chưa kiểm tra GPU thật',QUOTA_UNVERIFIED:'Quota chưa được provider xác nhận',
  INFERENCE_NOT_VERIFIED:'Chưa kiểm thử sinh clip bằng model thật'};
const help=c=>labels[c]??c;

export function VideoProviderCapabilities(){
  const [items,setItems]=useState([]),[selected,setSelected]=useState('');
  const [draft,setDraft]=useState(defaults),[test,setTest]=useState({mode:'text_to_video',durationSec:6,width:1280,height:720,fps:24,allowRemote:false,fallbackImageMotion:true});
  const [result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    const data=await api('/video-providers/capabilities');
    setItems(data.items??[]);
    setSelected(old=>old&&data.items.some(x=>x.id===old)?old:(data.items[0]?.id??''));
  },[]);
  useEffect(()=>{refresh().catch(e=>setError(e.code??e.message))},[refresh]);
  const item=items.find(x=>x.id===selected),cap=item?.capability;
  useEffect(()=>{setDraft(cap?.capabilities??defaults);setResult(null)},[selected,cap?.revision]);
  function num(key,event){setDraft(old=>({...old,[key]:event.target.value===''?0:Number(event.target.value)}))}
  async function act(fn){setBusy(true);setError('');try{await fn()}catch(e){setError(e.code??e.message??'REQUEST_FAILED')}finally{setBusy(false)}}
  const radio=(mode)=><label key={mode} className="video-cap-check"><input type="checkbox" checked={draft.modes.includes(mode)} onChange={e=>setDraft(x=>({...x,modes:e.target.checked?[...x.modes,mode]:x.modes.filter(t=>t!==mode)}))}/>{labels[mode]}</label>;
  return <section className="provider-box video-cap-workspace" aria-label="Năng lực AI Video">
    <h3>🎬 AI Video – Khả năng model & kiểm tra trước khi tạo</h3>
    <p className="muted">Wan, ComfyUI, LTX, CogVideo và các API khác chỉ được sử dụng khi đã cấu hình adapter. Giới hạn dưới đây do người dùng khai báo, <b>chưa xác minh thực tế</b>. Google Flow trên web không được coi là API miễn phí.</p>
    {error&&<p role="alert" className="warn">{error}</p>}
    {!items.length?<p>Chưa có AI Video model. Hãy thêm tài khoản ComfyUI hoặc provider Video tại phần “Model & hạn mức” phía trên.</p>:<>
      <label>Model Video<select aria-label="Chọn AI video model" value={selected} onChange={e=>setSelected(e.target.value)}>
        {items.map(m=><option key={m.id} value={m.id}>{m.modelName} · {m.providerId} · {m.location==='local'?'local':m.costTier==='paid'?'có phí':'remote – chưa xác minh'}</option>)}
      </select></label>
      <div className="video-cap-grid">
        <div className="video-cap-panel"><h4>1. Khai báo năng lực</h4>
          <div className="video-cap-tags">{item?.configured?'Đã cấu hình · Chưa xác minh AI':'Chưa cấu hình'} · {item?.costTier==='paid'?'Cần phê duyệt phí':'Ưu tiên miễn phí/local'}</div>
          <div className="video-cap-checks">{['text_to_video','image_to_video'].map(radio)}</div>
          <div className="video-cap-fields">{[['maxDurationSec','Clip tối đa (giây)'],['maxWidth','Chiều rộng tối đa (px)'],['maxHeight','Chiều cao tối đa (px)'],['maxFps','FPS tối đa']].map(([key,label])=><label key={key}>{label}<input type="number" min="1" max="8192" value={draft[key]} onChange={e=>num(key,e)}/></label>)}
            <label>VRAM tối thiểu (GB; để trống nếu không rõ)<input type="number" min="0" max="192" value={draft.minVramGb??''} onChange={e=>setDraft(x=>({...x,minVramGb:e.target.value===''?null:Number(e.target.value)}))}/></label></div>
          <label className="video-cap-check"><input type="checkbox" checked={draft.requiresGpu} onChange={e=>setDraft(x=>({...x,requiresGpu:e.target.checked}))}/>Cần GPU</label>
          <button className="btn" type="button" disabled={busy} onClick={()=>act(async()=>{await api(`/provider-models/${item.id}/video-capabilities`,{method:'PUT',body:{revision:cap?.revision??0,capabilities:draft}});await refresh()})}>Lưu giới hạn model</button>
        </div>
        <div className="video-cap-panel"><h4>2. Preflight một scene (không tốn quota)</h4>
          <div className="video-cap-fields"><label>Kiểu clip<select value={test.mode} onChange={e=>setTest(x=>({...x,mode:e.target.value}))}><option value="text_to_video">Text → Video</option><option value="image_to_video">Image → Video</option></select></label>
            {[['durationSec','Thời lượng (giây)'],['width','Chiều rộng (px)'],['height','Chiều cao (px)'],['fps','FPS']].map(([key,label])=><label key={key}>{label}<input type="number" min="1" value={test[key]} onChange={e=>setTest(x=>({...x,[key]:Number(e.target.value)}))}/></label>)}</div>
          <label className="video-cap-check"><input type="checkbox" checked={test.allowRemote} onChange={e=>setTest(x=>({...x,allowRemote:e.target.checked}))}/>Cho phép dùng provider remote (chưa đồng nghĩa phê duyệt phí)</label>
          <label className="video-cap-check"><input type="checkbox" checked={test.fallbackImageMotion} onChange={e=>setTest(x=>({...x,fallbackImageMotion:e.target.checked}))}/>Đề xuất Image Motion khi không thể tạo AI Video</label>
          <button className="btn secondary" disabled={busy} type="button" onClick={()=>act(async()=>setResult(await api('/video-providers/preflight',{method:'POST',body:{...test,modelId:item.id}})))}>Kiểm tra khả thi</button>
          {result&&<div className="video-cap-result" role="status"><strong>{result.canPlan?'✓ Cấu hình đáp ứng giới hạn đã khai báo':'⚠ Chưa đáp ứng điều kiện'}</strong>
            <p>{result.dryRun?'Chỉ xem trước · Không có tác vụ AI hay chi phí phát sinh.':''}</p>
            {!!result.blockers.length&&<div><b>Cần xử lý:</b> {result.blockers.map(help).join(' · ')}</div>}
            {!!result.warnings.length&&<div><b>Chưa xác minh:</b> {result.warnings.map(help).join(' · ')}</div>}
            {result.proposedFallback&&<p>Gợi ý: Image + Motion (FFmpeg), <b>không phải AI Video</b>. Chưa tự động chuyển đổi.</p>}
          </div>}
        </div>
      </div>
    </>}
  </section>;
}
