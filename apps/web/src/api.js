/**
 * R0-05 compatibility facade. Existing React screens keep the small api()/pair()
 * interface, while endpoint allowlisting, auth/CSRF and SSE framing now live in
 * the versioned shared SDK. Never store session secrets in Zustand/localStorage.
 */
import {createStudioClient} from '../../../packages/sdk/src/client.mjs';
const client=createStudioClient();
export const authenticated=()=>client.authenticated();
export const pair=(code)=>client.pair(code);
export const api=(path,options)=>client.requestPath(path,options);
export const streamJobs=(handler,options={})=>client.streamJobs(handler,{retries:3,...options});
// Typed callers can migrate incrementally without duplicating HTTP logic.
export const studioClient=client;

// Binary voice preview shares the in-memory authenticated SDK session.
export const previewVoice=(id,body,options)=>client.previewVoice(id,body,options);

// Private channel artwork must be fetched with the in-memory bearer session.
export const getChannelAvatar=(id,options)=>client.getChannelAvatar(id,options);

export const getSceneVoiceAudio=(id,options)=>client.getSceneVoiceAudio(id,options);

export const getSceneImageFile=(id,options)=>client.getSceneImageFile(id,options);

export const downloadLocalVideoRender=(id,jobId,options)=>client.downloadLocalVideoRender(id,jobId,options);
export const saveLocalVideoRender=(id,jobId,fileHandle,options)=>client.saveLocalVideoRender(id,jobId,fileHandle,options);

export const downloadLocalVideoThumbnail=(id,jobId,options)=>client.downloadLocalVideoThumbnail(id,jobId,options);

export const downloadLocalVideoSubtitle=(id,jobId,options)=>client.downloadLocalVideoSubtitle(id,jobId,options);

// R3-11 private ZIP project export, no tokens in browser anchor links.
export const downloadProjectZip=(id,revision,options)=>client.downloadProjectZip(id,revision,options);
export const saveProjectZip=(id,revision,handle,options)=>client.saveProjectZip(id,revision,handle,options);

// R2-VID: authenticated clip Blob URL (bearer stays inside SDK memory).
export const getSceneClipFile=(id,options)=>client.getSceneClipFile(id,options);
export const uploadSceneClipStream=(id,file,options)=>client.uploadSceneClipStream(id,file,options);

// Read old clip versions privately, without activating them.
export const getSceneClipRevisionFile=(id,assetId,options)=>client.getSceneClipRevisionFile(id,assetId,options);
