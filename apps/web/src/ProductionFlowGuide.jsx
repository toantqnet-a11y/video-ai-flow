/** Browser-only flow guide: GET persisted approvals, never trigger inference/render. */
import React,{useEffect,useState} from 'react';
import {api} from './api.js';
import {useStudio} from './store.js';
import {flowState,productionStages} from './production-flow.mjs';
export function ProductionFlowGuide({video,tab,onNavigate,flowTarget}){
 const sceneCount=useStudio(s=>s.scenes.length);
 const [state,setState]=useState({masterApproved:null,sceneRevision:null});
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!video?.id)return;
  let current=true;setError('');setState({masterApproved:null,sceneRevision:null});
  // Master approval and saved Scene Builder revision are server-owned. Never
  // equate draft text, a local preview, or a queued render with completion.
  Promise.allSettled([
   api(`/videos/${video.id}/content/master/revisions`),
   api(`/videos/${video.id}/scenes/builder`)
  ]).then(([master,builder])=>{
   if(!current)return;
   // Builder can reject while Master has not been approved. Keep independent
   // read evidence instead of hiding a successful Master status.
   setState({masterApproved:master.status==='fulfilled'?
     master.value.state?.hasApprovedScript===true:null,
    sceneRevision:builder.status==='fulfilled'?builder.value.sceneRevision??0:null});
   if(master.status==='rejected'||builder.status==='rejected')
     setError('Một phần trạng thái chưa đọc được (có thể do chưa duyệt Bản chuẩn).');
  });
  return()=>{current=false};
 },[video?.id,video?.rowVersion,tab,sceneCount]);
 if(!video)return null;
 const stages=flowState({...state,sceneCount});
 return <nav className="production-flow" aria-label="Quy trình tạo video localhost">
  <div className="production-flow-heading"><strong>Quy trình tạo video</strong>
   <small>Content → Scene → Timeline → MP4 · Kiểm tra trạng thái từ dữ liệu đã lưu</small></div>
  <div className="production-flow-steps">{stages.map((step,index)=>{
    const active=tab===step.tab&&(tab!=='timeline'?true:(flowTarget==='render')===(step.id==='render'));
    return <button type="button" key={step.id}
      className={`production-flow-step ${active?'active':''} ${step.status==='done'?'done':''}`}
      aria-current={active?'step':undefined} onClick={()=>onNavigate(step.id)}
      title={step.hint}>
      <span className="production-flow-number">{step.status==='done'?'✓':index+1}</span>
      <span className="production-flow-text"><strong>{step.label}</strong><small>{step.hint}</small></span>
    </button>;
  })}</div>
  {error&&<small role="status" className="production-flow-error">{error} Các nút chỉ chuyển trang, không xác nhận đã hoàn thành.</small>}
 </nav>;
}
