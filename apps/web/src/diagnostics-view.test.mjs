import test from 'node:test';import assert from 'node:assert/strict';
import {viewCheck,shortGiB,stateDescription} from './diagnostics-view.mjs';
test('status labels and the provider state never display raw system errors',()=>{
  assert.equal(stateDescription('ready'),'Sẵn sàng');
  assert.equal(stateDescription('malicious'),'Chưa xác minh');
  assert.equal(viewCheck({id:'ffmpeg',state:'ready',detail:'FFMPEG_RENDER_CODECS_AVAILABLE'}).title,'FFmpeg / Codec');
  assert.equal(viewCheck({id:'secret-path',state:'hacked',detail:'NEVER_SHOW_PATH'}).description,'Chưa có kết quả xác minh.');
});
test('GB formatting is predictable and ignores invalid values',()=>{
  assert.equal(shortGiB(null),'—');assert.equal(shortGiB(Infinity),'—');
  assert.ok(shortGiB(4.5).includes('4'));
});
