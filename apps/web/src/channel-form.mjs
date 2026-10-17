/**
 * Pure channel form utilities used by React and dependency-free Node tests.
 * They preview prompts locally; they NEVER send channel prompts to a provider.
 * The backend remains authoritative for validation, versioning and cost gates.
 */
export function channelDraft(channel){
  return {name:channel.name,description:channel.description,preset:structuredClone(channel.preset)};
}
export function validateChannelDraft(draft){
  if(!draft?.name?.trim()||draft.name.trim().length>120) return 'Tên kênh phải từ 1 đến 120 ký tự.';
  if((draft.description??'').length>2000)return 'Mô tả tối đa 2000 ký tự.';
  const p=draft.preset;
  if(!p?.content||!p?.voice||!p?.media||!p?.render||!p?.models)return 'Thiếu thông tin cấu hình.';
  if(!Number.isInteger(Number(p.content.targetMinutes))||p.content.targetMinutes<1||p.content.targetMinutes>240)
    return 'Thời lượng phải từ 1 đến 240 phút.';
  if(!Number.isInteger(Number(p.media.sceneSeconds))||p.media.sceneSeconds<2||p.media.sceneSeconds>120)
    return 'Scene từ 2 đến 120 giây.';
  if(p.voice.speed<0.5||p.voice.speed>2)return 'Tốc độ giọng đọc từ 0.5 đến 2.';
  if(p.models.paidEnabled||p.models.remoteEnabled)return 'Không thể tự bật tài khoản trả phí hoặc API từ xa trong preset.';
  if((p.content.basePrompt??'').length>4000)return 'Prompt nền tối đa 4000 ký tự.';
  return null;
}
/** Prompt composer is deterministic; editing the preview never spends AI quota. */
export function previewChannelPrompt(content){
  const lines=[
    `Ngôn ngữ: ${content.language||'vi'}`,
    `Đối tượng: ${content.audience||'khán giả phổ thông'}`,
    `Chủ đề: ${content.topic||'theo yêu cầu video'}`,
    `Phong cách: ${content.style||'rõ ràng'}`,
    `Giọng điệu: ${content.tone||'thân thiện'}`,
    `Xưng hô: ${content.addressStyle||'tự nhiên'}`,
    `Thời lượng mục tiêu: ${content.targetMinutes} phút`,
  ];
  if(content.preferredTerms)lines.push(`Ưu tiên: ${content.preferredTerms}`);
  if(content.avoidTerms)lines.push(`Tránh: ${content.avoidTerms}`);
  if(content.basePrompt)lines.push(`Hướng dẫn kênh:\n${content.basePrompt}`);
  if(content.extraPrompt)lines.push(`Ghi chú thêm:\n${content.extraPrompt}`);
  return lines.join('\n');
}
export function filterChannels(channels,{search='',status='active'}={}){
  const term=search.normalize('NFKC').trim().toLocaleLowerCase('vi-VN');
  return channels.filter(c=>{
    const current=c.deletedAt!==null?'deleted':c.status;
    if(status!=='all'&&current!==status)return false;
    const haystack=`${c.name} ${c.description}`.normalize('NFKC').toLocaleLowerCase('vi-VN');
    return !term||haystack.includes(term);
  });
}
