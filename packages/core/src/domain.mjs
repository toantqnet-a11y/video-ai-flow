/**
 * Channel > video > scene domain rules. All mutating operations are atomic and
 * scoped by identifiers instead of filesystem paths. Video presets are copied
 * at creation so editing a channel never silently changes an existing video.
 */
import { randomUUID, createHash } from 'node:crypto';
import { transact } from './db.mjs';
import {recordTimelineChangeInTransaction} from './timeline-history-r307.mjs';
import {matchesPresetSchema,presetSchema,stablePresetJson,defaultPreset} from './preset-schema.mjs';
import {normalizeVideoOverrides,videoConfigImpact} from './video-config.mjs';
import {buildSelectivePresetOverrides,presetApplyDigest} from './preset-diff-r401.mjs';
export {defaultPreset};

export class DomainError extends Error {
  constructor(code, status=400) { super(code); this.code=code; this.status=status; }
}
const fail = (code,status) => { throw new DomainError(code,status); };
const parse = v => JSON.parse(v);
const nonempty = (v,max=200) => typeof v === 'string' && v.trim().length>0 && v.trim().length<=max;
const text = (v,max=8000) => typeof v === 'string' && v.length<=max;
const record = x => x && typeof x === 'object' && !Array.isArray(x);
const boundedString = (value, max) => typeof value === 'string' && value.length <= max;
const allowed = (value, options) => options.includes(value);
const optionalString = (obj, key, max) => obj[key] === undefined || boundedString(obj[key],max);
const requestKeyOk = key => typeof key==='string' && /^[A-Za-z0-9_-]{8,100}$/.test(key);
const videoSteps = ['content','scenes','timeline','video-config'];
/** Encode stable keyset boundaries; opaque to client, no SQL/string interpolation. */
const videoCursor = (updatedAt,id) => Buffer.from(JSON.stringify([updatedAt,id])).toString('base64url');
function decodeVideoCursor(cursor) {
  if(typeof cursor!=='string'||cursor.length>250||!/^[A-Za-z0-9_-]+$/.test(cursor))fail('INVALID_VIDEO_CURSOR');
  try {
    const parsed=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));
    if(!Array.isArray(parsed)||parsed.length!==2||!Number.isSafeInteger(parsed[0])||!/^[-a-zA-Z0-9]{1,80}$/.test(parsed[1]))throw Error();
    return parsed;
  }catch{fail('INVALID_VIDEO_CURSOR');}
}
const escapeLike = value => value.replace(/[\\%_]/g, '\\$&');


export function validPreset(preset) {
  if (!record(preset)) fail('INVALID_PRESET');
  const whitelist=['content','voice','media','render','models'];
  if (Object.keys(preset).some(k=>!whitelist.includes(k))) fail('UNKNOWN_PRESET_FIELD');
  // Nested value validation prevents arbitrary objects/keys from entering saved presets.
  for (const key of whitelist) {
    if (!record(preset[key])) fail('INVALID_PRESET');
    if (JSON.stringify(preset[key]).length>12000) fail('PRESET_TOO_LARGE');
  }
  // Explicit nested schemas prohibit persisted credentials, model keys or arbitrary
  // objects inside presets. The provider vault owns secrets, never the channel.
  const fields={
    content:['style','tone','language','targetMinutes','audience','topic','addressStyle','preferredTerms','avoidTerms','basePrompt','extraPrompt'],
    voice:['provider','voice','speed','characterName','characterDescription'],
    media:['mode','style','aspectRatio','sceneSeconds','motionEffect'],
    render:['width','height','fps','codec','subtitles'],
    models:['paidEnabled','remoteEnabled']
  };
  for(const [group,names] of Object.entries(fields))
    if(Object.keys(preset[group]).some(k=>!names.includes(k)))fail('UNKNOWN_PRESET_FIELD');
  for(const key of ['style','tone','language','audience','topic','addressStyle','preferredTerms','avoidTerms','basePrompt','extraPrompt'])
    if(!optionalString(preset.content,key,key==='basePrompt'||key==='extraPrompt'?4000:500))fail('INVALID_CONTENT_PRESET');
  for(const key of ['provider','voice','characterName','characterDescription'])
    if(!optionalString(preset.voice,key,300))fail('INVALID_VOICE_PRESET');
  if(!allowed(preset.voice.provider,['edge','local','piper','vieneu','espeak']) || !nonempty(preset.voice.voice,150)
    || typeof preset.voice.speed!=='number' || preset.voice.speed<0.5 || preset.voice.speed>2) fail('INVALID_VOICE_PRESET');
  if(!allowed(preset.media.mode,['hybrid','image_motion','ai_video','import_video']) || !nonempty(preset.media.style,300)
    || !allowed(preset.media.aspectRatio,['16:9','9:16','1:1']) || !optionalString(preset.media,'motionEffect',100))fail('INVALID_MEDIA_PRESET');
  if(![[1280,720],[1920,1080],[3840,2160],[720,1280],[1080,1920],[1080,1080]].some(([w,h])=>w===preset.render.width&&h===preset.render.height)
    || (preset.media.aspectRatio==='16:9' && !(preset.render.width>preset.render.height))
    || (preset.media.aspectRatio==='9:16' && !(preset.render.width<preset.render.height))
    || (preset.media.aspectRatio==='1:1' && preset.render.width!==preset.render.height)
    || (preset.render.subtitles!==undefined&&typeof preset.render.subtitles!=='boolean'))fail('INVALID_RENDER_PRESET');
  if(typeof preset.models.paidEnabled!=='boolean'||typeof preset.models.remoteEnabled!=='boolean')fail('INVALID_MODEL_PRESET');
  if (preset.models.paidEnabled === true) fail('PAID_CONFIG_REQUIRES_APPROVAL',403);
  if (preset.models.remoteEnabled === true) fail('REMOTE_CONFIG_REQUIRES_APPROVAL',403);
  if (!Number.isInteger(preset.content.targetMinutes) || preset.content.targetMinutes<1 || preset.content.targetMinutes>240) fail('INVALID_DURATION');
  if (!Number.isInteger(preset.media.sceneSeconds) || preset.media.sceneSeconds<2 || preset.media.sceneSeconds>120) fail('INVALID_SCENE_SECONDS');
  if (preset.render.codec !== 'h264' || !Number.isInteger(preset.render.fps) || ![24,25,30,60].includes(preset.render.fps)) fail('INVALID_RENDER_PRESET');
  // Canonical JSON Schema catches non-finite numbers and optional field types
  // that legacy business-rule validation does not cover.
  if(!matchesPresetSchema(preset,presetSchema) || ['style','tone','language'].some(k=>!preset.content[k]?.trim()))fail('INVALID_PRESET_SCHEMA');
  return structuredClone(preset);
}
const rowChannel = r => r && ({id:r.id,name:r.name,description:r.description,status:r.status,preset:parse(r.preset_json),presetVersion:r.preset_version,avatarId:r.avatar_id??null,rowVersion:r.row_version,deletedAt:r.deleted_at??null,createdAt:r.created_at,updatedAt:r.updated_at});
const rowVideo = r => r && ({id:r.id,channelId:r.channel_id,title:r.title,brief:r.brief,status:r.status,masterScript:r.master_script,preset:parse(r.preset_snapshot_json),presetSourceVersion:r.preset_source_version,configRevision:r.config_revision,overrides:parse(r.video_overrides_json),effectivePreset:parse(r.resolved_json??r.preset_snapshot_json),rowVersion:r.row_version,deletedAt:r.deleted_at??null,lastActiveStep:r.last_active_step??'content',targetDurationSec:r.target_duration_sec??null,actualDurationSec:r.actual_duration_sec??null,createdAt:r.created_at,updatedAt:r.updated_at});
const rowScene = r => r && ({id:r.id,videoId:r.video_id,index:r.idx,text:r.text,durationMs:r.duration_ms,mediaType:r.media_type,visualPrompt:r.visual_prompt,voiceAssetId:r.voice_asset_id,visualAssetId:r.visual_asset_id,rowVersion:r.row_version});

