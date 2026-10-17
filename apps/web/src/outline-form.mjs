/** Pure CT02 UI helpers: math and immutable reorder, shared with tests. */
export function outlineStats(chapters=[],wpm=145,targetWords=0){
  const words=chapters.reduce((sum,c)=>sum+(Number(c.targetWords)||0),0);
  return {words,minutes:Number((words/wpm).toFixed(1)),delta:words-targetWords,count:chapters.length};
}
export function moveChapter(chapters,from,to){
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=chapters.length||to>=chapters.length)return chapters;
  const next=[...chapters];next.splice(to,0,...next.splice(from,1));return next;
}
export function outlineClientErrors(chapters){
  if(!chapters.length)return ['Thêm ít nhất một chương.'];
  if(chapters.length>50)return ['Tối đa 50 chương.'];
  const ids=new Set(chapters.map(c=>c.id));
  if(ids.size!==chapters.length||chapters.some(c=>!c.title?.trim()||!c.objective?.trim()||
    !Number.isInteger(Number(c.targetWords))||Number(c.targetWords)<50||Number(c.targetWords)>5000))
    return ['Mỗi chương cần tiêu đề, mục tiêu và 50–5.000 từ.'];
  return [];
}
