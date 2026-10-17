/** R3-07 — transactional immutable timeline revisions and bounded undo/redo.
 * A snapshot is always a NEW row_version; no mutation of immutable history.
 * Functions marked "InTransaction" are called inside the caller's BEGIN IMMEDIATE.
 */
import {transact} from './db.mjs';
import {DomainError} from './domain.mjs';
const fail=(code,status=409)=>{throw new DomainError(code,status)};
const LIMIT=40;
const encode=x=>JSON.stringify(x);
const parse=x=>JSON.parse(x);
function stacks(db,videoId,rowVersion){
 const row=db.prepare('SELECT * FROM timeline_action_stacks WHERE video_id=?').get(videoId);
 if(!row)return {undo:[],redo:[],head:rowVersion};
 return {undo:parse(row.undo_json),redo:parse(row.redo_json),head:row.head_version};
}
function saveStacks(db,videoId,version,undo,redo){
 db.prepare(`INSERT INTO timeline_action_stacks(video_id,head_version,undo_json,redo_json)
 VALUES(?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET
 head_version=excluded.head_version,undo_json=excluded.undo_json,redo_json=excluded.redo_json`)
 .run(videoId,version,encode(undo.slice(-LIMIT)),encode(redo.slice(-LIMIT)));
}
function insertRevision(db,videoId,version,document,action,clock){
 db.prepare(`INSERT OR IGNORE INTO timeline_revisions(video_id,row_version,action,document_json,created_at)
 VALUES(?,?,?,?,?)`).run(videoId,version,action,encode(document),clock());
}
/** Save before/after AFTER guarded UPDATE, in the SAME outer transaction. */
export function recordTimelineChangeInTransaction(db,{videoId,before,beforeVersion,after,action,clock=Date.now}){
 const current=stacks(db,videoId,beforeVersion);
 const undo=current.head===beforeVersion?current.undo:[];
 const next=beforeVersion+1;
 insertRevision(db,videoId,beforeVersion,before,'baseline',clock);
 insertRevision(db,videoId,next,after,action,clock);
 saveStacks(db,videoId,next,[...undo,before],[]);
}
export class TimelineHistoryR307{
 constructor(repo){this.repo=repo;this.db=repo.db;}
 state(videoId){
  const row=this.repo.getTimeline(videoId);const stack=stacks(this.db,videoId,row.rowVersion);
  return {videoId,rowVersion:row.rowVersion,canUndo:stack.head===row.rowVersion&&stack.undo.length>0,
   canRedo:stack.head===row.rowVersion&&stack.redo.length>0,
   revisions:this.db.prepare('SELECT row_version AS rowVersion,action,created_at AS createdAt FROM timeline_revisions WHERE video_id=? ORDER BY row_version DESC LIMIT 60').all(videoId)};
 }
 move(videoId,body={}){
  const {expectedRowVersion,direction}=body??{};
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['expectedRowVersion','direction'].includes(k)))fail('INVALID_TIMELINE_HISTORY',400);
  if(!Number.isSafeInteger(expectedRowVersion)||expectedRowVersion<1||!['undo','redo'].includes(direction))
   fail('INVALID_TIMELINE_HISTORY',400);
  let result;
  transact(this.db,()=>{
   const current=this.repo.getTimeline(videoId);
   if(current.rowVersion!==expectedRowVersion)fail('TIMELINE_VERSION_CONFLICT');
   const state=stacks(this.db,videoId,current.rowVersion);
   if(state.head!==current.rowVersion)fail('TIMELINE_HISTORY_STALE');
   const from=direction==='undo'?state.undo:state.redo;
   if(from.length===0)fail('TIMELINE_HISTORY_EMPTY');
   const target=from.at(-1);
   // A deleted/replaced scene invalidates the old history even when the saved
   // scene IDs look plausible. Never restore stale clip references or voice edits.
   const ids=new Set(this.repo.listScenes(videoId).map(s=>s.id));
   if(target.sceneOrder&&(!Array.isArray(target.sceneOrder)||target.sceneOrder.length!==ids.size||target.sceneOrder.some(id=>!ids.has(id))||new Set(target.sceneOrder).size!==ids.size))
    fail('TIMELINE_HISTORY_SCENE_CHANGED');
   if((target.clips??[]).some(c=>!ids.has(c.sceneId))||(target.visualEdits??[]).some(e=>!ids.has(e.sceneId)))fail('TIMELINE_HISTORY_SCENE_CHANGED');
   const durations=new Map(this.repo.listScenes(videoId).map(s=>[s.id,s.durationMs]));
   for(const c of (target.clips??[]))if(c.timingLocked)durations.set(c.sceneId,c.durationMs);
   if((target.visualEdits??[]).some(e=>!Number.isSafeInteger(e.inMs)||!Number.isSafeInteger(e.outMs)||e.inMs<0||e.outMs-e.inMs<200||e.outMs>durations.get(e.sceneId)))fail('TIMELINE_HISTORY_SCENE_CHANGED');
   const latest=current.rowVersion+1;
   const written=this.db.prepare('UPDATE timeline_documents SET data_json=?,row_version=?,updated_at=? WHERE video_id=? AND row_version=?')
    .run(encode(target),latest,this.repo.clock(),videoId,current.rowVersion);
   if(written.changes!==1)fail('TIMELINE_VERSION_CONFLICT');
   insertRevision(this.db,videoId,latest,target,direction,this.repo.clock);
   const undo=direction==='undo'?state.undo.slice(0,-1):[...state.undo,current.document];
   const redo=direction==='undo'?[...state.redo,current.document]:state.redo.slice(0,-1);
   saveStacks(this.db,videoId,latest,undo,redo);
   this.repo.event('video',videoId,`timeline.${direction}`,{from:current.rowVersion,to:latest});
   result={...this.state(videoId),document:target};
  });
  return result;
 }
}
