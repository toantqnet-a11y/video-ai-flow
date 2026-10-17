/**
 * Generate OpenAPI from the checked-in catalog, without contacting npm or the
 * server. The same catalog drives drift tests and the SDK type declarations.
 */
import {operations,schemas} from './catalog.mjs';
const toPath=(p)=>p.replace(/:([A-Za-z][A-Za-z0-9_]*)/g,'{$1}');
const json=(schema)=>({'application/json':{schema}});
export function buildOpenApi(){
 const paths={};
 for(const op of operations){
   const path=toPath(op.path),item=paths[path]??(paths[path]={});
   const params=[...op.path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map(m=>({name:m[1],in:'path',required:true,schema:{type:'string',minLength:1,maxLength:80}}));
   for(const [key,schema] of Object.entries(op.query??{})) params.push({name:key,in:'query',required:false,schema});
   if(op.stream)params.push({name:'Last-Event-ID',in:'header',required:false,schema:{type:'string',pattern:'^[0-9]+$'},description:'Durable cursor; no bearer in URL'});
   const entry={operationId:op.id,summary:op.description,tags:[op.path.split('/')[2]??'service'],
      security:op.public?[]:[{SessionBearer:[]}],
      responses:{'400':{description:'Invalid input',content:json({$ref:'#/components/schemas/Error'})},
       '401':{description:'Pairing or bearer required',content:json({$ref:'#/components/schemas/Error'})},
       '403':{description:'CSRF, remote consent, or policy denied',content:json({$ref:'#/components/schemas/Error'})},
       '409':{description:'Version/idempotency conflict',content:json({$ref:'#/components/schemas/Error'})},
       '500':{description:'Sanitized internal failure',content:json({$ref:'#/components/schemas/Error'})}}};
   if(params.length)entry.parameters=params;
   if(op.body)entry.requestBody={required:!op.optionalBody,content:json(op.body)};
   if(op.binaryImage){entry.responses['200']={description:'Private channel avatar, authenticated, no-store',content:{'image/png':{schema:{type:'string',format:'binary'}},'image/jpeg':{schema:{type:'string',format:'binary'}}}};}
   else if(op.binarySceneImage){entry.responses['200']={description:'Private scene image, no-store',content:Object.fromEntries(['image/png','image/jpeg','image/webp'].map(t=>[t,{schema:{type:'string',format:'binary'}}]))};}
   else if(op.binarySceneVideo||op.binaryVideo){entry.responses['200']={description:'Private MP4 export',content:{'video/mp4':{schema:{type:'string',format:'binary'}}}};}
   else if(op.binaryArchive){entry.responses['200']={description:'Private ZIP64 project bundle',content:{'application/zip':{schema:{type:'string',format:'binary'}}}};}
   else if(op.binaryAudio){entry.responses['200']={description:'Ephemeral audio; never cached',content:{'audio/mpeg':{schema:{type:'string',format:'binary'}},'audio/wav':{schema:{type:'string',format:'binary'}}}};}
   else if(op.stream){entry.responses['200']={description:'Replayable job status events',content:{'text/event-stream':{schema:{type:'string'},example:'id: 1\\nevent: job\\ndata: {"seq":1}\\n\\n'}}};}
   else entry.responses[op.created?'201':op.accepted?'202':'200']={description:'Success',content:json(op.response)};
   if(!op.public && op.method!=='GET')entry.description='Requires Bearer authorization and x-contentstudio-csrf (CSRF) header; no auth query parameters.';
   item[op.method.toLowerCase()]=entry;
 }
 return {openapi:'3.1.0',info:{title:'ContentStudio Local API',version:'0.6.0',description:'Local-first Windows desktop companion. Secret values are write-only; paid AI never starts without approval.'},
   servers:[{url:'http://127.0.0.1:4311',description:'local process only'}],
   components:{securitySchemes:{SessionBearer:{type:'http',scheme:'bearer',bearerFormat:'opaque-memory-token'}},schemas},paths};
}
