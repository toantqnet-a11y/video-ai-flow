/**
 * R0-01 / EP01: Channel list and configuration workspace.
 * Persist ONLY through guarded localhost API. No secrets or session tokens are
 * stored in localStorage; video presets are immutable snapshots on creation.
 */
import React,{useEffect,useMemo,useState} from 'react';
import {useStudio} from './store.js';
import {defaultPreset} from './presets.js';
import {api} from './api.js';
import {VoicePreview} from './VoicePreview.jsx';
import {ChannelAvatarImage,ChannelAvatarUpload} from './ChannelAvatar.jsx';
import {comparePresetRevisions} from './preset-history.mjs';
import {channelDraft,validateChannelDraft,previewChannelPrompt,filterChannels} from './channel-form.mjs';

function Button({children,onClick,variant='primary',disabled=false,type='button'}){
  return <button type={type} className={`btn ${variant==='secondary'?'secondary':''} ${variant==='danger'?'danger':''}`} disabled={disabled} onClick={onClick}>{children}</button>;
}
function Modal({title,children,onClose}){
  return <div className="modal-back" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button className="text-action" aria-label="Đóng" onClick={onClose}>✕</button></div>{children}</div>
  </div>;
}
const FIELD_TABS=[['info','Thông tin'],['content','Content'],['voice','Nhân vật & Voice'],['media','Media'],['models','AI Models'],['render','Render'],['history','Lịch sử preset']];
const VOICES=[['vi-VN-HoaiMyNeural','Hoài My · Nữ'],['vi-VN-NamMinhNeural','Nam Minh · Nam']];
function Field({label,value,onChange,type='text',options,help,min,max,step}){
  const id=`field-${label.replace(/\W/g,'-')}`;
  return <label className="config-field" htmlFor={id}><span>{label}</span>
    {options?<select id={id} value={value??''} onChange={e=>onChange(e.target.value)}>{options.map(([v,text])=><option key={v} value={v}>{text}</option>)}</select>:
      type==='textarea'?<textarea id={id} value={value??''} onChange={e=>onChange(e.target.value)}/>:
      <input id={id} type={type} min={min} max={max} step={step} value={value??''} onChange={e=>onChange(type==='number'?Number(e.target.value):e.target.value)}/>}
    {help&&<small>{help}</small>}
  </label>;
}
function ConfirmChannel({channel,mode,onClose}){
  const perform=useStudio(s=>s.changeChannelLifecycle),setError=useStudio(s=>s.setError);
  const [typed,setTyped]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const destructive=mode==='delete';
  const title=mode==='archive'?'Lưu trữ kênh':mode==='restore'?'Khôi phục kênh':'Đưa vào thùng rác';
  async function submit(){setBusy(true);setMessage('');try{await perform(channel,mode);onClose();}
    catch(err){setMessage(err.message);setError(err.message)}finally{setBusy(false)}}
  return <Modal title={title} onClose={onClose}>
    <p><b>{channel.name}</b> · {channel.summary?.videoCount??0} video · {channel.summary?.activeJobs??0} job đang chờ/chạy.</p>
    <p>{destructive?'Không xoá vĩnh viễn video, tài nguyên và lịch sử. Có thể khôi phục lại.':'Dữ liệu và video hiện có được giữ nguyên.'}</p>
    {destructive&&<Field label={`Nhập chính xác tên kênh để xác nhận`} value={typed} onChange={setTyped}/>}
    {channel.summary?.activeJobs>0&&mode!=='restore'&&<div className="warn">Đang có job xử lý. Hãy hoàn thành hoặc hủy job trước khi tiếp tục.</div>}
    {message&&<div role="alert" className="error">{message}</div>}
    <div className="actions"><Button variant="secondary" onClick={onClose}>Hủy</Button><Button variant={destructive?'danger':'primary'} disabled={busy||(destructive&&typed!==channel.name)||(mode!=='restore'&&channel.summary?.activeJobs>0)} onClick={submit}>{busy?'Đang xử lý…':title}</Button></div>
  </Modal>;
}

