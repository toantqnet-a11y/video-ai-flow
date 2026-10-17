/**
 * R1-06 — Source-pinned Master Script Approval.
 *
 * WHY: model output and AI judge scores never constitute editorial approval.
 * A reviewable revision stores an exact frozen script and the selected draft
 * lineage; the explicit approval action alone updates videos.master_script.
 * Separate tables keep prior versions auditable and allow edits before publish.
 */
import {createHash} from 'node:crypto';
import {transact} from './db.mjs';
import {DomainError} from './domain.mjs';
import {ContentOutlineRepository} from './content-outline.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex');
const error=(code,status=400)=>{throw new DomainError(code,status)};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const number=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const words=text=>text.trim().split(/\s+/u).filter(Boolean).length;
const normalized=text=>text.trim().replace(/\s+/gu,' ').toLocaleLowerCase('vi');

/** Advisory warnings, never silent corrections to the author's approved text. */
export function analyzeMasterScript(script,targetWords){
  const currentWords=words(script),warnings=[];
  if(targetWords>=200&&Math.abs(currentWords-targetWords)/targetWords>.20)
    warnings.push('WORD_COUNT_OUTSIDE_TARGET');
  const paragraphs=script.split(/\n\s*\n/gu).map(normalized).filter(p=>p.length>=90);
  if(new Set(paragraphs).size!==paragraphs.length)
    warnings.push('DUPLICATE_LONG_PARAGRAPH');
  return {wordCount:currentWords,targetWords,warnings};
}

