/**
 * R0-04 authenticated local system diagnostics. No secrets or raw shell output
 * are rendered. Manual refresh bypasses the backend 30-second cache; ordinary
 * page navigation does not rerun expensive subprocesses each time.
 */
import React,{useEffect} from 'react';
import {useStudio} from './store.js';
import {shortGiB,stateDescription,viewCheck} from './diagnostics-view.mjs';

const icon={ready:'✓',warning:'!',missing:'×',unconfigured:'◌',unknown:'?'};
const section=[
  {title:'Thiết bị & lưu trữ',ids:['cpu','ram','disk','sqlite','gpu']},
  {title:'Media & Render',ids:['ffmpeg','ffprobe']},
  {title:'Provider & nền tảng',ids:['windows','comfyui']},
];
function Metric({label,value,description}){return <div className="diag-kpi"><small>{label}</small><strong>{value}</strong><span>{description}</span></div>}
function Card({check}){
  const item=viewCheck(check),metric=check.metrics??{};
  const fragments={
    cpu:metric.cores!=null?`${metric.cores} luồng`:null,
    ram:`${shortGiB(metric.freeGiB)} trống / ${shortGiB(metric.totalGiB)} tổng`,
    disk:`${shortGiB(metric.freeGiB)} trống / ${shortGiB(metric.totalGiB)} tổng`,
    gpu:metric.nvidiaCount?`${metric.nvidiaCount} GPU · ${metric.memoryMiB??'?'} MiB VRAM`:null,
    ffmpeg:metric.h264===true&&metric.aac===true?'H.264 + AAC':null,
  };
  return <article className={`diag-card diag-${item.state}`}>
    <div className="diag-card-head"><h4>{item.title}</h4><span className={`diag-pill ${item.state}`}><i>{icon[item.state]}</i> {stateDescription(item.state)}</span></div>
    <p>{item.description}</p><small className="diag-caption">{fragments[check.id]||item.subtitle}</small>
    {check.id.startsWith('provider:')&&<small className="diag-caption">{metric.location==='remote'?'Nguồn trực tuyến – chỉ dùng khi đã cho phép':'Nguồn chạy local'} · {metric.kind||'AI'} · {metric.inferenceVerified?'Đã xác minh':'Chưa chạy thử sinh media'}</small>}
  </article>;
}
export function DiagnosticsDashboard(){
  const report=useStudio(s=>s.systemDiagnostics),loading=useStudio(s=>s.diagnosticsLoading);
  const error=useStudio(s=>s.diagnosticsError),load=useStudio(s=>s.loadDiagnostics);
  useEffect(()=>{load().catch(()=>{})},[load]);
  const checks=report?.checks??[];
  const known=new Set(section.flatMap(s=>s.ids));
  const groups=[...section,{title:'AI đã đăng ký',ids:checks.map(c=>c.id).filter(id=>!known.has(id))}];
  return <section className="diag-page" aria-labelledby="diag-heading">
    <div className="diag-hero"><div><span className="diag-eyebrow">SYSTEM HEALTH · R0-04</span><h2 id="diag-heading">Tình trạng hệ thống</h2><p>Kiểm tra môi trường làm video local, không gửi API key hay dữ liệu dự án ra ngoài.</p></div>
      <button className="btn" onClick={()=>load(true).catch(()=>{})} disabled={loading} aria-busy={loading}>{loading?'Đang kiểm tra…':'↻ Kiểm tra lại'}</button></div>
    {error&&<div role="alert" className="error">Không tải được kết quả: {error}. Vui lòng kiểm tra kết nối backend local.</div>}
    {!report&&loading&&<div className="diag-loading" role="status">Đang kiểm tra FFmpeg, SQLite, GPU và dung lượng ổ đĩa…</div>}
    {report&&<>
      <div className="diag-overview" role="status">
        <Metric label="Chỉnh sửa kênh & dự án" value={report.readiness?.editing?'Sẵn sàng':'Cần xử lý'} description="Kết nối SQLite"/>
        <Metric label="Render H.264/AAC" value={report.readiness?.render?'Có thể thử':'Chưa sẵn sàng'} description="Chưa chứng minh render 35 phút"/>
        <Metric label="AI Video local" value="Chưa xác minh" description="Cần workflow, model & GPU thực"/>
        <Metric label="Môi trường" value={report.environment?.platform==='win32'?'Windows':report.environment?.platform||'—'} description="Windows target: đang chờ nghiệm thu"/>
      </div>
      <p className="diag-stamp">Lần kiểm tra: {new Date(report.collectedAt).toLocaleString('vi-VN')} · Cache {Math.round(report.cacheTtlMs/1000)} giây · {checks.filter(c=>c.state==='ready').length}/{checks.length} mục sẵn sàng</p>
      {groups.map(group=>{const items=checks.filter(c=>group.ids.includes(c.id));return items.length?<div key={group.title} className="diag-group"><h3>{group.title}</h3><div className="diag-grid">{items.map(c=><Card key={c.id} check={c}/>)}</div></div>:null})}
      <div className="diag-advice"><strong>Những điều cần biết trước khi tạo video dài 30–40 phút</strong><p>FFmpeg và SQLite sẵn sàng không đồng nghĩa đã nghiệm thu hiệu năng 1080p hoặc khả năng tạo video bằng AI. Các kiểm thử thực tế trên Windows/GPU đang được hoãn theo quyết định PO.</p><p>Nhấn “Kiểm tra lại” chỉ chạy các kiểm tra local đã giới hạn thời gian. Không tải model, không sinh hình/clip và không sử dụng dịch vụ AI trả phí.</p></div>
    </>}
  </section>;
}
