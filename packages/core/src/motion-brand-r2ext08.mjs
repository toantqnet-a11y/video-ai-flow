/**
 * EXT-08: allowlisted, immutable motion + brand templates. No user JavaScript,
 * free-form FFmpeg filter expressions, fonts, paths, external template URLs,
 * or runtime-evaluated scene expressions are accepted.
 */
import {createHash} from 'node:crypto';
import {DomainError} from './domain.mjs';
import {compositionDigest,stableCompositionJson} from './composition-r2ext01.mjs';
import {transact} from './db.mjs';

const fail=(code,status=400)=>{throw new DomainError(code,status)};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const only=(x,keys)=>obj(x)&&Object.keys(x).every(k=>keys.includes(k));
const hex=x=>typeof x==='string'&&/^#[0-9a-fA-F]{6}$/.test(x);
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9-]{1,100}$/.test(x);
const presets=[
  {id:'clean',label:'Clean · tĩnh',motion:'none',transition:'cut'},
  {id:'gentle',label:'Gentle · zoom nhẹ',motion:'zoom',transition:'cut'},
  {id:'story',label:'Story · Ken Burns',motion:'ken_burns',transition:'fade_black'},
  {id:'documentary',label:'Documentary · lia chậm',motion:'pan',transition:'cut'}
];
export const MOTION_TEMPLATES=Object.freeze(presets.map(p=>Object.freeze({...p,version:1})));
export const DEFAULT_BRAND=Object.freeze({title:'',accentColor:'#1E88E5',captionColor:'#FFFFFF',outlineColor:'#131722',captionSize:26,showLowerThird:false});
const preset=id=>MOTION_TEMPLATES.find(p=>p.id===id)??fail('MOTION_PRESET_UNKNOWN');
export function normalizeMotionStyle(input){
 if(!only(input,['schemaVersion','presetId','brand','sceneOverrides'])||input.schemaVersion!==1)fail('MOTION_STYLE_INVALID');
 const p=preset(input.presetId);
 const b=input.brand??{};
 if(!only(b,['title','accentColor','captionColor','outlineColor','captionSize','showLowerThird']))fail('MOTION_BRAND_INVALID');
 const brand={...DEFAULT_BRAND,...b};
 if(typeof brand.title!=='string'||brand.title.length>42||/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(brand.title)||
   !hex(brand.accentColor)||!hex(brand.captionColor)||!hex(brand.outlineColor)||
   !Number.isInteger(brand.captionSize)||brand.captionSize<18||brand.captionSize>42||typeof brand.showLowerThird!=='boolean')fail('MOTION_BRAND_INVALID');
 if(!Array.isArray(input.sceneOverrides)||input.sceneOverrides.length>1200)fail('MOTION_OVERRIDES_INVALID');
 const seen=new Set();const sceneOverrides=input.sceneOverrides.map(x=>{
   if(!only(x,['sceneId','presetId'])||!safeId(x.sceneId)||seen.has(x.sceneId))fail('MOTION_OVERRIDES_INVALID');
   seen.add(x.sceneId);return {sceneId:x.sceneId,presetId:preset(x.presetId).id};
 }).sort((a,b)=>a.sceneId.localeCompare(b.sceneId,'en'));
 const normalized={schemaVersion:1,presetId:p.id,brand,sceneOverrides};
 return {...normalized,digest:compositionDigest(normalized)};
}
export function validateMotionStyle(value){
 if(!only(value,['schemaVersion','presetId','brand','sceneOverrides','digest'])||typeof value.digest!=='string')fail('MOTION_STYLE_INVALID');
 const {digest,...input}=value;const normalized=normalizeMotionStyle(input);
 if(normalized.digest!==digest||stableCompositionJson(normalized)!==stableCompositionJson(value))fail('MOTION_STYLE_DIGEST_MISMATCH',409);
 return normalized;
}
export function resolveMotionStyle(style,composition){
 const normalized=validateMotionStyle(style);
 const sceneIds=new Set(composition.scenes.map(s=>s.id));
 if(normalized.sceneOverrides.some(s=>!sceneIds.has(s.sceneId)))fail('MOTION_STYLE_STALE_SCENE',409);
 return {brand:normalized.brand,byScene:new Map(composition.scenes.map(s=>{
  const override=normalized.sceneOverrides.find(x=>x.sceneId===s.id);
  return [s.id,preset(override?.presetId??normalized.presetId)];
 }))};
}
/** Immutable history in SQLite; edits are new revisions, never mutation. */
export class MotionBrandRepository{
 constructor(repo){this.repo=repo;this.db=repo.db;}
 latest(videoId){this.repo.getVideo(videoId)??fail('VIDEO_NOT_FOUND',404);
  const row=this.db.prepare('SELECT revision,payload_json FROM motion_brand_revisions WHERE video_id=? ORDER BY revision DESC LIMIT 1').get(videoId);
  return row?{revision:row.revision,style:validateMotionStyle(JSON.parse(row.payload_json))}:{revision:0,style:normalizeMotionStyle({schemaVersion:1,presetId:'clean',brand:{},sceneOverrides:[]})};
 }
 revision(videoId,revision){this.repo.getVideo(videoId)??fail('VIDEO_NOT_FOUND',404);
  if(!Number.isSafeInteger(revision)||revision<1)fail('MOTION_REVISION_INVALID');
  const row=this.db.prepare('SELECT payload_json FROM motion_brand_revisions WHERE video_id=? AND revision=?').get(videoId,revision);
  if(!row)fail('MOTION_REVISION_NOT_FOUND',404);
  return {revision,style:validateMotionStyle(JSON.parse(row.payload_json))};
 }
 publish(videoId,body){
  if(!only(body,['expectedRevision','style'])||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail('MOTION_PUBLISH_INVALID');
  const style=normalizeMotionStyle(body.style);
  return transact(this.db,()=>{
   const latest=this.latest(videoId);
   if(latest.revision!==body.expectedRevision)fail('MOTION_REVISION_CONFLICT',409);
   const activeScenes=new Set(this.repo.listScenes(videoId).map(s=>s.id));
   if(style.sceneOverrides.some(x=>!activeScenes.has(x.sceneId)))fail('MOTION_STYLE_STALE_SCENE',409);
   if(style.digest===latest.style.digest)return {...latest,unchanged:true};
   const next=latest.revision+1;
   this.db.prepare('INSERT INTO motion_brand_revisions(video_id,revision,digest,payload_json,created_at) VALUES(?,?,?,?,?)')
    .run(videoId,next,style.digest,stableCompositionJson(style),Date.now());
   this.repo.event('video',videoId,'motion_brand.published',{revision:next,digest:style.digest});
   return {revision:next,style,unchanged:false};
  });
 }
}
