import {videoListQuery} from './video-library.mjs';
import {create} from 'zustand';
import {api,pair} from './api.js';
/** UI-only selections live in Zustand; canonical state stays in SQLite API. */
export const useStudio=create((set,get)=>({
  paired:false,loading:false,error:'',channels:[],videos:[],videoNextCursor:null,videoFilter:{},videosLoading:false,videosError:'',videoRequestSeq:0,scenes:[],jobs:[],
  systemDiagnostics:null,diagnosticsLoading:false,diagnosticsError:'',
  currentChannel:null,currentVideo:null,tab:'channels',contentBriefDirty:false,
  masterScriptDirty:false,sceneBuilderDirty:false,timelineWorkspaceDirty:false,
  flowTarget:null,renderFocusToken:0,
  async connect(code){set({loading:true,error:''});try{await pair(code);set({paired:true});await get().refreshChannels();}catch(e){set({error:e.message});}finally{set({loading:false});}},
  async refreshChannels(){const result=await api('/channels?status=any');set({channels:result.items});},
  async openChannelSettings(channel){set({currentChannel:channel,currentVideo:null,tab:'channel-settings',error:''});},
  async reloadChannel(id){const channel=await api(`/channels/${id}`);set({currentChannel:channel});await get().refreshChannels();return channel;},
  async updateChannel(id,body){const updated=await api(`/channels/${id}`,{method:'PATCH',body});
    set({currentChannel:updated});await get().refreshChannels();return updated;},
  async changeChannelLifecycle(channel,mode){
    const method=mode==='delete'?'DELETE':'POST';const path=mode==='delete'?`/channels/${channel.id}`:`/channels/${channel.id}/${mode}`;
    await api(path,{method,body:{rowVersion:channel.rowVersion}});
    if(get().currentChannel?.id===channel.id)set({currentChannel:null,currentVideo:null,videos:[],tab:'channels'});
    await get().refreshChannels();
  },
  async addChannel(body){const created=await api('/channels',{method:'POST',body});await get().refreshChannels();set({currentChannel:created,currentVideo:null,tab:'channel-settings'});return created;},
  async chooseChannel(channel){
    // Reset scoped data before requesting a new channel, preventing a flash of
    // videos belonging to the previously selected channel on slow connections.
    set(s=>({currentChannel:channel,currentVideo:null,videos:[],videoNextCursor:null,scenes:[],tab:'videos',flowTarget:null,renderFocusToken:0,error:'',videoRequestSeq:s.videoRequestSeq+1}));
    await get().loadVideoPage({});
  },
  async loadVideoPage(filter={}){
    const channelId=get().currentChannel?.id;if(!channelId)return;
    const seq=get().videoRequestSeq+1;
    set({videosLoading:true,videosError:'',videoFilter:filter,videoRequestSeq:seq,videoNextCursor:null});
    try{
      const result=await api(`/channels/${channelId}/videos?${videoListQuery(filter)}`);
      if(get().videoRequestSeq===seq&&get().currentChannel?.id===channelId)
        set({videos:result.items,videoNextCursor:result.nextCursor,videosLoading:false});
    }catch(e){if(get().videoRequestSeq===seq)set({videosLoading:false,videosError:e.code??e.message});throw e;}
  },
  async moreVideos(){
    const {videoNextCursor:cursor,videoFilter:filter,currentChannel:channel,videosLoading}=get();
    if(!cursor||!channel||videosLoading)return;
    const seq=get().videoRequestSeq+1;
    set({videosLoading:true,videoRequestSeq:seq,videosError:''});
    try{
      const result=await api(`/channels/${channel.id}/videos?${videoListQuery({...filter,cursor})}`);
      if(get().videoRequestSeq===seq&&get().currentChannel?.id===channel.id)
        set(s=>({videos:[...s.videos,...result.items],videoNextCursor:result.nextCursor,videosLoading:false}));
    }catch(e){if(get().videoRequestSeq===seq)set({videosLoading:false,videosError:e.code??e.message});throw e;}
  },
  async addVideo(body){
    const channelId=get().currentChannel?.id;
    if(!channelId)throw Error('CHANNEL_NOT_FOUND');
    const v=await api(`/channels/${channelId}/videos`,{method:'POST',body});
    await get().loadVideoPage(get().videoFilter);
    await get().chooseVideo(v);return v;
  },
  async chooseVideo(video){
    const channelId=get().currentChannel?.id;
    if(!channelId)throw Error('CHANNEL_NOT_FOUND');
    const resume=await api(`/channels/${channelId}/videos/${video.id}/resume`);
    const scenes=await api(`/videos/${video.id}/scenes`);
    set({currentVideo:resume.video,scenes:scenes.items,tab:resume.step,flowTarget:resume.step==='timeline'?'timeline':null,renderFocusToken:0,error:''});
    return resume;
  },
  async renameVideo(video,patch){const v=await api(`/videos/${video.id}`,{method:'PATCH',body:{...patch,rowVersion:video.rowVersion}});return v;},
  async cloneVideo(video,body){return api(`/videos/${video.id}/clone`,{method:'POST',body});},
  async deleteVideo(video){return api(`/videos/${video.id}`,{method:'DELETE',body:{rowVersion:video.rowVersion}});},
  async restoreVideo(video){return api(`/videos/${video.id}/restore`,{method:'POST',body:{rowVersion:video.rowVersion}});},
  async saveCurrentStep(step){
    const video=get().currentVideo;if(!video||video.lastActiveStep===step)return;
    try{const result=await api(`/videos/${video.id}/step`,{method:'PUT',body:{step,rowVersion:video.rowVersion}});
      if(get().currentVideo?.id===video.id)set({currentVideo:result});
    }catch(e){if(e.code==='VERSION_CONFLICT')await get().reloadVideo(video.id);}
  },
  async reloadVideo(id){const v=await api(`/videos/${id}`);set({currentVideo:v});return v;},
  async saveScript(script){const v=get().currentVideo;const updated=await api(`/videos/${v.id}/script`,{method:'PUT',body:{masterScript:script,rowVersion:v.rowVersion}});set({currentVideo:updated});},
  async makeScenes(texts){const v=get().currentVideo;
    const scenes=texts.map(text=>({text,durationMs:18000,mediaType:'image_motion'}));
    const created=await api(`/videos/${v.id}/scenes`,{method:'PUT',body:{scenes,rowVersion:v.rowVersion}});
    const fresh=await api(`/videos/${v.id}`);set({scenes:created.items,currentVideo:fresh,tab:'timeline'});},
  async loadDiagnostics(force=false){
    set({diagnosticsLoading:true,diagnosticsError:''});
    try{const report=await api(force?'/system/diagnostics/refresh':'/system/diagnostics',
      force?{method:'POST',body:{}}:undefined);
      set({systemDiagnostics:report});return report;
    }catch(error){set({diagnosticsError:'Không thể kiểm tra hệ thống'});throw error;}
    finally{set({diagnosticsLoading:false});}
  },
  async refreshJobs(){const result=await api('/jobs');set({jobs:result.items});},
  async diagnostic(){await api('/jobs/diagnostic',{method:'POST',body:{idempotencyKey:String(Date.now())}});await get().refreshJobs();},
  setTab(tab){set({tab,flowTarget:tab==='timeline'?'timeline':null,renderFocusToken:0});},setError(error){set({error})}
}));
