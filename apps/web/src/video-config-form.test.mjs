import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultPreset} from '../../../packages/core/src/preset-schema.mjs';
import {setVideoOverride,currentOverrideValue,editableVideoConfig} from './video-config-form.mjs';

test('R0-11 UI starts inherited, stores only changed fields',()=>{
  const config={sourcePreset:defaultPreset};
  const voice=defaultPreset.voice.voice;
  const overrides=setVideoOverride({},'voice','voice','vi-VN-NamMinhNeural',defaultPreset);
  assert.equal(currentOverrideValue(config,overrides,'voice','voice'),'vi-VN-NamMinhNeural');
  assert.equal(defaultPreset.voice.voice,voice);
  assert.deepEqual(setVideoOverride(overrides,'voice','voice',undefined,defaultPreset),{});
});

test('R0-11 UI reset one field preserves other changed fields',()=>{
  const c=defaultPreset;
  const overrides={voice:{voice:'vi-VN-NamMinhNeural',speed:1.25}};
  assert.deepEqual(setVideoOverride(overrides,'voice','voice',c.voice.voice,c),{voice:{speed:1.25}});
  assert.equal(overrides.voice.voice,'vi-VN-NamMinhNeural');
  assert(editableVideoConfig.some(field=>field.join('.')==='voice.voice.Giọng đọc.voice'));
});
