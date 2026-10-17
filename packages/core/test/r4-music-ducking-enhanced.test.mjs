import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMusicMixSettings,inspectVisualConsistency} from '../src/r4-editor-music-style.mjs';
import {validateRenderMusic} from '../src/render-finishing-r405-r406.mjs';
test('R4-06 ducking is optional, explicit boolean only, no injected FFmpeg expressions',()=>{
 const base={volume:0.15,fadeInSeconds:0,fadeOutSeconds:0,loop:true};
 assert.deepEqual(validateMusicMixSettings(base),base);
 assert.equal(validateMusicMixSettings({...base,ducking:true}).ducking,true);
 assert.throws(()=>validateMusicMixSettings({...base,ducking:'volume=100'}),{code:'R4_MUSIC_SETTINGS_INVALID'});
 assert.throws(()=>validateRenderMusic({pin:{relativePath:'music/v1/'+'a'.repeat(64)+'.mp3',sha256:'a'.repeat(64),bytes:200},settings:{...base,ducking:'true'}}),{code:'R4_MUSIC_SETTINGS_INVALID'});
});
test('R4-07 actual integrity evidence cannot masquerade as identity verification',()=>{
 const style={styleToken:'cinema',characterTokens:['hero']};
 const scene={id:'s1',visualPrompt:'cinema hero',visualAssetId:'a1'};
 const healthy=inspectVisualConsistency({scenes:[scene],styleProfile:style,assetEvidence:[{sceneId:'s1',health:'healthy'}]});
 assert.equal(healthy.ready,true);assert.equal(healthy.assetEvidence.identityVerified,false);
 const bad=inspectVisualConsistency({scenes:[scene],styleProfile:style,assetEvidence:[{sceneId:'s1',health:'corrupt'}]});
 assert.equal(bad.ready,false);assert.equal(bad.warnings[0].code,'VISUAL_ASSET_UNHEALTHY');
});
