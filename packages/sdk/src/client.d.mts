/** GENERATED client declarations; tools/generate-api.mjs */
import type { OperationId,OperationArgs,OperationResult,JobEvent } from '../../contracts/src/types.d.mts';
export class StudioApiError extends Error { readonly code:string; readonly status:number; constructor(code:string,status?:number); }
export function readJobEventStream(stream:ReadableStream<Uint8Array>,onEvent:(event:JobEvent)=>void,opts?:{signal?:AbortSignal,lastEventId?:number,maxFrameBytes?:number}):Promise<{lastEventId:number}>;
export interface StudioClient {
 authenticated():boolean; clear():void; pair(code:string):Promise<true>;
 request<K extends Exclude<OperationId,'streamJobEvents'>>(id:K,args:OperationArgs<K>,options?:{signal?:AbortSignal}):Promise<OperationResult<K>>;
 getChannelAvatar(channelId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 getSceneVoiceAudio(sceneId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 getSceneImageFile(sceneId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 getSceneClipFile(sceneId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 getSceneClipRevisionFile(sceneId:string,assetId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 downloadLocalVideoThumbnail(videoId:string,jobId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 downloadLocalVideoRender(videoId:string,jobId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 downloadLocalVideoSubtitle(videoId:string,jobId:string,options?:{signal?:AbortSignal}):Promise<Blob>;
 downloadProjectZip(videoId:string,revision:number,options?:{signal?:AbortSignal}):Promise<Blob>;
 saveProjectZip(videoId:string,revision:number,fileHandle:FileSystemFileHandle,options?:{signal?:AbortSignal}):Promise<{bytes:number}>;
 saveLocalVideoRender(videoId:string,jobId:string,fileHandle:FileSystemFileHandle,options?:{signal?:AbortSignal}):Promise<{bytes:number}>;
 previewVoice(channelId:string,body:import('../../contracts/src/types.d.mts').VoicePreviewInput,options?:{signal?:AbortSignal}):Promise<Blob>;
 requestPath(path:string,options?:{method?:'GET'|'POST'|'PATCH'|'PUT'|'DELETE',body?:unknown,signal?:AbortSignal}):Promise<unknown>;
 streamJobs(onEvent:(event:JobEvent)=>void,opts?:{signal?:AbortSignal,lastEventId?:number,retries?:number,retryDelayMs?:number}):Promise<{lastEventId:number}>;
}
export function createStudioClient(options?:{fetchImpl?:typeof fetch,baseUrl?:string}):StudioClient;
