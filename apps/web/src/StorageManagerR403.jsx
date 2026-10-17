/** R4-03: conservative, manually confirmed storage quarantine UI. */
import React,{useEffect,useState} from 'react';
import {api} from './api.js';
const mb=b=>(b/1048576).toFixed(1)+' MiB';
export function StorageManagerR403(){
 const [state,setState]=useState(null),[selected,setSelected]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 async function refresh(){setBusy(true);try{const p=await api('/system/storage/preview');setState(p);setSelected([]);setError('');}catch(e){setError(e.code??e.message)}finally{setBusy(false)}}
 useEffect(()=>{void refresh()},[]);
 const quarantine=async()=>{
  if(!selected.length||!state||!window.confirm(`Chuyển ${selected.length} thư mục tạm cũ vào cách ly? Không xóa ảnh, voice, video hoặc cache.`))return;
  setBusy(true);try{const r=await api('/system/storage/quarantine',{method:'POST',body:{ids:selected,expectedDigest:state.digest,confirmation:'QUARANTINE_STAGING'}});setNote(`Đã cách ly ${r.count} thư mục; không xóa vĩnh viễn.`);await refresh();}catch(e){setError(e.code??e.message);await refresh();}finally{setBusy(false)}
 };
 return <section className="frame" aria-label="Quản lý dung lượng"><header className="frame-title"><div><h3>Dung lượng & bản tạm</h3><small>Chỉ cách ly thư mục render tạm ≥7 ngày; không xóa tài nguyên đang dùng.</small></div><button className="btn secondary" disabled={busy} onClick={refresh}>↻ Quét lại</button></header>
 {error&&<p role="alert" className="error">{error}</p>}{note&&<p className="info">{note}</p>}
 {state&&<><p>Asset: {state.inventory.map(x=>`${x.kind} ${x.count} (${mb(x.bytes)})`).join(' · ')||'0'} · Cache render: {mb(state.segmentCache.bytes)} · Bản tạm cũ: {mb(state.stagedBytes)}</p>
 {state.runningJobsBlockQuarantine&&<p className="warn">Có job đang chạy: tạm khóa cách ly.</p>}
 {(state.candidates??[]).slice(0,80).map(x=><label key={x.id} style={{display:'block',padding:6}}><input type="checkbox" disabled={!x.eligible||busy} checked={selected.includes(x.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,x.id]:v.filter(a=>a!==x.id))}/> Video {x.videoId.slice(0,12)} · {mb(x.bytes)} · {new Date(x.modifiedAt).toLocaleDateString('vi-VN')}</label>)}
 <button className="btn secondary" disabled={busy||!selected.length||state.runningJobsBlockQuarantine} onClick={quarantine}>Cách ly {selected.length} bản tạm đã chọn</button><small>Không thực hiện xóa vĩnh viễn. Có thể khôi phục thủ công từ thư mục cách ly riêng tư.</small></>}
 </section>;
}
