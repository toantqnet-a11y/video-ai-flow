import test from 'node:test';
import assert from 'node:assert/strict';
import {channelDraft,validateChannelDraft,previewChannelPrompt,filterChannels} from './channel-form.mjs';
import {defaultPreset} from './presets.js';
const channel={id:'A',name:'  Tin Công Nghệ ',description:'Tin hàng ngày',preset:defaultPreset};
test('R0-01 draft is copied, not mutating original preset',()=>{const d=channelDraft(channel);d.preset.media.style='updated';assert.notEqual(d.preset.media.style,channel.preset.media.style)});
test('R0-01 previews prompt locally including Vietnamese channel context',()=>{const v=previewChannelPrompt({...defaultPreset.content,audience:'Người đi làm',basePrompt:'Nêu ví dụ thực tế'});assert.match(v,/Người đi làm/);assert.match(v,/Nêu ví dụ thực tế/)});
test('R0-01 validates form before API writes',()=>{const d=channelDraft(channel);assert.equal(validateChannelDraft(d),null);d.preset.models.paidEnabled=true;assert.match(validateChannelDraft(d),/trả phí/);d.preset.models.paidEnabled=false;d.preset.media.sceneSeconds=200;assert.match(validateChannelDraft(d),/Scene/)});
test('R0-01 status and search filter do not include deleted records in active list',()=>{
  const rows=[{...channel,status:'active',deletedAt:null},{...channel,id:'B',name:'Khác',status:'archived',deletedAt:null},{...channel,id:'C',name:'Đã xoá',status:'archived',deletedAt:999}];
  assert.equal(filterChannels(rows,{search:'tin công',status:'active'}).length,1);
  assert.equal(filterChannels(rows,{status:'deleted'}).length,1);
});
