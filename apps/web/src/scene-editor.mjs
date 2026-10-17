/**
 * R2-01 client-side draft commands. No network calls: the backend validates
 * immutable source coverage and approval again when Save is clicked.
 */
const estimatedMs=(text,wpm)=>Math.max(500,Math.min(120000,Math.round(text.trim().split(/\s+/u).filter(Boolean).length*60000/wpm)));
export function moveDraft(scenes,from,to){
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=scenes.length||to>=scenes.length)return scenes;
  const next=[...scenes], [scene]=next.splice(from,1);next.splice(to,0,scene);return next;
}
export function splitDraft(scenes,index,wpm=145){
  const s=scenes[index];if(!s)return scenes;
  // Split only at whitespace near center to preserve raw original source spans.
  // Text manually changed must first be returned to its canonical substring.
  const middle=Math.floor(s.text.length/2);
  const offsets=Array.from(s.text.matchAll(/\s+/gu),m=>m.index+m[0].length)
    .filter(n=>n>0&&n<s.text.length&&s.text.slice(0,n).trim()&&s.text.slice(n).trim());
  if(!offsets.length)return scenes;
  const cut=offsets.reduce((a,b)=>Math.abs(a-middle)<=Math.abs(b-middle)?a:b);
  const left=s.text.slice(0,cut),right=s.text.slice(cut);
  const a={...s,sourceEnd:s.sourceStart+cut,text:left,durationMs:estimatedMs(left,wpm)};
  const b={...s,sourceStart:s.sourceStart+cut,text:right,durationMs:estimatedMs(right,wpm)};
  return [...scenes.slice(0,index),a,b,...scenes.slice(index+1)];
}
export function mergeDraft(scenes,index,wpm=145){
  const a=scenes[index],b=scenes[index+1];
  if(!a||!b||a.sourceEnd!==b.sourceStart||a.sourceEnd-a.sourceStart!==a.text.length||b.sourceEnd-b.sourceStart!==b.text.length||a.text.length+b.text.length>20000)return scenes;
  const text=a.text+b.text;
  return [...scenes.slice(0,index),{...a,sourceEnd:b.sourceEnd,text,durationMs:estimatedMs(text,wpm)},...scenes.slice(index+2)];
}

/**
 * R2-02: apply read-only AI proposals to a LOCAL unsaved draft. The user still
 * needs to click Save in the Scene Builder. Never replace a custom prompt,
 * change media selection based only on an unverified model recommendation,
 * or apply a stale proposal to a moved/split scene.
 */
export function applyVisualPrompts(draft,run){
  if(!Array.isArray(draft)||run?.stale||run?.status!=='succeeded'||
     !Array.isArray(run.items)||!Array.isArray(run.sceneRefs))return {scenes:draft,applied:0,skipped:0};
  const refs=new Map(run.sceneRefs.map(s=>[s.index,s]));
  const proposed=new Map(run.items.map(s=>[s.index,s]));
  let applied=0,skipped=0;
  const scenes=draft.map((scene,index)=>{
    const suggestion=proposed.get(index),source=refs.get(index);
    if(!suggestion)return scene;
    if(!source||scene.sourceStart!==source.sourceStart||scene.sourceEnd!==source.sourceEnd||scene.text!==source.text||scene.mediaType==='import_video'||
       (scene.visualPrompt??'').trim()||!suggestion.prompt?.trim()){
      skipped++;return scene;
    }
    applied++;return {...scene,visualPrompt:suggestion.prompt};
  });
  return {scenes,applied,skipped};
}
