import React,{useEffect,useState} from 'react';
import {useStudio} from './store.js';
import {videoStatuses,videoLabels,videoStatusLabel,videoProgressLabel,videoDurationLabel,validateVideoForm} from './video-library.mjs';

const Button=({children,onClick,secondary=false,disabled=false,danger=false,type='button'})=><button
  type={type} className={`btn ${secondary?'secondary':''} ${danger?'danger':''}`} disabled={disabled} onClick={onClick}>{children}</button>;
const asError=e=>e?.code==='VERSION_CONFLICT'?'Dữ liệu đã thay đổi. Vui lòng tải lại.':(e?.code??e?.message??'Không thể thực hiện thao tác.');
const displayDate=millis=>new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short'}).format(new Date(millis));

/** One channel owns this library. All actions go through scoped HTTP operations;
 * switching channels invalidates the list and cursor in the Zustand store. */
export function VideoWorkspace(){
  const channel=useStudio(s=>s.currentChannel),videos=useStudio(s=>s.videos),busy=useStudio(s=>s.videosLoading),error=useStudio(s=>s.videosError);
  const cursor=useStudio(s=>s.videoNextCursor),list=useStudio(s=>s.loadVideoPage),more=useStudio(s=>s.moreVideos);
  const add=useStudio(s=>s.addVideo),resume=useStudio(s=>s.chooseVideo),rename=useStudio(s=>s.renameVideo),clone=useStudio(s=>s.cloneVideo),del=useStudio(s=>s.deleteVideo),restore=useStudio(s=>s.restoreVideo);
  const [search,setSearch]=useState(''),[status,setStatus]=useState('all'),[deleted,setDeleted]=useState(false);
  const [dialog,setDialog]=useState(null),[title,setTitle]=useState(''),[brief,setBrief]=useState(''),[minutes,setMinutes]=useState(35),[formError,setFormError]=useState(''),[saving,setSaving]=useState(false);
  const editable=channel?.status==='active'&&channel?.deletedAt===null;

  useEffect(()=>setDialog(null),[channel?.id]);
  // Debounce reduces SQLite work while typing. Request sequence guards in the
  // store prevent older network responses from overwriting the newer filter.
  useEffect(()=>{if(!channel)return;const timer=setTimeout(()=>list({search,status,deleted}).catch(()=>{}),250);return()=>clearTimeout(timer)},[channel?.id,search,status,deleted,list]);
  function start(action,video=null){setDialog({action,video,key:globalThis.crypto?.randomUUID?.()??`key_${Date.now()}_session`});setTitle(action==='rename'?video.title:action==='clone'?`${video.title.slice(0,190)} (copy)`: '');setBrief('');setMinutes(channel?.preset?.content?.targetMinutes??35);setFormError('');}
  async function submit(e){e.preventDefault();if(!dialog)return;
    const {action,video,key}=dialog;
    if(['create','clone','rename'].includes(action)){
      const error=validateVideoForm({title,brief,targetMinutes:action==='create'?Number(minutes):undefined});
      if(error){setFormError(error);return;}
    }
    setSaving(true);setFormError('');
    try{
      if(action==='create')await add({title:title.trim(),brief,targetMinutes:Number(minutes),idempotencyKey:key});
      if(action==='clone')await clone(video,{title:title.trim(),idempotencyKey:key});
      if(action==='rename')await rename(video,{title:title.trim()});
      if(action==='delete')await del(video);
      if(action==='restore')await restore(video);
      setDialog(null);
      // Refresh scoped list rather than optimistically guessing record versions.
      if(action!=='create')await list({search,status,deleted});
    }catch(e){setFormError(asError(e));}
    finally{setSaving(false);}
  }
  if(!channel)return null;
  return <section className="frame video-library" aria-label="Quản lý video của kênh">
    <header className="frame-title"><div><h2>Video · {channel.name}</h2><p>Quản lý các video thuộc kênh, tiếp tục sản xuất từ bước đang làm.</p></div>
      <Button disabled={!editable} onClick={()=>start('create')}>＋ Video mới</Button></header>
    {!editable&&<div className="warn">Kênh đang lưu trữ hoặc đã xóa. Khôi phục kênh để tạo video mới.</div>}
    <div className="video-toolbar">
      <label>Tìm theo tên hoặc ý tưởng<input placeholder="Tìm kiếm video..." value={search} maxLength={160} onChange={e=>setSearch(e.target.value)}/></label>
      <label>Trạng thái<select value={status} onChange={e=>setStatus(e.target.value)}>{videoStatuses.map(s=><option key={s} value={s}>{s==='all'?'Tất cả':videoLabels[s]}</option>)}</select></label>
      <label>Thư viện<select value={deleted?'deleted':'active'} onChange={e=>setDeleted(e.target.value==='deleted')}><option value="active">Đang sử dụng</option><option value="deleted">Thùng rác</option></select></label>
      <Button secondary disabled={busy} onClick={()=>list({search,status,deleted})}>↻ Làm mới</Button>
    </div>
    {error&&<div className="error" role="alert">{asError(error)} <button onClick={()=>list({search,status,deleted})}>Thử lại</button></div>}
    <div className="video-list" aria-live="polite" aria-busy={busy}>
      {videos.map(video=><article key={video.id} className="video-library-card">
        <div className="video-library-thumb" aria-hidden="true">▶</div>
        <div className="video-library-main"><h3>{video.title}</h3><p>{video.brief?.slice(0,180)||'Chưa có mô tả'}</p>
          <div className="video-library-meta"><span>◷ {videoDurationLabel(video)}</span><span>☷ {video.sceneCount??0} scene</span><span>Preset v{video.presetSourceVersion}</span><span>{displayDate(video.updatedAt)}</span></div>
          <small>{videoProgressLabel(video)}</small></div>
        <div className="video-library-operations"><span className={`badge ${video.status}`}>{videoStatusLabel(video)}</span>
          {deleted?<Button secondary onClick={()=>start('restore',video)}>Khôi phục</Button>:<>
            <Button onClick={()=>resume(video).catch(e=>alert(asError(e)))}>Tiếp tục →</Button>
            <div className="video-library-secondary"><button onClick={()=>start('rename',video)}>Đổi tên</button><button disabled={!editable} onClick={()=>start('clone',video)}>Nhân bản</button><button className="danger-link" onClick={()=>start('delete',video)}>Xóa</button></div>
          </>}</div></article>)}
      {!videos.length&&!busy&&!error&&<div className="video-library-empty"><span>▣</span><h3>{deleted?'Thùng rác trống':search||status!=='all'?'Không tìm thấy video':'Chưa có video'}</h3><p>{deleted?'Video đã xóa mềm sẽ xuất hiện tại đây.':'Tạo một video mới để bắt đầu sản xuất nội dung.'}</p>{!deleted&&!search&&status==='all'&&editable&&<Button onClick={()=>start('create')}>＋ Tạo video đầu tiên</Button>}</div>}
    </div>
    <div className="video-library-paging">{busy&&<span>Đang tải danh sách…</span>}{cursor&&<Button secondary disabled={busy} onClick={()=>more().catch(()=>{})}>Tải thêm 20 video ↓</Button>}</div>
    {dialog&&<div className="modal-back" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setDialog(null)}}><form className="modal video-library-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="video-dialog-heading">
      <h2 id="video-dialog-heading">{({create:'Tạo video mới',rename:'Đổi tên video',clone:'Nhân bản video',delete:'Xóa video',restore:'Khôi phục video'})[dialog.action]}</h2>
      {['create','clone','rename'].includes(dialog.action)&&<label>Tên video<input autoFocus required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>}
      {dialog.action==='create'&&<><label>Chủ đề / ý tưởng<textarea maxLength={20000} value={brief} onChange={e=>setBrief(e.target.value)}/></label><label>Thời lượng mục tiêu (phút)<input type="number" min="1" max="120" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label><p className="muted">Kế thừa preset hiện tại của kênh; không tự gọi AI hoặc khởi chạy job.</p></>}
      {dialog.action==='clone'&&<p>Chỉ sao chép nội dung chuẩn và cấu hình. Không sao chép media, job hoặc lịch sử phiên bản.</p>}
      {dialog.action==='delete'&&<p>Xóa mềm “{dialog.video.title}”? File và nội dung vẫn được giữ để có thể khôi phục. Video có job đang chạy sẽ không được xóa.</p>}
      {dialog.action==='restore'&&<p>Khôi phục “{dialog.video.title}” về danh sách đang sử dụng?</p>}
      {formError&&<div className="error" role="alert">{formError}</div>}
      <div className="actions"><Button secondary disabled={saving} onClick={()=>setDialog(null)}>Hủy</Button><Button type="submit" danger={dialog.action==='delete'} disabled={saving}>{saving?'Đang lưu…':'Xác nhận'}</Button></div>
    </form></div>}
  </section>;
}
