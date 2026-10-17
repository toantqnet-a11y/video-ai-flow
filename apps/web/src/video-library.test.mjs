import test from 'node:test';import assert from 'node:assert/strict';
import {videoDurationLabel,videoStatusLabel,videoProgressLabel,videoListQuery,validateVideoForm,normalizeVideoFilter} from './video-library.mjs';
test('R0-12 statuses never manufacture video progress',()=>{
 assert.equal(videoStatusLabel({status:'rendering',deletedAt:null}),'Đang render');
 assert.equal(videoProgressLabel({status:'rendering',progressPercent:null,progressSource:'unknown'}),'Chưa có tiến độ đo thực tế');
 assert.match(videoProgressLabel({progressPercent:45.4,progressSource:'job'}),/45%/);
 assert.equal(videoStatusLabel({status:'rendered',deletedAt:123}),'Đã xóa');
});
test('R0-12 duration label distinguishes actual from target',()=>{
 assert.match(videoDurationLabel({targetDurationSec:2100,actualDurationSec:null}),/Mục tiêu/);
 assert.match(videoDurationLabel({targetDurationSec:2100,actualDurationSec:120}),/Thực tế: 2 phút/);
});
test('R0-12 query and form validation are explicit',()=>{
 assert.match(videoListQuery({search:' AI ',deleted:true,cursor:'opaque',status:'draft'}),/search=AI/);
 assert.deepEqual(normalizeVideoFilter({status:'unknown',deleted:'true'}),{search:'',status:'all',deleted:false});
 assert(validateVideoForm({title:'  ',targetMinutes:35}));assert(validateVideoForm({title:'A',targetMinutes:121}));
 assert.equal(validateVideoForm({title:'Video',brief:'Y',targetMinutes:35}),'');
});
