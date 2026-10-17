/** R1-EXT-01 — local, deterministic script skill recipes.
 * Inspired by structured skill workflows, not an import of an external
 * Superpowers package. A skill is editorial guidance, never an AI call.
 * An approved master remains the sole authority for scene narration.
 */
import {createHash} from 'node:crypto';
import {DomainError} from './domain.mjs';
import {normalizeContentBrief,estimateContent} from './content-brief.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
const hash=value=>createHash('sha256').update(value,'utf8').digest('hex');
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;

const STAGES=[
  {id:'hook',label:'Hook (3 giây đầu)',objective:'Nêu một câu hỏi hoặc chi tiết thu hút ngay từ đầu.'},
  {id:'problem',label:'Đặt vấn đề',objective:'Mô tả vấn đề và lý do khán giả nên quan tâm.'},
  {id:'explain',label:'Giải thích cơ chế',objective:'Giải thích lập luận, thông tin cốt lõi và nguyên nhân.'},
  {id:'examples',label:'Giải pháp hoặc ví dụ',objective:'Đưa ví dụ, minh họa, ứng dụng và nguồn để kiểm chứng.'},
  {id:'cta',label:'Kết luận / CTA',objective:'Tóm tắt kết luận và mời khán giả hành động phù hợp.'}
];
const definitions=[
  ['educational','Giải thích kiến thức','Rõ ràng, từng bước; thuật ngữ cần định nghĩa.',[.16,.37,.40,.07]],
  ['storytelling','Kể chuyện','Nhân vật, xung đột, diễn biến, kết thúc; không bịa sự kiện có thật.',[.20,.28,.47,.05]],
  ['analysis','Phân tích','Luận điểm, bằng chứng, phản biện, kết luận; tách nhận định với dữ kiện.',[.18,.39,.36,.07]],
  ['review','Review','Đối tượng, tiêu chí, trải nghiệm kiểm chứng, ưu nhược điểm, kết luận.',[.17,.29,.45,.09]],
  ['shorts','Video ngắn','Mở đầu ngay vào lợi ích, ngắn gọn, một thông điệp chính.',[.22,.25,.42,.11]]
];
export const SCRIPT_SKILLS=Object.freeze(definitions.map(([id,label,guidance,weights])=>Object.freeze({
  id,label,guidance,version:1,stages:STAGES.map(s=>({...s})),weights:[...weights]
})));
export function scriptSkillCatalog(){return SCRIPT_SKILLS.map(({id,label,guidance,version,stages})=>({id,label,guidance,version,stages:stages.map(s=>({...s}))}));}
export function scriptSkill(id){
  const match=SCRIPT_SKILLS.find(p=>p.id===id);
  if(!match)fail('SCRIPT_SKILL_NOT_FOUND');
  return match;
}
/** Pin an immutable brief revision and provide recommendations, NOT research or generated claims. */
export function buildScriptSkillPlan(rawBrief,skillId=rawBrief?.scriptSkillId??'educational'){
  const brief=normalizeContentBrief(rawBrief),skill=scriptSkill(skillId);
  const estimate=estimateContent(brief),hookWords=Math.min(12,Math.max(1,Math.round(brief.target.wpm*3/60)));
  const rest=estimate.targetWords-hookWords;
  const weights=skill.weights;
  const allocations=weights.slice(0,3).map(x=>Math.round(rest*x));
  allocations.push(rest-allocations.reduce((a,b)=>a+b,0));
  const all=[hookWords,...allocations];
  const steps=skill.stages.map((stage,i)=>({...stage,targetWords:all[i],
    estimatedSeconds:Number((all[i]/brief.target.wpm*60).toFixed(1)),
    evidenceRequired:i===2||i===3}));
  const sourceDigest=hash(JSON.stringify(brief));
  return {schemaVersion:1,skillId:skill.id,skillVersion:skill.version,skillLabel:skill.label,
    briefSha256:sourceDigest,estimatedTotalWords:estimate.targetWords,steps,
    research:{status:brief.sourceText?'user_source_unverified':'sources_required',
      note:'Không tự tìm nguồn; kiểm chứng dữ kiện và dẫn nguồn trước khi duyệt.'},
    reviewGates:['HOOK_REVIEW','CLAIMS_AND_SOURCES','EDITORIAL_REVIEW','AI_SCORE_OPTIONAL','MANUAL_MASTER_APPROVAL'],
    noAutomaticResearch:true,willGenerate:false,
    outputContract:{format:'json',fields:['spokenText','subtitleText','visualCue','estimatedDurationMs'],
      actualDuration:'measure_after_tts'}};
}
/** Existing R1 workers use this short instruction, without changing the wire JSON format. */
export function scriptSkillPromptGuidance(skillId,stage='outline'){
  const skill=scriptSkill(skillId);
  return `KHUÔN KỊCH BẢN: ${skill.label}. ${skill.guidance}\nKhung: ${skill.stages.map(s=>s.label).join(' → ')}. `+
    `Hook ~3 giây mở video, CTA chỉ ở cuối toàn video; không ép mọi chương thành một video ngắn. `+
    `Tài liệu nguồn có thể chưa kiểm chứng: không tự tạo trích dẫn, số liệu hoặc đường dẫn. `+
    (stage==='chapter'?'Giữ nguyên JSON {"text","summary"} theo hợp đồng R1.':'Giữ nguyên JSON dàn ý theo hợp đồng R1.');
}
/**
 * Split without rephrasing or losing even one whitespace/code-unit. Offsets
 * address the original immutable master text (UTF-16 JS indices). The stage
 * tags are position-based suggestions, not semantic classification.
 */
