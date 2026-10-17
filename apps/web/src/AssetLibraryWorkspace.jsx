/** R2-09: video-scoped asset inspection, selective regeneration plan, and
 * explicit image revision restore. Browsing never generates media or spends. */
import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {assetCanRestore,assetHealthLabel,assetPlanLabel,bytesLabel} from './asset-library-view.mjs';
const KIND=[['all','Tất cả'],['image','Hình ảnh'],['voice','Giọng đọc'],['video','Video']];
export function AssetLibraryWorkspace({video}){
  const [kind,setKind]=useState('all'),[items,setItems]=useState([]),[cursor,setCursor]=useState(null),[plan,setPlan]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const load=async(next=null,append=false)=>{
    const qs=new URLSearchParams({kind,limit:'20'});if(next)qs.set('cursor',next);
    const response=await api(`/videos/${video.id}/assets/library?${qs}`);
    setItems(old=>append?[...old,...response.items]:response.items);setCursor(response.nextCursor);
  };
  useEffect(()=>{let live=true;setItems([]);setCursor(null);setPlan(null);setError('');
    const qs=new URLSearchParams({kind,limit:'20'});
    Promise.all([api(`/videos/${video.id}/assets/library?${qs}`),api(`/videos/${video.id}/assets/recompute-plan`)]).then(([a,p])=>{
      if(live){setItems(a.items);setCursor(a.nextCursor);setPlan(p);}
    }).catch(e=>{if(live)setError(e.code??e.message)});
    return()=>{live=false};
  },[video.id,kind]);
  const run=async fn=>{setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError(e.code??e.message)}finally{setBusy(false)}};
  const refresh=()=>run(async()=>{await load();setPlan(await api(`/videos/${video.id}/assets/recompute-plan`))});
  const restore=asset=>run(async()=>{
    // Read the CURRENT optimistic rowVersion; the server guards simultaneous
    // edits, intent changes and invalid/missing asset revisions.
    const scenes=await api(`/videos/${video.id}/scenes`);
    const scene=(scenes.items??[]).find(x=>x.id===asset.sceneId);
    if(!scene)throw Error('SCENE_NOT_FOUND');
    await api(`/scenes/${asset.sceneId}/${asset.kind}/select`,{method:'POST',body:{assetId:asset.id,expectedRowVersion:scene.rowVersion}});
    await load();setPlan(await api(`/videos/${video.id}/assets/recompute-plan`));
    setNotice('Đã khôi phục phiên bản được kiểm chứng. Không gọi AI.');
  });
  const s=plan?.summary;
  return <section className="frame"><header className="frame-title"><div><h2>④ Thư viện tài nguyên</h2><p>Xem file, phiên bản, sức khỏe và kế hoạch tái sử dụng theo video. Không gọi AI khi mở trang.</p></div>
    <button className="btn secondary" disabled={busy} onClick={refresh}>↻ Kiểm tra lại</button></header>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="info">{notice}</p>}
    {s&&<div className="info"><strong>Kế hoạch xử lý lại (chỉ xem)</strong><p>
      Voice: {s.reuseVoice} tái sử dụng · {s.regenerateVoice} cần tạo lại · {s.missingVoice} chưa tạo.<br/>
      Hình: {s.reuseVisual} tái sử dụng · {s.manualPreserved} giữ ảnh thủ công · {s.regenerateVisual} cần tạo lại · {s.missingVisual} chưa tạo.
      </p><small>Đây là bản đánh giá, KHÔNG xếp job. Dùng tính năng DAG để xem trước và xác nhận xử lý.</small></div>}
    <label>Loại tài nguyên <select value={kind} onChange={e=>setKind(e.target.value)}>{KIND.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
    {!items.length&&<p className="muted">Không có phiên bản tài nguyên phù hợp.</p>}
    <div className="scene-list">{items.map(a=><article className="scene-card" key={a.id}>
      <div className="scene-card-head"><strong>Scene #{a.sceneIndex+1} · {({voice:'🎙 Voice',image:'🖼 Hình ảnh',video:'🎞 Video'})[a.kind]}</strong><span>{a.selected?'★ Đang chọn':'Phiên bản cũ'}</span></div>
      <p>{a.source} · {bytesLabel(a.bytes)} · {new Date(a.createdAt).toLocaleString('vi-VN')}</p>
      <p className={a.health==='healthy'?'info':'warn'}>{assetHealthLabel[a.health]??a.health} · {a.state} · SHA-256 {a.sha256.slice(0,12)}…</p>
      <div className="toolbar"><button className="btn secondary" disabled={busy||!(a.kind==='voice'?a.health==='healthy'&&a.state==='committed'&&!a.selected:assetCanRestore(a))} onClick={()=>restore(a)}>Khôi phục {a.kind==='voice'?'voice':'ảnh'}</button></div>
    </article>)}</div>
    {cursor&&<button className="btn secondary" disabled={busy} onClick={()=>run(()=>load(cursor,true))}>Xem thêm 20 phiên bản ↓</button>}
    <p className="muted">Không xóa hoặc dọn cache tự động. Chỉ có thể khôi phục phiên bản khỏe mạnh; voice cũ phải khớp nội dung và cấu hình hiện tại.</p>
  </section>;
}
