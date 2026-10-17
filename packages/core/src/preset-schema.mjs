/**
 * R0-08 canonical channel-preset JSON Schema (draft 2020-12 compatible).
 * This exact schema is reused by OpenAPI and the local persistence validator.
 * It describes configuration ONLY: tokens, credentials and payment approvals
 * belong to the backend vault/approval ledger, never channel presets.
 */
const string=(maxLength,{minLength=0}={})=>({type:'string',minLength,maxLength});
const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
const choice=(...values)=>({type:'string',enum:values});
const group=(properties,required)=>({type:'object',additionalProperties:false,properties,required});

/** Shared initial channel configuration. The frontend imports this exact object;
 * no duplicated defaults drifting between React and SQLite. */
export const defaultPreset=Object.freeze({
  content:{style:'giải thích rõ ràng',tone:'thân thiện',language:'vi',targetMinutes:35},
  voice:{provider:'edge',voice:'vi-VN-HoaiMyNeural',speed:1},
  media:{mode:'hybrid',style:'cinematic documentary',aspectRatio:'16:9',sceneSeconds:18},
  render:{width:1920,height:1080,fps:30,codec:'h264'},
  models:{paidEnabled:false,remoteEnabled:false}
});

export const presetSchema=group({
  content:group({
    style:string(500,{minLength:1}),tone:string(500,{minLength:1}),language:string(500,{minLength:1}),targetMinutes:integer(1,240),
    audience:string(500),topic:string(500),addressStyle:string(500),
    preferredTerms:string(500),avoidTerms:string(500),basePrompt:string(4000),extraPrompt:string(4000)
  },['style','tone','language','targetMinutes']),
  voice:group({provider:choice('edge','local','piper','vieneu','espeak'),voice:string(150,{minLength:1}),
    speed:{type:'number',minimum:0.5,maximum:2},characterName:string(300),characterDescription:string(300)},
    ['provider','voice','speed']),
  media:group({mode:choice('hybrid','image_motion','ai_video','import_video'),
    style:string(300,{minLength:1}),aspectRatio:choice('16:9','9:16','1:1'),
    sceneSeconds:integer(2,120),motionEffect:choice('ken_burns','zoom','pan','none')},
    ['mode','style','aspectRatio','sceneSeconds']),
  render:group({width:integer(1,3840),height:integer(1,2160),fps:{type:'integer',enum:[24,25,30,60]},
    codec:choice('h264'),subtitles:{type:'boolean'}},['width','height','fps','codec']),
  models:group({paidEnabled:{type:'boolean'},remoteEnabled:{type:'boolean'}},['paidEnabled','remoteEnabled'])
},['content','voice','media','render','models']);

/** Small, dependency-free validator for this finite schema. No coercion: JSON
 * must round-trip exactly; 1e999, NaN, null and unknown keys are rejected.
 * Provider availability/quota must be checked again at job execution time.
 */
export function matchesPresetSchema(value,schema=presetSchema){
  if (schema.type==='object') {
    if(!value || typeof value!=='object' || Array.isArray(value))return false;
    if((schema.required??[]).some(key=>!Object.hasOwn(value,key)))return false;
    return Object.entries(value).every(([key,item])=>{
      const child=schema.properties[key];
      return child?matchesPresetSchema(item,child):schema.additionalProperties!==false;
    });
  }
  if(schema.type==='string')return typeof value==='string' && value.length>=(schema.minLength??0)
    && value.length<=(schema.maxLength??Infinity) && (!schema.enum||schema.enum.includes(value));
  if(schema.type==='boolean')return typeof value==='boolean';
  if(schema.type==='integer')return Number.isSafeInteger(value) && value>=(schema.minimum??-Infinity)
    && value<=(schema.maximum??Infinity) && (!schema.enum||schema.enum.includes(value));
  if(schema.type==='number')return typeof value==='number' && Number.isFinite(value)
    && value>=(schema.minimum??-Infinity) && value<=(schema.maximum??Infinity);
  return false;
}

/** Stable key order is important: saving an equivalent JSON object should not
 * create a new revision merely because a different client reordered fields.
 * Caller must run validPreset() before serializing untrusted data.
 */
export function stablePresetJson(value){
  const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'
    ?Object.fromEntries(Object.keys(x).sort().map(key=>[key,ordered(x[key])])):x;
  return JSON.stringify(ordered(value));
}

/** Static capabilities describe editor options, NOT provider availability or
 * free-tier eligibility. Live provider checks are owned by EP02/R0-07.
 */
export const presetCapabilities=Object.freeze({
  ttsProviders:['edge','local','piper','vieneu','espeak'],
  mediaModes:['hybrid','image_motion','ai_video','import_video'],
  aspectRatios:['16:9','9:16','1:1'],
  outputCodecs:['h264'],
  edgeVietnameseVoices:['vi-VN-HoaiMyNeural','vi-VN-NamMinhNeural'],
  paidEnabledByDefault:false,remoteEnabledByDefault:false
});
