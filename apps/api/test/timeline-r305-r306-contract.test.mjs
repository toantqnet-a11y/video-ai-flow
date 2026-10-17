import test from 'node:test';
import assert from 'node:assert/strict';
import {operations,schemas} from '../../../packages/contracts/src/catalog.mjs';
import {readFileSync} from 'node:fs';
test('R3-05/06 API contracts expose strict persisted trim and private waveform',()=>{
 const trim=operations.find(x=>x.id==='trimTimelineVisualR305'),wave=operations.find(x=>x.id==='getSceneWaveformR306');
 assert.equal(trim.path,'/api/videos/:id/timeline/visual-window');assert.equal(trim.method,'PATCH');
 assert.deepEqual(schemas.TimelineVisualWindowInput.required,['expectedRowVersion','sceneId','inMs','outMs']);
 assert.equal(wave.path,'/api/scenes/:id/voice/waveform');assert.equal(wave.method,'GET');
 assert.ok(schemas.TimelineManifestScene.required.includes('visualInMs'));
 assert.ok(schemas.TimelineManifestScene.required.includes('visualOutMs'));
 assert.notEqual(wave.public,true);
 for(const name of ['apps/api/src/controllers.mjs','apps/api/src/routes.mjs','apps/web/src/TimelineEditorR302.jsx']){
  const code=readFileSync(name,'utf8');assert.match(code,/waveform/);assert.match(code,/visual-window|trimTimelineVisual|saveVisual/);
 }
});
