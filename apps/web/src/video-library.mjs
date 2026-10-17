/** R0-12 view mappings: never invent numeric progress from a workflow status. */
export const videoLabels={
  draft:'Nháp',content_ready:'Đã chốt nội dung',scenes_ready:'Đã tách scene',
  assets_processing:'Đang tạo tài nguyên',editing:'Đang chỉnh sửa',
  rendering:'Đang render',rendered:'Đã xuất video',failed:'Có lỗi'
};
export const videoStatuses=['all',...Object.keys(videoLabels)];
export const libraryPageSize=20;
export const formatSeconds=sec=>sec==null?'Chưa xác định':`${Math.floor(sec/60)} phút ${sec%60?`${sec%60} giây`:''}`.trim();
export function videoStatusLabel(video){return video.deletedAt!=null?'Đã xóa':(videoLabels[video.status]??'Không rõ trạng thái');}
export function videoProgressLabel(video){
  return typeof video.progressPercent==='number'&&video.progressSource!=='unknown'
    ?`${Math.round(video.progressPercent)}% · ${video.progressSource}`:'Chưa có tiến độ đo thực tế';
}
export function videoDurationLabel(video){
  return video.actualDurationSec==null?`Mục tiêu: ${formatSeconds(video.targetDurationSec)}`
    :`Thực tế: ${formatSeconds(video.actualDurationSec)}`;
}
export function normalizeVideoFilter({search='',status='all',deleted=false}={}){
  return {search:search.trim().slice(0,160),status:videoStatuses.includes(status)?status:'all',deleted:deleted===true};
}
export function videoListQuery({search='',status='all',deleted=false,cursor}={}){
  const filter=normalizeVideoFilter({search,status,deleted});
  const params=new URLSearchParams({limit:String(libraryPageSize),status:filter.status,deleted:String(filter.deleted)});
  if(filter.search)params.set('search',filter.search);
  if(cursor)params.set('cursor',cursor);
  return params.toString();
}
export function validateVideoForm({title,brief='',targetMinutes}={}){
  if(typeof title!=='string'||!title.trim()||title.trim().length>200)return 'Nhập tiêu đề từ 1–200 ký tự.';
  if(typeof brief!=='string'||brief.length>20000)return 'Nội dung ý tưởng không được vượt quá 20.000 ký tự.';
  if(targetMinutes!==undefined&&(!Number.isInteger(targetMinutes)||targetMinutes<1||targetMinutes>120))return 'Thời lượng phải từ 1 đến 120 phút.';
  return '';
}
