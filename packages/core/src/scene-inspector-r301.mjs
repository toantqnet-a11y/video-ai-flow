/**
 * R3-01: canonical, single-scene edits. Preview is pure and saving is atomic.
 * Asset bytes/revisions are immutable: changing an input only detaches the
 * affected active pointer and retires its intent, never deletes history or
 * invokes an AI provider. A manually pinned image is preserved deliberately.
 */
import {createHash} from 'node:crypto';
import {DomainError} from './domain.mjs';
import {transact} from './db.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
const sha=(value)=>createHash('sha256').update(value,'utf8').digest('hex');
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const plain=(obj)=>obj!==null&&typeof obj==='object'&&!Array.isArray(obj)&&Object.getPrototypeOf(obj)===Object.prototype;
const allowed=new Set(['text','visualPrompt','mediaType','durationMs']);
const valid=(patch)=>{
  if(!plain(patch)||!Object.keys(patch).length||Object.keys(patch).some(k=>!allowed.has(k)))fail('INVALID_SCENE_PATCH');
  if(own(patch,'text')&&(typeof patch.text!=='string'||!patch.text.trim()||patch.text.length>20000))fail('INVALID_SCENE_PATCH');
  if(own(patch,'visualPrompt')&&(typeof patch.visualPrompt!=='string'||patch.visualPrompt.length>4000))fail('INVALID_SCENE_PATCH');
  if(own(patch,'mediaType')&&!['image_motion','ai_video','import_video'].includes(patch.mediaType))fail('INVALID_SCENE_PATCH');
  if(own(patch,'durationMs')&&(!Number.isSafeInteger(patch.durationMs)||patch.durationMs<500||patch.durationMs>120000))fail('INVALID_SCENE_PATCH');
};
export function sceneMutationImpact(scene,patch,{manualImage=false}={}){
  valid(patch);
  const changedFields=Object.keys(patch).filter(k=>patch[k]!==scene[k]);
  const textChanged=changedFields.includes('text');
  const visualChanged=textChanged||changedFields.includes('visualPrompt')||changedFields.includes('mediaType');
  // An image pin survives a new prompt/text only while its media kind remains an image.
  const preserveManual=manualImage&&(patch.mediaType??scene.mediaType)==='image_motion';
  return {
    changedFields,
    voiceStale:textChanged,
    imageStale:visualChanged&&!preserveManual,
    manualImagePreserved:visualChanged&&preserveManual,
    captionStale:textChanged,
    compositionStale:changedFields.length>0,
    renderStale:changedFields.length>0,
    // Editing inputs is NOT a command to create media or spend provider quota.
    providerCallsScheduled:0,
  };
}
export class SceneInspectorR301 {
  constructor(repo){this.repo=repo;this.db=repo.db;}
  current(id){
    const scene=this.repo.getScene(id);
    if(!scene)fail('SCENE_NOT_FOUND',404);
    const video=this.repo.getVideo(scene.videoId);
    if(!video||video.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
    return scene;
  }
  validate(body){
    if(!plain(body)||Object.keys(body).some(k=>!['expectedRowVersion','patch','acknowledgeTextEdit'].includes(k))||
      !Number.isSafeInteger(body.expectedRowVersion)||body.expectedRowVersion<1||
      (body.acknowledgeTextEdit!==undefined&&typeof body.acknowledgeTextEdit!=='boolean'))fail('INVALID_SCENE_MUTATION');
    valid(body.patch);
  }
  inspect(id,body){
    this.validate(body);
    const scene=this.current(id);
    if(scene.rowVersion!==body.expectedRowVersion)fail('SCENE_ROW_VERSION_CONFLICT',409);
    const selected=this.db.prepare('SELECT asset_id FROM scene_image_manual_selections WHERE scene_id=?').get(id);
    const manualImage=!!(scene.visualAssetId&&selected?.asset_id===scene.visualAssetId);
    const impact=sceneMutationImpact(scene,body.patch,{manualImage});
    return {scene,impact,changed:impact.changedFields.length>0,
      requiresAcknowledgement:impact.voiceStale&&!body.acknowledgeTextEdit};
  }
  save(id,body){
    let outcome;
    transact(this.db,()=>{
      // Check the row lock AND manual pin *inside* the same transaction.
      const {scene,impact,changed,requiresAcknowledgement}=this.inspect(id,body);
      if(requiresAcknowledgement)fail('SCENE_TEXT_EDIT_REQUIRES_ACK',409);
      if(!changed){outcome={scene,impact,changed:false};return;}
      const next={...scene,...body.patch};
      const updated=this.db.prepare(`UPDATE scenes SET text=?,visual_prompt=?,media_type=?,duration_ms=?,
        voice_asset_id=?,visual_asset_id=?,row_version=row_version+1,updated_at=?
        WHERE id=? AND row_version=?`).run(next.text,next.visualPrompt,next.mediaType,next.durationMs,
          impact.voiceStale?null:scene.voiceAssetId,
          impact.imageStale?null:scene.visualAssetId,
          this.repo.clock(),id,body.expectedRowVersion);
      if(updated.changes!==1)fail('SCENE_ROW_VERSION_CONFLICT',409);
      if(impact.voiceStale)this.db.prepare('DELETE FROM scene_voice_intents WHERE scene_id=?').run(id);
      if(impact.imageStale||impact.manualImagePreserved)
        this.db.prepare('DELETE FROM scene_image_intents WHERE scene_id=?').run(id);
      if(impact.imageStale)
        this.db.prepare('DELETE FROM scene_image_manual_selections WHERE scene_id=?').run(id);
      // R3-05: a duration mutation can invalidate saved visual in/out. Reset
      // that scene's visual-only window atomically; audio and other scene trims
      // are unaffected. Composition is fenced by the timeline row_version.
      if(impact.changedFields.includes('durationMs')){
        const timeline=this.repo.getTimeline(scene.videoId);
        if((timeline.document.visualEdits??[]).some(edit=>edit.sceneId===id)){
          const document={...timeline.document,visualEdits:timeline.document.visualEdits.filter(edit=>edit.sceneId!==id)};
          this.db.prepare(`UPDATE timeline_documents SET data_json=?,row_version=row_version+1,updated_at=?
            WHERE video_id=? AND row_version=?`).run(JSON.stringify(document),this.repo.clock(),scene.videoId,timeline.rowVersion);
        }
      }
      // Manual image stays selected; generated image history stays immutable.
      this.repo.event('scene',id,'scene.editor_saved',{videoId:scene.videoId,
        rowVersion:body.expectedRowVersion+1,changedFields:impact.changedFields,
        beforeTextSha256:sha(scene.text),afterTextSha256:sha(next.text),impact});
      outcome={scene:this.repo.getScene(id),impact,changed:true};
    });
    return outcome;
  }
}