export function ChannelGrid(){
  const channels=useStudio(s=>s.channels),create=useStudio(s=>s.addChannel),pick=useStudio(s=>s.chooseChannel);
  const navigateSettings=useStudio(s=>s.openChannelSettings),setError=useStudio(s=>s.setError),error=useStudio(s=>s.error);
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('active');
  const [show,setShow]=useState(false),[pending,setPending]=useState(null);
  const [name,setName]=useState(''),[description,setDescription]=useState(''),[busy,setBusy]=useState(false);
  // Retain key while the modal stays open: clicking Retry cannot create duplicates.
  const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
  const visible=useMemo(()=>filterChannels(channels,{search,status:filter}),[channels,search,filter]);
  const counts={active:channels.filter(c=>c.status==='active'&&c.deletedAt===null).length,
    archived:channels.filter(c=>c.status==='archived'&&c.deletedAt===null).length,
    deleted:channels.filter(c=>c.deletedAt!==null).length};
  async function save(e){e.preventDefault();setBusy(true);setError('');try{
    await create({name:name.trim(),description,preset:structuredClone(defaultPreset),idempotencyKey:requestKey});
    setShow(false);setName('');setDescription('');setRequestKey(crypto.randomUUID());
  }catch(err){setError(err.message)}finally{setBusy(false)}}
  return <section className="frame channel-workspace">
    <header className="frame-title"><div><h2>Quản lý kênh</h2><p>Mỗi kênh có preset riêng · Video cũ giữ nguyên preset khi kênh thay đổi</p></div>
      <Button onClick={()=>{setShow(true);setError('')}}>＋ Tạo kênh</Button></header>
    <div className="channel-toolbar"><input aria-label="Tìm kênh" placeholder="⌕ Tìm tên hoặc mô tả kênh..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="filter-tabs" aria-label="Trạng thái kênh">{[['active','Đang hoạt động'],['archived','Lưu trữ'],['deleted','Thùng rác'],['all','Tất cả']].map(([id,text])=><button className={filter===id?'current':''} key={id} onClick={()=>setFilter(id)}>{text} {counts[id]??channels.length}</button>)}</div></div>
    <div className="channel-results">{visible.map((c,i)=><article className="channel-tile" key={c.id}>
      <div className="tile-art" style={{background:i%2?'linear-gradient(130deg,#2e245f,#216f80)':'linear-gradient(130deg,#22385e,#6540a2)'}}><ChannelAvatarImage channel={c}/><span className="badge">{c.deletedAt!==null?'Đã xoá':c.status==='active'?'Hoạt động':'Lưu trữ'}</span></div>
      <div className="tile-body"><h3>{c.name}</h3><p>{c.description||c.preset.content.style}</p><div className="tile-meta"><span>▣ {c.summary?.videoCount??0} video</span><span>⚙ v{c.presetVersion}</span></div>
        <div className="tile-actions"><Button disabled={c.deletedAt!==null} onClick={()=>pick(c)}>Video →</Button><Button variant="secondary" disabled={c.deletedAt!==null} onClick={()=>navigateSettings(c)}>Cấu hình</Button></div>
        <div className="tile-secondary">{c.status==='active'&&c.deletedAt===null&&<button onClick={()=>setPending({c,mode:'archive'})}>Lưu trữ</button>}{(c.status==='archived'||c.deletedAt!==null)&&<button onClick={()=>setPending({c,mode:'restore'})}>Khôi phục</button>}{c.deletedAt===null&&<button className="danger-link" onClick={()=>setPending({c,mode:'delete'})}>Xóa mềm</button>}</div>
      </div></article>)}
      {!visible.length&&<div className="empty-state"><div className="empty-icon">▦</div><h3>{channels.length?'Không tìm thấy kênh phù hợp':'Chưa có kênh nào'}</h3><p>Tạo kênh để cấu hình phong cách nội dung, giọng đọc và media.</p><Button onClick={()=>setShow(true)}>Tạo kênh mới</Button></div>}</div>
    {show&&<Modal title="Tạo kênh mới" onClose={()=>setShow(false)}><form onSubmit={save}>
      <Field label="Tên kênh *" value={name} onChange={setName} help="1–120 ký tự; chỉ tên kênh là bắt buộc."/>
      <Field label="Mô tả" type="textarea" value={description} onChange={setDescription}/>
      <div className="muted">Sau khi tạo, cấu hình các tab Content · Voice · Media · Model · Render.</div>
      {error&&<div className="error" role="alert">{error}</div>}<div className="actions"><Button variant="secondary" onClick={()=>setShow(false)}>Hủy</Button><Button type="submit" disabled={busy||!name.trim()||name.trim().length>120}>{busy?'Đang tạo…':'Tạo và cấu hình →'}</Button></div>
    </form></Modal>}
    {pending&&<ConfirmChannel channel={pending.c} mode={pending.mode} onClose={()=>setPending(null)}/>}
  </section>;
}

