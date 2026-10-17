/** R2-11 single-scene selective regeneration + safe voice undo. All IO local. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {openProjectDb,StudioRepository,AssetManifest,SceneImageRepository,
  SceneVoiceRepository,SelectiveRegenerationR211,voiceSnapshot,imageSnapshot,
  voiceIntentMatches} from '../src/index.mjs';
import {JobStore} from '../../../spikes/SP-04/src/store.js';
import {JobRunner} from '../../../spikes/SP-04/src/runner.js';
import {promoteQueueAsset} from '../src/manifest.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
const reg={imageAdapter:{async loadWorkflow(){return {'5':{inputs:{seed:3}}}}},
  list:()=>[{id:'comfyui',kind:'image',location:'local',costTier:'local'}]};
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'r211-'));const file=join(root,'studio.sqlite');
  const db=openProjectDb(file),repo=new StudioRepository(db);
  const store=new JobStore({path:file,leaseMs:5000,baseBackoffMs:0,maxBackoffMs:0});
  const ch=repo.createChannel({name:'Selective R211'}),video=repo.createVideo(ch.id,{title:'Explicit regen'});
  const scenes=repo.replaceScenes(video.id,{rowVersion:1,scenes:[
    {text:'Hello in Vietnamese',visualPrompt:'A forest',durationMs:4000,mediaType:'image_motion'},
    {text:'Another scene narration',visualPrompt:'A city',durationMs:4000,mediaType:'image_motion'}]});
  const manifest=new AssetManifest({db,repository:repo,dataRoot:root});
  const sceneVoices=new SceneVoiceRepository(repo,{store,manifest,localVoices:{piper:'vi_mock'}});
  const sceneImages=new SceneImageRepository(repo,{store,manifest,registry:reg});
  const service=new SelectiveRegenerationR211({repo,manifest,sceneVoices,sceneImages});
  return {root,file,db,repo,store,video,scenes,manifest,sceneVoices,sceneImages,service,
    close:async()=>{store.close();db.close();await rm(root,{recursive:true,force:true});}};
}
const req=(s,key,kind='voice',options=null)=>({kind,requestKey:key,expectedRowVersion:s.rowVersion,
  options:options??(kind==='voice'?{provider:'piper',speed:1}:{width:512,height:512,seed:3})});
async function complete(f,jobId){
  const handler=async(p,{jobId:jid})=>{
    const kind=p.providerId==='comfyui'?'image':'voice';
    const buffer=kind==='image'?png:Buffer.from('a synthetic test audio payload '+jid);
    const folder=join(f.root,'outputs');await mkdir(folder,{recursive:true});
    const path=join(folder,jid+(kind==='image'?'.png':'.wav'));await writeFile(path,buffer);
    return {result:kind==='voice'?{sceneId:p.sceneId,kind,providerId:p.providerId,
      voiceInputHash:p.inputHash,textSha256:p.textSha256,configRevision:p.configRevision,
      voice:p.voice,rate:p.rate,durationSec:1.12,codec:'pcm_s16le'}:
      {sceneId:p.sceneId,kind,providerId:'comfyui',imageInputHash:p.inputHash,
        sourceSha256:p.sourceSha256,configRevision:p.configRevision,workflowHash:p.workflowHash,
        width:p.width,height:p.height,seed:p.seed},
      asset:{logicalKey:`${kind}:${p.sceneId}:${p.inputHash}`,filePath:path,checksum:sha(buffer)}};
  };
  const runner=new JobRunner(f.store,{'asset:voice':handler,'asset:image':handler},
    {concurrency:1,pollMs:3,heartbeatMs:300});
  runner.start();try{await runner.waitForIdle({timeoutMs:4000});}finally{await runner.stop({abort:true});}
  return await promoteQueueAsset({manifest:f.manifest,jobId});
}

test('regular snapshot input hashes remain exactly backward compatible',async()=>{
  const f=await fixture();try{
    const s=f.scenes[0],v=f.repo.getVideo(f.video.id);
    const one=voiceSnapshot(s,v,{provider:'piper',speed:1},{piper:'vi_mock'});
    const changed=voiceSnapshot(s,v,{provider:'piper',speed:1,regenerationKey:'new-revision'},{piper:'vi_mock'});
    const before=sha(JSON.stringify({sceneId:s.id,videoId:s.videoId,textSha256:one.textSha256,
      configRevision:v.configRevision,provider:'piper',voice:'vi_mock',rate:0,fallbackProvider:null,fallbackVoice:null}));
    assert.equal(one.inputHash,before);assert.notEqual(changed.inputHash,one.inputHash);
    const a=imageSnapshot(s,v,{seed:3,width:512,height:512},'0'.repeat(64));
    const b=imageSnapshot(s,v,{seed:3,width:512,height:512,regenerationKey:'new-revision'},'0'.repeat(64));
    assert.notEqual(a.inputHash,b.inputHash);
  }finally{await f.close();}
});

test('explicit voice regeneration touches no other scene or image; same key idempotent',async()=>{
  const f=await fixture();try{
    const s=f.scenes[0],other=f.scenes[1];
    const first=await f.service.regenerate(s.id,req(s,'voice-1'));
    assert.equal(first.kind,'voice');assert.equal(first.state,'queued');assert.ok(first.jobId);
    assert.equal(f.store.countByStatus().total,1);
    const again=await f.service.regenerate(s.id,req(s,'voice-1'));
    assert.equal(again.jobId,first.jobId);assert.equal(again.reused,true);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM scene_image_intents').get().n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM scene_voice_intents WHERE scene_id=?').get(other.id).n,0);
    assert.equal(f.repo.getScene(s.id).visualAssetId,null);
    const newer=await f.service.regenerate(s.id,req(s,'voice-2'));
    assert.notEqual(newer.jobId,first.jobId);assert.equal(f.store.countByStatus().total,2);
    assert.equal(f.db.prepare('SELECT job_id FROM scene_voice_intents WHERE scene_id=?').get(s.id).job_id,newer.jobId);
  }finally{await f.close();}
});

test('image-only forced regeneration is distinct and does not touch voice or neighbour',async()=>{
  const f=await fixture();try{
    const s=f.scenes[0];
    const a=await f.service.regenerate(s.id,req(s,'image-1','image'));
    const b=await f.service.regenerate(s.id,req(s,'image-2','image'));
    assert.notEqual(a.jobId,b.jobId);
    assert.equal(f.store.countByStatus().total,2);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM scene_voice_intents').get().n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM scene_image_intents WHERE scene_id=?').get(f.scenes[1].id).n,0);
    assert.equal(f.repo.getScene(s.id).voiceAssetId,null);
  }finally{await f.close();}
});

test('invalid, stale, remote-without-consent and foreign IDs fail before enqueue',async()=>{
  const f=await fixture();try{
    const s=f.scenes[0];
    await assert.rejects(f.service.regenerate(s.id,req(s,'bad space')),{code:'INVALID_SELECTIVE_REGENERATION'});
    await assert.rejects(f.service.regenerate(s.id,{...req(s,'fresh'),expectedRowVersion:s.rowVersion+1}),{code:'SCENE_ROW_VERSION_CONFLICT'});
    await assert.rejects(f.service.regenerate(s.id,req(s,'edge-run','voice',{provider:'edge',voice:'vi-VN-HoaiMyNeural',speed:1})),{code:'REMOTE_CONSENT_REQUIRED'});
    await assert.rejects(f.service.regenerate('unknown-scene',req(s,'missing')),{code:'SCENE_NOT_FOUND'});
    await assert.rejects(f.service.regenerate(s.id,{...req(s,'none'),options:{provider:'piper',seed:3}}),{code:'INVALID_VOICE_REQUEST'});
    assert.equal(f.store.countByStatus().total,0);
  }finally{await f.close();}
});

test('new voice revision does not destroy the old; select prior voice without new job',async()=>{
  const f=await fixture();try{
    const s=f.scenes[0];
    const a=await f.service.regenerate(s.id,req(s,'one'));
    const old=await complete(f,a.jobId);
    assert.equal((await f.sceneVoices.status(s.id)).voiceAsset.id,old.id);
    const fresh=f.repo.getScene(s.id);
    const b=await f.service.regenerate(s.id,req(fresh,'two'));
    const recent=await complete(f,b.jobId);
    assert.equal(f.repo.getScene(s.id).voiceAssetId,recent.id);
    const total=f.store.countByStatus().total;
    const restored=await f.service.selectVoice(s.id,{assetId:old.id,expectedRowVersion:f.repo.getScene(s.id).rowVersion});
    assert.equal(restored.selected,true);
    assert.equal(f.repo.getScene(s.id).voiceAssetId,old.id);
    assert.equal((await f.sceneVoices.status(s.id)).voiceAsset.id,old.id);
    assert.equal(f.store.countByStatus().total,total,'undo never invokes a provider');
    assert.equal(f.manifest.listScene(s.id).filter(x=>x.kind==='voice').length,2);
    assert.equal(f.repo.getScene(f.scenes[1].id).voiceAssetId,null);
    assert.equal(f.repo.getScene(s.id).visualAssetId,null);
    assert.equal(voiceIntentMatches(f.repo,{sceneId:s.id,videoId:s.videoId,inputHash:old.metadata.inputHash,
      textSha256:old.metadata.textSha256,configRevision:f.video.configRevision},a.jobId),true);
  }finally{await f.close();}
});

test('voice revert rejects corrupt, foreign and obsolete revisions without changing active job',async()=>{
  const f=await fixture();try{
    const a=await f.service.regenerate(f.scenes[0].id,req(f.scenes[0],'first'));
    const old=await complete(f,a.jobId);
    const second=f.scenes[1];
    await assert.rejects(f.service.selectVoice(second.id,{assetId:old.id,expectedRowVersion:second.rowVersion}),{code:'VOICE_REVISION_NOT_FOUND'});
    await assert.rejects(f.service.selectVoice(f.scenes[0].id,{assetId:'nonexistent',expectedRowVersion:1}),{code:'VOICE_REVISION_NOT_FOUND'});
    const path=join(f.root,old.relativePath);await writeFile(path,Buffer.from('corrupt'));
    await assert.rejects(f.service.selectVoice(f.scenes[0].id,{assetId:old.id,expectedRowVersion:f.repo.getScene(f.scenes[0].id).rowVersion}),{code:'VOICE_REVISION_UNHEALTHY'});
    assert.equal(f.repo.getScene(f.scenes[0].id).voiceAssetId,old.id);
  }finally{await f.close();}
});

test('a scene text edit makes old voice unsafe for revert even if checksum healthy',async()=>{
  const f=await fixture();try{
    const r=await f.service.regenerate(f.scenes[0].id,req(f.scenes[0],'x'));
    const old=await complete(f,r.jobId);
    f.db.prepare('UPDATE scenes SET text=?,row_version=row_version+1 WHERE id=?').run('New words',f.scenes[0].id);
    await assert.rejects(f.service.selectVoice(f.scenes[0].id,{assetId:old.id,expectedRowVersion:f.repo.getScene(f.scenes[0].id).rowVersion}),{code:'VOICE_REVISION_STALE'});
  }finally{await f.close();}
});

test('simultaneous new voice intent makes undo fail closed after verifying disk',async()=>{
  const f=await fixture();try{
    const r=await f.service.regenerate(f.scenes[0].id,req(f.scenes[0],'one'));
    const old=await complete(f,r.jobId);
    const original=f.manifest.verifyRevision.bind(f.manifest);
    f.manifest.verifyRevision=async id=>{
      const result=await original(id);
      await f.service.regenerate(f.scenes[0].id,req(f.repo.getScene(f.scenes[0].id),'newer'));
      return result;
    };
    await assert.rejects(f.service.selectVoice(f.scenes[0].id,{assetId:old.id,expectedRowVersion:f.repo.getScene(f.scenes[0].id).rowVersion}),{code:'VOICE_SELECTION_CONFLICT'});
    assert.notEqual(f.db.prepare('SELECT job_id FROM scene_voice_intents WHERE scene_id=?').get(f.scenes[0].id).job_id,r.jobId);
  }finally{await f.close();}
});

test('image regeneration preserves generated revision for explicit undo; voice pointer untouched',async()=>{
  const f=await fixture();try{
    const s=f.scenes[0];
    const first=await f.service.regenerate(s.id,req(s,'image-old','image'));
    const old=await complete(f,first.jobId);
    const current=f.repo.getScene(s.id);
    const second=await f.service.regenerate(s.id,req(current,'image-new','image'));
    const newer=await complete(f,second.jobId);
    assert.notEqual(old.id,newer.id);
    assert.equal(f.repo.getScene(s.id).visualAssetId,newer.id);
    await f.sceneImages.select(s.id,{assetId:old.id,expectedRowVersion:f.repo.getScene(s.id).rowVersion});
    assert.equal(f.repo.getScene(s.id).visualAssetId,old.id);
    assert.equal(f.repo.getScene(s.id).voiceAssetId,null);
    assert.equal((await f.sceneImages.status(s.id)).state,'ready');
    assert.equal(f.manifest.listScene(s.id).length,2);
  }finally{await f.close();}
});

test('restoring older voice explicitly fences the newer still queued job from promotion',async()=>{
 const f=await fixture();try{
   const s=f.scenes[0];
   const first=await f.service.regenerate(s.id,req(s,'old'));
   const original=await complete(f,first.jobId);
   const second=await f.service.regenerate(s.id,req(f.repo.getScene(s.id),'new'));
   await f.service.selectVoice(s.id,{assetId:original.id,expectedRowVersion:f.repo.getScene(s.id).rowVersion});
   const pending=f.store.get(second.jobId);
   assert.equal(voiceIntentMatches(f.repo,pending.payload,second.jobId),false);
   assert.equal(f.repo.getScene(s.id).voiceAssetId,original.id);
 }finally{await f.close()}
});

test('same regeneration key after a completed job is safe, but changed options/source are conflicts',async()=>{
 const f=await fixture();try{
   const s=f.scenes[0];const b=req(s,'stable-click');
   const first=await f.service.regenerate(s.id,b);await complete(f,first.jobId);
   const repeat=await f.service.regenerate(s.id,b); // stale rowVersion after promotion
   assert.equal(repeat.jobId,first.jobId);assert.equal(repeat.reused,true);
   assert.equal(f.store.countByStatus().total,1);
   await assert.rejects(f.service.regenerate(s.id,{...b,options:{provider:'piper',speed:1.2}}),{code:'REGENERATION_KEY_CONFLICT'});
   f.db.prepare('UPDATE scenes SET text=? WHERE id=?').run('Changed script',s.id);
   await assert.rejects(f.service.regenerate(s.id,b),{code:'REGENERATION_KEY_CONFLICT'});
   assert.equal(f.store.countByStatus().total,1);
 }finally{await f.close()}
});
