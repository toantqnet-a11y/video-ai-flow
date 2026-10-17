/**
 * R0-11 video config editor: channel preset is the immutable starting point.
 * Users explicitly preview affected script/media before committing changes;
 * clicking Save never starts voice/image/video generation or spends quota.
 */
import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {useStudio} from './store.js';
import {editableVideoConfig,setVideoOverride,currentOverrideValue,cloneOverrides} from './video-config-form.mjs';

const opts={
  voice:[['vi-VN-HoaiMyNeural','Hoài My (nữ)'],['vi-VN-NamMinhNeural','Nam Minh (nam)']],
  mode:[['hybrid','Hybrid'],['image_motion','Ảnh có chuyển động'],['ai_video','Video AI'],['import_video','Import video']],
  fps:[[24,'24'],[25,'25'],[30,'30'],[60,'60']],
};
function ConfigField({config,overrides,field,onChange}){
  const [group,key,label,type]=field;
  const overridden=Object.hasOwn(overrides[group]??{},key);
  const value=currentOverrideValue(config,overrides,group,key)??'';
  const inputProps={value:value,onChange:e=>onChange(group,key,type==='number'||type==='fps'||type==='decimal'?Number(e.target.value):type==='boolean'?e.target.value==='true':e.target.value)};
  return <label className="video-config-field"><span>{label} <em>{overridden?'Riêng video':'Kế thừa kênh'}</em></span>
    {opts[type]?<select {...inputProps}>{opts[type].map(([v,name])=><option value={v} key={v}>{name}</option>)}</select>:
      type==='boolean'?<select {...inputProps}><option value="true">Bật</option><option value="false">Tắt</option></select>:
      type==='textarea'?<textarea rows={3} {...inputProps}/>:
      <input type={['number','decimal'].includes(type)?'number':'text'} min={type==='number'?1:undefined} step={type==='decimal'?'0.05':undefined} {...inputProps}/>}
    {overridden&&<button type="button" className="text-action" onClick={()=>onChange(group,key,undefined)}>↺ Khôi phục theo kênh</button>}
  </label>;
}
export function VideoConfigWorkspace(){
  const video=useStudio(s=>s.currentVideo),reload=useStudio(s=>s.reloadVideo),setTab=useStudio(s=>s.setTab);
  const [config,setConfig]=useState(null),[overrides,setOverrides]=useState({});
  const [preview,setPreview]=useState(null),[history,setHistory]=useState([]);
  const [channelDiff,setChannelDiff]=useState(null),[selectedPaths,setSelectedPaths]=useState([]),[diffPreview,setDiffPreview]=useState(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{let active=true;setLoading(true);setError('');setPreview(null);setChannelDiff(null);setSelectedPaths([]);setDiffPreview(null);
    Promise.all([api(`/videos/${video.id}/config`),api(`/videos/${video.id}/config/revisions`)]).then(([c,h])=>{
      if(!active)return;setConfig(c);setOverrides(cloneOverrides(c.overrides));setHistory(h.items??[]);
    }).catch(()=>{if(active)setError('Không đọc được cấu hình video')}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[video.id]);
  function edit(group,key,value){setOverrides(s=>setVideoOverride(s,group,key,value,config.sourcePreset));setPreview(null);setChannelDiff(null);setDiffPreview(null);setNotice('Có thay đổi chưa lưu');}
  async function showImpact(){setSaving(true);setError('');try{
    const result=await api(`/videos/${video.id}/config/preview`,{method:'POST',body:{rowVersion:config.rowVersion,overrides}});
    setPreview(result);setNotice(result.changed?'Đã tính ảnh hưởng. Chưa thay đổi asset.':'Không có thay đổi so với cấu hình hiện tại.');
  }catch(e){setError(e.message)}finally{setSaving(false)}}
  async function save(){if(!preview)return;setSaving(true);setError('');try{
    const updated=await api(`/videos/${video.id}/config`,{method:'PUT',body:{rowVersion:config.rowVersion,overrides,
      confirmImpact:preview.impact.requiresReview}});
    const fresh=await api(`/videos/${video.id}/config/revisions`);
    setConfig(updated);setOverrides(cloneOverrides(updated.overrides));setHistory(fresh.items??[]);setPreview(null);setChannelDiff(null);setDiffPreview(null);
    await reload(video.id);setNotice('Đã lưu phiên bản cấu hình mới. Không chạy lại AI hay media.');
  }catch(e){setError(e.message)}finally{setSaving(false)}}
  const editorDirty=config&&JSON.stringify(overrides)!==JSON.stringify(config.overrides);
  async function compareChannelPreset(){
    if(editorDirty){setError('Hãy lưu hoặc hủy các thay đổi cấu hình video trước khi so sánh preset kênh.');return;}
    setSaving(true);setError('');setDiffPreview(null);
    try{
      const channel=await api(`/channels/${video.channelId}`);
      const result=await api(`/videos/${video.id}/config/diff`,{method:'POST',body:{rowVersion:config.rowVersion,channelPresetVersion:channel.presetVersion,selectedPaths:[]}});
      setChannelDiff(result);setSelectedPaths([]);setNotice('Đã so sánh với preset mới nhất của kênh. Chưa có thay đổi nào được áp dụng.');
    }catch(e){setError(e.message);setChannelDiff(null);}finally{setSaving(false);}
  }
  async function previewSelected(){
    setSaving(true);setError('');setDiffPreview(null);
    try{
      const result=await api(`/videos/${video.id}/config/diff`,{method:'POST',body:{rowVersion:channelDiff.rowVersion,channelPresetVersion:channelDiff.channelPresetVersion,selectedPaths}});
      setDiffPreview(result);
    }catch(e){setError(e.message);}finally{setSaving(false);}
  }
  async function applySelected(){
    if(!diffPreview?.changed||editorDirty)return;
    setSaving(true);setError('');
    try{
      const result=await api(`/videos/${video.id}/config/apply`,{method:'POST',body:{rowVersion:diffPreview.rowVersion,
        channelPresetVersion:diffPreview.channelPresetVersion,selectedPaths:diffPreview.selectedPaths,
        expectedDigest:diffPreview.previewDigest,confirmImpact:diffPreview.impact.requiresReview}});
      const revisions=await api(`/videos/${video.id}/config/revisions`);
      setConfig(result);setOverrides(cloneOverrides(result.overrides));setHistory(revisions.items??[]);
      setChannelDiff(null);setSelectedPaths([]);setDiffPreview(null);setPreview(null);
      await reload(video.id);setNotice('Chỉ cập nhật các trường đã chọn. Không tạo lại tài nguyên hoặc gọi AI.');
    }catch(e){setError(e.message);}finally{setSaving(false);}
  }
  if(loading)return <section className="frame"><h2>Cấu hình video</h2><p>Đang tải…</p></section>;
  if(!config)return <section className="frame"><p role="alert">{error||'Không có cấu hình'}</p></section>;
  return <section className="frame video-config-page"><header className="frame-title"><div>
    <button className="text-action" onClick={()=>setTab('content')}>← Quay lại Content</button>
    <h2>Thiết lập riêng cho video · {video.title}</h2>
    <p>Preset nguồn v{config.sourcePresetVersion} · Cấu hình video v{config.version} · Thay đổi kênh không tự cập nhật video này.</p>
  </div><div className="actions"><button className="btn secondary" onClick={()=>{setOverrides({});setPreview(null);setChannelDiff(null);setDiffPreview(null)}}>Dùng toàn bộ preset gốc</button>
    <button className="btn secondary" disabled={saving} onClick={showImpact}>1. Xem ảnh hưởng</button>
    <button className="btn" disabled={saving||!preview?.changed} onClick={save}>{preview?.impact.requiresReview?'2. Xác nhận và lưu':'2. Lưu cấu hình'}</button></div></header>
    <div className="video-config-banner">🔒 Thay đổi chỉ lưu cấu hình. Hệ thống không tự tạo lại voice, ảnh, clip hoặc gọi API trả phí. Cấu hình kênh và video khác vẫn được giữ nguyên.</div>
    <section className="video-preset-diff" aria-label="So sánh preset kênh">
      <div className="actions"><h3>Đồng bộ có chọn lọc từ preset kênh</h3>
        <button className="btn secondary" disabled={saving||editorDirty} onClick={compareChannelPreset}>So sánh preset mới nhất</button></div>
      <p className="muted">Mỗi video giữ preset riêng. Chỉ các trường bạn chọn mới được cập nhật, không chạy lại AI.</p>
      {editorDirty&&<p role="status">Bạn đang có thay đổi chưa lưu trong trình chỉnh sửa phía dưới.</p>}
      {channelDiff&&<><p>Preset kênh v{channelDiff.channelPresetVersion} · {channelDiff.fields.length} trường khác nhau</p>
        {channelDiff.fields.map(field=><label className="video-preset-diff-row" key={field.path}>
          <input type="checkbox" disabled={saving||!field.selectable} checked={selectedPaths.includes(field.path)}
            onChange={event=>{setSelectedPaths(previous=>event.target.checked?[...previous,field.path]:previous.filter(path=>path!==field.path));setDiffPreview(null);}}/>
          <strong>{field.path}</strong><span>{JSON.stringify(field.currentValue)} → {JSON.stringify(field.channelValue)}</span>
          {!field.selectable&&<small>Không thể xóa thuộc tính tùy chọn qua cơ chế override</small>}
        </label>)}
        <div className="actions"><button className="btn secondary" disabled={saving||!selectedPaths.length||editorDirty} onClick={previewSelected}>Xem ảnh hưởng {selectedPaths.length} trường</button>
          <button className="btn" disabled={saving||!diffPreview?.changed||editorDirty} onClick={applySelected}>
            {diffPreview?.impact.requiresReview?'Xác nhận ảnh hưởng và áp dụng':'Áp dụng các trường đã chọn'}</button></div>
        {diffPreview&&<aside className="video-config-impact" role="region" aria-label="Ảnh hưởng preset đã chọn">
          <p>Trường thay đổi: {diffPreview.impact.changedPaths.join(', ')||'Không có'}</p>
          <p>Tài nguyên bị ảnh hưởng: {diffPreview.impact.affected.join(', ')||'Không có'}</p>
          <p>{diffPreview.impact.note}</p></aside>}
      </>}
    </section>
    <div className="video-config-layout"><div><div className="video-config-grid">{editableVideoConfig.map(field=><ConfigField key={field.slice(0,2).join('.')} config={config} overrides={overrides} field={field} onChange={edit}/>)}</div>
      {error&&<div className="error" role="alert">{error}{error==='VERSION_CONFLICT'&&' · Hãy mở lại video để tải phiên bản mới nhất.'}</div>}
      {notice&&<p role="status" className="muted">{notice}</p>}
      {preview&&<aside className={`video-config-impact ${preview.impact.requiresReview?'needs-review':''}`} role="region" aria-label="Ảnh hưởng thay đổi">
        <h3>{preview.impact.requiresReview?'⚠ Cần xác nhận ảnh hưởng':'✓ Kết quả kiểm tra'}</h3>
        <p>Trường thay đổi: {preview.impact.changedPaths.join(', ')||'Không có'}</p>
        <p>Ảnh hưởng: {preview.impact.affected.join(', ')||'Không ảnh hưởng tài nguyên'}</p>
        <p>Asset đã có: Voice {preview.impact.existing.assetCounts.voice} · Ảnh {preview.impact.existing.assetCounts.image} · Video {preview.impact.existing.assetCounts.video}</p>
        <p>{preview.impact.note}</p>
      </aside>}
    </div><aside className="video-config-history"><h3>📜 Lịch sử cấu hình</h3><p>Chỉ đọc · Không tự khôi phục hoặc ghi đè</p>
      {history.map(r=><div key={r.version} className="video-config-revision"><b>v{r.version}</b> · {new Date(r.createdAt).toLocaleString('vi-VN')}<small>{r.impact.changedPaths.join(', ')||'Từ preset kênh'}</small></div>)}
    </aside></div>
  </section>;
}