export class StudioRepository {
  constructor(db,{clock=()=>Date.now()}={}) { this.db=db; this.clock=clock; }
  event(type,id,name,detail={}) {
    this.db.prepare('INSERT INTO domain_events(entity_type,entity_id,event_name,created_at,detail_json) VALUES(?,?,?,?,?)')
      .run(type,id,name,this.clock(),JSON.stringify(detail));
  }
  createChannel({name,description='',preset=structuredClone(defaultPreset),idempotencyKey}={}) {
    if (!nonempty(name,120) || !text(description,2000)) fail('INVALID_CHANNEL');
    preset=validPreset(preset);
    if(idempotencyKey!==undefined && (typeof idempotencyKey!=='string'||!(/^[A-Za-z0-9_-]{8,100}$/).test(idempotencyKey)))fail('INVALID_IDEMPOTENCY_KEY');
    const id=randomUUID(),at=this.clock(),body=stablePresetJson(preset);
    const payloadHash=createHash('sha256').update(JSON.stringify([name.trim(),description,body])).digest('hex');
    // The existence check and insertion share a transaction so a retry never
    // makes a second channel, even after process restart.
    let existingId;
    transact(this.db,()=>{
      if(idempotencyKey){const entry=this.db.prepare('SELECT * FROM channel_create_keys WHERE request_key=?').get(idempotencyKey);
        if(entry){if(entry.payload_sha256!==payloadHash)fail('IDEMPOTENCY_CONFLICT',409);existingId=entry.channel_id;return;}}
      this.db.prepare('INSERT INTO channels(id,name,description,preset_json,created_at,updated_at) VALUES(?,?,?,?,?,?)')
        .run(id,name.trim(),description,body,at,at);
      this.db.prepare('INSERT INTO preset_revisions(channel_id,version,preset_json,created_at) VALUES(?,?,?,?)').run(id,1,body,at);
      if(idempotencyKey)this.db.prepare('INSERT INTO channel_create_keys(request_key,payload_sha256,channel_id) VALUES(?,?,?)').run(idempotencyKey,payloadHash,id);
      this.event('channel',id,'channel.created');
    });
    return this.getChannel(existingId??id);
  }
  getChannel(id) {return rowChannel(this.db.prepare('SELECT * FROM channels WHERE id=?').get(id));}
  listChannels({status='active',includeArchived}={}){
    // Keep ARC-01 callers backward-compatible while the UI adds explicit filters.
    if(includeArchived===true) status='all';
    if(!['all','any','active','archived','deleted'].includes(status))fail('INVALID_CHANNEL_FILTER');
    const clause=status==='any'?'1=1':status==='all'?'deleted_at IS NULL':status==='deleted'?'deleted_at IS NOT NULL':`deleted_at IS NULL AND status='${status}'`;
    return this.db.prepare(`SELECT * FROM channels WHERE ${clause} ORDER BY updated_at DESC,id`).all().map(rowChannel);
  }
  /** Video count is cheap; active job count supports safe archive/delete UX. */
  getChannelSummary(id){
    const c=this.getChannel(id);if(!c)fail('CHANNEL_NOT_FOUND',404);
    const videoCount=this.db.prepare('SELECT COUNT(*) n FROM videos WHERE channel_id=?').get(id).n;
    // Queue tables can be absent when the domain is tested without JobStore.
    if(!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='jobs'").get())
      return {videoCount,activeJobs:0,runningJobs:0};
    const jobs=this.db.prepare("SELECT status,payload_json FROM jobs WHERE status IN ('pending','running','paused')").all();
    const owned=new Set(this.db.prepare('SELECT id FROM videos WHERE channel_id=?').all(id).map(v=>v.id));
    let activeJobs=0,runningJobs=0;
    for(const job of jobs){let payload;try{payload=JSON.parse(job.payload_json)}catch{continue}
      if(owned.has(payload.projectId)||owned.has(payload.videoId)){
        activeJobs++;if(job.status==='running')runningJobs++;
      }
    }
    return {videoCount,activeJobs,runningJobs};
  }
  assertChannelIdle(id){if(this.getChannelSummary(id).activeJobs)fail('CHANNEL_HAS_ACTIVE_JOBS',409);}
  archiveChannel(id,{rowVersion}={}){
    const current=this.getChannel(id);if(!current||current.deletedAt!==null)fail('CHANNEL_NOT_FOUND',404);
    if(rowVersion!==current.rowVersion)fail('VERSION_CONFLICT',409);
    this.assertChannelIdle(id);
    return this.updateChannel(id,{rowVersion,status:'archived'});
  }
  /** Never physically delete children; a tombstone is reversible after restart. */
  softDeleteChannel(id,{rowVersion}={}){
    const current=this.getChannel(id);if(!current||current.deletedAt!==null)fail('CHANNEL_NOT_FOUND',404);
    if(rowVersion!==current.rowVersion)fail('VERSION_CONFLICT',409);
    this.assertChannelIdle(id);
    transact(this.db,()=>{
      this.db.prepare("UPDATE channels SET status='archived',deleted_at=?,row_version=row_version+1,updated_at=? WHERE id=?")
        .run(this.clock(),this.clock(),id);
      this.event('channel',id,'channel.soft_deleted');
    });
    return this.getChannel(id);
  }
  restoreChannel(id,{rowVersion}={}){
    const current=this.getChannel(id);if(!current)fail('CHANNEL_NOT_FOUND',404);
    if(rowVersion!==current.rowVersion)fail('VERSION_CONFLICT',409);
    transact(this.db,()=>{
      this.db.prepare("UPDATE channels SET status='active',deleted_at=NULL,row_version=row_version+1,updated_at=? WHERE id=?")
        .run(this.clock(),id);
      this.event('channel',id,'channel.restored');
    });
    return this.getChannel(id);
  }
  updateChannel(id,{name,description,preset,status,rowVersion}={}) {
    const previous=this.getChannel(id); if (!previous||previous.deletedAt!==null) fail('CHANNEL_NOT_FOUND',404);
    if (!Number.isInteger(rowVersion) || rowVersion!==previous.rowVersion) fail('VERSION_CONFLICT',409);
    if (name!==undefined && !nonempty(name,120)) fail('INVALID_CHANNEL');
    if (description!==undefined && !text(description,2000)) fail('INVALID_CHANNEL');
    if (status!==undefined && !['active','archived'].includes(status)) fail('INVALID_STATUS');
    // PATCH cannot bypass the archive endpoint's active-job protection.
    if(status==='archived'&&previous.status!=='archived')this.assertChannelIdle(id);
    const nextPreset=preset===undefined?previous.preset:validPreset(preset);
    const presetChanged=preset!==undefined&&stablePresetJson(nextPreset)!==stablePresetJson(previous.preset);
    const newVersion=previous.presetVersion+(presetChanged?1:0);
    transact(this.db,()=>{
      this.db.prepare('UPDATE channels SET name=?,description=?,status=?,preset_json=?,preset_version=?,row_version=row_version+1,updated_at=? WHERE id=?')
        .run(name?.trim()??previous.name,description??previous.description,status??previous.status,stablePresetJson(nextPreset),newVersion,this.clock(),id);
      if (presetChanged) this.db.prepare('INSERT INTO preset_revisions(channel_id,version,preset_json,created_at) VALUES(?,?,?,?)')
        .run(id,newVersion,stablePresetJson(nextPreset),this.clock());
      this.event('channel',id,'channel.updated',{presetChanged});
    });
    return this.getChannel(id);
  }
  listPresetRevisions(channelId) {
    if (!this.getChannel(channelId)) fail('CHANNEL_NOT_FOUND',404);
    return this.db.prepare('SELECT version,preset_json,created_at FROM preset_revisions WHERE channel_id=? ORDER BY version DESC').all(channelId)
      .map(r=>({version:r.version,preset:parse(r.preset_json),createdAt:r.created_at}));
  }
  /**
   * Explicit revision endpoint for preset-only changes (EP10 US-10.3).
   * Uses the existing updateChannel() transaction and rowVersion lock; there is
   * exactly one revision for each semantic change, and no secret-bearing copy.
   * Unchanged saves return the current revision instead of inflating history.
   */
  savePresetRevision(channelId,{preset,rowVersion}={}) {
    if(preset===undefined)fail('INVALID_PRESET');
    const before=this.getChannel(channelId);
    const channel=this.updateChannel(channelId,{preset,rowVersion});
    const revision=this.getPresetRevision(channelId,channel.presetVersion);
    return {...revision,channelId,rowVersion:channel.rowVersion,
      changed:channel.presetVersion!==before.presetVersion};
  }
  getPresetRevision(channelId,version) {
    if(!this.getChannel(channelId))fail('CHANNEL_NOT_FOUND',404);
    if(!Number.isSafeInteger(version)||version<1)fail('INVALID_PRESET_VERSION');
    const r=this.db.prepare('SELECT version,preset_json,created_at FROM preset_revisions WHERE channel_id=? AND version=?')
      .get(channelId,version);
    if(!r)fail('PRESET_REVISION_NOT_FOUND',404);
    return {version:r.version,preset:parse(r.preset_json),createdAt:r.created_at};
  }
  /** One SQLite transaction commits the immutable channel snapshot, effective
   * initial video settings, timeline and optional retry key. No job is started. */
  createVideo(channelId,{title,brief='',targetMinutes,idempotencyKey}={}) {
    const channel=this.getChannel(channelId); if(!channel||channel.deletedAt!==null)fail('CHANNEL_NOT_FOUND',404);
    if(channel.status!=='active')fail('CHANNEL_ARCHIVED',409);
    if(!nonempty(title,200)||!text(brief,20000)|| (targetMinutes!==undefined&&(!Number.isInteger(targetMinutes)||targetMinutes<1||targetMinutes>120)))fail('INVALID_VIDEO');
    if(idempotencyKey!==undefined&&!requestKeyOk(idempotencyKey))fail('INVALID_IDEMPOTENCY_KEY');
    const preset=structuredClone(channel.preset),minutes=targetMinutes??preset.content.targetMinutes;
    if(!Number.isInteger(minutes)||minutes<1||minutes>120)fail('INVALID_DURATION');
    const overrides=targetMinutes===undefined||targetMinutes===preset.content.targetMinutes?{}:{content:{targetMinutes}};
    const resolved=normalizeVideoOverrides(preset,overrides).resolved;
    const id=randomUUID(),at=this.clock();
    const payloadHash=createHash('sha256').update(JSON.stringify([channelId,title.trim(),brief,targetMinutes??null])).digest('hex');
    let selectedId=id;
    transact(this.db,()=>{
      if(idempotencyKey){const used=this.db.prepare("SELECT video_id,payload_sha256 FROM video_request_keys WHERE action='create' AND request_key=?").get(idempotencyKey);
        if(used){if(used.payload_sha256!==payloadHash)fail('IDEMPOTENCY_CONFLICT',409);selectedId=used.video_id;return;}}
      this.db.prepare(`INSERT INTO videos(id,channel_id,title,brief,preset_snapshot_json,preset_source_version,
        video_overrides_json,target_duration_sec,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .run(id,channelId,title.trim(),brief,stablePresetJson(preset),channel.presetVersion,
          stablePresetJson(overrides),minutes*60,at,at);
      this.db.prepare(`INSERT INTO video_config_revisions
        (video_id,version,source_preset_version,overrides_json,resolved_json,impact_json,created_at)
        VALUES(?,?,?,?,?,?,?)`).run(id,1,channel.presetVersion,stablePresetJson(overrides),stablePresetJson(resolved),
          JSON.stringify({changedPaths:[],affected:[],requiresReview:false}),at);
      this.db.prepare('INSERT INTO timeline_documents(video_id,data_json,updated_at) VALUES(?,?,?)')
        .run(id,JSON.stringify({tracks:['media','text','voice','music'],clips:[]}),at);
      if(idempotencyKey)this.db.prepare("INSERT INTO video_request_keys(action,request_key,payload_sha256,video_id) VALUES('create',?,?,?)")
        .run(idempotencyKey,payloadHash,id);
      this.event('video',id,'video.created',{channelId});
    });
    return this.getVideo(selectedId);
  }
  getVideo(id) {return rowVideo(this.db.prepare(`SELECT v.*,r.resolved_json FROM videos v
    LEFT JOIN video_config_revisions r ON r.video_id=v.id AND r.version=v.config_revision WHERE v.id=?`).get(id));}
  /** Latest and historical video-level overrides; channel-origin snapshot stays immutable. */
  getVideoConfig(videoId,version) {
    const video=this.getVideo(videoId);if(!video)fail('VIDEO_NOT_FOUND',404);
    if(version!==undefined&&(!Number.isSafeInteger(version)||version<1))fail('INVALID_CONFIG_REVISION');
    const revision=this.db.prepare(`SELECT * FROM video_config_revisions WHERE video_id=? AND version=?`)
      .get(videoId,version??video.configRevision);
    if(!revision)fail('CONFIG_REVISION_NOT_FOUND',404);
    return {videoId,version:revision.version,sourcePresetVersion:revision.source_preset_version,
      sourcePreset:video.preset,overrides:parse(revision.overrides_json),effectivePreset:parse(revision.resolved_json),
      impact:parse(revision.impact_json),createdAt:revision.created_at,rowVersion:video.rowVersion};
  }
  listVideoConfigRevisions(videoId){
    if(!this.getVideo(videoId))fail('VIDEO_NOT_FOUND',404);
    return this.db.prepare(`SELECT version FROM video_config_revisions WHERE video_id=? ORDER BY version DESC`).all(videoId)
      .map(r=>this.getVideoConfig(videoId,r.version));
  }
  _videoConfigCandidate(videoId,{overrides,rowVersion}={}){
    const video=this.getVideo(videoId);if(!video)fail('VIDEO_NOT_FOUND',404);
    if(rowVersion!==video.rowVersion)fail('VERSION_CONFLICT',409);
    if(overrides===undefined)fail('INVALID_VIDEO_OVERRIDES');
    const result=normalizeVideoOverrides(video.preset,overrides);
    const assetCounts=Object.fromEntries(this.db.prepare(`SELECT kind,COUNT(*) n FROM asset_revisions
      WHERE video_id=? GROUP BY kind`).all(videoId).map(r=>[r.kind,r.n]));
    const sceneCount=this.db.prepare('SELECT COUNT(*) n FROM scenes WHERE video_id=?').get(videoId).n;
    const impact=videoConfigImpact(video.effectivePreset,result.resolved,{
      hasScript:!!video.masterScript,sceneCount,assetCounts});
    return {video,result,impact,changed:impact.changedPaths.length>0};
  }
  /** Client can review the exact asset implications without saving/queueing. */
  previewVideoConfig(videoId,body){
    const {video,result,impact,changed}=this._videoConfigCandidate(videoId,body);
    return {videoId,sourcePresetVersion:video.presetSourceVersion,fromRevision:video.configRevision,
      rowVersion:video.rowVersion,overrides:result.overrides,effectivePreset:result.resolved,
      changed,impact};
  }
  /** Full-replacement overrides + optimistic lock. Confirmation acknowledges
   * the impact ONLY: workers may not auto-regenerate assets here. */
  updateVideoConfig(videoId,body={}){
    // Commit inside IMMEDIATE transaction so queued jobs/config revisions cannot
    // be interleaved between impact computation and immutable revision insert.
    return transact(this.db,()=>this._commitVideoConfigCandidate(videoId,body));
  }
  _commitVideoConfigCandidate(videoId,{overrides,rowVersion,confirmImpact=false}={}){
      const {video,result,impact,changed}=this._videoConfigCandidate(videoId,{overrides,rowVersion});
      if(!changed)return {...this.getVideoConfig(videoId),changed:false};
      if(impact.requiresReview&&confirmImpact!==true)fail('CONFIG_CHANGE_REVIEW_REQUIRED',409);
      if(confirmImpact!==undefined&&typeof confirmImpact!=='boolean')fail('INVALID_IMPACT_CONFIRMATION');
      // As in archive-channel, changing config during queued/running work
      // would leave a result generated against the old config ambiguously fresh.
      if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='jobs'").get()){
        const active=this.db.prepare("SELECT payload_json FROM jobs WHERE status IN ('pending','running','paused')").all();
        for(const job of active){let payload;try{payload=JSON.parse(job.payload_json)}catch{continue}
          if(payload.projectId===videoId||payload.videoId===videoId)fail('VIDEO_HAS_ACTIVE_JOBS',409);
        }
      }
      const next=video.configRevision+1,at=this.clock();
      this.db.prepare(`UPDATE videos SET config_revision=?,video_overrides_json=?,row_version=row_version+1,updated_at=? WHERE id=?`)
        .run(next,stablePresetJson(result.overrides),at,videoId);
      this.db.prepare(`INSERT INTO video_config_revisions
        (video_id,version,source_preset_version,overrides_json,resolved_json,impact_json,created_at)
        VALUES(?,?,?,?,?,?,?)`).run(videoId,next,video.presetSourceVersion,
        stablePresetJson(result.overrides),stablePresetJson(result.resolved),JSON.stringify(impact),at);
      this.event('video',videoId,'video.config_updated',{configRevision:next,changedPaths:impact.changedPaths,affected:impact.affected});
      return {...this.getVideoConfig(videoId),changed:true};
  }

  /** R4-01 dry-run compare: never mutates the video's frozen channel origin. */
  _channelPresetCandidate(videoId,{rowVersion,channelPresetVersion,selectedPaths=[]}={}){
    const video=this.getVideo(videoId);
    if(!video||video.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
    const channel=this.getChannel(video.channelId);
    if(!channel||channel.deletedAt!==null)fail('CHANNEL_NOT_FOUND',404);
    if(!Number.isSafeInteger(rowVersion)||rowVersion!==video.rowVersion ||
       !Number.isSafeInteger(channelPresetVersion)||channelPresetVersion!==channel.presetVersion)
      fail('VERSION_CONFLICT',409);
    let proposed;
    try {proposed=buildSelectivePresetOverrides({origin:video.preset,
      effective:video.effectivePreset,channel:channel.preset,selectedPaths});}
    catch(error){if(error.code==='INVALID_PRESET_SELECTION')fail('INVALID_PRESET_SELECTION');throw error;}
    const candidate=this._videoConfigCandidate(videoId,{overrides:proposed.overrides,rowVersion});
    const {impact,changed}=candidate;
    const digest=presetApplyDigest({videoId,rowVersion,channelPresetVersion,
      configRevision:video.configRevision,selectedPaths,overrides:proposed.overrides,impact});
    return {videoId,channelId:channel.id,rowVersion,channelPresetVersion,
      configRevision:video.configRevision,fields:proposed.fields,selectedPaths,
      overrides:proposed.overrides,impact,changed,previewDigest:digest};
  }
  previewChannelPresetDiff(videoId,body){return this._channelPresetCandidate(videoId,body);}
  /** Explicit only: re-evaluate while holding SQLite IMMEDIATE transaction,
   * and refuse stale preview, changed channel or changed impact counts. */
  applyChannelPresetDiff(videoId,{rowVersion,channelPresetVersion,selectedPaths,expectedDigest,confirmImpact=false}={}){
    if(typeof expectedDigest!=='string'||!/^[a-f0-9]{64}$/.test(expectedDigest) ||
       typeof confirmImpact!=='boolean')fail('INVALID_PRESET_APPLY');
    return transact(this.db,()=>{
      const preview=this._channelPresetCandidate(videoId,{rowVersion,channelPresetVersion,selectedPaths});
      if(preview.previewDigest!==expectedDigest)fail('PRESET_PREVIEW_STALE',409);
      if(preview.impact.requiresReview&&!confirmImpact)fail('CONFIG_CHANGE_REVIEW_REQUIRED',409);
      return this._commitVideoConfigCandidate(videoId,{rowVersion,overrides:preview.overrides,confirmImpact});
    });
  }
  /** Library queries are channel-scoped and use keyset pagination so equal
   * timestamps never cause duplicate or skipped rows between pages. */
  listVideoPage(channelId,{search='',status='all',sort='updated',limit=20,cursor,deleted=false}={}) {
    if(!this.getChannel(channelId))fail('CHANNEL_NOT_FOUND',404);
    if(typeof search!=='string'||search.length>160||!Number.isInteger(limit)||limit<1||limit>100||
      !['updated'].includes(sort)||typeof deleted!=='boolean'||
      !['all','draft','content_ready','scenes_ready','assets_processing','editing','rendering','rendered','failed'].includes(status))fail('INVALID_VIDEO_FILTER');
    const boundary=cursor===undefined?null:decodeVideoCursor(cursor);
    const where=["v.channel_id=?",deleted?'v.deleted_at IS NOT NULL':'v.deleted_at IS NULL'];
    const params=[channelId];
    if(status!=='all'){where.push('v.status=?');params.push(status);}
    if(search.trim()){where.push("(v.title LIKE ? ESCAPE '\\' OR v.brief LIKE ? ESCAPE '\\')");
      const term=`%${escapeLike(search.trim())}%`;params.push(term,term);}
    if(boundary){where.push('(v.updated_at<? OR (v.updated_at=? AND v.id<?))');params.push(boundary[0],boundary[0],boundary[1]);}
    const rows=this.db.prepare(`SELECT v.*,r.resolved_json FROM videos v
      LEFT JOIN video_config_revisions r ON r.video_id=v.id AND r.version=v.config_revision
      WHERE ${where.join(' AND ')} ORDER BY v.updated_at DESC,v.id DESC LIMIT ?`).all(...params,limit+1);
    const items=rows.slice(0,limit).map(r=>this.videoSummary(rowVideo(r),{listItem:true}));
    const last=items.at(-1);
    return {items,nextCursor:rows.length>limit?videoCursor(last.updatedAt,last.id):null};
  }
  /** Legacy callers receive the whole active list; interactive UI uses pages. */
  listVideos(channelId){
    if(!this.getChannel(channelId))fail('CHANNEL_NOT_FOUND',404);
    return this.db.prepare(`SELECT v.*,r.resolved_json FROM videos v LEFT JOIN video_config_revisions r
      ON r.video_id=v.id AND r.version=v.config_revision
      WHERE v.channel_id=? AND v.deleted_at IS NULL ORDER BY v.updated_at DESC,v.id DESC`).all(channelId).map(rowVideo);
  }
  videoSummary(video,{listItem=false}={}){
    const count=this.db.prepare('SELECT COUNT(*) n FROM scenes WHERE video_id=?').get(video.id).n;
    // The library intentionally excludes masterScript and full presets. A 40-minute
    // script can be hundreds of KB; fetching it for every card wastes memory/network.
    const details=listItem?{
      id:video.id,channelId:video.channelId,title:video.title,
      brief:video.brief.slice(0,500),status:video.status,rowVersion:video.rowVersion,
      deletedAt:video.deletedAt,lastActiveStep:video.lastActiveStep,
      targetDurationSec:video.targetDurationSec,actualDurationSec:video.actualDurationSec,
      presetSourceVersion:video.presetSourceVersion,configRevision:video.configRevision,
      updatedAt:video.updatedAt,createdAt:video.createdAt
    }:video;
    return {...details,sceneCount:count,progressPercent:null,
      // A legitimate value for progress can only come from an actual processor;
      // stage/status alone never implies a made-up completion percentage.
      progressSource:'unknown'};
  }
  getScopedVideo(channelId,videoId,{includeDeleted=false}={}){
    const v=this.getVideo(videoId);
    if(!v||v.channelId!==channelId||(!includeDeleted&&v.deletedAt!==null))fail('VIDEO_NOT_FOUND',404);
    return this.videoSummary(v);
  }
  /** Resume is derived from actual persisted prerequisites: client-provided step
   * is advisory only, never proof that a scene or render exists. */
  resumeVideo(channelId,videoId){
    const v=this.getScopedVideo(channelId,videoId);
    const scenes=this.db.prepare('SELECT COUNT(*) n FROM scenes WHERE video_id=?').get(videoId).n;
    let step=v.lastActiveStep;
    if(['scenes','timeline'].includes(step)&&!v.masterScript)step='content';
    if(step==='timeline'&&scenes===0)step='scenes';
    if(v.status==='draft'&&!v.masterScript)step='content';
    return {video:v,step,hasScript:!!v.masterScript,sceneCount:scenes};
  }
  updateVideoStep(videoId,{step,rowVersion}={}){
    const v=this.getVideo(videoId);if(!v||v.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
    if(rowVersion!==v.rowVersion)fail('VERSION_CONFLICT',409);
    if(!videoSteps.includes(step))fail('INVALID_VIDEO_STEP');
    if(['scenes','timeline'].includes(step)&&!v.masterScript)fail('VIDEO_STEP_NOT_READY',409);
    if(step==='timeline'&&!this.db.prepare('SELECT 1 FROM scenes WHERE video_id=?').get(videoId))fail('VIDEO_STEP_NOT_READY',409);
    if(v.lastActiveStep===step)return v;
    this.db.prepare('UPDATE videos SET last_active_step=?,row_version=row_version+1,updated_at=? WHERE id=?')
      .run(step,this.clock(),videoId);
    this.event('video',videoId,'video.step_changed',{step});
    return this.getVideo(videoId);
  }
  renameVideo(videoId,{title,brief,rowVersion}={}){
    const v=this.getVideo(videoId);if(!v||v.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
    if(rowVersion!==v.rowVersion)fail('VERSION_CONFLICT',409);
    if(title!==undefined&&!nonempty(title,200)||brief!==undefined&&!text(brief,20000))fail('INVALID_VIDEO');
    if(title===undefined&&brief===undefined)fail('INVALID_VIDEO');
    this.db.prepare('UPDATE videos SET title=?,brief=?,row_version=row_version+1,updated_at=? WHERE id=?')
      .run(title?.trim()??v.title,brief??v.brief,this.clock(),videoId);
    this.event('video',videoId,'video.updated');
    return this.getVideo(videoId);
  }
  /** Active media jobs refer to projectId; never delete while workers may write. */
  assertVideoIdle(videoId){
    if(!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='jobs'").get())return;
    const active=this.db.prepare("SELECT payload_json FROM jobs WHERE status IN ('pending','running','paused')").all();
    for(const row of active){let payload;try{payload=JSON.parse(row.payload_json)}catch{continue}
      if(payload.projectId===videoId||payload.videoId===videoId)fail('VIDEO_HAS_ACTIVE_JOBS',409);
    }
  }
  softDeleteVideo(videoId,{rowVersion}={}){
    const v=this.getVideo(videoId);if(!v||v.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
    if(v.rowVersion!==rowVersion)fail('VERSION_CONFLICT',409);
    return transact(this.db,()=>{
      this.assertVideoIdle(videoId);
      this.db.prepare('UPDATE videos SET deleted_at=?,row_version=row_version+1,updated_at=? WHERE id=?')
        .run(this.clock(),this.clock(),videoId);
      this.event('video',videoId,'video.soft_deleted');
      return this.getVideo(videoId);
    });
  }
  restoreVideo(videoId,{rowVersion}={}){
    const v=this.getVideo(videoId);if(!v||v.deletedAt===null)fail('VIDEO_NOT_FOUND',404);
    if(v.rowVersion!==rowVersion)fail('VERSION_CONFLICT',409);
    const ch=this.getChannel(v.channelId);if(!ch||ch.deletedAt!==null)fail('CHANNEL_NOT_FOUND',409);
    this.db.prepare('UPDATE videos SET deleted_at=NULL,row_version=row_version+1,updated_at=? WHERE id=?')
      .run(this.clock(),videoId);
    this.event('video',videoId,'video.restored');
    return this.getVideo(videoId);
  }
  /** Lightweight clone: preserve script + original config snapshot, never copy
   * assets, scene UUIDs, historical jobs or render status. */
  cloneVideo(videoId,{title,idempotencyKey}={}){
    const source=this.getVideo(videoId);
    if(!source||source.deletedAt!==null)fail('VIDEO_NOT_FOUND',404);
    const channel=this.getChannel(source.channelId);
    if(!channel||channel.status!=='active'||channel.deletedAt!==null)fail('CHANNEL_ARCHIVED',409);
    if(title!==undefined&&!nonempty(title,200))fail('INVALID_VIDEO');
    if(!requestKeyOk(idempotencyKey))fail('INVALID_IDEMPOTENCY_KEY');
    const newTitle=title?.trim()??`${source.title.slice(0,190)} (copy)`;
    const hash=createHash('sha256').update(JSON.stringify([videoId,newTitle])).digest('hex');
    let selectedId=randomUUID();
    transact(this.db,()=>{
      const used=this.db.prepare("SELECT video_id,payload_sha256 FROM video_request_keys WHERE action='clone' AND request_key=?").get(idempotencyKey);
      if(used){if(used.payload_sha256!==hash)fail('IDEMPOTENCY_CONFLICT',409);selectedId=used.video_id;return;}
      const now=this.clock(),hasScript=!!source.masterScript;
      this.db.prepare(`INSERT INTO videos(id,channel_id,title,brief,status,master_script,preset_snapshot_json,
        preset_source_version,video_overrides_json,target_duration_sec,last_active_step,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(selectedId,source.channelId,newTitle,source.brief,
        hasScript?'content_ready':'draft',source.masterScript,stablePresetJson(source.preset),source.presetSourceVersion,
        stablePresetJson(source.overrides),source.targetDurationSec,'content',now,now);
      this.db.prepare(`INSERT INTO video_config_revisions(video_id,version,source_preset_version,overrides_json,
        resolved_json,impact_json,created_at) VALUES(?,?,?,?,?,?,?)`).run(selectedId,1,source.presetSourceVersion,
          stablePresetJson(source.overrides),stablePresetJson(source.effectivePreset),
          JSON.stringify({changedPaths:[],affected:[],requiresReview:false}),now);
      this.db.prepare('INSERT INTO timeline_documents(video_id,data_json,updated_at) VALUES(?,?,?)')
        .run(selectedId,JSON.stringify({tracks:['media','text','voice','music'],clips:[]}),now);
      this.db.prepare("INSERT INTO video_request_keys(action,request_key,payload_sha256,video_id) VALUES('clone',?,?,?)")
        .run(idempotencyKey,hash,selectedId);
      this.event('video',selectedId,'video.cloned',{sourceId:videoId});
    });
    return this.getVideo(selectedId);
  }
  updateScript(videoId,{masterScript,rowVersion}) {
    const v=this.getVideo(videoId); if(!v||v.deletedAt!==null) fail('VIDEO_NOT_FOUND',404);
    if (!Number.isInteger(rowVersion)||rowVersion!==v.rowVersion) fail('VERSION_CONFLICT',409);
    if (!nonempty(masterScript,300000)) fail('INVALID_SCRIPT');
    // Legacy manual import cannot bypass R1-06 once candidate review begins.
    if (v.masterScript!==masterScript && this.db.prepare('SELECT 1 FROM content_master_state WHERE video_id=?').get(videoId))
      fail('MASTER_APPROVAL_REQUIRED',409);
    // Until R2 implements scene-level diff/invalidation, reject edits that
    // would leave the saved scene texts/assets inconsistent with the master.
    if (v.masterScript!==masterScript && this.db.prepare('SELECT 1 FROM scenes WHERE video_id=? LIMIT 1').get(videoId))
      fail('SCENES_EXIST_REQUIRE_REBUILD',409);
    this.db.prepare("UPDATE videos SET master_script=?,status='content_ready',last_active_step='content',row_version=row_version+1,updated_at=? WHERE id=?")
      .run(masterScript,this.clock(),videoId);
    this.event('video',videoId,'video.script_updated');
    return this.getVideo(videoId);
  }
  /** Replace scenes only before any assets exist; future editing uses versioned diff/invalidation. */
  replaceScenes(videoId,{scenes,rowVersion}={}) {
    const video=this.getVideo(videoId); if(!video||video.deletedAt!==null) fail('VIDEO_NOT_FOUND',404);
    if (rowVersion!==video.rowVersion) fail('VERSION_CONFLICT',409);
    // Once editorial approval exists, the legacy endpoint may not bypass R2-01
    // immutable source-offset coverage; use SceneBuilderRepository.apply().
    if (this.db.prepare('SELECT 1 FROM content_master_state WHERE video_id=? AND approved_revision IS NOT NULL').get(videoId))
      fail('SCENE_BUILDER_REQUIRED',409);
    if (!Array.isArray(scenes)||scenes.length<1||scenes.length>1200) fail('INVALID_SCENE_COUNT');
    if (this.db.prepare('SELECT 1 FROM asset_revisions WHERE video_id=? LIMIT 1').get(videoId)) fail('SCENES_HAVE_ASSETS',409);
    for (const s of scenes) {
      if (!nonempty(s.text,20000)||!Number.isInteger(s.durationMs)||s.durationMs<500||s.durationMs>120000||
          (s.mediaType && !['image_motion','ai_video','import_video'].includes(s.mediaType)) || !text(s.visualPrompt??'',4000)) fail('INVALID_SCENE');
    }
    transact(this.db,()=>{
      this.db.prepare('DELETE FROM scenes WHERE video_id=?').run(videoId);
      const stmt=this.db.prepare('INSERT INTO scenes(id,video_id,idx,text,duration_ms,media_type,visual_prompt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
      const ts=this.clock();
      scenes.forEach((s,idx)=>stmt.run(randomUUID(),videoId,idx,s.text,s.durationMs,s.mediaType??'image_motion',s.visualPrompt??'',ts,ts));
      this.db.prepare("UPDATE videos SET status='scenes_ready',last_active_step='timeline',row_version=row_version+1,updated_at=? WHERE id=?").run(ts,videoId);
      // Old timeline clips target scene UUIDs that no longer exist.
      this.db.prepare('UPDATE timeline_documents SET data_json=?,row_version=row_version+1,updated_at=? WHERE video_id=?')
        .run(JSON.stringify({tracks:['media','text','voice','music'],clips:[]}),ts,videoId);
      this.event('video',videoId,'video.scenes_replaced',{count:scenes.length});
    });
    return this.listScenes(videoId);
  }
  listScenes(videoId) {
    if (!this.getVideo(videoId)) fail('VIDEO_NOT_FOUND',404);
    return this.db.prepare('SELECT * FROM scenes WHERE video_id=? ORDER BY idx').all(videoId).map(rowScene);
  }
  getScene(sceneId) {return rowScene(this.db.prepare('SELECT * FROM scenes WHERE id=?').get(sceneId));}
  getTimeline(videoId) {
    if (!this.getVideo(videoId)) fail('VIDEO_NOT_FOUND',404);
    const row=this.db.prepare('SELECT * FROM timeline_documents WHERE video_id=?').get(videoId);
    return {videoId,document:parse(row.data_json),rowVersion:row.row_version};
  }
  updateTimeline(videoId,{document,rowVersion}) {
    const current=this.getTimeline(videoId);
    if (rowVersion!==current.rowVersion) fail('VERSION_CONFLICT',409);
    // R3-04: raw timeline saves can update timing but not reorder scenes.
    // Reorder must use the fenced, audited endpoint that rebases clip offsets.
    if (JSON.stringify(document?.sceneOrder??null)!==JSON.stringify(current.document.sceneOrder??null))
      fail('TIMELINE_ORDER_ENDPOINT_REQUIRED',409);
    if (JSON.stringify(document?.visualEdits??null)!==JSON.stringify(current.document.visualEdits??null))
      fail('TIMELINE_VISUAL_EDIT_ENDPOINT_REQUIRED',409);
    if (!record(document)||!Array.isArray(document.tracks)||!Array.isArray(document.clips)||document.clips.length>6000||JSON.stringify(document).length>2000000) fail('INVALID_TIMELINE');
    if (document.clips.some(c=>!record(c)||typeof c.sceneId!=='string'||!Number.isInteger(c.startMs)||c.startMs<0||!Number.isInteger(c.durationMs)||c.durationMs<0)) fail('INVALID_CLIP');
    const validIds=new Set(this.listScenes(videoId).map(s=>s.id));
    if (document.clips.some(c=>!validIds.has(c.sceneId))) fail('FOREIGN_SCENE',409);
    transact(this.db,()=>{
      const saved=this.db.prepare('UPDATE timeline_documents SET data_json=?,row_version=row_version+1,updated_at=? WHERE video_id=? AND row_version=?')
        .run(JSON.stringify(document),this.clock(),videoId,current.rowVersion);
      if(saved.changes!==1)fail('VERSION_CONFLICT',409);
      recordTimelineChangeInTransaction(this.db,{videoId,before:current.document,beforeVersion:current.rowVersion,
        after:document,action:'timing',clock:this.clock});
    });
    return this.getTimeline(videoId);
  }
}
