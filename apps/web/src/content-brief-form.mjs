/** R1-01 pure UI helpers: safe preview/limits only; backend remains authoritative. */
export const briefMax={topic:500,idea:10000,sourceText:100000,freePrompt:10000};
export function estimateDraft(draft){
  const {mode,wpm,wordCount,durationMinutes,chapterTargetWords}=draft.target;
  const safeWpm=Number(wpm)||145,safeWords=mode==='words'?Number(wordCount):Number(durationMinutes)*safeWpm;
  const targetWords=Math.max(0,Math.round(safeWords));
  return {targetWords,estimatedMinutes:Math.round(targetWords/safeWpm*10)/10,
    chapterCount:Math.ceil(targetWords/(Number(chapterTargetWords)||1100)),isEstimate:true};
}
export function previewBrief(draft,inherited){
  // A display-only human-readable brief; never treated as trusted system role,
  // and never includes API keys, hidden system prompts or runtime secrets.
  const style={...inherited,...draft.styleOverrides};
  return [['Chủ đề',draft.topic],['Ý tưởng',draft.idea],['Tài liệu tham khảo',draft.sourceText],
    ['Văn phong',style.style],['Giọng điệu',style.tone],['Đối tượng',style.audience],
    ['Ngôn ngữ',style.language],['Yêu cầu bổ sung',draft.freePrompt]]
    .filter(([,v])=>typeof v==='string'&&v.trim())
    .map(([title,value])=>`${title}: ${value.trim()}`).join('\n\n');
}
export function draftErrors(draft){
  const errors=[];
  if(!['topic','idea','sourceText'].some(name=>draft[name]?.trim()))errors.push('Vui lòng nhập chủ đề, ý tưởng hoặc tài liệu tham khảo.');
  if(!draft.modelIds?.length)errors.push('Chọn ít nhất một model LLM trước khi tạo nội dung.');
  if(draft.modelIds?.length>3)errors.push('Chỉ được chọn tối đa 3 model.');
  const t=draft.target??{};
  if(!Number.isInteger(Number(t.wpm))||Number(t.wpm)<100||Number(t.wpm)>200)errors.push('Tốc độ đọc từ 100 đến 200 từ/phút.');
  if(t.mode==='duration'&&(Number(t.durationMinutes)<1||Number(t.durationMinutes)>120))errors.push('Thời lượng từ 1–120 phút.');
  if(t.mode==='words'&&(Number(t.wordCount)<200||Number(t.wordCount)>20000))errors.push('Số từ từ 200–20.000.');
  return errors;
}
