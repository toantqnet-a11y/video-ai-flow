/**
 * Private channel-avatar widget. We fetch the image through the paired SDK,
 * display only a revocable object URL, and keep base64 confined to upload HTTP.
 * Avatar saves are independent of draft preset edits; a refreshed rowVersion
 * prevents the next channel save from silently overwriting a concurrent edit.
 */
import React,{useEffect,useState} from 'react';
import {api,getChannelAvatar} from './api.js';
import {useStudio} from './store.js';

export function ChannelAvatarImage({channel,className='channel-avatar-thumb'}){
  const [url,setUrl]=useState('');
  useEffect(()=>{
    let alive=true;let objectUrl='';const controller=new AbortController();
    if(channel?.avatarId){
      getChannelAvatar(channel.id,{signal:controller.signal}).then(blob=>{
        objectUrl=URL.createObjectURL(blob);
        if(alive)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);
      }).catch(()=>{if(alive)setUrl('')});
    }else setUrl('');
    return ()=>{alive=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[channel?.id,channel?.avatarId]);
  return url?<img className={className} src={url} alt={`Ảnh đại diện kênh ${channel.name}`}/>:<span className="channel-avatar-fallback" aria-hidden="true">◈</span>;
}

export function ChannelAvatarUpload({channel}){
  const reload=useStudio(s=>s.reloadChannel);
  const [file,setFile]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{setFile(null);setError('');setNotice('')},[channel.id]);
  async function upload(event){
    event.preventDefault();if(!file)return;
    setBusy(true);setError('');setNotice('');
    try{
      if(!['image/png','image/jpeg'].includes(file.type)||file.size>262144||file.size===0)
        throw new Error('Chỉ nhận PNG/JPEG tối đa 256 KB.');
      const encoded=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onerror=()=>reject(new Error('Không đọc được ảnh.'));
        reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);
      });
      await api(`/channels/${channel.id}/avatar`,{method:'PUT',body:{
        rowVersion:channel.rowVersion,mimeType:file.type,dataBase64:encoded
      }});
      await reload(channel.id);
      setFile(null);setNotice('Đã cập nhật ảnh đại diện.');
    }catch(e){setError(e?.code==='VERSION_CONFLICT'?'Kênh đã được sửa ở nơi khác. Tải lại kênh rồi thử lại.':e.message??'Tải ảnh thất bại.');}
    finally{setBusy(false);}
  }
  return <section className="channel-avatar-upload" aria-label="Ảnh đại diện kênh">
    <ChannelAvatarImage channel={channel} className="channel-avatar-large"/>
    <form onSubmit={upload}>
      <strong>Ảnh đại diện kênh</strong>
      <p className="muted">PNG hoặc JPEG, tối đa 256 KB, kích thước tối đa 2048×2048. Ảnh lưu riêng trên máy local.</p>
      <input aria-label="Chọn ảnh đại diện" type="file" accept="image/png,image/jpeg" disabled={busy||channel.deletedAt!==null}
        onChange={e=>{setFile(e.target.files?.[0]??null);setNotice('');setError('')}}/>
      <button className="btn secondary" type="submit" disabled={!file||busy||channel.deletedAt!==null}>{busy?'Đang lưu…':'Cập nhật ảnh'}</button>
      {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    </form>
  </section>;
}
