/** R2-09: video-scoped, read-only asset browser. Never returns disk paths,
 * prompts or provider credentials, and never makes a paid/local model call. */
import {DomainError} from './domain.mjs';

const KIND=new Set(['all','voice','image','video']);
const TOKEN=/^[A-Za-z0-9_-]{1,350}$/;
const ASSET_ID=/^[a-zA-Z0-9_-]{1,80}$/;
const fail=()=>{throw new DomainError('INVALID_ASSET_LIBRARY_QUERY',400)};
function options(query){
  if(!query||typeof query!=='object'||Array.isArray(query)||Object.keys(query).some(x=>!['kind','limit','cursor'].includes(x)))fail();
  if((Object.hasOwn(query,'kind')&&query.kind===null)||(Object.hasOwn(query,'limit')&&query.limit===null))fail();
  const kind=query.kind??'all',number=query.limit??20;
  if(!KIND.has(kind)||!(typeof number==='number'||typeof number==='string')||!/^(?:[1-9]|[1-4][0-9]|50)$/.test(String(number)))fail();
  return {kind,limit:Number(number),cursor:query.cursor??null};
}
function parseCursor(cursor,videoId,kind){
  if(cursor===null)return null;
  if(typeof cursor!=='string'||!TOKEN.test(cursor))fail();
  let obj;
  try{
    const decoded=Buffer.from(cursor,'base64url');
    if(decoded.toString('base64url')!==cursor)fail();
    obj=JSON.parse(decoded.toString('utf8'));
  }catch{fail()}
  if(!obj||Object.keys(obj).sort().join(',')!=='at,id,kind,v,videoId'||obj.v!==1||
    obj.videoId!==videoId||obj.kind!==kind||!Number.isSafeInteger(obj.at)||obj.at<0||
    typeof obj.id!=='string'||!ASSET_ID.test(obj.id))fail();
  return obj;
}
const cursorFor=(videoId,kind,row)=>Buffer.from(JSON.stringify({v:1,videoId,kind,at:row.created_at,id:row.id})).toString('base64url');

export class AssetLibraryR209 {
  constructor({repo,manifest}){this.repo=repo;this.manifest=manifest;this.db=repo.db;}
  ensureVideo(id){
    // Do not expose tombstoned or nonexistent videos via this read-only surface.
    if(typeof id!=='string'||!this.repo.getVideo(id)||this.repo.getVideo(id).deletedAt!==null)
      throw new DomainError('VIDEO_NOT_FOUND',404);
  }
  async page(videoId,query={}){
    this.ensureVideo(videoId);
    const {kind,limit,cursor}=options(query),after=parseCursor(cursor,videoId,kind);
    const rows=this.db.prepare(`SELECT ar.id,ar.scene_id,ar.kind,ar.source,ar.bytes,ar.sha256,
      ar.state,ar.created_at,s.idx,s.voice_asset_id,s.visual_asset_id
      FROM asset_revisions ar JOIN scenes s ON ar.scene_id=s.id AND s.video_id=ar.video_id
      WHERE ar.video_id=? AND (?='all' OR ar.kind=?)
        AND (? IS NULL OR ar.created_at<? OR (ar.created_at=? AND ar.id<?))
      ORDER BY ar.created_at DESC,ar.id DESC LIMIT ?`)
      .all(videoId,kind,kind,after?.id??null,after?.at??0,after?.at??0,after?.id??'',limit+1);
    const more=rows.length>limit,page=more?rows.slice(0,limit):rows;
    // Hash each bounded visible page only. No global filesystem scan or writes.
    const describe=async row=>({
      id:row.id,sceneId:row.scene_id,sceneIndex:row.idx,kind:row.kind,source:row.source,
      bytes:row.bytes,sha256:row.sha256,createdAt:row.created_at,state:row.state,
      selected:(row.kind==='voice'?row.voice_asset_id:row.visual_asset_id)===row.id,
      health:await this.manifest.verifyRevision(row.id)
    });
    // Cap parallel disk hashing so 50 large video files cannot saturate IO.
    const items=[];
    for(let i=0;i<page.length;i+=4)items.push(...await Promise.all(page.slice(i,i+4).map(describe))); 
    return {videoId,items,nextCursor:more?cursorFor(videoId,kind,page.at(-1)):null};
  }
  async recompute(videoId){
    this.ensureVideo(videoId);
    // The existing R2-06 planner preserves explicitly selected manual images.
    const plan=await this.manifest.planRecompute(videoId);
    const summary={reuseVoice:0,reuseVisual:0,manualPreserved:0,regenerateVoice:0,
      regenerateVisual:0,missingVoice:0,missingVisual:0};
    for(const scene of plan.scenes){
      if(scene.voice==='reuse')summary.reuseVoice++;
      if(scene.voice==='regenerate')summary.regenerateVoice++;
      if(scene.voice==='not_generated')summary.missingVoice++;
      if(scene.visual==='reuse')summary.reuseVisual++;
      if(scene.visual==='manual_preserved')summary.manualPreserved++;
      if(scene.visual==='regenerate')summary.regenerateVisual++;
      if(scene.visual==='not_generated')summary.missingVisual++;
    }
    return {...plan,summary,queued:false,requiresExplicitSubmit:true};
  }
}