export function exportApprovedScript({videoId,masterRevision,scriptText,scriptSha256,skillId='educational',wpm=145}={}){
  if(typeof videoId!=='string'||!videoId||!Number.isSafeInteger(masterRevision)||masterRevision<1||
     typeof scriptText!=='string'||scriptText.length<1||scriptText.length>300000||
     !Number.isSafeInteger(wpm)||wpm<100||wpm>200)fail('SCRIPT_EXPORT_INVALID');
  const skill=scriptSkill(skillId),digest=hash(scriptText);
  if(scriptSha256!==digest)fail('SCRIPT_SOURCE_CHANGED',409);
  const stops=[...new Intl.Segmenter('vi',{granularity:'sentence'}).segment(scriptText)].map(x=>x.index+x.segment.length);
  if(!stops.length||stops.at(-1)!==scriptText.length)stops.push(scriptText.length);
  const segments=[];let start=0,wordTotal=0,stopCursor=0;
  while(start<scriptText.length){
    const limit=Math.min(scriptText.length,start+360);
    // Prefer complete sentence within the size cap. Otherwise split at a
    // whitespace boundary; never cut inside a surrogate pair when forced.
    let end;
    while(stopCursor<stops.length&&stops[stopCursor]<=limit){
      const candidate=stops[stopCursor++];if(candidate>start)end=candidate;
    }
    if(!end){
      const window=scriptText.slice(start,limit);
      const boundary=Math.max(window.lastIndexOf(' '),window.lastIndexOf('\n'));
      end=boundary>=90?start+boundary+1:limit;
      const last=scriptText.charCodeAt(end-1),next=scriptText.charCodeAt(end);
      if(last>=0xD800&&last<=0xDBFF&&next>=0xDC00&&next<=0xDFFF)end++;
    }
    const exact=scriptText.slice(start,end),subtitle=exact.trim(),words=(subtitle.match(/\S+/gu)??[]).length;
    wordTotal+=words;
    segments.push({index:segments.length,sourceStart:start,sourceEnd:end,
      spokenText:exact,subtitleText:subtitle,visualCue:'',
      estimatedDurationMs:Math.max(1,Math.round(words/wpm*60000)),
      durationEstimated:true,sourceSha256:hash(exact),suggestedStageId:'explain'});
    start=end;
    if(segments.length>2000)fail('SCRIPT_EXPORT_TOO_MANY_SEGMENTS',409);
  }
  if(segments.length){
    const first=segments[0],last=segments.at(-1);
    for(const [i,segment] of segments.entries()){
      const progress=i/(segments.length-1||1);
      segment.suggestedStageId=i===0?'hook':i===segments.length-1?'cta':
        progress<.18?'problem':progress<.57?'explain':'examples';
    }
    // Source is preserved exactly, including the last newline, if present.
    if(segments.map(s=>s.spokenText).join('')!==scriptText||last.sourceEnd!==scriptText.length||first.sourceStart!==0)
      fail('SCRIPT_SOURCE_COVERAGE_FAILED',500);
  }
  const data={schemaVersion:1,videoId,masterRevision,scriptSha256:digest,
    skillId:skill.id,skillVersion:skill.version,alignment:'estimated_only',
    stageAssignment:'position_suggested_review_required',wordCount:wordTotal,
    segments,editorialReviewRequired:true,willGenerate:false};
  return {...data,digest:hash(JSON.stringify(data))};
}
