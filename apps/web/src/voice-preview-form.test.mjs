import test from 'node:test';import assert from 'node:assert/strict';
import {validatePreviewDraft,voicePreviewError} from './voice-preview-form.mjs';
test('UI validation mirrors backend consent and short sample constraints',()=>{
 const sample={provider:'edge',voice:'vi-VN-HoaiMyNeural',text:'Xin chào',speed:1,remoteConsent:true};
 assert.equal(validatePreviewDraft(sample),null);
 assert.equal(validatePreviewDraft({...sample,remoteConsent:false}),'REMOTE_CONSENT_REQUIRED');
 assert.equal(validatePreviewDraft({...sample,text:'a'.repeat(351)}),'INVALID_PREVIEW_TEXT');
 assert.match(voicePreviewError('TTS_DEPENDENCY_UNAVAILABLE'),/Thiếu/);
});
