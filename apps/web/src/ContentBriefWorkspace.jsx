import React,{useEffect,useMemo,useRef,useState} from 'react';
import {api} from './api.js';
import {briefMax,previewBrief,estimateDraft,draftErrors} from './content-brief-form.mjs';
import {useStudio} from './store.js';

const inputStyle={width:'100%'};
const msg=e=>e?.code==='CONTENT_VERSION_CONFLICT'?'Brief đã bị sửa ở nơi khác. Tải lại trước khi tiếp tục.':(e?.code??e?.message??'Không lưu được brief.');

/**
 * R1-01 editor. Autosave is serialized and versioned so a slow response cannot
 * overwrite a newer draft; switching videos invalidates the outstanding load.
 * No LLM calls in this component. The Generate CTA arrives in R1-02.
 */
export function ContentBriefWorkspace({video}){
  const [record,setRecord]=useState(null),[draft,setDraft]=useState(null),[models,setModels]=useState([]),[busy,setBusy]=useState(false),
    [saveState,setSaveState]=useState('Đang tải'),[warning,setWarning]=useState(''),[check,setCheck]=useState(null),[history,setHistory]=useState([]),
    [skills,setSkills]=useState([]),[skillPlan,setSkillPlan]=useState(null);
  const revisionRef=useRef(0),persistedRef=useRef(''),videoRef=useRef(null),busyRef=useRef(false),loadSeq=useRef(0);
  const videoId=video.id;
  useEffect(()=>{
    const seq=++loadSeq.current;
    videoRef.current=videoId;setDraft(null);setRecord(null);setWarning('');setCheck(null);setSkillPlan(null);setSaveState('Đang tải');revisionRef.current=0;persistedRef.current='';busyRef.current=false;
    Promise.all([api(`/videos/${videoId}/content/brief`),api('/provider-models'),api(`/videos/${videoId}/content/brief/revisions`),api('/content/script-skills')])
      .then(([value,catalog,revisions,skillCatalog])=>{if(seq!==loadSeq.current)return;
        setRecord(value);setDraft(value.brief);revisionRef.current=value.revision;persistedRef.current=JSON.stringify(value.brief);
        setModels(catalog.items.filter(m=>m.kind==='llm'));setHistory(revisions.items);setSkills(skillCatalog.items);setSaveState(value.revision?'Đã lưu':'Nháp chưa lưu');})
      .catch(e=>{if(seq===loadSeq.current){setWarning(msg(e));setSaveState('Lỗi tải brief')}});
    return ()=>{loadSeq.current++;};
  },[videoId]);
  const fingerprint=draft?JSON.stringify(draft):'';
  const isDirty=Boolean(draft&&fingerprint!==persistedRef.current);
  // Global in-app navigation warning complements beforeunload for React tabs.
  useEffect(()=>{useStudio.setState({contentBriefDirty:isDirty});return()=>useStudio.setState({contentBriefDirty:false});},[isDirty]);
  // Protect against accidental page reload while unsaved data is present.
  useEffect(()=>{if(!isDirty)return;const before=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before)},[isDirty]);

  async function save(){
    if(!draft||busyRef.current||videoRef.current!==videoId)return;
    const serialized=JSON.stringify(draft);
    if(serialized===persistedRef.current)return;
    busyRef.current=true;setBusy(true);setSaveState('Đang lưu…');
    try{
      const saved=await api(`/videos/${videoId}/content/brief`,{method:'PUT',body:{expectedRevision:revisionRef.current,brief:draft}});
      if(videoRef.current!==videoId)return;
      revisionRef.current=saved.revision;persistedRef.current=serialized;setRecord(saved);
      setHistory(old=>[{revision:saved.revision,createdAt:saved.updatedAt},...old.filter(r=>r.revision!==saved.revision)].slice(0,100));
      setSaveState('Đã lưu · v'+saved.revision);setWarning('');
    }catch(e){if(videoRef.current===videoId){setSaveState('Chưa lưu');setWarning(msg(e));}}
    finally{if(videoRef.current===videoId){busyRef.current=false;setBusy(false);}}
  }
  // Auto-save after a short typing pause; retries are explicit on conflicts.
  useEffect(()=>{if(!draft||!isDirty||warning)return;const timer=setTimeout(()=>{if(!busyRef.current)save();},1200);return()=>clearTimeout(timer);},[fingerprint,busy,warning,videoId]);
  function change(key,value){setWarning('');setCheck(null);setSkillPlan(null);setDraft(current=>({...current,[key]:value}));setSaveState('Chưa lưu');}
  function target(key,value){setWarning('');setCheck(null);setSkillPlan(null);setDraft(current=>({...current,target:{...current.target,[key]:value}}));setSaveState('Chưa lưu');}
  function style(key,value){setWarning('');setCheck(null);setSkillPlan(null);setDraft(current=>({...current,styleOverrides:{...current.styleOverrides,[key]:value}}));setSaveState('Chưa lưu');}
  function toggleModel(id){setCheck(null);setWarning('');setSkillPlan(null);setDraft(current=>({...current,modelIds:current.modelIds.includes(id)?current.modelIds.filter(x=>x!==id):current.modelIds.length>=3?current.modelIds:[...current.modelIds,id]}));}
  async function previewSkill(){
    if(isDirty||!revisionRef.current){setWarning('Lưu Brief trước khi xem bản kế hoạch kỹ năng.');return;}
    setWarning('');try{const plan=await api(`/videos/${videoId}/content/script-skills/plan`,{method:'POST',
      body:{briefRevision:revisionRef.current,scriptSkillId:draft.scriptSkillId??'educational'}});
      if(videoRef.current===videoId)setSkillPlan(plan);
    }catch(e){setWarning(msg(e));}
  }
  async function validate(){if(!draft)return;setWarning('');setCheck(null);
    const local=draftErrors(draft);
    if(local.length){setCheck({valid:false,errors:local});return;}
    try{const result=await api(`/videos/${videoId}/content/brief/validate`,{method:'POST',body:draft});
      if(videoRef.current===videoId)setCheck(result);
    }catch(e){setWarning(msg(e));}}
  async function reload(){
    if(isDirty&&!window.confirm('Tải lại sẽ bỏ các chỉnh sửa chưa lưu. Tiếp tục?'))return;
    try{const value=await api(`/videos/${videoId}/content/brief`);setRecord(value);setDraft(value.brief);revisionRef.current=value.revision;persistedRef.current=JSON.stringify(value.brief);setWarning('');setCheck(null);setSaveState('Đã tải lại');}catch(e){setWarning(msg(e))}
  }
  const estimate=useMemo(()=>draft?estimateDraft(draft):null,[fingerprint]);
  const effectiveStyle=record?.inherited??{};
  if(!draft)return <section className="frame"><h2>Brief & cấu hình</h2><p aria-live="polite">{warning||'Đang tải dữ liệu video…'}</p><button onClick={reload}>Tải lại</button></section>;
  return <section className="frame content-brief-workspace" aria-label="Brief nội dung">
    <header className="frame-title"><div><h2>✍ Brief & Cấu hình</h2><p>{video.title} · Nội dung lưu theo video, không thay đổi preset kênh.</p></div>
      <div className="content-brief-status" role="status">{saveState} {busy?'⌛':''}</div></header>
    {warning&&<div className="error" role="alert">{warning} <button type="button" onClick={reload}>Tải lại</button></div>}
    <div className="content-brief-grid"><div className="content-brief-fields">
      <div className="content-brief-panel"><h3>01 · Nội dung đầu vào</h3>
        {[["topic","Chủ đề","VD: Lịch sử hình thành Internet"],["idea","Ý tưởng / nội dung chính","Những thông điệp muốn nhấn mạnh…"],["sourceText","Nội dung tham khảo","Dán nguồn tham khảo hoặc kịch bản thô…"],["freePrompt","Prompt bổ sung","Yêu cầu riêng cho AI, không phải system prompt…"]].map(([key,label,placeholder])=><label key={key}>{label}<small>{draft[key].length.toLocaleString('vi-VN')} / {briefMax[key].toLocaleString('vi-VN')}</small>{key==='topic'?<input style={inputStyle} maxLength={briefMax[key]} placeholder={placeholder} value={draft[key]} onChange={e=>change(key,e.target.value)}/>:<textarea maxLength={briefMax[key]} rows={key==='sourceText'?5:3} placeholder={placeholder} value={draft[key]} onChange={e=>change(key,e.target.value)}/>}</label>)}
        <small>Ít nhất một trong Chủ đề, Ý tưởng, Tài liệu tham khảo cần có trước khi tạo nội dung.</small>
      </div>
      <div className="content-brief-panel"><h3>02 · Độ dài và cách triển khai</h3>
        <div className="content-brief-row"><label>Cách đặt mục tiêu<select value={draft.target.mode} onChange={e=>target('mode',e.target.value)}><option value="duration">Theo phút</option><option value="words">Theo số từ</option></select></label>
          {draft.target.mode==='duration'?<label>Thời lượng (1–120 phút)<input type="number" min="1" max="120" step="1" value={draft.target.durationMinutes} onChange={e=>target('durationMinutes',Number(e.target.value))}/></label>:<label>Số từ (200–20.000)<input type="number" min="200" max="20000" value={draft.target.wordCount} onChange={e=>target('wordCount',Number(e.target.value))}/></label>}
          <label>Tốc độ đọc (WPM)<input type="number" min="100" max="200" value={draft.target.wpm} onChange={e=>target('wpm',Number(e.target.value))}/></label>
          <label>Mục tiêu từ/chương<input type="number" min="500" max="2000" value={draft.target.chapterTargetWords} onChange={e=>target('chapterTargetWords',Number(e.target.value))}/></label></div>
        <div className="content-brief-estimate">≈ <strong>{estimate.targetWords.toLocaleString('vi-VN')}</strong> từ · <strong>{estimate.estimatedMinutes}</strong> phút · khoảng <strong>{estimate.chapterCount}</strong> chương <small>Ước tính, thời lượng chính xác sau khi tạo voice.</small></div>
      </div>
      <div className="content-brief-panel"><h3>03 · Phong cách nội dung</h3><p className="muted">Để trống để sử dụng cấu hình video kế thừa từ kênh.</p>
        <div className="content-brief-row">{[['style','Văn phong'],['tone','Giọng điệu'],['audience','Khán giả'],['language','Ngôn ngữ']].map(([key,label])=><label key={key}>{label}<input maxLength={key==='audience'?250:key==='language'?40:120} value={draft.styleOverrides[key]??''} placeholder={effectiveStyle[key]||'Theo preset'} onChange={e=>style(key,e.target.value)}/></label>)}</div></div>
      <div className="content-brief-panel"><h3>04 · Khuôn kịch bản (R1-EXT-01)</h3>
        <p className="muted">Chọn phong cách theo quy trình Hook → Vấn đề → Giải thích → Ví dụ → CTA. Dàn ý sẽ kế thừa khuôn ở phiên bản Brief được lưu.</p>
        <label>Loại kịch bản<select value={draft.scriptSkillId??'educational'} onChange={e=>change('scriptSkillId',e.target.value)}>
          {skills.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <button className="btn secondary" type="button" onClick={previewSkill} disabled={busy||isDirty||!record?.revision}>Xem kế hoạch 5 chặng</button>
        {skillPlan&&<div aria-live="polite" className="content-brief-preview">
          <strong>{skillPlan.skillLabel}</strong>{skillPlan.steps.map(step=><p key={step.id}>{step.label}: {step.targetWords} từ (ước tính)</p>)}
          <small>Đề xuất cấu trúc, chưa nghiên cứu hay gọi AI. Kiểm chứng nguồn và duyệt Bản chuẩn thủ công.</small>
        </div>}
      </div>
      <div className="content-brief-panel"><h3>05 · Chọn 1–3 AI model</h3><p className="muted">Chọn model để chuẩn bị tạo nội dung; bước này chưa gọi API AI hoặc tính phí.</p>
        {!models.length&&<div className="warn">Chưa có model LLM. Vào “AI Models & Quota” để thêm tài khoản và model.</div>}
        <div className="content-brief-models">{models.map(model=><label key={model.id} className="content-brief-model"><input type="checkbox" checked={draft.modelIds.includes(model.id)} disabled={(!draft.modelIds.includes(model.id)&&draft.modelIds.length>=3)||model.status!=='active'} onChange={()=>toggleModel(model.id)}/><span><strong>{model.modelId}</strong><small>{model.location==='local'?'💻 Local':model.costTier==='paid'?'💳 Trả phí':'🌐 Remote · quota chưa xác minh'} · {model.status==='active'?'Đã đăng ký':'Đã tắt'}</small></span></label>)}</div>
        {models.some(m=>draft.modelIds.includes(m.id)&&m.costTier==='paid')&&<div className="warn">Model trả phí được chọn để cấu hình. Việc sử dụng thực tế vẫn phải được phê duyệt riêng trước khi chạy job.</div>}
      </div>
      <div className="content-brief-actions"><button className="btn secondary" type="button" onClick={save} disabled={busy||!isDirty}>Lưu nháp</button><button className="btn secondary" type="button" onClick={reload} disabled={busy}>Tải lại</button><button className="btn" type="button" onClick={validate} disabled={busy}>Kiểm tra trước khi tạo →</button></div>
      {check&&<div className={check.valid?'content-brief-valid':'warn'} role="status">{check.valid?'✓ Brief hợp lệ để chuyển sang bước tạo dàn ý (R1-02).':`Chưa hợp lệ: ${(check.errors??[]).join(', ')}`} {check.requiresPaidApproval?' Cần phê duyệt trước khi dùng model trả phí.':''}</div>}
    </div><aside className="content-brief-aside">
      <div className="content-brief-panel"><h3>Xem trước nội dung gửi AI</h3><p className="muted">Chỉ hiển thị các trường do bạn cấu hình, không có khóa API.</p><pre className="content-brief-preview">{previewBrief(draft,effectiveStyle)||'Nhập chủ đề hoặc ý tưởng để xem preview…'}</pre></div>
      <div className="content-brief-panel"><h3>Phiên bản brief</h3><div className="content-brief-history">{history.slice(0,12).map(v=><span key={v.revision}>v{v.revision} · {new Date(v.createdAt).toLocaleString('vi-VN')}</span>)}{history.length===0&&<span>Chưa lưu phiên bản nào.</span>}</div><small>Lịch sử bất biến; bản chuẩn (Master Script) được quản lý riêng.</small></div>
      <div className="content-brief-panel"><h3>Bước tiếp theo</h3><p>Tạo dàn ý → Sinh từng chương → So sánh & chấm điểm → Chốt bản chuẩn.</p><span className="badge">R1-01 · Chưa gọi LLM</span></div>
    </aside></div>
  </section>;
}