/**
 * Audit-only history viewer: comparing earlier versions never changes a video
 * snapshot. This panel fetches only when opened, not on every draft keystroke.
 */
function PresetHistory({channel}){
  const [items,setItems]=useState([]),[base,setBase]=useState(null),[head,setHead]=useState(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{let alive=true;setLoading(true);setError('');
    api(`/channels/${channel.id}/presets`).then(response=>{
      if(!alive)return;
      const versions=response.items??[];setItems(versions);
      setHead(versions[0]?.version??null);setBase(versions[1]?.version??versions[0]?.version??null);
    }).catch(()=>{if(alive)setError('Không tải được lịch sử phiên bản.')})
      .finally(()=>{if(alive)setLoading(false)});
    return ()=>{alive=false};
  },[channel.id,channel.presetVersion]);
  const previous=items.find(r=>r.version===base),current=items.find(r=>r.version===head);
  const changes=comparePresetRevisions(previous,current);
  const show=x=>x===null||x===undefined?'(chưa đặt)':typeof x==='boolean'?(x?'Bật':'Tắt'):String(x);
  return <div className="preset-history"><h3>Lịch sử cấu hình kênh</h3>
    <p className="muted">Các phiên bản chỉ đọc. Video đã tạo tiếp tục sử dụng snapshot riêng; xem lịch sử không tạo job hoặc phát sinh chi phí.</p>
    {loading&&<p role="status">Đang tải lịch sử…</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {!loading&&!error&&<><div className="field-grid">
      <Field label="Phiên bản gốc" value={String(base??'')} onChange={x=>setBase(Number(x))} options={items.map(r=>[String(r.version),`v${r.version}`])}/>
      <Field label="Phiên bản so sánh" value={String(head??'')} onChange={x=>setHead(Number(x))} options={items.map(r=>[String(r.version),`v${r.version}`])}/>
    </div><div className="notice">{changes.length} trường thay đổi giữa hai phiên bản đã chọn.</div>
    <div className="preset-diff" role="region" aria-label="So sánh preset">
      {changes.map(item=><article className="preset-diff-row" key={`${item.group}.${item.key}`}>
        <strong>{item.group} · {item.key}</strong><div><span>{show(item.from)}</span><span aria-hidden="true">→</span><span>{show(item.to)}</span></div>
      </article>)}
      {!changes.length&&<div className="muted">Hai phiên bản có cùng giá trị cấu hình.</div>}
    </div></>}
  </div>;
}

/** Edit a draft, then submit exactly one complete preset using optimistic locking. */
export function ChannelSettings(){
  const channel=useStudio(s=>s.currentChannel),save=useStudio(s=>s.updateChannel),reload=useStudio(s=>s.reloadChannel),setTab=useStudio(s=>s.setTab);
  const [draft,setDraft]=useState(()=>channelDraft(channel));const [section,setSection]=useState('info');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[conflict,setConflict]=useState(false);
  useEffect(()=>{setDraft(channelDraft(channel));setError('');setConflict(false)},[channel.id]);
  function change(group,key,value){setDraft(old=>({...old,preset:{...old.preset,[group]:{...old.preset[group],[key]:value}}}));setNotice('Có thay đổi chưa lưu')}
  function root(key,value){setDraft(old=>({...old,[key]:value}));setNotice('Có thay đổi chưa lưu')}
  async function persist(){const invalid=validateChannelDraft(draft);if(invalid){setError(invalid);return}
    setBusy(true);setError('');setConflict(false);
    try{await save(channel.id,{name:draft.name.trim(),description:draft.description,preset:draft.preset,rowVersion:channel.rowVersion});setNotice('Đã lưu và tạo phiên bản preset nếu cấu hình thay đổi');}
    catch(err){setError(err.message);setConflict(err.message==='VERSION_CONFLICT');}finally{setBusy(false)}}
  async function readLatest(){const latest=await reload(channel.id);setDraft(channelDraft(latest));setConflict(false);setError('');setNotice('Đã tải phiên bản mới nhất; thay đổi chưa lưu đã bị bỏ.')}
  const c=draft.preset.content,v=draft.preset.voice,m=draft.preset.media,r=draft.preset.render;
  return <section className="frame channel-workspace"><header className="frame-title"><div><button className="text-action" onClick={()=>setTab('channels')}>← Tất cả kênh</button><h2>Cài đặt kênh · {channel.name}</h2><p>Preset v{channel.presetVersion} · Row v{channel.rowVersion} · Các video đã tạo không tự cập nhật</p></div><div className="actions"><Button variant="secondary" onClick={()=>setTab('videos')}>Xem video</Button><Button disabled={busy||channel.deletedAt!==null} onClick={persist}>{busy?'Đang lưu…':'Lưu cấu hình'}</Button></div></header>
    <div className="settings-layout"><nav className="settings-tabs" aria-label="Tab cấu hình kênh">{FIELD_TABS.map(([id,text])=><button key={id} className={section===id?'active':''} onClick={()=>setSection(id)}>{text}</button>)}</nav>
      <div className="settings-body">
        {section==='info'&&<><h3>Thông tin kênh</h3><ChannelAvatarUpload channel={channel}/><div className="field-grid"><Field label="Tên kênh" value={draft.name} onChange={value=>root('name',value)}/><Field label="Mô tả" type="textarea" value={draft.description} onChange={value=>root('description',value)}/></div></>}
        {section==='content'&&<><h3>Định hướng nội dung</h3><div className="field-grid">
          <Field label="Văn phong" value={c.style} onChange={x=>change('content','style',x)}/><Field label="Giọng điệu" value={c.tone} onChange={x=>change('content','tone',x)}/>
          <Field label="Đối tượng khán giả" value={c.audience||''} onChange={x=>change('content','audience',x)}/><Field label="Chủ đề kênh" value={c.topic||''} onChange={x=>change('content','topic',x)}/>
          <Field label="Cách xưng hô" value={c.addressStyle||''} onChange={x=>change('content','addressStyle',x)}/>
          <Field label="Ngôn ngữ nội dung" value={c.language} onChange={x=>change('content','language',x)} options={[["vi","Tiếng Việt"],["en","English"]]}/>
          <Field label="Thời lượng video mặc định (phút)" value={c.targetMinutes} type="number" min="1" max="240" onChange={x=>change('content','targetMinutes',x)}/>
          <Field label="Từ khóa ưu tiên" value={c.preferredTerms||''} onChange={x=>change('content','preferredTerms',x)}/><Field label="Từ khóa tránh" value={c.avoidTerms||''} onChange={x=>change('content','avoidTerms',x)}/>
        </div><Field label="Prompt nền của kênh" type="textarea" value={c.basePrompt||''} onChange={x=>change('content','basePrompt',x)}/><Field label="Prompt bổ sung" type="textarea" value={c.extraPrompt||''} onChange={x=>change('content','extraPrompt',x)}/>
        <div className="prompt-preview"><h3>Preview prompt tổng hợp · Không gọi AI</h3><pre>{previewChannelPrompt(c)}</pre></div></>}
        {section==='voice'&&<><h3>Nhân vật & Voice</h3><div className="field-grid">
          <Field label="Tên nhân vật" value={v.characterName||''} onChange={x=>change('voice','characterName',x)}/><Field label="Mô tả nhân vật" value={v.characterDescription||''} onChange={x=>change('voice','characterDescription',x)}/>
          <Field label="TTS Provider" value={v.provider} onChange={x=>change('voice','provider',x)} options={[["edge","Microsoft Edge TTS"],["piper","Piper local"],["vieneu","VieNeu local"],["espeak","eSpeak (test)"]]}/>
          <Field label={v.provider==='edge'?'Giọng tiếng Việt':'Voice ID / model voice'} value={v.voice} onChange={x=>change('voice','voice',x)} options={v.provider==='edge'?(VOICES.some(a=>a[0]===v.voice)?VOICES:[[v.voice,v.voice],...VOICES]):undefined}/>
          <Field label="Tốc độ đọc" type="number" min="0.5" max="2" step="0.05" value={v.speed} onChange={x=>change('voice','speed',x)}/>
        </div><VoicePreview channelId={channel.id} provider={v.provider} voice={v.voice} speed={v.speed}/></>}
        {section==='media'&&<><h3>Hình ảnh và AI Video</h3><div className="field-grid">
          <Field label="Chế độ media" value={m.mode} onChange={x=>change('media','mode',x)} options={[["hybrid","Hybrid – AI video + ảnh"],["image_motion","Ảnh + FFmpeg motion"],["ai_video","Ưu tiên AI Video"],["import_video","Clip được nhập"]]}/>
          <Field label="Phong cách minh họa" value={m.style} onChange={x=>change('media','style',x)}/>
          <Field label="Tỷ lệ khung hình" value={m.aspectRatio} onChange={x=>setDraft(old=>({...old,preset:{...old.preset,media:{...old.preset.media,aspectRatio:x},render:{...old.preset.render,...(x==='9:16'?{width:1080,height:1920}:x==='1:1'?{width:1080,height:1080}:{width:1920,height:1080})}}}))} options={[["16:9","Ngang 16:9"],["9:16","Dọc 9:16"],["1:1","Vuông 1:1"]]}/>
          <Field label="Thời lượng scene mặc định (giây)" value={m.sceneSeconds} type="number" min="2" max="120" onChange={x=>change('media','sceneSeconds',x)}/>
          <Field label="Hiệu ứng" value={m.motionEffect||'ken_burns'} onChange={x=>change('media','motionEffect',x)} options={[["ken_burns","Ken Burns"],["zoom","Zoom"],["pan","Pan"],["none","Không"]]}/>
        </div></>}
        {section==='models'&&<><h3>AI Model & Chi phí</h3><div className="cost-safety"><strong>🔒 Mặc định Free / Local</strong><p>Paid API: TẮT · Remote API: TẮT. Để bật provider từ xa/trả phí phải dùng luồng phê duyệt riêng ở EP02. Tab này không tự kích hoạt quota hoặc thanh toán.</p></div></>}
        {section==='render'&&<><h3>Xuất video</h3><div className="field-grid"><Field label="Độ phân giải" value={`${r.width}x${r.height}`} onChange={x=>{const [w,h]=x.split('x').map(Number);setDraft(old=>({...old,preset:{...old.preset,render:{...old.preset.render,width:w,height:h}}}));setNotice('Có thay đổi chưa lưu')}} options={m.aspectRatio==='16:9'?[["1280x720","HD · 1280×720"],["1920x1080","Full HD · 1920×1080"],["3840x2160","4K · 3840×2160"]]:m.aspectRatio==='9:16'?[["720x1280","720×1280 · Dọc"],["1080x1920","1080×1920 · Dọc"]]:[["1080x1080","1080×1080 · Vuông"]]}/><Field label="FPS" value={String(r.fps)} onChange={x=>change('render','fps',Number(x))} options={[["24","24"],["25","25"],["30","30"],["60","60"]]}/><Field label="Phụ đề khi render" value={r.subtitles===false?'off':'on'} onChange={x=>change('render','subtitles',x==='on')} options={[["on","Bật phụ đề"],["off","Không"]]}/></div><div className="cost-safety">MP4 · H.264 / AAC · Subtitles: SRT. Các tùy chọn codec nâng cao triển khai ở R3.</div></>}
        {section==='history'&&<PresetHistory channel={channel}/> }
        {error&&<div className="error" role="alert">{error}{conflict&&<div><p>Phiên bản kênh đã thay đổi nơi khác. Hãy tải lại trước khi lưu.</p><Button variant="secondary" onClick={readLatest}>Tải phiên bản mới (bỏ thay đổi)</Button></div>}</div>}
        {notice&&<div role="status" className="notice">{notice}</div>}
      </div></div>
  </section>;
}
