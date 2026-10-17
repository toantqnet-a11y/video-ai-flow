import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePresetRevisions} from './preset-history.mjs';
import {defaultPreset} from '../../../packages/core/src/index.mjs';

test('R0-08 UI diff reports only changed allowlisted preset properties',()=>{
 const a={preset:structuredClone(defaultPreset)},b={preset:structuredClone(defaultPreset)};
 b.preset.voice.speed=1.1;b.preset.content.tone='lịch sự';
 assert.deepEqual(comparePresetRevisions(a,b),[
   {group:'content',key:'tone',from:'thân thiện',to:'lịch sự'},
   {group:'voice',key:'speed',from:1,to:1.1}
 ]);
});
test('R0-08 UI diff ignores unknown secret-bearing properties and handles empty values',()=>{
 const a={preset:structuredClone(defaultPreset)},b={preset:structuredClone(defaultPreset)};
 b.preset.voice.apiKey='should never be displayed';
 b.preset.media.motionEffect='pan';
 assert.deepEqual(comparePresetRevisions(a,b),[{group:'media',key:'motionEffect',from:null,to:'pan'}]);
 assert.deepEqual(comparePresetRevisions(null,b),[]);
});
