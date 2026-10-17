import test from 'node:test';
import assert from 'node:assert/strict';
import {openProjectDb,StudioRepository} from '../src/index.mjs';
import {buildSelectivePresetOverrides,presetDiffFields} from '../src/preset-diff-r401.mjs';

function fixture(){const db=openProjectDb(),repo=new StudioRepository(db);
  const channel=repo.createChannel({name:'R4-01 channel'}),video=repo.createVideo(channel.id,{title:'Existing video'});
  return {db,repo,channel,video,close:()=>db.close()};
}
function channelChange(f,patch){const before=f.repo.getChannel(f.channel.id),preset=structuredClone(before.preset);
  for(const [group,keys] of Object.entries(patch))Object.assign(preset[group],keys);
  return f.repo.updateChannel(before.id,{rowVersion:before.rowVersion,preset});
}
const preview=(f,paths=[],rowVersion=f.repo.getVideo(f.video.id).rowVersion,channelPresetVersion=f.repo.getChannel(f.channel.id).presetVersion)=>
  f.repo.previewChannelPresetDiff(f.video.id,{rowVersion,channelPresetVersion,selectedPaths:paths});
const apply=(f,d,opts={})=>f.repo.applyChannelPresetDiff(f.video.id,{rowVersion:d.rowVersion,
  channelPresetVersion:d.channelPresetVersion,selectedPaths:d.selectedPaths,expectedDigest:d.previewDigest,
  confirmImpact:d.impact.requiresReview,...opts});

