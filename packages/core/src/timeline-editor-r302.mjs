/** R3-02/R3-04 — authoritative playback order without modifying immutable
 * script-source offsets or scene idx. Reads never queue work or call providers.
 */
import {DomainError} from './domain.mjs';
import {transact} from './db.mjs';
import {recordTimelineChangeInTransaction} from './timeline-history-r307.mjs';
const fail=(code,status=400)=>{throw new DomainError(code,status)};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
export const TIMELINE_LANES=Object.freeze(['media','text','voice','music']);
export function orderedTimelineScenes(scenes,document={}){
  if(!document?.sceneOrder)return scenes;
  const order=document.sceneOrder;
  if(!Array.isArray(order)||order.length!==scenes.length||new Set(order).size!==scenes.length)
    fail('TIMELINE_ORDER_CORRUPTED',409);
  const lookup=new Map(scenes.map(s=>[s.id,s]));
  if(order.some(id=>!lookup.has(id)))fail('TIMELINE_ORDER_CORRUPTED',409);
  return order.map(id=>lookup.get(id));
}
export function timelineManifest({videoId,scenes,document,rowVersion,fps=30}){
  const ordered=orderedTimelineScenes(scenes,document);
  const locks=new Map((document.clips??[]).filter(c=>c.timingLocked===true).map(c=>[c.sceneId,c]));
  const windows=new Map((document.visualEdits??[]).map(x=>[x.sceneId,x]));
  let startMs=0;
  const items=ordered.map((s,index)=>{
    const lock=locks.get(s.id);
    const durationMs=lock?.durationMs??s.durationMs;
    const edit=windows.get(s.id);
    if(edit&&(!Number.isInteger(edit.inMs)||!Number.isInteger(edit.outMs)||edit.inMs<0||edit.outMs>durationMs||edit.outMs-edit.inMs<200))
      fail('TIMELINE_VISUAL_EDIT_CORRUPTED',409);
    const result={id:s.id,index,sourceIndex:s.index,sceneRowVersion:s.rowVersion,
      text:s.text,mediaType:s.mediaType,voiceAssetId:s.voiceAssetId??null,visualAssetId:s.visualAssetId??null,
      startMs,endMs:startMs+durationMs,durationMs,timingSource:lock?'manual_locked':'scene_estimate',
      // No fake word alignment; captions appear as the original scene text.
      captionText:s.text,captionStartMs:lock?.captionStartMs??0,captionEndMs:lock?.captionEndMs??durationMs,
      visualInMs:edit?.inMs??0,visualOutMs:edit?.outMs??durationMs};
    startMs=result.endMs;
    return result;
  });
  return {videoId,rowVersion,fps,tracks:[...TIMELINE_LANES],scenes:items,totalDurationMs:startMs,
    timingWarning:'Scene duration is estimated unless manually locked. Audio preview uses actual media time.'};
}
export class TimelineEditorR304{
  constructor(repo){this.repo=repo;this.db=repo.db;}
  manifest(videoId){
    const timeline=this.repo.getTimeline(videoId);
    return timelineManifest({videoId,scenes:this.repo.listScenes(videoId),
      document:timeline.document,rowVersion:timeline.rowVersion,
      fps:this.repo.getVideo(videoId).effectivePreset?.render?.fps??30});
  }
  /** Visual in/out is a NON-DESTRUCTIVE preview window. The scene duration,
   * narration, captions and composition timing never shrink. Future renderer
   * integration must hold the visual outside the window, not trim voice.
   */
  trimVisual(videoId,body){
    if(!object(body)||Object.keys(body).some(k=>!['expectedRowVersion','sceneId','inMs','outMs'].includes(k))||
      !Number.isSafeInteger(body.expectedRowVersion)||body.expectedRowVersion<1||
      typeof body.sceneId!=='string'||!Number.isInteger(body.inMs)||!Number.isInteger(body.outMs))
      fail('INVALID_VISUAL_TRIM');
    let result;
    transact(this.db,()=>{
      const timeline=this.repo.getTimeline(videoId);
      if(timeline.rowVersion!==body.expectedRowVersion)fail('TIMELINE_VERSION_CONFLICT',409);
      const scene=this.repo.listScenes(videoId).find(x=>x.id===body.sceneId);
      if(!scene)fail('VISUAL_TRIM_SCENE_NOT_FOUND',404);
      const locked=(timeline.document.clips??[]).find(c=>c.sceneId===body.sceneId&&c.timingLocked);
      const duration=locked?.durationMs??scene.durationMs;
      if(body.inMs<0||body.outMs>duration||body.outMs-body.inMs<200)
        fail('VISUAL_TRIM_OUT_OF_RANGE',422);
      const previous=(timeline.document.visualEdits??[]).filter(x=>x.sceneId!==body.sceneId);
      if(body.inMs!==0||body.outMs!==duration)
        previous.push({sceneId:body.sceneId,inMs:body.inMs,outMs:body.outMs});
      previous.sort((a,b)=>a.sceneId.localeCompare(b.sceneId));
      const next={...timeline.document,visualEdits:previous};
      if(JSON.stringify(timeline.document.visualEdits??[])===JSON.stringify(previous)){
        result={...this.manifest(videoId),changed:false};return;
      }
      const saved=this.db.prepare(`UPDATE timeline_documents SET data_json=?,row_version=row_version+1,updated_at=?
        WHERE video_id=? AND row_version=?`).run(JSON.stringify(next),this.repo.clock(),videoId,timeline.rowVersion);
      if(saved.changes!==1)fail('TIMELINE_VERSION_CONFLICT',409);
      recordTimelineChangeInTransaction(this.db,{videoId,before:timeline.document,beforeVersion:timeline.rowVersion,after:next,action:'trim',clock:this.repo.clock});
      this.repo.event('video',videoId,'timeline.visual_window_updated',{
        sceneId:body.sceneId,previousVersion:timeline.rowVersion,newVersion:timeline.rowVersion+1});
      result={...this.manifest(videoId),changed:true};
    });
    return result;
  }
  reorder(videoId,body){
    if(!object(body)||Object.keys(body).some(k=>!['expectedRowVersion','sceneOrder'].includes(k))||
       !Number.isSafeInteger(body.expectedRowVersion)||body.expectedRowVersion<1||
       !Array.isArray(body.sceneOrder)||body.sceneOrder.length>1200||
       body.sceneOrder.some(id=>typeof id!=='string'))fail('INVALID_TIMELINE_REORDER');
    let result;
    transact(this.db,()=>{
      const timeline=this.repo.getTimeline(videoId);
      if(timeline.rowVersion!==body.expectedRowVersion)fail('TIMELINE_VERSION_CONFLICT',409);
      const sceneRows=this.repo.listScenes(videoId);
      const ids=new Set(sceneRows.map(s=>s.id));
      if(body.sceneOrder.length!==sceneRows.length||new Set(body.sceneOrder).size!==sceneRows.length||
        body.sceneOrder.some(id=>!ids.has(id)))fail('TIMELINE_ORDER_MISMATCH',409);
      const previous=orderedTimelineScenes(sceneRows,timeline.document).map(s=>s.id);
      if(previous.every((id,i)=>id===body.sceneOrder[i])){
        result={...this.manifest(videoId),changed:false};return;
      }
      const sceneMap=new Map(sceneRows.map(s=>[s.id,s]));
      const clips=(timeline.document.clips??[]).map(c=>({...c}));
      const byId=new Map(clips.map(c=>[c.sceneId,c]));
      let cursor=0;
      for(const id of body.sceneOrder){
        const clip=byId.get(id);
        if(clip)clip.startMs=cursor; // Locked starts follow reordering, never retain a stale absolute offset.
        cursor+=clip?.timingLocked===true?clip.durationMs:sceneMap.get(id).durationMs;
      }
      const next={...timeline.document,sceneOrder:[...body.sceneOrder],clips};
      // Protected mutation: only this endpoint may change sceneOrder. SQLite
      // row-version compare prevents overwrites even across two open editors.
      const saved=this.db.prepare(`UPDATE timeline_documents SET data_json=?,row_version=row_version+1,updated_at=?
        WHERE video_id=? AND row_version=?`).run(JSON.stringify(next),this.repo.clock(),videoId,timeline.rowVersion);
      if(saved.changes!==1)fail('TIMELINE_VERSION_CONFLICT',409);
      recordTimelineChangeInTransaction(this.db,{videoId,before:timeline.document,beforeVersion:timeline.rowVersion,after:next,action:'reorder',clock:this.repo.clock});
      this.repo.event('video',videoId,'timeline.scenes_reordered',{
        rowVersion:timeline.rowVersion+1,sceneCount:body.sceneOrder.length,
        // An order of IDs is not a script/body leak; script-source idx stays fixed.
        from:previous,to:body.sceneOrder});
      result={...this.manifest(videoId),changed:true};
    });
    return result;
  }
}
