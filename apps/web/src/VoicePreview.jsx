/**
 * R0-10 / EP01: Short real-audio preview on the channel Voice tab.
 * No synthetic sample is disguised as Edge output. Preview content and audio
 * stay in memory only; Blob URLs are revoked on every setting change/unmount.
 */
import React,{useEffect,useRef,useState} from 'react';
import {previewVoice} from './api.js';
import {validatePreviewDraft,voicePreviewError} from './voice-preview-form.mjs';

const DEFAULT_SAMPLE='Xin chào! Chào mừng bạn đến với kênh của chúng tôi. Hôm nay, chúng ta sẽ khám phá một chủ đề rất thú vị.';

export function VoicePreview({channelId,provider,voice,speed}){
  const [sample,setSample]=useState(DEFAULT_SAMPLE),[consent,setConsent]=useState(false);
  const [url,setUrl]=useState(''),[status,setStatus]=useState('idle'),[error,setError]=useState('');
  const current=useRef({abort:null,url:''});
  const dispose=()=>{
    current.current.abort?.abort();current.current.abort=null;
    if(current.current.url){URL.revokeObjectURL(current.current.url);current.current.url='';}
    setUrl('');
  };
  // Changing provider, voice or speed invalidates preview even if the channel
  // preset has not yet been saved. Never play stale audio for new settings.
  useEffect(()=>{
    dispose();setStatus('idle');setError('');setConsent(false);
    return ()=>dispose();
  },[channelId,provider,voice,speed]);
  const updateText=value=>{dispose();setSample(value);setStatus('idle');setError('')};
  async function play(){
    dispose();setError('');
    const input={provider,voice,text:sample,speed:Number(speed),remoteConsent:provider==='edge'&&consent};
    const problem=validatePreviewDraft(input);
    if(problem){setError(voicePreviewError(problem));setStatus('error');return;}
    const abort=new AbortController();current.current.abort=abort;setStatus('loading');
    try{
      const blob=await previewVoice(channelId,input,{signal:abort.signal});
      if(abort.signal.aborted)return;
      const next=URL.createObjectURL(blob);
      current.current.url=next;setUrl(next);setStatus('ready');
    }catch(ex){if(!abort.signal.aborted){setError(voicePreviewError(ex?.code));setStatus('error');}}
    finally{if(current.current.abort===abort)current.current.abort=null;}
  }
  const unsupported=provider==='espeak';
  return <section className="voice-preview-panel" aria-label="Nghe thử giọng đọc thật">
    <h3>🎧 Nghe thử giọng đọc</h3>
    <p className="muted">Tạo bản nghe thử ngắn từ cấu hình đang chọn, không cần lưu preset và không tạo tài nguyên scene.</p>
    <label className="voice-preview-label">Văn bản nghe thử ({sample.length}/350)
      <textarea value={sample} maxLength={350} onChange={e=>updateText(e.target.value)} rows={3} aria-label="Văn bản nghe thử"/>
    </label>
    {provider==='edge'&&<label className="voice-preview-consent"><input type="checkbox" checked={consent} onChange={e=>{dispose();setConsent(e.target.checked);setStatus('idle')}}/>
      Tôi đồng ý gửi đoạn văn bản nghe thử tới dịch vụ Microsoft Edge TTS qua Internet (không có API key; khả năng cung cấp có thể thay đổi).
    </label>}
    {provider==='piper'||provider==='vieneu'?<div className="muted">Endpoint local phải được cấu hình trên backend. Nếu chưa cấu hình, hệ thống sẽ báo rõ lỗi; không tự chuyển sang dịch vụ khác.</div>:null}
    {unsupported&&<p className="warn">eSpeak chỉ dùng để kiểm thử offline; chưa bật trong chức năng nghe thử này để tránh nhầm với giọng Neural.</p>}
    <div className="voice-preview-actions">
      <button className="btn" type="button" disabled={status==='loading'||unsupported||provider==='edge'&&!consent||!sample.trim()} onClick={play}>
        {status==='loading'?'Đang tạo giọng…':'▶ Tạo giọng & nghe thử'}
      </button>
      {status==='loading'&&<button className="btn secondary" type="button" onClick={()=>{dispose();setStatus('idle')}}>Hủy</button>}
    </div>
    {status==='loading'&&<p role="status">Đang kết nối provider để tạo audio thật…</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {url&&status==='ready'&&<div className="voice-preview-player"><audio src={url} controls aria-label="Nghe thử giọng đọc" preload="metadata"/><p className="muted">Đây là audio do provider trả về, chỉ lưu tạm trong trình duyệt.</p></div>}
  </section>;
}