test('R4-01 channel preset changes never silently alter existing videos',()=>{
  const f=fixture();try{
    const original=f.repo.getVideo(f.video.id).effectivePreset;
    channelChange(f,{content:{style:'đơn giản'},voice:{voice:'vi-VN-NamMinhNeural'},media:{style:'truyện tranh'}});
    const d=preview(f);assert.deepEqual(d.selectedPaths,[]);assert.equal(d.changed,false);
    assert.deepEqual(d.fields.map(x=>x.path),['content.style','voice.voice','media.style']);
    assert.deepEqual(f.repo.getVideo(f.video.id).effectivePreset,original);
    assert.equal(f.repo.getVideoConfig(f.video.id).version,1);
  }finally{f.close();}
});
test('R4-01 selecting media.style leaves voice untouched, only image/video/render affected',()=>{
  const f=fixture();try{
    channelChange(f,{content:{style:'trẻ trung'},voice:{voice:'vi-VN-NamMinhNeural'},media:{style:'cinematic'}});
    const d=preview(f,['media.style']);assert.equal(d.changed,true);
    assert.deepEqual(d.impact.changedPaths,['media.style']);
    assert.deepEqual(d.impact.affected,['image','render','video']);
    const saved=apply(f,d);assert.equal(saved.version,2);
    assert.equal(saved.effectivePreset.media.style,'cinematic');
    assert.equal(saved.effectivePreset.voice.voice,f.video.preset.voice.voice);
    assert.equal(saved.sourcePresetVersion,1);
    assert.equal(f.repo.getVideoConfig(f.video.id,1).effectivePreset.media.style,f.video.preset.media.style);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM domain_events WHERE event_name='video.config_updated'").get().n,1);
  }finally{f.close();}
});
test('R4-01 retains unrelated video overrides and canonical original source on apply',()=>{
  const f=fixture();try{
    f.repo.updateVideoConfig(f.video.id,{rowVersion:f.video.rowVersion,overrides:{voice:{speed:1.25},content:{tone:'trang trọng'}}});
    channelChange(f,{media:{style:'watercolor'},voice:{voice:'vi-VN-NamMinhNeural',speed:0.75}});
    const d=preview(f,['voice.voice']);const saved=apply(f,d);
    assert.equal(saved.overrides.voice.speed,1.25);assert.equal(saved.overrides.content.tone,'trang trọng');
    assert.equal(saved.effectivePreset.voice.voice,'vi-VN-NamMinhNeural');
    assert.equal(saved.effectivePreset.media.style,f.video.preset.media.style);
    assert.equal(saved.sourcePresetVersion,1);
  }finally{f.close();}
});
test('R4-01 review is required for existing scenes; refusal performs zero writes',()=>{
  const f=fixture();try{
    f.repo.replaceScenes(f.video.id,{rowVersion:1,scenes:[{text:'Xin chào',durationMs:2000}]});
    channelChange(f,{voice:{voice:'vi-VN-NamMinhNeural'}});
    const d=preview(f,['voice.voice']);assert.equal(d.impact.requiresReview,true);
    assert.throws(()=>apply(f,d,{confirmImpact:false}),{code:'CONFIG_CHANGE_REVIEW_REQUIRED',status:409});
    assert.equal(f.repo.getVideoConfig(f.video.id).version,1);
    const saved=apply(f,d);assert.equal(saved.version,2);assert.equal(f.repo.listScenes(f.video.id).length,1);
    assert.equal(f.repo.listVideoConfigRevisions(f.video.id).length,2);
  }finally{f.close();}
});
test('R4-01 stale channel, stale video and forged preview digest are refused',()=>{
  const f=fixture();try{
    channelChange(f,{content:{style:'hiện đại'}});
    const d=preview(f,['content.style']);
    assert.throws(()=>apply(f,d,{expectedDigest:'0'.repeat(64)}),{code:'PRESET_PREVIEW_STALE',status:409});
    channelChange(f,{content:{style:'phóng sự'}});
    assert.throws(()=>apply(f,d),{code:'VERSION_CONFLICT',status:409});
    const newer=preview(f,['content.style']);
    f.repo.updateVideoConfig(f.video.id,{rowVersion:newer.rowVersion,overrides:{voice:{speed:1.1}}});
    assert.throws(()=>apply(f,newer),{code:'VERSION_CONFLICT',status:409});
  }finally{f.close();}
});
test('R4-01 reject duplicate, fabricated, unavailable fields and implicit entire preset',()=>{
  const f=fixture();try{
    channelChange(f,{content:{style:'mới'}});
    for(const paths of [['content.style','content.style'],['__proto__.polluted'],['voice.voice'],['content.madeup'],[5], 'content.style']){
      assert.throws(()=>preview(f,paths),{code:'INVALID_PRESET_SELECTION'});
    }
    assert.equal(f.repo.getVideoConfig(f.video.id).version,1);
  }finally{f.close();}
});
test('R4-01 no-op does not increment revision and blocks paid/remote bypass',()=>{
  const f=fixture();try{
    const d=preview(f,[]),result=apply(f,d);
    assert.equal(result.changed,false);assert.equal(result.version,1);
    assert.equal(f.repo.getChannel(f.channel.id).preset.models.paidEnabled,false);
    const origin=f.video.preset,effective=structuredClone(origin),target=structuredClone(origin);
    target.models.paidEnabled=true;
    assert.throws(()=>buildSelectivePresetOverrides({origin,effective,channel:target,selectedPaths:['models.paidEnabled']}),{code:'PAID_CONFIG_REQUIRES_APPROVAL'});
  }finally{f.close();}
});
test('R4-01 optional field removal is visible but not silently representable',()=>{
  const f=fixture();try{
    const base=f.repo.getChannel(f.channel.id);const source=structuredClone(base.preset);source.content.basePrompt='prompt with notes';
    f.repo.updateChannel(base.id,{rowVersion:base.rowVersion,preset:source});
    const other=f.repo.createVideo(base.id,{title:'Second video'});
    let changed=f.repo.getChannel(base.id);const newer=structuredClone(changed.preset);delete newer.content.basePrompt;
    f.repo.updateChannel(base.id,{rowVersion:changed.rowVersion,preset:newer});
    const d=f.repo.previewChannelPresetDiff(other.id,{rowVersion:other.rowVersion,channelPresetVersion:3,selectedPaths:[]});
    assert.equal(d.fields.find(x=>x.path==='content.basePrompt').selectable,false);
    assert.throws(()=>f.repo.previewChannelPresetDiff(other.id,{rowVersion:other.rowVersion,channelPresetVersion:3,selectedPaths:['content.basePrompt']}),{code:'INVALID_PRESET_SELECTION'});
  }finally{f.close();}
});
test('R4-01 unchanged optional fields and missing keys handled by diff helper',()=>{
  const x={content:{style:'A'},voice:{},media:{},render:{},models:{}};
  const y=structuredClone(x);y.content.style='B';y.content.extraPrompt='note';
  assert.deepEqual(presetDiffFields(x,y).map(f=>f.path),['content.extraPrompt','content.style']);
});
