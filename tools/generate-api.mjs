/** Reproducible and deterministic OpenAPI/TypeScript generation; no npm download. */
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildOpenApi} from '../packages/contracts/src/openapi.mjs';
import {generateTypes} from '../packages/contracts/src/typegen.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const generated=[
 ['docs/api/openapi.json',JSON.stringify(buildOpenApi(),null,2)+'\n'],
 ['packages/contracts/src/types.d.mts',generateTypes()],
 ['packages/sdk/src/client.d.mts',`/** GENERATED client declarations; tools/generate-api.mjs */\nimport type { OperationId,OperationArgs,OperationResult,JobEvent } from '../../contracts/src/types.d.mts';\nexport class StudioApiError extends Error { readonly code:string; readonly status:number; constructor(code:string,status?:number); }\nexport function readJobEventStream(stream:ReadableStream<Uint8Array>,onEvent:(event:JobEvent)=>void,opts?:{signal?:AbortSignal,lastEventId?:number,maxFrameBytes?:number}):Promise<{lastEventId:number}>;\nexport interface StudioClient {\n authenticated():boolean; clear():void; pair(code:string):Promise<true>;\n request<K extends Exclude<OperationId,'streamJobEvents'>>(id:K,args:OperationArgs<K>,options?:{signal?:AbortSignal}):Promise<OperationResult<K>>;\n getChannelAvatar(channelId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 getSceneVoiceAudio(sceneId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 getSceneImageFile(sceneId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 getSceneClipFile(sceneId:string,options?:{signal?:AbortSignal}):Promise<Blob>;\n uploadSceneClipStream(sceneId:string,file:File,options:{expectedRowVersion:number,signal?:AbortSignal}):Promise<unknown>;
 getSceneClipRevisionFile(sceneId:string,assetId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 downloadLocalVideoThumbnail(videoId:string,jobId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 downloadLocalVideoRender(videoId:string,jobId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 downloadLocalVideoSubtitle(videoId:string,jobId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 downloadProjectZip(videoId:string,revision:number,options?:{signal?:AbortSignal}):Promise<Blob>;
 saveProjectZip(videoId:string,revision:number,fileHandle:FileSystemFileHandle,options?:{signal?:AbortSignal}):Promise<{bytes:number}>;
 saveLocalVideoRender(videoId:string,jobId:string,fileHandle:FileSystemFileHandle,options?:{signal?:AbortSignal}):Promise<{bytes:number}>;
 previewVoice(channelId:string,body:import('../../contracts/src/types.d.mts').VoicePreviewInput,options?:{signal?:AbortSignal}):Promise<Blob>;
 requestPath(path:string,options?:{method?:'GET'|'POST'|'PATCH'|'PUT'|'DELETE',body?:unknown,signal?:AbortSignal}):Promise<unknown>;\n streamJobs(onEvent:(event:JobEvent)=>void,opts?:{signal?:AbortSignal,lastEventId?:number,retries?:number,retryDelayMs?:number}):Promise<{lastEventId:number}>;\n}\nexport function createStudioClient(options?:{fetchImpl?:typeof fetch,baseUrl?:string}):StudioClient;\n`]
];
const check=process.argv.includes('--check');
let mismatch=false;
for(const [path,content] of generated){const target=join(root,path);
 if(check){let prior='';try{prior=await readFile(target,'utf8')}catch{}if(prior!==content){console.error('OUTDATED_GENERATED_ARTIFACT',path);mismatch=true;}}
 else {await mkdir(dirname(target),{recursive:true});await writeFile(target,content);console.log('GENERATED',path);}
}
if(mismatch)process.exitCode=1;
else if(check)console.log('GENERATED_ARTIFACTS_UP_TO_DATE');