export class MasterScriptRepository {
  constructor(repo){this.repo=repo;this.db=repo.db;this.clock=repo.clock;
    this.outlines=new ContentOutlineRepository(repo);}
  video(videoId){
    const v=this.repo.getVideo(videoId);
    if(!v||v.deletedAt!==null)error('VIDEO_NOT_FOUND',404);
    return v;
  }
  state(videoId){
    const v=this.video(videoId);
    const s=this.db.prepare('SELECT * FROM content_master_state WHERE video_id=?').get(videoId);
    return {videoId,revision:s?.revision??0,approvedRevision:s?.approved_revision??null,
      currentVideoRowVersion:v.rowVersion,hasApprovedScript:!!v.masterScript};
  }
  history(videoId){
    const s=this.state(videoId);
    return {state:s,items:this.db.prepare(`SELECT r.revision,r.outline_revision,r.word_count,r.script_sha256,r.created_at,
      r.warnings_json,(a.revision IS NOT NULL) approved FROM content_master_revisions r
      LEFT JOIN content_master_approvals a ON a.video_id=r.video_id AND a.revision=r.revision
      WHERE r.video_id=? ORDER BY r.revision DESC LIMIT 100`).all(videoId).map(r=>({
        revision:r.revision,outlineRevision:r.outline_revision,wordCount:r.word_count,
        sha256:r.script_sha256,warnings:JSON.parse(r.warnings_json),approved:!!r.approved,createdAt:r.created_at}))};
  }
  revision(videoId,revision){
    this.video(videoId);
    if(!number(revision,1,2147483647))error('INVALID_MASTER_REVISION');
    const r=this.db.prepare(`SELECT r.*,a.approved_at FROM content_master_revisions r
      LEFT JOIN content_master_approvals a ON r.video_id=a.video_id AND r.revision=a.revision
      WHERE r.video_id=? AND r.revision=?`).get(videoId,revision);
    if(!r)error('MASTER_REVISION_NOT_FOUND',404);
    return {videoId,revision:r.revision,outlineRevision:r.outline_revision,
      sources:JSON.parse(r.source_json),text:r.script_text,wordCount:r.word_count,
      sha256:r.script_sha256,warnings:JSON.parse(r.warnings_json),
      approvedAt:r.approved_at??null,createdAt:r.created_at};
  }
  /**
   * Resolve exact immutable variants from the selected outline; reject drafts
   * from another video, chapter or outline revision even if UUIDs are valid.
   */
  assemble(videoId,input={}){
    this.video(videoId);
    if(!record(input)||Object.keys(input).some(k=>!['outlineRevision','selections','editedText'].includes(k))||
      !number(input.outlineRevision,0,2147483647)||!Array.isArray(input.selections))error('INVALID_MASTER_INPUT');
    // Manual imports remain supported, but they follow the SAME explicit
    // save/approval boundary; no legacy direct-publish shortcut in the UI.
    if(input.outlineRevision===0){
      if(input.selections.length||typeof input.editedText!=='string')error('INVALID_MASTER_INPUT');
      const script=input.editedText.trim();
      if(!script||script.length>300000||words(script)<25)error('INVALID_MASTER_TEXT');
      const analysis=analyzeMasterScript(script,0);
      return {videoId,outlineRevision:0,sources:[],text:script,sha256:hash(script),
        ...analysis,edited:true};
    }
    const {chapters}=this.outlines.revision(videoId,input.outlineRevision).outline;
    if(chapters.length===0||input.selections.length!==chapters.length)error('MASTER_CHAPTER_COVERAGE',409);
    const byIndex=new Map();
    for(const item of input.selections){
      if(!record(item)||Object.keys(item).some(k=>!['chapterIndex','variantId'].includes(k))||
        !number(item.chapterIndex,0,chapters.length-1)||typeof item.variantId!=='string'||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(item.variantId)||byIndex.has(item.chapterIndex))error('MASTER_SELECTION_INVALID');
      byIndex.set(item.chapterIndex,item.variantId);
    }
    const sources=[];const texts=[];
    for(let chapterIndex=0;chapterIndex<chapters.length;chapterIndex++){
      const variantId=byIndex.get(chapterIndex);
      if(!variantId)error('MASTER_CHAPTER_COVERAGE',409);
      const row=this.db.prepare(`SELECT d.text,d.word_count,b.outline_revision,b.video_id
        FROM content_draft_variants v
        JOIN content_chapter_drafts d ON d.batch_id=v.batch_id AND d.model_id=v.model_id AND d.chapter_idx=v.chapter_idx
        JOIN content_generation_batches b ON b.id=v.batch_id
        WHERE v.id=? AND v.chapter_idx=?`).get(variantId,chapterIndex);
      if(!row||row.video_id!==videoId||row.outline_revision!==input.outlineRevision)
        error('MASTER_SOURCE_MISMATCH',409);
      texts.push(row.text.trim());
      sources.push({chapterIndex,chapterTitle:chapters[chapterIndex].title,
        variantId,sourceSha256:hash(row.text),sourceWordCount:row.word_count});
    }
    const composed=texts.join('\n\n');
    let script=composed;
    if(input.editedText!==undefined){
      if(typeof input.editedText!=='string')error('INVALID_MASTER_TEXT');
      script=input.editedText.trim();
    }
    if(!script||script.length>300000||words(script)<25)error('INVALID_MASTER_TEXT');
    const targetWords=chapters.reduce((total,c)=>total+c.targetWords,0);
    const analysis=analyzeMasterScript(script,targetWords);
    return {videoId,outlineRevision:input.outlineRevision,sources,text:script,
      sha256:hash(script),...analysis,edited:script!==composed};
  }
  /** Save an immutable candidate; compare-and-swap prevents tab races. */
  save(videoId,input={}){
    if(!record(input)||Object.keys(input).some(k=>!['outlineRevision','selections','editedText','expectedRevision'].includes(k))||
      !number(input.expectedRevision,0,2147483647))error('INVALID_MASTER_SAVE');
    const {expectedRevision,...body}=input;
    const assembled=this.assemble(videoId,body);
    let next;
    transact(this.db,()=>{
      const before=this.state(videoId);
      if(before.revision!==expectedRevision)error('MASTER_VERSION_CONFLICT',409);
      // Even a stale second tab cannot replace review of the current outline.
      if(body.outlineRevision!==0 && this.outlines.get(videoId).revision!==body.outlineRevision)error('MASTER_OUTLINE_STALE',409);
      next=before.revision+1;const now=this.clock();
      this.db.prepare(`INSERT INTO content_master_revisions(video_id,revision,outline_revision,source_json,
        script_text,script_sha256,word_count,warnings_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
        .run(videoId,next,body.outlineRevision,JSON.stringify(assembled.sources),assembled.text,
          assembled.sha256,assembled.wordCount,JSON.stringify(assembled.warnings),now);
      if(before.revision===0)this.db.prepare(`INSERT INTO content_master_state
        (video_id,revision,approved_revision,updated_at) VALUES(?,?,NULL,?)`).run(videoId,next,now);
      else this.db.prepare('UPDATE content_master_state SET revision=?,updated_at=? WHERE video_id=?')
        .run(next,now,videoId);
      this.repo.event('video',videoId,'content.master_draft_saved',{revision:next,wordCount:assembled.wordCount});
    });
    return this.revision(videoId,next);
  }
  /** Only explicit approval publishes. Approval is transactional with video. */
  approve(videoId,input={}){
    if(!record(input)||Object.keys(input).some(k=>!['revision','expectedRevision','videoRowVersion','acknowledgeWarnings'].includes(k))||
      !number(input.revision,1,2147483647)||!number(input.expectedRevision,1,2147483647)||
      !number(input.videoRowVersion,1,2147483647)||
      (input.acknowledgeWarnings!==undefined&&typeof input.acknowledgeWarnings!=='boolean'))
      error('INVALID_MASTER_APPROVAL');
    transact(this.db,()=>{
      const s=this.state(videoId),v=this.video(videoId);
      if(s.revision!==input.expectedRevision||input.revision!==s.revision||v.rowVersion!==input.videoRowVersion)
        error('MASTER_VERSION_CONFLICT',409);
      const revision=this.revision(videoId,input.revision);
      if(revision.warnings.length&&!input.acknowledgeWarnings)error('MASTER_WARNINGS_REQUIRE_ACK',409);
      if(this.db.prepare('SELECT 1 FROM scenes WHERE video_id=? LIMIT 1').get(videoId)&&
        v.masterScript!==revision.text)error('SCENES_EXIST_REQUIRE_REBUILD',409);
      // Do not approve another version of a script based on an obsolete outline.
      if(revision.outlineRevision!==0 && this.outlines.get(videoId).revision!==revision.outlineRevision)error('MASTER_OUTLINE_STALE',409);
      if(!this.db.prepare('SELECT 1 FROM content_master_approvals WHERE video_id=? AND revision=?').get(videoId,input.revision))
        this.db.prepare('INSERT INTO content_master_approvals(video_id,revision,approved_at) VALUES(?,?,?)')
          .run(videoId,input.revision,this.clock());
      this.db.prepare('UPDATE content_master_state SET approved_revision=?,updated_at=? WHERE video_id=?')
        .run(input.revision,this.clock(),videoId);
      this.db.prepare(`UPDATE videos SET master_script=?,status='content_ready',last_active_step='content',
        row_version=row_version+1,updated_at=? WHERE id=?`)
        .run(revision.text,this.clock(),videoId);
      this.repo.event('video',videoId,'content.master_approved',{
        revision:input.revision,sha256:revision.sha256});
    });
    return {state:this.state(videoId),revision:this.revision(videoId,input.revision)};
  }
}
